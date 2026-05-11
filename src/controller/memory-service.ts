/**
 * Memory 服务。
 * 负责维护 scratchpad、抽取候选记忆、合并长期记忆，以及记录每次记忆写入/拒绝/更新的审计轨迹。
 */
import type { PromptLoader } from "#src/prompts/loader.js";
import type { SessionRecord } from "#src/types/session.js";
import { messageContentToPlainText, type ChatMessage } from "#src/types/chat.js";
import type { ToolExecutionRecord } from "#src/types/tool.js";
import type { RunRecord } from "#src/types/run.js";
import type {
  MemoryRecord,
  MemoryScope,
  MemoryTier,
  MemoryType,
  SessionScratchpad,
  MemorySensitivity,
} from "#src/types/memory.js";
import type { MemoryPromptSelectionRecord } from "#src/types/system-prompt.js";
import { SessionScratchpadRepository } from "#src/infra/repositories/session-scratchpad-repository.js";
import { MemoryRecordRepository } from "#src/infra/repositories/memory-record-repository.js";
import { MemoryAuditRepository } from "#src/infra/repositories/memory-audit-repository.js";
import { PROMPT_MEMORY_LIMIT, normalizeMemoryText, selectMemoriesForPrompt } from "#src/controller/memory-selection.js";

interface MemoryServiceConfig {
  enabled: boolean;
  userId: string;
  autoWriteLowRisk: boolean;
  episodicTtlHoursDefault: number;
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

interface ExtractedMemoryCandidate extends MemoryScope {
  sessionId: string;
  type: MemoryType;
  tier: MemoryTier;
  subject: string;
  value: string;
  sensitivity: MemorySensitivity;
  explicit: boolean;
  evidenceRefs: string[];
}

export class MemoryService {
  constructor(
    private readonly config: MemoryServiceConfig,
    private readonly promptLoader: PromptLoader,
    private readonly scratchpadRepository: SessionScratchpadRepository,
    private readonly memoryRecordRepository: MemoryRecordRepository,
    private readonly memoryAuditRepository: MemoryAuditRepository,
  ) {}

  deleteSessionState(sessionId: string) {
    this.scratchpadRepository.deleteBySession(sessionId);
  }

  resetAll() {
    if (!this.isEnabled()) {
      return;
    }

    this.scratchpadRepository.deleteAll();
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
    /**
     * scratchpad 只保存最近几轮对当前任务仍有帮助的短期上下文。
     * 它面向“本次会话还在继续”，长期记忆是否写入要等回合结束后的候选提取与合并。
     */
    if (!this.isEnabled()) {
      return null;
    }

    const now = new Date().toISOString();
    const existing = this.scratchpadRepository.getBySessionId(sessionId);
    const scratchpad: SessionScratchpad = {
      sessionId,
      currentTask: input.trim() || existing?.currentTask,
      recentObservations: appendRecent(existing?.recentObservations ?? [], normalizeText(input), 6),
      toolFindings: appendRecent(existing?.toolFindings ?? [], toolExecutions.map((execution) => execution.summary), 6),
      updatedAt: now,
    };

    return this.scratchpadRepository.upsert(scratchpad);
  }

