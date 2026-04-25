import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS tool_executions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      run_id TEXT,
      message_id TEXT,
      tool_name TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_message_id TEXT NOT NULL,
      assistant_message_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      first_token_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_created_at
      ON messages(session_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_tool_executions_session_updated_at
      ON tool_executions(session_id, updated_at);

    CREATE INDEX IF NOT EXISTS idx_runs_session_started_at
      ON runs(session_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runs_status_started_at
      ON runs(status, started_at DESC);
  `);

  const toolExecutionColumns = db.prepare(`PRAGMA table_info(tool_executions)`).all() as Array<{ name: string }>;
  if (!toolExecutionColumns.some((column) => column.name === "run_id")) {
    db.exec(`ALTER TABLE tool_executions ADD COLUMN run_id TEXT`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tool_executions_run_created_at
      ON tool_executions(run_id, created_at);
  `);
}
