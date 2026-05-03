export type ToolRiskLevel = "low" | "medium";
export type ToolExecutionStatus = "pending" | "running" | "completed" | "failed" | "denied";

export interface ToolDescriptor {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
}

export interface ToolExecutionRecord {
  id: string;
  sessionId: string;
  runId?: string;
  messageId?: string;
  callId?: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  status: ToolExecutionStatus;
  summary: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ToolConfirmationRequest {
  id: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  summary: string;
  input: Record<string, unknown>;
}
