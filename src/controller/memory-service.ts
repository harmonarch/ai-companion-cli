import type { PromptLoader } from "../prompts/loader.js";
import type { SessionRecord } from "../types/session.js";
import { messageContentToPlainText, type ChatMessage } from "../types/chat.js";
import type { ToolExecutionRecord } from "../types/tool.js";
import type { RunRecord } from "../types/run.js";
import type {
  MemoryCandidate,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemoryType,
  SessionScratchpad,
} from "../types/memory.js";
import { SessionScratchpadRepository } from "../infra/repositories/session-scratchpad-repository.js";
import { MemoryCandidateRepository } from "../infra/repositories/memory-candidate-repository.js";
import { MemoryRecordRepository } from "../infra/repositories/memory-record-repository.js";
import { MemoryAuditRepository } from "../infra/repositories/memory-audit-repository.js";

interface MemoryServiceConfig {
  enabled: boolean;
  userId: string;
  autoWriteLowRisk: boolean;
  workspaceScope: string;
}

interface ProcessTurnInput {
  session: SessionRecord;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  run: RunRecord;
  toolExecutions: ToolExecutionRecord[];
  extractMemoryCandidates(prompt: string): Promise<string>;
}

export class MemoryService {
  constructor(
    private readonly config: MemoryServiceConfig,
    private readonly promptLoader: PromptLoader,
    private readonly scratchpadRepository: SessionScratchpadRepository,
    private readonly candidateRepository: MemoryCandidateRepository,
    private readonly memoryRecordRepository: MemoryRecordRepository,
    private readonly memoryAuditRepository: MemoryAuditRepository,
  ) {}

  deleteSessionState(sessionId: string) {
    this.scratchpadRepository.deleteBySession(sessionId);
    this.candidateRepository.deleteBySession(sessionId);
  }

  resetAll() {
    if (!this.isEnabled()) {
      return;
    }

    this.scratchpadRepository.deleteAll();
    this.candidateRepository.deleteAll();
    this.memoryRecordRepository.deleteByScope(this.getScope());
    this.memoryAuditRepository.deleteByScope(this.getScope());
  }

  isEnabled() {
    return this.config.enabled;
  }

  getScope(): MemoryScope {
    return {
      userId: this.config.userId,
      workspaceScope: this.config.workspaceScope,
    };
  }

  updateScratchpad(sessionId: string, input: string, toolExecutions: ToolExecutionRecord[]) {
    if (!this.isEnabled()) {
      return null;
    }

    const now = new Date().toISOString();
    const existing = this.scratchpadRepository.getBySessionId(sessionId);
    const scratchpad: SessionScratchpad = {
      sessionId,
      currentTask: input.trim() || existing?.currentTask,
      answerStrategy: existing?.answerStrategy,
      temporaryConstraints: existing?.temporaryConstraints ?? [],
      openQuestions: existing?.openQuestions ?? [],
      discussedOptions: existing?.discussedOptions ?? [],
      recentObservations: appendRecent(existing?.recentObservations ?? [], normalizeText(input), 6),
      toolFindings: appendRecent(existing?.toolFindings ?? [], toolExecutions.map((execution) => execution.summary), 6),
      updatedAt: now,
    };

    return this.scratchpadRepository.upsert(scratchpad);
  }

  retrieveForPrompt() {
    if (!this.isEnabled()) {
      return { records: [], context: "" };
    }

    const now = Date.now();
    const records = this.listMemories()
      .filter((record) => record.status === "active")
      .filter((record) => !record.deletedAt)
      .filter((record) => !record.expiresAt || Date.parse(record.expiresAt) > now)
      .filter((record) => record.sensitivity !== "high")
      .sort((a, b) => (b.lastConfirmedAt ?? b.updatedAt).localeCompare(a.lastConfirmedAt ?? a.updatedAt));

    return {
      records,
      context: this.promptLoader.renderMemoryContext(records),
    };
  }

  listMemories() {
    if (!this.isEnabled()) {
      return [];
    }

    const records = this.memoryRecordRepository.listByScope(this.getScope());

    return records
      .filter((record) => record.status !== "deleted")
      .filter((record) => !record.deletedAt);
  }

  deleteMemory(memoryId: string, sessionId?: string) {
    const existing = this.memoryRecordRepository.getById(memoryId);
    if (!existing) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    if (existing.userId !== this.config.userId || existing.workspaceScope !== this.config.workspaceScope) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    if (sessionId && existing.sessionId !== sessionId) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    if (existing.status === "deleted") {
      return existing;
    }

    const now = new Date().toISOString();
    const next = this.memoryRecordRepository.update(memoryId, {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });

    this.memoryAuditRepository.create({
      ...this.getScope(),
      targetId: next.id,
      targetType: "memory",
      action: "delete",
      actor: "user",
      before: snapshotMemory(existing),
      after: snapshotMemory(next),
      reason: "deleted by user",
      sourceRefs: next.sourceRefs,
      timestamp: now,
    });

    return next;
  }

