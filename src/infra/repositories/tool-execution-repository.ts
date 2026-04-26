import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { ToolExecutionRecord, ToolExecutionStatus } from "../../types/tool.js";

function mapToolExecution(row: Record<string, unknown>): ToolExecutionRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    runId: row.run_id ? String(row.run_id) : undefined,
    messageId: row.message_id ? String(row.message_id) : undefined,
    toolName: String(row.tool_name),
    riskLevel: row.risk_level as ToolExecutionRecord["riskLevel"],
    status: row.status as ToolExecutionStatus,
    summary: String(row.summary),
    input: parseJsonRecord(row.input_json),
    output: parseJsonRecord(row.output_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
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

export class ToolExecutionRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: Omit<ToolExecutionRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const record: ToolExecutionRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.db.prepare(`
      INSERT INTO tool_executions (
        id, session_id, run_id, message_id, tool_name, risk_level, status, summary,
        input_json, output_json, created_at, updated_at
      ) VALUES (
        @id, @sessionId, @runId, @messageId, @toolName, @riskLevel, @status, @summary,
        @inputJson, @outputJson, @createdAt, @updatedAt
      )
    `).run({
      ...record,
      inputJson: JSON.stringify(record.input),
      outputJson: JSON.stringify(record.output),
    });

    return record;
  }

  update(recordId: string, patch: Partial<Pick<ToolExecutionRecord, "status" | "summary" | "output">>) {
    const existing = this.getById(recordId);
    if (!existing) {
      throw new Error(`Tool execution not found: ${recordId}`);
    }

    const next = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.db.prepare(`
      UPDATE tool_executions
      SET status = ?, summary = ?, output_json = ?, updated_at = ?
      WHERE id = ?
    `).run(next.status, next.summary, JSON.stringify(next.output), next.updatedAt, recordId);

    return next;
  }

  listBySession(sessionId: string) {
    const rows = this.db.prepare(`
      SELECT * FROM tool_executions WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as Array<Record<string, unknown>>;
    return rows.map(mapToolExecution);
  }

  getById(recordId: string) {
    const row = this.db.prepare(`SELECT * FROM tool_executions WHERE id = ?`).get(recordId) as Record<string, unknown> | undefined;
    return row ? mapToolExecution(row) : null;
  }

  deleteBySession(sessionId: string) {
    this.db.prepare(`DELETE FROM tool_executions WHERE session_id = ?`).run(sessionId);
  }
}
