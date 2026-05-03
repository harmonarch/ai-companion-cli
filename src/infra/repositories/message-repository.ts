import crypto from "node:crypto";
import { FileStore } from "#src/infra/storage/file-store.js";
import {
  createTextMessageContent,
  type ChatMessage,
  type MessageContent,
  type MessageContentPart,
  type MessageKind,
  type MessageRole,
} from "#src/types/chat.js";

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
    content: MessageContent;
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

  updateContent(sessionId: string, messageId: string, content: MessageContent, metadata?: Record<string, unknown>) {
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
    content: readMessageContent(record),
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

function readMessageContent(record: Record<string, unknown>): MessageContent {
  if (typeof record.content === "string") {
    return createTextMessageContent(record.content);
  }

  const parts = record.content;
  if (!Array.isArray(parts)) {
    throw new Error("Invalid message.content");
  }

  return parts.map(readMessageContentPart);
}

function readMessageContentPart(value: unknown): MessageContentPart {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid message.content part");
  }

  const record = value as Record<string, unknown>;
  if (record.type === "text") {
    return {
      type: "text",
      text: readString(record.text, "message.content.text"),
    };
  }

  if (record.type === "tool_call") {
    return {
      type: "tool_call",
      callId: readString(record.callId, "message.content.callId"),
      toolName: readString(record.toolName, "message.content.toolName"),
      input: readUnknown(record.input, "message.content.input"),
    };
  }

  if (record.type === "tool_result") {
    return {
      type: "tool_result",
      callId: readString(record.callId, "message.content.callId"),
      toolName: readString(record.toolName, "message.content.toolName"),
      output: readUnknown(record.output, "message.content.output"),
      isError: readOptionalBoolean(record.isError, "message.content.isError"),
    };
  }

  throw new Error("Invalid message.content part type");
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readOptionalBoolean(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${field}`);
  }

  return value;
}

function readUnknown(value: unknown, field: string) {
  if (value === undefined) {
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
