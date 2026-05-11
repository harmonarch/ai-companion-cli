import { FileStore } from "#src/infra/storage/file-store.js";
import type { MemoryPromptDecisionReason, MemoryPromptDecisionStatus, MemoryPromptSelectionEntry } from "#src/types/memory.js";
import type { MemoryPromptSelectionRecord, SystemPromptRecord } from "#src/types/system-prompt.js";

export class SystemPromptRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("system-prompts");
  }

  create(input: Omit<SystemPromptRecord, "createdAt">) {
    const record: SystemPromptRecord = {
      ...input,
      createdAt: new Date().toISOString(),
    };

    this.store.writeJson(getSystemPromptPath(record.assistantMessageId), record);
    return record;
  }

  getByAssistantMessageId(assistantMessageId: string) {
    const record = this.store.readJson(getSystemPromptPath(assistantMessageId));
    return record ? parseSystemPromptRecord(record) : null;
  }

  listBySession(sessionId: string) {
    return listSystemPrompts(this.store)
      .filter((record) => record.sessionId === sessionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  deleteBySession(sessionId: string) {
    for (const record of listSystemPrompts(this.store)) {
      if (record.sessionId === sessionId) {
        this.store.delete(getSystemPromptPath(record.assistantMessageId));
      }
    }
  }

  deleteAll() {
    for (const record of listSystemPrompts(this.store)) {
      this.store.delete(getSystemPromptPath(record.assistantMessageId));
    }
  }
}

function listSystemPrompts(store: FileStore) {
  return store
    .list("system-prompts")
    .map((filePath) => store.readJson(filePath))
    .filter((record): record is unknown => Boolean(record))
    .map(parseSystemPromptRecord);
}

function parseSystemPromptRecord(value: unknown): SystemPromptRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid system prompt record");
  }

  const record = value as Record<string, unknown>;
  return {
    assistantMessageId: readString(record.assistantMessageId, "systemPrompt.assistantMessageId"),
    sessionId: readString(record.sessionId, "systemPrompt.sessionId"),
    runId: readString(record.runId, "systemPrompt.runId"),
    provider: readString(record.provider, "systemPrompt.provider"),
    model: readString(record.model, "systemPrompt.model"),
    systemPrompt: readString(record.systemPrompt, "systemPrompt.systemPrompt"),
    memoryContext: readOptionalString(record.memoryContext, "systemPrompt.memoryContext"),
    memorySelection: readOptionalMemorySelectionRecord(record.memorySelection, "systemPrompt.memorySelection"),
    emotionContext: readOptionalString(record.emotionContext, "systemPrompt.emotionContext"),
    temporalContext: readOptionalString(record.temporalContext, "systemPrompt.temporalContext"),
    messages: readStringArray(record.messages, "systemPrompt.messages"),
    createdAt: readString(record.createdAt, "systemPrompt.createdAt"),
  };
}

function readOptionalMemorySelectionRecord(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }

  const record = value as Record<string, unknown>;
  return {
    queryPreview: readString(record.queryPreview, `${field}.queryPreview`),
    limit: readNumber(record.limit, `${field}.limit`),
    selected: readSelectionEntries(record.selected, `${field}.selected`),
    omitted: readSelectionEntries(record.omitted, `${field}.omitted`),
  } satisfies MemoryPromptSelectionRecord;
}

function readSelectionEntries(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }

  return value.map((entry, index) => readSelectionEntry(entry, `${field}[${index}]`));
}

function readSelectionEntry(value: unknown, field: string): MemoryPromptSelectionEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }

  const entry = value as Record<string, unknown>;
  return {
    memoryId: readString(entry.memoryId, `${field}.memoryId`),
    status: readDecisionStatus(entry.status, `${field}.status`),
    reason: readDecisionReason(entry.reason, `${field}.reason`),
    score: readOptionalNumber(entry.score, `${field}.score`),
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

function readNumber(value: unknown, field: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readOptionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readNumber(value, field);
}

function readDecisionStatus(value: unknown, field: string): MemoryPromptDecisionStatus {
  if (value === "selected" || value === "omitted") {
    return value;
  }
  throw new Error(`Invalid ${field}`);
}

function readDecisionReason(value: unknown, field: string): MemoryPromptDecisionReason {
  if (
    value === "selected_subject_match"
    || value === "selected_value_match"
    || value === "high_sensitivity"
    || value === "superseded"
    || value === "no_query_match"
    || value === "lower_ranked"
    || value === "shadowed_by_newer_exact_match"
    || value === "expired"
    || value === "excluded_episodic_tier"
  ) {
    return value;
  }
  throw new Error(`Invalid ${field}`);
}

function getSystemPromptPath(assistantMessageId: string) {
  return `system-prompts/${assistantMessageId}.json`;
}
