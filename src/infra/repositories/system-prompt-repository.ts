import { FileStore } from "#src/infra/storage/file-store.js";
import type { SystemPromptRecord } from "#src/types/system-prompt.js";

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
    emotionContext: readOptionalString(record.emotionContext, "systemPrompt.emotionContext"),
    temporalContext: readOptionalString(record.temporalContext, "systemPrompt.temporalContext"),
    messages: readStringArray(record.messages, "systemPrompt.messages"),
    createdAt: readString(record.createdAt, "systemPrompt.createdAt"),
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

function getSystemPromptPath(assistantMessageId: string) {
  return `system-prompts/${assistantMessageId}.json`;
}
