import type { MemoryPromptSelectionEntry } from "#src/types/memory.js";

export interface MemoryPromptSelectionRecord {
  queryPreview: string;
  limit: number;
  selected: MemoryPromptSelectionEntry[];
  omitted: MemoryPromptSelectionEntry[];
}

export interface SystemPromptRecord {
  assistantMessageId: string;
  sessionId: string;
  runId: string;
  provider: string;
  model: string;
  systemPrompt: string;
  memoryContext?: string;
  memorySelection?: MemoryPromptSelectionRecord;
  emotionContext?: string;
  temporalContext?: string;
  messages: string[];
  createdAt: string;
}
