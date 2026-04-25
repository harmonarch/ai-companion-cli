import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { RunRecord } from "../../types/run.js";

function mapRun(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    userMessageId: String(row.user_message_id),
    assistantMessageId: String(row.assistant_message_id),
    provider: String(row.provider),
    model: String(row.model),
    status: row.status as RunRecord["status"],
    startedAt: String(row.started_at),
    firstTokenAt: row.first_token_at ? String(row.first_token_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    failedAt: row.failed_at ? String(row.failed_at) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class RunRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    sessionId: string;
    userMessageId: string;
    assistantMessageId: string;
    provider: string;
    model: string;
  }) {
    const now = new Date().toISOString();
    const run: RunRecord = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId,
      provider: input.provider,
      model: input.model,
      status: "running",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.db.prepare(`
      INSERT INTO runs (
        id, session_id, user_message_id, assistant_message_id,
        provider, model, status, started_at,
        first_token_at, completed_at, failed_at, error_message,
        created_at, updated_at
      ) VALUES (
        @id, @sessionId, @userMessageId, @assistantMessageId,
        @provider, @model, @status, @startedAt,
        NULL, NULL, NULL, NULL,
        @createdAt, @updatedAt
      )
    `).run(run);

    return run;
  }

  getById(runId: string) {
    const row = this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as Record<string, unknown> | undefined;
    return row ? mapRun(row) : null;
  }

  markFirstToken(runId: string, at = new Date().toISOString()) {
    this.db.prepare(`
      UPDATE runs
      SET first_token_at = COALESCE(first_token_at, ?), updated_at = ?
      WHERE id = ?
    `).run(at, at, runId);
  }

  markCompleted(runId: string, at = new Date().toISOString()) {
    this.db.prepare(`
      UPDATE runs
      SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(at, at, runId);
  }

  markFailed(runId: string, errorMessage: string, at = new Date().toISOString()) {
    this.db.prepare(`
      UPDATE runs
      SET status = 'failed', failed_at = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(at, errorMessage, at, runId);
  }
}