  updateMemory(memoryId: string, patch: { subject?: string; value?: string }, sessionId?: string) {
    const existing = this.memoryRecordRepository.getById(memoryId);
    if (!existing) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    if (existing.userId !== this.config.userId || existing.workspaceScope !== this.config.workspaceScope) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    if (sessionId && existing.sessionId !== sessionId) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const subject = patch.subject === undefined ? existing.subject : normalizeText(patch.subject).slice(0, 120);
    const value = patch.value === undefined ? existing.value : normalizeText(patch.value).slice(0, 280);

    if (!subject) {
      throw new Error("Memory subject is required.");
    }
    if (!value) {
      throw new Error("Memory value is required.");
    }
    if (subject === existing.subject && value === existing.value) {
      return existing;
    }

    const now = new Date().toISOString();
    const next = this.memoryRecordRepository.update(memoryId, {
      subject,
      value,
      updatedAt: now,
    });

    this.memoryAuditRepository.create({
      ...this.getScope(),
      targetId: next.id,
      targetType: "memory",
      action: "update",
      actor: "user",
      before: snapshotMemory(existing),
      after: snapshotMemory(next),
      reason: "edited by user",
      sourceRefs: next.sourceRefs,
      timestamp: now,
    });

    return next;
  }

  async processCompletedTurn(input: ProcessTurnInput) {
    if (!this.isEnabled()) {
      return;
    }

    const scratchpad = this.scratchpadRepository.getBySessionId(input.session.id);
    const candidates = await this.extractCandidates({ ...input, scratchpad });
    for (const extracted of candidates) {
      const candidate = this.candidateRepository.create(extracted);
      const outcome = this.consolidateCandidate(candidate);

      if (outcome.kind === "reject") {
        const rejected = this.candidateRepository.update(candidate.id, {
          status: outcome.status,
          reason: outcome.reason,
        });
        this.memoryAuditRepository.create({
          ...this.getScope(),
          targetId: rejected.id,
          targetType: "candidate",
          action: "reject",
          actor: "system",
          sessionId: input.session.id,
          runId: input.run.id,
          after: snapshotCandidate(rejected),
          reason: outcome.reason,
          sourceRefs: rejected.evidenceRefs,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const promotedCandidate = this.candidateRepository.update(candidate.id, {
        status: "promoted",
        reason: outcome.reason,
      });

      if (outcome.kind === "duplicate") {
        const updated = this.memoryRecordRepository.update(outcome.record.id, {
          confidence: clampConfidence(Math.max(outcome.record.confidence, promotedCandidate.confidence)),
          lastConfirmedAt: input.assistantMessage.createdAt,
          sourceRefs: mergeRefs(outcome.record.sourceRefs, promotedCandidate.evidenceRefs),
        });
        this.memoryAuditRepository.create({
          ...this.getScope(),
          targetId: updated.id,
          targetType: "memory",
          action: "reinforce",
          actor: "system",
          sessionId: input.session.id,
          runId: input.run.id,
          before: snapshotMemory(outcome.record),
          after: snapshotMemory(updated),
          reason: outcome.reason,
          sourceRefs: promotedCandidate.evidenceRefs,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      if (outcome.kind === "update") {
        const created = this.memoryRecordRepository.create({
          ...candidateToRecord(promotedCandidate),
          kind: outcome.kindValue,
          status: "active",
          lastConfirmedAt: input.assistantMessage.createdAt,
          expiresAt: outcome.expiresAt,
        });
        const superseded = this.memoryRecordRepository.update(outcome.previous.id, {
          status: "superseded",
          supersededBy: created.id,
        });
        this.memoryAuditRepository.create({
          ...this.getScope(),
          targetId: superseded.id,
          targetType: "memory",
          action: "supersede",
          actor: "system",
          sessionId: input.session.id,
          runId: input.run.id,
          before: snapshotMemory(outcome.previous),
          after: snapshotMemory(superseded),
          reason: outcome.reason,
          sourceRefs: promotedCandidate.evidenceRefs,
          timestamp: new Date().toISOString(),
        });
        this.memoryAuditRepository.create({
          ...this.getScope(),
          targetId: created.id,
          targetType: "memory",
          action: "update",
          actor: "system",
          sessionId: input.session.id,
          runId: input.run.id,
          after: snapshotMemory(created),
          reason: outcome.reason,
          sourceRefs: promotedCandidate.evidenceRefs,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const created = this.memoryRecordRepository.create({
        ...candidateToRecord(promotedCandidate),
        kind: outcome.kindValue,
        status: "active",
        lastConfirmedAt: input.assistantMessage.createdAt,
        expiresAt: outcome.expiresAt,
      });
      this.memoryAuditRepository.create({
        ...this.getScope(),
        targetId: created.id,
        targetType: "memory",
        action: "create",
        actor: "system",
        sessionId: input.session.id,
        runId: input.run.id,
        after: snapshotMemory(created),
        reason: outcome.reason,
        sourceRefs: promotedCandidate.evidenceRefs,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async extractCandidates(input: ProcessTurnInput & { scratchpad: SessionScratchpad | null }) {
    const normalized = normalizeText(messageContentToPlainText(input.userMessage.content));
    if (!normalized) {
      return [];
    }

    const prompt = buildExtractionPrompt({
      policy: this.promptLoader.loadMemoryExtractionPrompt(),
      scratchpad: input.scratchpad,
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
      run: input.run,
      toolExecutions: input.toolExecutions,
    });

    let rawResponse = "";
    try {
      rawResponse = await input.extractMemoryCandidates(prompt);
    } catch {
      return [];
    }

    const extracted = parseExtractedCandidates(rawResponse);
    const evidenceRefs = [
      `message:${input.userMessage.id}`,
      `assistant:${input.assistantMessage.id}`,
      `run:${input.run.id}`,
      ...input.toolExecutions.map((execution) => `tool:${execution.id}`),
    ];

    return dedupeCandidates(
      extracted
        .map((candidate): Omit<MemoryCandidate, "id" | "createdAt" | "updatedAt"> => ({
          ...this.getScope(),
          sessionId: input.session.id,
          type: candidate.type,
          subject: normalizeText(candidate.subject).slice(0, 120),
          value: normalizeText(candidate.value).slice(0, 280),
          confidence: clampConfidence(candidate.confidence ?? 0.7),
          sensitivity: candidate.sensitivity ?? "low",
          explicit: candidate.explicit ?? false,
          evidenceRefs,
          status: "pending",
          reason: candidate.reason ?? "model extracted candidate",
          observedAt: input.userMessage.createdAt,
        }))
        .filter((candidate) => candidate.subject && candidate.value),
    );
  }

  private consolidateCandidate(candidate: MemoryCandidate): ConsolidationOutcome {
    if (!this.config.autoWriteLowRisk) {
      return reject("automatic memory writes are disabled", "needs_confirmation");
    }

    if (!candidate.explicit) {
      return reject("candidate is not explicit", "rejected");
    }

    if (candidate.sensitivity !== "low") {
      return reject("sensitive candidate stays out of automatic long-term memory", "rejected");
    }

    const tombstone = this.memoryRecordRepository
      .findBySubject(this.getScope(), candidate.subject, candidate.type)
      .find((record) => record.status === "deleted");
    if (tombstone) {
      return reject("subject was deleted before and now requires explicit reconfirmation", "needs_confirmation");
    }

    const related = this.memoryRecordRepository.findBySubject(this.getScope(), candidate.subject, candidate.type);
    const active = related.find((record) => record.status === "active");

    if (!active) {
      return {
        kind: "create",
        kindValue: inferMemoryKind(candidate),
        reason: "new active memory",
        expiresAt: inferExpiresAt(candidate),
      };
    }

    if (active.value === candidate.value) {
      return {
        kind: "duplicate",
        record: active,
        reason: "same subject and value reinforced",
      };
    }

    return {
      kind: "update",
      previous: active,
      kindValue: inferMemoryKind(candidate),
      reason: "new explicit value supersedes existing active memory",
      expiresAt: inferExpiresAt(candidate),
    };
  }
}

type ConsolidationOutcome =
  | { kind: "create"; kindValue: MemoryKind; reason: string; expiresAt?: string }
  | { kind: "duplicate"; record: MemoryRecord; reason: string }
  | { kind: "update"; previous: MemoryRecord; kindValue: MemoryKind; reason: string; expiresAt?: string }
  | { kind: "reject"; status: MemoryCandidate["status"]; reason: string };

function reject(reason: string, status: MemoryCandidate["status"]): ConsolidationOutcome {
  return { kind: "reject", status, reason };
}

function candidateToRecord(candidate: MemoryCandidate) {
  return {
    userId: candidate.userId,
    workspaceScope: candidate.workspaceScope,
    sessionId: candidate.sessionId,
    type: candidate.type,
    subject: candidate.subject,
    value: candidate.value,
    confidence: clampConfidence(candidate.confidence),
    sensitivity: candidate.sensitivity,
    explicit: candidate.explicit,
    sourceRefs: candidate.evidenceRefs,
  };
}

function inferMemoryKind(candidate: MemoryCandidate): MemoryKind {
  if (candidate.type === "event" || candidate.type === "pattern") {
    return "episodic";
  }
  return "profile";
}

function inferExpiresAt(candidate: MemoryCandidate) {
  if (candidate.type !== "event" && candidate.type !== "pattern") {
    return undefined;
  }
  const next = new Date();
  next.setDate(next.getDate() + 30);
  return next.toISOString();
}

function summarizeStylePreference(lower: string) {
  const parts: string[] = [];
  if (lower.includes("brief") || lower.includes("short") || lower.includes("concise")) {
    parts.push("brief");
  }
  if (lower.includes("direct")) {
    parts.push("direct");
  }
  return parts.length > 0 ? parts.join(" and ") : "brief and direct";
}

function appendRecent(existing: string[], next: string | string[], limit: number) {
  const entries = Array.isArray(next) ? next : next ? [next] : [];
  return [...existing, ...entries].filter(Boolean).slice(-limit);
}

function buildExtractionPrompt({
  policy,
  scratchpad,
  userMessage,
  assistantMessage,
  run,
  toolExecutions,
}: {
  policy: string;
  scratchpad: SessionScratchpad | null;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  run: RunRecord;
  toolExecutions: ToolExecutionRecord[];
}) {
  return [
    policy,
    "",
    "Return JSON only.",
    "Schema:",
    '{"candidates":[{"type":"preference|goal|constraint|relationship|event|pattern","subject":"string","value":"string","confidence":0.0,"sensitivity":"low|medium|high","explicit":true,"reason":"string"}]}',
    "",
    "Constraints:",
    "- Use only explicit user statements from the evidence below.",
    "- Keep candidates sparse; return an empty array when unsure.",
    "- Do not infer hidden traits or identity.",
    "- Put short-lived items in event or pattern, not profile-style preference.",
    "",
    "Evidence:",
    `User message (${userMessage.createdAt}): ${normalizeText(messageContentToPlainText(userMessage.content))}`,
    `Assistant message (${assistantMessage.createdAt}): ${normalizeText(messageContentToPlainText(assistantMessage.content))}`,
    `Run id: ${run.id}`,
    `Scratchpad: ${JSON.stringify(scratchpad ?? null)}`,
    `Tool summaries: ${JSON.stringify(toolExecutions.map((execution) => execution.summary))}`,
  ].join("\n");
}

function parseExtractedCandidates(rawResponse: string): Array<{
  type: MemoryType;
  subject: string;
  value: string;
  confidence?: number;
  sensitivity?: MemoryCandidate["sensitivity"];
  explicit?: boolean;
  reason?: string;
}> {
  const parsed = parseJsonObject(rawResponse);
  if (!parsed || typeof parsed !== "object" || !("candidates" in parsed) || !Array.isArray(parsed.candidates)) {
    return [];
  }

  return parsed.candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }

    const type = readMemoryType(candidate.type);
    const subject = typeof candidate.subject === "string" ? candidate.subject : "";
    const value = typeof candidate.value === "string" ? candidate.value : "";
    const confidence = typeof candidate.confidence === "number" ? candidate.confidence : undefined;
    const sensitivity = readSensitivity(candidate.sensitivity);
    const explicit = typeof candidate.explicit === "boolean" ? candidate.explicit : undefined;
    const reason = typeof candidate.reason === "string" ? candidate.reason : undefined;

    if (!type || !subject.trim() || !value.trim()) {
      return [];
    }

    return [{
      type,
      subject,
      value,
      confidence,
      sensitivity,
      explicit,
      reason,
    }];
  });
}

function parseJsonObject(rawResponse: string): Record<string, unknown> | null {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    return null;
  }

  const direct = tryParseJson(trimmed);
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const sliced = trimmed.slice(start, end + 1);
  const nested = tryParseJson(sliced);
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  return null;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readMemoryType(value: unknown): MemoryType | null {
  return value === "preference"
    || value === "goal"
    || value === "constraint"
    || value === "relationship"
    || value === "event"
    || value === "pattern"
    ? value
    : null;
}

function readSensitivity(value: unknown): MemoryCandidate["sensitivity"] | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function mergeRefs(current: string[], next: string[]) {
  return [...new Set([...current, ...next])];
}

function clampConfidence(value: number) {
  return Math.min(0.99, Math.max(0.1, Number(value.toFixed(2))));
}

function snapshotMemory(record: MemoryRecord) {
  return {
    id: record.id,
    subject: record.subject,
    value: record.value,
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

function snapshotCandidate(record: MemoryCandidate) {
  return {
    id: record.id,
    subject: record.subject,
    value: record.value,
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

function dedupeCandidates(candidates: Array<Omit<MemoryCandidate, "id" | "createdAt" | "updatedAt">>) {
  const unique = new Map<string, Omit<MemoryCandidate, "id" | "createdAt" | "updatedAt">>();
  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.subject}:${candidate.value}`;
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
  }
  return [...unique.values()];
}
