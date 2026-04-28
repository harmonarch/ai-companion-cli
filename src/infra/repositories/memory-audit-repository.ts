import crypto from "node:crypto";
import { FileStore } from "../storage/file-store.js";
import type { MemoryAuditAction, MemoryAuditEvent, MemoryAuditTargetType, MemoryScope } from "../../types/memory.js";

export class MemoryAuditRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("memory-audits");
  }

  create(input: Omit<MemoryAuditEvent, "eventId">) {
    const event: MemoryAuditEvent = {
      ...input,
      eventId: crypto.randomUUID(),
    };
    this.store.writeJson(getAuditPath(event.eventId), event);
    return event;
  }

  listByScope(scope: MemoryScope) {
    return listAudits(this.store)
      .filter((event) => event.userId === scope.userId && event.workspaceScope === scope.workspaceScope)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
}

function listAudits(store: FileStore) {
  return store
    .list("memory-audits")
    .map((filePath) => store.readJson(filePath))
    .filter((record): record is unknown => Boolean(record))
    .map(parseMemoryAuditEvent);
}

function parseMemoryAuditEvent(value: unknown): MemoryAuditEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid memory audit event");
  }

  const record = value as Record<string, unknown>;
  return {
    eventId: readString(record.eventId, "memoryAudit.eventId"),
    targetId: readString(record.targetId, "memoryAudit.targetId"),
    targetType: readTargetType(record.targetType),
    action: readAction(record.action),
    actor: readActor(record.actor),
    userId: readString(record.userId, "memoryAudit.userId"),
    workspaceScope: readString(record.workspaceScope, "memoryAudit.workspaceScope"),
    sessionId: readOptionalString(record.sessionId, "memoryAudit.sessionId"),
    runId: readOptionalString(record.runId, "memoryAudit.runId"),
    before: readOptionalObject(record.before, "memoryAudit.before"),
    after: readOptionalObject(record.after, "memoryAudit.after"),
    reason: readOptionalString(record.reason, "memoryAudit.reason"),
    sourceRefs: readStringArray(record.sourceRefs, "memoryAudit.sourceRefs"),
    timestamp: readString(record.timestamp, "memoryAudit.timestamp"),
  };
}

function readTargetType(value: unknown): MemoryAuditTargetType {
  if (value === "candidate" || value === "memory") {
    return value;
  }
  throw new Error("Invalid memory audit target type");
}

function readAction(value: unknown): MemoryAuditAction {
  if (value === "create" || value === "reinforce" || value === "update" || value === "delete" || value === "reject" || value === "confirm" || value === "supersede") {
    return value;
  }
  throw new Error("Invalid memory audit action");
}

function readActor(value: unknown) {
  if (value === "system" || value === "user") {
    return value;
  }
  throw new Error("Invalid memory audit actor");
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

function readOptionalObject(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value as Record<string, unknown>;
}

function getAuditPath(eventId: string) {
  return `memory-audits/${eventId}.json`;
}
