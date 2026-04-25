export type RunStatus = "running" | "completed" | "failed";

export interface RunRecord {
  id: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  provider: string;
  model: string;
  status: RunStatus;
  startedAt: string;
  firstTokenAt?: string;
  completedAt?: string;
  failedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