  retrieveForPrompt(query: string) {
    /**
     * 进入 prompt 的 memory 会先经过状态和敏感度过滤。
     * 这里同时返回选中的 records、原因元数据，以及渲染好的 prompt context。
     */
    if (!this.isEnabled()) {
      return {
        records: [],
        context: "",
        memorySelection: {
          queryPreview: "",
          limit: PROMPT_MEMORY_LIMIT,
          selected: [],
          omitted: [],
        } satisfies MemoryPromptSelectionRecord,
      };
    }

    const records = this.listMemories();
    const selection = selectMemoriesForPrompt(records, query);

    return {
      records: selection.selectedRecords,
      context: this.promptLoader.renderMemoryContext(selection.selectedRecords),
      memorySelection: {
        queryPreview: normalizeText(query).slice(0, 160),
        limit: PROMPT_MEMORY_LIMIT,
        selected: selection.selectedEntries,
        omitted: selection.omittedEntries,
      } satisfies MemoryPromptSelectionRecord,
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

  recordPromptHits(memoryIds: string[], timestamp: string) {
    if (!this.isEnabled() || memoryIds.length === 0) {
      return [];
    }

    return memoryIds.flatMap((memoryId) => {
      const existing = this.memoryRecordRepository.getById(memoryId);
      if (!existing) {
        return [];
      }
      if (existing.userId !== this.config.userId || existing.workspaceScope !== this.config.workspaceScope) {
        return [];
      }

      return [this.memoryRecordRepository.update(memoryId, {
        promptHitCount: (existing.promptHitCount ?? 0) + 1,
        lastInjectedAt: timestamp,
      })];
    });
  }

  deleteMemory(memoryId: string) {
    const existing = this.memoryRecordRepository.getById(memoryId);
    if (!existing) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    if (existing.userId !== this.config.userId || existing.workspaceScope !== this.config.workspaceScope) {
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

  updateMemory(memoryId: string, patch: { subject?: string; value?: string }) {
    const existing = this.memoryRecordRepository.getById(memoryId);
    if (!existing) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    if (existing.userId !== this.config.userId || existing.workspaceScope !== this.config.workspaceScope) {
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
    /**
     * 一轮对话结束后，memory 流程才真正开始。
     * 顺序是：读取 scratchpad -> 让模型抽候选 -> 候选去重/判定 -> 写入或驳回长期记忆 -> 记录审计。
     */
    if (!this.isEnabled()) {
      return;
    }

    const scratchpad = this.scratchpadRepository.getBySessionId(input.session.id);
    const candidates = await this.extractCandidates({ ...input, scratchpad });
    for (const candidate of candidates) {
      const outcome = this.consolidateCandidate(candidate);

      if (outcome.kind === "reject") {
        this.memoryAuditRepository.create({
          ...this.getScope(),
          targetId: `${input.run.id}:${candidate.type}:${candidate.subject}`,
          targetType: "candidate",
          action: "reject",
          actor: "system",
          sessionId: input.session.id,
          runId: input.run.id,
          after: snapshotCandidate(candidate),
          reason: outcome.reason,
          sourceRefs: candidate.evidenceRefs,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      if (outcome.kind === "duplicate") {
        const updated = this.memoryRecordRepository.update(outcome.record.id, {
          lastConfirmedAt: input.assistantMessage.createdAt,
          expiresAt: getNextExpiration(candidate, this.config.episodicTtlHoursDefault),
          sourceRefs: mergeRefs(outcome.record.sourceRefs, candidate.evidenceRefs),
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
          sourceRefs: candidate.evidenceRefs,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      if (outcome.kind === "update") {
        const created = this.memoryRecordRepository.create({
          ...candidateToRecord(candidate, this.config.episodicTtlHoursDefault),
          status: "active",
          lastConfirmedAt: input.assistantMessage.createdAt,
          promptHitCount: 0,
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
          sourceRefs: candidate.evidenceRefs,
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
          sourceRefs: candidate.evidenceRefs,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const created = this.memoryRecordRepository.create({
        ...candidateToRecord(candidate, this.config.episodicTtlHoursDefault),
        status: "active",
        lastConfirmedAt: input.assistantMessage.createdAt,
        promptHitCount: 0,
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
        sourceRefs: candidate.evidenceRefs,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async extractCandidates(input: ProcessTurnInput & { scratchpad: SessionScratchpad | null }) {
    /**
     * 候选提取拿到的是模型输出，不直接落长期记忆。
     * 后面还要经过显式性、敏感度、重复度和 tombstone 等规则筛选。
     */
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
        .map((candidate): ExtractedMemoryCandidate => ({
          ...this.getScope(),
          sessionId: input.session.id,
          type: candidate.type,
          tier: getTierForType(candidate.type),
          subject: normalizeText(candidate.subject).slice(0, 120),
          value: normalizeText(candidate.value).slice(0, 280),
          sensitivity: candidate.sensitivity ?? "low",
          explicit: candidate.explicit ?? false,
          evidenceRefs,
        }))
        .filter((candidate) => candidate.subject && candidate.value),
    );
  }

  private consolidateCandidate(candidate: ExtractedMemoryCandidate): ConsolidationOutcome {
    /**
     * consolidateCandidate 决定候选记忆的命运：reject / duplicate / update / create。
     * 这里集中承载自动写入策略，便于后续调整规则而不改动上游抽取流程。
     */
    if (!this.config.autoWriteLowRisk) {
      return reject("automatic memory writes are disabled");
    }

    if (!candidate.explicit) {
      return reject("candidate is not explicit");
    }

    if (candidate.sensitivity !== "low") {
      return reject("sensitive candidate stays out of automatic long-term memory");
    }

    const tombstone = this.memoryRecordRepository
      .findBySubject(this.getScope(), candidate.subject, candidate.type)
      .find((record) => record.status === "deleted");
    if (tombstone) {
      return reject("subject was deleted before and automatic rewrite stays disabled");
    }

    const related = this.memoryRecordRepository.findBySubject(this.getScope(), candidate.subject, candidate.type);
    const active = related.find((record) => record.status === "active");

    if (!active) {
      return {
        kind: "create",
        reason: "new active memory",
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
      reason: "new explicit value supersedes existing active memory",
    };
  }
}

type ConsolidationOutcome =
  | { kind: "create"; reason: string }
  | { kind: "duplicate"; record: MemoryRecord; reason: string }
  | { kind: "update"; previous: MemoryRecord; reason: string }
  | { kind: "reject"; reason: string };

function reject(reason: string): ConsolidationOutcome {
  return { kind: "reject", reason };
}

function candidateToRecord(candidate: ExtractedMemoryCandidate, episodicTtlHoursDefault: number) {
  return {
    userId: candidate.userId,
    workspaceScope: candidate.workspaceScope,
    sessionId: candidate.sessionId,
    type: candidate.type,
    tier: candidate.tier,
    subject: candidate.subject,
    value: candidate.value,
    sensitivity: candidate.sensitivity,
    expiresAt: getNextExpiration(candidate, episodicTtlHoursDefault),
    sourceRefs: candidate.evidenceRefs,
  };
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
    '{"candidates":[{"type":"preference|goal|constraint|relationship|event|pattern","subject":"string","value":"string","sensitivity":"low|medium|high","explicit":true,"reason":"string"}]}',
    "",
    "Constraints:",
    "- Use only explicit user statements from the evidence below.",
    "- Keep candidates sparse; return an empty array when unsure.",
    "- Do not infer hidden traits or identity.",
    "- Put short-lived items in event or pattern, not profile-style preference.",
    "- Treat one-off plans, same-day arrangements, and casual social outings as event candidates.",
    "- Do not rewrite temporary social context into long-term preferences or relationship facts.",
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
  sensitivity?: MemorySensitivity;
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

function readSensitivity(value: unknown): MemorySensitivity | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function normalizeText(value: string) {
  return normalizeMemoryText(value);
}

function mergeRefs(current: string[], next: string[]) {
  return [...new Set([...current, ...next])];
}

function snapshotMemory(record: MemoryRecord) {
  return {
    id: record.id,
    tier: record.tier,
    subject: record.subject,
    value: record.value,
    status: record.status,
    expiresAt: record.expiresAt,
    updatedAt: record.updatedAt,
  };
}

function snapshotCandidate(record: ExtractedMemoryCandidate) {
  return {
    sessionId: record.sessionId,
    tier: record.tier,
    subject: record.subject,
    value: record.value,
    type: record.type,
  };
}

function dedupeCandidates(candidates: ExtractedMemoryCandidate[]) {
  const unique = new Map<string, ExtractedMemoryCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.subject}:${candidate.value}`;
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
  }
  return [...unique.values()];
}

function getTierForType(type: MemoryType): MemoryTier {
  switch (type) {
    case "event":
    case "pattern":
      return "episodic";
    case "preference":
    case "goal":
    case "constraint":
    case "relationship":
      return "profile";
  }
}

function getNextExpiration(candidate: ExtractedMemoryCandidate, episodicTtlHoursDefault: number) {
  if (candidate.tier !== "episodic") {
    return undefined;
  }

  return new Date(Date.now() + (episodicTtlHoursDefault * 60 * 60 * 1000)).toISOString();
}
