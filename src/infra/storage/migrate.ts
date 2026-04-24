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

    CREATE INDEX IF NOT EXISTS idx_messages_session_created_at
      ON messages(session_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_tool_executions_session_updated_at
      ON tool_executions(session_id, updated_at);
  `);
}
