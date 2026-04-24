import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { ChatMessage, MessageKind, MessageRole } from "../../types/chat.js";

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as MessageRole,
    kind: row.kind as MessageKind,
    content: String(row.content),
    createdAt: String(row.created_at),
    metadata: parseJsonRecord(row.metadata_json),
  };
}

function parseJsonRecord(value: unknown) {
  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export class MessageRepository {
  constructor(private readonly db: Database.Database) {}

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

    this.db.prepare(`
      INSERT INTO messages (id, session_id, role, kind, content, metadata_json, created_at)
      VALUES (@id, @sessionId, @role, @kind, @content, @metadataJson, @createdAt)
    `).run({
      ...message,
      metadataJson: JSON.stringify(message.metadata),
    });

    return message;
  }

  listBySession(sessionId: string) {
    const rows = this.db.prepare(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as Array<Record<string, unknown>>;

    return rows.map(mapMessage);
  }

  updateContent(messageId: string, content: string, metadata?: Record<string, unknown>) {
    this.db.prepare(`
      UPDATE messages SET content = ?, metadata_json = ? WHERE id = ?
    `).run(content, JSON.stringify(metadata ?? {}), messageId);
  }
}
