import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { SessionRecord, SessionSummary } from "../../types/session.js";

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    provider: String(row.provider),
    model: String(row.model),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

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

    this.db.prepare(`
      INSERT INTO sessions (id, title, provider, model, created_at, updated_at)
      VALUES (@id, @title, @provider, @model, @createdAt, @updatedAt)
    `).run(session);

    return session;
  }

  list(): SessionSummary[] {
    const rows = this.db.prepare(`
      SELECT s.*, COUNT(m.id) AS message_count
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      ...mapSession(row),
      messageCount: Number(row.message_count),
    }));
  }

  getById(sessionId: string) {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Record<string, unknown> | undefined;
    return row ? mapSession(row) : null;
  }

  touch(sessionId: string) {
    this.db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), sessionId);
  }

  updateTitle(sessionId: string, title: string) {
    this.db.prepare(`
      UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?
    `).run(title, new Date().toISOString(), sessionId);
  }
}
