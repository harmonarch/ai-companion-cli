import { FileStore } from "../storage/file-store.js";
import type { EmotionState, EmotionPrimaryState, EmotionTransitionReason } from "../../types/emotion.js";

export class EmotionStateRepository {
  constructor(private readonly store: FileStore) {
    this.store.ensureDir("emotions");
  }

  getBySessionId(sessionId: string) {
    const record = this.store.readJson(getEmotionPath(sessionId));
    return record ? parseEmotionState(record) : null;
  }

  upsert(state: EmotionState) {
    this.store.writeJson(getEmotionPath(state.sessionId), state);
    return state;
  }

  deleteBySession(sessionId: string) {
    this.store.delete(getEmotionPath(sessionId));
  }

  deleteAll() {
    for (const filePath of this.store.list("emotions")) {
      this.store.delete(filePath);
    }
  }
}

function parseEmotionState(value: unknown): EmotionState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid emotion state");
  }

  const record = value as Record<string, unknown>;
  const primary = readPrimaryState(record.primary, "emotion.primary");
  const lastTrigger = readOptionalTransitionReason(record.lastTrigger, "emotion.lastTrigger");

  return {
    sessionId: readString(record.sessionId, "emotion.sessionId"),
    primary,
    intensity: readNumber(record.intensity, "emotion.intensity"),
    intimacy: readNumber(record.intimacy, "emotion.intimacy"),
    boundaryActive: readBoolean(record.boundaryActive, "emotion.boundaryActive"),
    lastTrigger,
    turnsSinceTrigger: readNumber(record.turnsSinceTrigger, "emotion.turnsSinceTrigger"),
    updatedAt: readString(record.updatedAt, "emotion.updatedAt"),
  };
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string") {
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

function readPrimaryState(value: unknown, field: string): EmotionPrimaryState {
  if (value !== "neutral" && value !== "angry") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readOptionalTransitionReason(value: unknown, field: string): EmotionTransitionReason | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value !== "disrespect"
    && value !== "pressure"
    && value !== "boundary"
    && value !== "repair"
    && value !== "cooperation"
    && value !== "assistant_settle"
    && value !== "time_decay"
  ) {
    throw new Error(`Invalid ${field}`);
  }

  return value;
}

function getEmotionPath(sessionId: string) {
  return `emotions/${sessionId}.json`;
}
