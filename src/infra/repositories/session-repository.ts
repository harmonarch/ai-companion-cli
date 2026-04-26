import crypto from "node:crypto";
import { FileStore } from "../storage/file-store.js";
import type { ChatMessage } from "../../types/chat.js";
import type { SessionRecord, SessionSummary } from "../../types/session.js";

function compareSessions(a: SessionRecord, b: SessionRecord) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export class SessionRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("sessions");
    this.store.ensureDir("messages");
  }

  create(input: { title: string; provider: string; model: string }) {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      title: input.title,
      provider: input.provider,
      model: input.model,
      createdAt: now,
      updatedAt: now,
    };

    this.store.writeJson(getSessionPath(session.id), session);
    return session;
  }

  list(): SessionSummary[] {
    return this.store
      .list("sessions")
      .map((filePath) => this.store.readJson(filePath))
      .filter((session): session is unknown => Boolean(session))
      .map(parseSessionRecord)
      .sort(compareSessions)
      .map((session) => ({
        ...session,
        messageCount: this.store.readJsonLines(getMessagePath(session.id)).length,
      }));
  }

  getById(sessionId: string) {
    const session = this.store.readJson(getSessionPath(sessionId));
    return session ? parseSessionRecord(session) : null;
  }

  touch(sessionId: string) {
    const session = this.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.store.writeJson(getSessionPath(sessionId), {
      ...session,
      updatedAt: new Date().toISOString(),
    });
  }

  updateTitle(sessionId: string, title: string) {
    const session = this.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.store.writeJson(getSessionPath(sessionId), {
      ...session,
      title,
      updatedAt: new Date().toISOString(),
    });
  }

  delete(sessionId: string) {
    this.store.delete(getSessionPath(sessionId));
  }
}

function parseSessionRecord(value: unknown): SessionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid session record");
  }

  const record = value as Record<string, unknown>;
  return {
    id: readString(record.id, "session.id"),
    title: readString(record.title, "session.title"),
    provider: readString(record.provider, "session.provider"),
    model: readString(record.model, "session.model"),
    createdAt: readString(record.createdAt, "session.createdAt"),
    updatedAt: readString(record.updatedAt, "session.updatedAt"),
  };
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function getSessionPath(sessionId: string) {
  return `sessions/${sessionId}.json`;
}

function getMessagePath(sessionId: string) {
  return `messages/${sessionId}.jsonl`;
}
