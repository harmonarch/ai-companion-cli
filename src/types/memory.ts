export type MemoryType = "preference" | "goal" | "constraint" | "relationship" | "event" | "pattern";
export type MemoryKind = "profile" | "episodic";
export type MemorySensitivity = "low" | "medium" | "high";
export type MemoryCandidateStatus = "pending" | "rejected" | "promoted" | "needs_confirmation";
export type MemoryRecordStatus = "pending" | "active" | "superseded" | "archived" | "deleted";
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
  answerStrategy?: string;
  temporaryConstraints: string[];
  openQuestions: string[];
  discussedOptions: string[];
  recentObservations: string[];
  toolFindings: string[];
  updatedAt: string;
}

export interface MemoryCandidate extends MemoryScope {
  id: string;
  sessionId: string;
  type: MemoryType;
  subject: string;
  value: string;
  confidence: number;
  sensitivity: MemorySensitivity;
  explicit: boolean;
  evidenceRefs: string[];
  status: MemoryCandidateStatus;
  reason?: string;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRecord extends MemoryScope {
  id: string;
  sessionId?: string;
  kind: MemoryKind;
  type: MemoryType;
  subject: string;
  value: string;
  confidence: number;
  sensitivity: MemorySensitivity;
  explicit: boolean;
  sourceRefs: string[];
  status: MemoryRecordStatus;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt?: string;
  expiresAt?: string;
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
