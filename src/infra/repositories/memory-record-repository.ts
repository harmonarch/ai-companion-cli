import crypto from "node:crypto";
import { FileStore } from "#src/infra/storage/file-store.js";
import type { MemoryRecord, MemoryRecordStatus, MemoryScope, MemoryTier, MemoryType } from "#src/types/memory.js";

export class MemoryRecordRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("memories");
  }

  create(input: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const record: MemoryRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.store.writeJson(getMemoryPath(record.id), record);
    return record;
  }

  update(memoryId: string, patch: Partial<Omit<MemoryRecord, "id" | "createdAt">>) {
    const existing = this.getById(memoryId);
    if (!existing) {
      throw new Error(`Memory record not found: ${memoryId}`);
    }

    const next: MemoryRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.store.writeJson(getMemoryPath(memoryId), next);
    return next;
  }

  getById(memoryId: string) {
    const record = this.store.readJson(getMemoryPath(memoryId));
    return record ? parseMemoryRecord(record) : null;
  }

  listByScope(scope: MemoryScope) {
    return listMemories(this.store)
      .filter((record) => record.userId === scope.userId && record.workspaceScope === scope.workspaceScope)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  findBySubject(scope: MemoryScope, subject: string, type?: MemoryType) {
    return this.listByScope(scope).filter((record) => record.subject === subject && (type ? record.type === type : true));
  }

  deleteByScope(scope: MemoryScope) {
    for (const record of this.listByScope(scope)) {
      this.store.delete(getMemoryPath(record.id));
    }
  }
}

function listMemories(store: FileStore) {
  return store
    .list("memories")
    .map((filePath) => store.readJson(filePath))
    .filter((record): record is unknown => Boolean(record))
    .map(parseMemoryRecord);
}

function parseMemoryRecord(value: unknown): MemoryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid memory record");
  }

  const record = value as Record<string, unknown>;
  return {
    id: readString(record.id, "memory.id"),
    userId: readString(record.userId, "memory.userId"),
    workspaceScope: readString(record.workspaceScope, "memory.workspaceScope"),
    sessionId: readOptionalString(record.sessionId, "memory.sessionId"),
    type: readMemoryType(record.type),
    tier: readTier(record.tier),
    subject: readString(record.subject, "memory.subject"),
    value: readString(record.value, "memory.value"),
    sensitivity: readSensitivity(record.sensitivity),
    sourceRefs: readStringArray(record.sourceRefs, "memory.sourceRefs"),
    status: readStatus(record.status),
    createdAt: readString(record.createdAt, "memory.createdAt"),
    updatedAt: readString(record.updatedAt, "memory.updatedAt"),
    lastConfirmedAt: readOptionalString(record.lastConfirmedAt, "memory.lastConfirmedAt"),
    lastInjectedAt: readOptionalString(record.lastInjectedAt, "memory.lastInjectedAt"),
    promptHitCount: readOptionalNumber(record.promptHitCount, "memory.promptHitCount") ?? 0,
    expiresAt: readOptionalString(record.expiresAt, "memory.expiresAt"),
    deletedAt: readOptionalString(record.deletedAt, "memory.deletedAt"),
    supersededBy: readOptionalString(record.supersededBy, "memory.supersededBy"),
  };
}

function readMemoryType(value: unknown) {
  if (value === "preference" || value === "goal" || value === "constraint" || value === "relationship" || value === "event" || value === "pattern") {
    return value;
  }
  throw new Error("Invalid memory type");
}

function readTier(value: unknown): MemoryTier {
  if (value === undefined || value === null) {
    return "profile";
  }
  if (value === "profile" || value === "episodic") {
    return value;
  }
  throw new Error("Invalid memory tier");
}

function readSensitivity(value: unknown) {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  throw new Error("Invalid memory sensitivity");
}

function readStatus(value: unknown): MemoryRecordStatus {
  if (value === "active" || value === "superseded" || value === "deleted") {
    return value;
  }
  if (value === "pending" || value === "archived") {
    return "superseded";
  }
  throw new Error("Invalid memory status");
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readOptionalString(value: unknown, field: string) {
  if (value === undefined || value === null) {
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

function readOptionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function getMemoryPath(memoryId: string) {
  return `memories/${memoryId}.json`;
}
