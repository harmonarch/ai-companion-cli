import { FileStore } from "#src/infra/storage/file-store.js";
import type { SessionScratchpad } from "#src/types/memory.js";

export class SessionScratchpadRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("scratchpads");
  }

  getBySessionId(sessionId: string) {
    const record = this.store.readJson(getScratchpadPath(sessionId));
    return record ? parseSessionScratchpad(record) : null;
  }

  upsert(scratchpad: SessionScratchpad) {
    this.store.writeJson(getScratchpadPath(scratchpad.sessionId), scratchpad);
    return scratchpad;
  }

  deleteBySession(sessionId: string) {
    this.store.delete(getScratchpadPath(sessionId));
  }

  deleteAll() {
    for (const filePath of this.store.list("scratchpads")) {
      this.store.delete(filePath);
    }
  }
}

function parseSessionScratchpad(value: unknown): SessionScratchpad {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid session scratchpad");
  }

  const record = value as Record<string, unknown>;
  return {
    sessionId: readString(record.sessionId, "scratchpad.sessionId"),
    currentTask: readOptionalString(record.currentTask, "scratchpad.currentTask"),
    recentObservations: readStringArray(record.recentObservations, "scratchpad.recentObservations"),
    toolFindings: readStringArray(record.toolFindings, "scratchpad.toolFindings"),
    updatedAt: readString(record.updatedAt, "scratchpad.updatedAt"),
  };
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readOptionalString(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }
  return readString(value, field);
}

function readStringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function getScratchpadPath(sessionId: string) {
  return `scratchpads/${sessionId}.json`;
}
