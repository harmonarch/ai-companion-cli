export type MemoryType = "preference" | "goal" | "constraint" | "relationship" | "event" | "pattern";
export type MemorySensitivity = "low" | "medium" | "high";
export type MemoryRecordStatus = "active" | "superseded" | "deleted";
export type MemoryAuditAction = "create" | "reinforce" | "update" | "delete" | "reject" | "confirm" | "supersede";
export type MemoryAuditTargetType = "candidate" | "memory";
export type MemoryEvidenceKind = "message" | "assistant" | "run" | "tool";

export interface MemoryScope {
  userId: string;
  workspaceScope: string;
}

export interface SessionScratchpad {
  sessionId: string;
  currentTask?: string;
  recentObservations: string[];
  toolFindings: string[];
  updatedAt: string;
}

export interface MemoryRecord extends MemoryScope {
  id: string;
  sessionId?: string;
  type: MemoryType;
  subject: string;
  value: string;
  sensitivity: MemorySensitivity;
  sourceRefs: string[];
  status: MemoryRecordStatus;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt?: string;
  deletedAt?: string;
  supersededBy?: string;
}

export interface MemoryEvidenceMessageSummary {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  preview: string;
  createdAt: string;
}

export interface MemoryEvidenceRecord {
  rawRef: string;
  kind: MemoryEvidenceKind;
  refId: string;
  sessionId?: string;
  sessionTitle?: string;
  runId?: string;
  toolName?: string;
  message?: MemoryEvidenceMessageSummary;
  unresolvedReason?: string;
}

export interface MemoryDetailRecord {
  memory: MemoryRecord;
  evidence: MemoryEvidenceRecord[];
}

export interface MemoryAuditEvent extends MemoryScope {
  eventId: string;
  targetId: string;
  targetType: MemoryAuditTargetType;
  action: MemoryAuditAction;
  actor: "system" | "user";
  sessionId?: string;
  runId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  sourceRefs: string[];
  timestamp: string;
}
