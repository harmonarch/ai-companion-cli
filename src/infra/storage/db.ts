import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function openDatabase(databasePath: string) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  return new Database(databasePath);
}
