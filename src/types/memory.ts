export type MemoryType = "preference" | "goal" | "constraint" | "relationship" | "event" | "pattern";
export type MemoryTier = "profile" | "episodic";
export type MemorySensitivity = "low" | "medium" | "high";
export type MemoryRecordStatus = "active" | "superseded" | "deleted";
export type MemoryAuditAction = "create" | "reinforce" | "update" | "delete" | "reject" | "confirm" | "supersede";
export type MemoryAuditTargetType = "candidate" | "memory";
export type MemoryEvidenceKind = "message" | "assistant" | "run" | "tool";
export type MemoryPromptDecisionStatus = "selected" | "omitted";
export type MemoryPromptDecisionReason =
  | "selected_subject_match"
  | "selected_value_match"
  | "high_sensitivity"
  | "superseded"
  | "no_query_match"
  | "lower_ranked"
  | "shadowed_by_newer_exact_match"
  | "expired"
  | "excluded_episodic_tier";

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
  tier: MemoryTier;
  subject: string;
  value: string;
  sensitivity: MemorySensitivity;
  sourceRefs: string[];
  status: MemoryRecordStatus;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt?: string;
  lastInjectedAt?: string;
  promptHitCount?: number;
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

export interface MemoryPromptSelectionEntry {
  memoryId: string;
  status: MemoryPromptDecisionStatus;
  reason: MemoryPromptDecisionReason;
  score?: number;
}

export interface MemoryPromptUsageRecord {
  assistantMessageId: string;
  createdAt: string;
  queryPreview: string;
  status: MemoryPromptDecisionStatus;
  reason: MemoryPromptDecisionReason;
  score?: number;
}

export interface MemoryDetailRecord {
  memory: MemoryRecord;
  evidence: MemoryEvidenceRecord[];
  promptHitCount: number;
  lastInjectedAt?: string;
  promptDecisions: MemoryPromptUsageRecord[];
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
