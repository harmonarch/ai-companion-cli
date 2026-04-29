import crypto from "node:crypto";
import { FileStore } from "../storage/file-store.js";
import type { MemoryCandidate, MemoryCandidateStatus } from "../../types/memory.js";

export class MemoryCandidateRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("memory-candidates");
  }

  create(input: Omit<MemoryCandidate, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const candidate: MemoryCandidate = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.store.writeJson(getCandidatePath(candidate.id), candidate);
    return candidate;
  }

  update(candidateId: string, patch: Partial<Omit<MemoryCandidate, "id" | "createdAt">>) {
    const existing = this.getById(candidateId);
    if (!existing) {
      throw new Error(`Memory candidate not found: ${candidateId}`);
    }

    const next: MemoryCandidate = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.store.writeJson(getCandidatePath(candidateId), next);
    return next;
  }

  getById(candidateId: string) {
    const record = this.store.readJson(getCandidatePath(candidateId));
    return record ? parseMemoryCandidate(record) : null;
  }

  listBySession(sessionId: string) {
    return listCandidates(this.store)
      .filter((candidate) => candidate.sessionId === sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  deleteBySession(sessionId: string) {
    for (const candidate of this.listBySession(sessionId)) {
      this.store.delete(getCandidatePath(candidate.id));
    }
  }

  deleteAll() {
    for (const candidate of listCandidates(this.store)) {
      this.store.delete(getCandidatePath(candidate.id));
    }
  }
}

function listCandidates(store: FileStore) {
  return store
    .list("memory-candidates")
    .map((filePath) => store.readJson(filePath))
    .filter((record): record is unknown => Boolean(record))
    .map(parseMemoryCandidate);
}

function parseMemoryCandidate(value: unknown): MemoryCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid memory candidate");
  }

  const record = value as Record<string, unknown>;
  return {
    id: readString(record.id, "candidate.id"),
    userId: readString(record.userId, "candidate.userId"),
    workspaceScope: readString(record.workspaceScope, "candidate.workspaceScope"),
    sessionId: readString(record.sessionId, "candidate.sessionId"),
    type: readMemoryType(record.type),
    subject: readString(record.subject, "candidate.subject"),
    value: readString(record.value, "candidate.value"),
    confidence: readNumber(record.confidence, "candidate.confidence"),
    sensitivity: readSensitivity(record.sensitivity),
    explicit: readBoolean(record.explicit, "candidate.explicit"),
    evidenceRefs: readStringArray(record.evidenceRefs, "candidate.evidenceRefs"),
    status: readCandidateStatus(record.status),
    reason: readOptionalString(record.reason, "candidate.reason"),
    observedAt: readString(record.observedAt, "candidate.observedAt"),
    createdAt: readString(record.createdAt, "candidate.createdAt"),
    updatedAt: readString(record.updatedAt, "candidate.updatedAt"),
  };
}

function readMemoryType(value: unknown) {
  if (value === "preference" || value === "goal" || value === "constraint" || value === "relationship" || value === "event" || value === "pattern") {
    return value;
  }
  throw new Error("Invalid memory candidate type");
}

function readSensitivity(value: unknown) {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  throw new Error("Invalid memory candidate sensitivity");
}

function readCandidateStatus(value: unknown): MemoryCandidateStatus {
  if (value === "pending" || value === "rejected" || value === "promoted" || value === "needs_confirmation") {
    return value;
  }
  throw new Error("Invalid memory candidate status");
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

function readNumber(value: unknown, field: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function getCandidatePath(candidateId: string) {
  return `memory-candidates/${candidateId}.json`;
}
