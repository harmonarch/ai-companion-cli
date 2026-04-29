import crypto from "node:crypto";
import { FileStore } from "../storage/file-store.js";
import type { RunRecord, RunStatus } from "../../types/run.js";

export class RunRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("runs");
  }

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

    this.store.writeJson(getRunPath(run.id), run);
    return run;
  }

  getById(runId: string) {
    const run = this.store.readJson(getRunPath(runId));
    return run ? parseRunRecord(run) : null;
  }

  deleteBySession(sessionId: string) {
    for (const run of listRuns(this.store)) {
      if (run.sessionId === sessionId) {
        this.store.delete(getRunPath(run.id));
      }
    }
  }

  deleteAll() {
    for (const run of listRuns(this.store)) {
      this.store.delete(getRunPath(run.id));
    }
  }

  markFirstToken(runId: string, at = new Date().toISOString()) {
    const run = this.requireRun(runId);
    this.store.writeJson(getRunPath(runId), {
      ...run,
      firstTokenAt: run.firstTokenAt ?? at,
      updatedAt: at,
    });
  }

  markCompleted(runId: string, at = new Date().toISOString()) {
    const run = this.requireRun(runId);
    this.store.writeJson(getRunPath(runId), {
      ...run,
      status: "completed",
      completedAt: at,
      updatedAt: at,
    });
  }

  markFailed(runId: string, errorMessage: string, at = new Date().toISOString()) {
    const run = this.requireRun(runId);
    this.store.writeJson(getRunPath(runId), {
      ...run,
      status: "failed",
      failedAt: at,
      errorMessage,
      updatedAt: at,
    });
  }

  private requireRun(runId: string) {
    const run = this.getById(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }
}

function listRuns(store: FileStore) {
  return store
    .list("runs")
    .map((filePath) => store.readJson(filePath))
    .filter((run): run is unknown => Boolean(run))
    .map(parseRunRecord);
}

function parseRunRecord(value: unknown): RunRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid run record");
  }

  const record = value as Record<string, unknown>;
  return {
    id: readString(record.id, "run.id"),
    sessionId: readString(record.sessionId, "run.sessionId"),
    userMessageId: readString(record.userMessageId, "run.userMessageId"),
    assistantMessageId: readString(record.assistantMessageId, "run.assistantMessageId"),
    provider: readString(record.provider, "run.provider"),
    model: readString(record.model, "run.model"),
    status: readRunStatus(record.status),
    startedAt: readString(record.startedAt, "run.startedAt"),
    firstTokenAt: readOptionalString(record.firstTokenAt, "run.firstTokenAt"),
    completedAt: readOptionalString(record.completedAt, "run.completedAt"),
    failedAt: readOptionalString(record.failedAt, "run.failedAt"),
    errorMessage: readOptionalString(record.errorMessage, "run.errorMessage"),
    createdAt: readString(record.createdAt, "run.createdAt"),
    updatedAt: readString(record.updatedAt, "run.updatedAt"),
  };
}

function readRunStatus(value: unknown): RunStatus {
  if (value === "running" || value === "completed" || value === "failed") {
    return value;
  }
  throw new Error("Invalid run status");
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

function getRunPath(runId: string) {
  return `runs/${runId}.json`;
}
