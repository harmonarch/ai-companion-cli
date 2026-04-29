import crypto from "node:crypto";
import { FileStore } from "../storage/file-store.js";
import type { ChatMessage, MessageKind, MessageRole } from "../../types/chat.js";

function compareMessages(a: ChatMessage, b: ChatMessage) {
  return a.createdAt.localeCompare(b.createdAt);
}

export class MessageRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("messages");
  }

  create(input: {
    sessionId: string;
    role: MessageRole;
    kind: MessageKind;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      kind: input.kind,
      content: input.content,
      createdAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    };

    this.store.appendJsonLine(getMessagePath(input.sessionId), message);
    return message;
  }

  listBySession(sessionId: string) {
    return this.store
      .readJsonLines(getMessagePath(sessionId))
      .map(parseChatMessage)
      .sort(compareMessages);
  }

  updateContent(sessionId: string, messageId: string, content: string, metadata?: Record<string, unknown>) {
    const messages = this.listBySession(sessionId);
    const next = messages.map((message) => (
      message.id === messageId
        ? { ...message, content, metadata: metadata ?? {} }
        : message
    ));

    this.store.writeJsonLines(getMessagePath(sessionId), next);
  }

  deleteBySession(sessionId: string) {
    this.store.delete(getMessagePath(sessionId));
  }

  deleteAll() {
    for (const filePath of this.store.list("messages")) {
      this.store.delete(filePath);
    }
  }
}

function parseChatMessage(value: unknown): ChatMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid chat message record");
  }

  const record = value as Record<string, unknown>;
  const role = readMessageRole(record.role);
  const kind = readMessageKind(record.kind);

  return {
    id: readString(record.id, "message.id"),
    sessionId: readString(record.sessionId, "message.sessionId"),
    role,
    kind,
    content: readString(record.content, "message.content"),
    createdAt: readString(record.createdAt, "message.createdAt"),
    metadata: readObject(record.metadata, "message.metadata"),
  };
}

function readMessageRole(value: unknown): MessageRole {
  if (value === "user" || value === "assistant" || value === "system" || value === "tool") {
    return value;
  }
  throw new Error("Invalid message role");
}

function readMessageKind(value: unknown): MessageKind {
  if (value === "user" || value === "assistant" || value === "system" || value === "tool") {
    return value;
  }
  throw new Error("Invalid message kind");
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readObject(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value as Record<string, unknown>;
}

function getMessagePath(sessionId: string) {
  return `messages/${sessionId}.jsonl`;
}
