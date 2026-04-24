import type { ToolExecutionRecord } from "./tool.js";

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageKind = MessageRole;

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface AssistantDraft {
  id: string;
  sessionId: string;
  content: string;
  isStreaming: boolean;
  toolExecutions: ToolExecutionRecord[];
  error?: string;
}
