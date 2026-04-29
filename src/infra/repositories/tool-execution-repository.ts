import crypto from "node:crypto";
import { FileStore } from "../storage/file-store.js";
import type { ToolExecutionRecord, ToolExecutionStatus, ToolRiskLevel } from "../../types/tool.js";

function compareExecutions(a: ToolExecutionRecord, b: ToolExecutionRecord) {
  return a.createdAt.localeCompare(b.createdAt);
}

export class ToolExecutionRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("tool-executions");
  }

  create(input: Omit<ToolExecutionRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const record: ToolExecutionRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.store.writeJson(getToolExecutionPath(record.id), record);
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

    this.store.writeJson(getToolExecutionPath(recordId), next);
    return next;
  }

  listBySession(sessionId: string) {
    return listToolExecutions(this.store)
      .filter((record) => record.sessionId === sessionId)
      .sort(compareExecutions);
  }

  getById(recordId: string) {
    const record = this.store.readJson(getToolExecutionPath(recordId));
    return record ? parseToolExecutionRecord(record) : null;
  }

  deleteBySession(sessionId: string) {
    for (const record of listToolExecutions(this.store)) {
      if (record.sessionId === sessionId) {
        this.store.delete(getToolExecutionPath(record.id));
      }
    }
  }

  deleteAll() {
    for (const record of listToolExecutions(this.store)) {
      this.store.delete(getToolExecutionPath(record.id));
    }
  }
}

function listToolExecutions(store: FileStore) {
  return store
    .list("tool-executions")
    .map((filePath) => store.readJson(filePath))
    .filter((record): record is unknown => Boolean(record))
    .map(parseToolExecutionRecord);
}

function parseToolExecutionRecord(value: unknown): ToolExecutionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid tool execution record");
  }

  const record = value as Record<string, unknown>;
  return {
    id: readString(record.id, "toolExecution.id"),
    sessionId: readString(record.sessionId, "toolExecution.sessionId"),
    runId: readOptionalString(record.runId, "toolExecution.runId"),
    messageId: readOptionalString(record.messageId, "toolExecution.messageId"),
    toolName: readString(record.toolName, "toolExecution.toolName"),
    riskLevel: readRiskLevel(record.riskLevel),
    status: readToolExecutionStatus(record.status),
    summary: readString(record.summary, "toolExecution.summary"),
    input: readObject(record.input, "toolExecution.input"),
    output: readObject(record.output, "toolExecution.output"),
    createdAt: readString(record.createdAt, "toolExecution.createdAt"),
    updatedAt: readString(record.updatedAt, "toolExecution.updatedAt"),
  };
}

function readRiskLevel(value: unknown): ToolRiskLevel {
  if (value === "low" || value === "medium") {
    return value;
  }
  throw new Error("Invalid tool risk level");
}

function readToolExecutionStatus(value: unknown): ToolExecutionStatus {
  if (value === "pending" || value === "running" || value === "completed" || value === "failed" || value === "denied") {
    return value;
  }
  throw new Error("Invalid tool execution status");
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

function readObject(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value as Record<string, unknown>;
}

function getToolExecutionPath(recordId: string) {
  return `tool-executions/${recordId}.json`;
}
