/**
 * 会话快照组装层。
 * 持久化数据分散在 sessions/messages/runs/tool-executions/memory/emotion 多处，UI 读取时通过这里合成一个可直接渲染的 snapshot。
 */
import type { MessageRepository } from "#src/infra/repositories/message-repository.js";
import type { RunRepository } from "#src/infra/repositories/run-repository.js";
import type { SessionRepository } from "#src/infra/repositories/session-repository.js";
import type { ToolExecutionRepository } from "#src/infra/repositories/tool-execution-repository.js";
import type { SystemPromptRepository } from "#src/infra/repositories/system-prompt-repository.js";
import type { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import {
  messageContentToPlainText,
  type ChatMessage,
} from "#src/types/chat.js";
import type { EmotionState } from "#src/types/emotion.js";
import type {
  MemoryDetailRecord,
  MemoryEvidenceKind,
  MemoryEvidenceMessageSummary,
  MemoryEvidenceRecord,
  MemoryRecord,
} from "#src/types/memory.js";
import type { SessionRecord, SessionSummary } from "#src/types/session.js";
import type { ToolExecutionRecord } from "#src/types/tool.js";
import type { EmotionService } from "#src/controller/emotion-service.js";
import type { MemoryService } from "#src/controller/memory-service.js";
import { sanitizeSingleLineText } from "#src/utils/sanitize-text.js";

export interface SessionSnapshot {
  session: SessionRecord;
  messages: ChatMessage[];
  toolExecutions: ToolExecutionRecord[];
  memories: MemoryRecord[];
  memoryDetails: MemoryDetailRecord[];
  emotion: EmotionState;
}

interface ParsedSourceRef {
  kind: MemoryEvidenceKind;
  refId: string;
  rawRef: string;
}

interface ResolutionContext {
  messagesBySessionId: Map<string, ChatMessage[]>;
  sessionsById: Map<string, SessionRecord | null>;
}

export class SessionStore {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly messageRepository: MessageRepository,
    private readonly runRepository: RunRepository,
    private readonly toolExecutionRepository: ToolExecutionRepository,
    private readonly systemPromptRepository: SystemPromptRepository,
    private readonly memoryService: MemoryService,
    private readonly emotionService: EmotionService,
    private readonly assistantProfileRepository: AssistantProfileRepository,
    private defaults: { provider: string; model: string },
  ) {}

  listSessions(): SessionSummary[] {
    return this.sessionRepository.list();
  }

  ensureSession() {
    const sessions = this.listSessions();
    const first = sessions[0];
    if (first) {
      return this.loadSession(first.id);
    }

    return this.createSession();
  }

  createSession(title = `Session ${new Date().toLocaleString()}`): SessionSnapshot {
    const session = this.sessionRepository.create({
      title,
      provider: this.defaults.provider,
      model: this.defaults.model,
    });
    const memories = this.memoryService.listMemories();
    const context = this.createResolutionContext();

    return {
      session,
      messages: [],
      toolExecutions: [],
      memories,
      memoryDetails: memories.map((memory) => this.resolveMemoryDetail(memory, context)),
      emotion: this.emotionService.getOrCreate(session.id),
    };
  }

  loadSession(sessionId: string): SessionSnapshot {
    /**
     * loadSession 是 UI 最常依赖的读取入口。
     * 它把消息、工具执行、memory 详情和 emotion 状态一起补齐，避免界面层自己跨 repository 拼装。
     */
    const session = this.sessionRepository.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const memories = this.memoryService.listMemories();
    const context = this.createResolutionContext();

    return {
      session,
      messages: this.messageRepository.listBySession(sessionId).filter((message) => message.content.length > 0),
      toolExecutions: this.toolExecutionRepository.listBySession(sessionId),
      memories,
      memoryDetails: memories.map((memory) => this.resolveMemoryDetail(memory, context)),
      emotion: this.emotionService.getOrCreate(sessionId),
    };
  }

  deleteSession(sessionId: string) {
    this.emotionService.deleteSessionState(sessionId);
    this.memoryService.deleteSessionState(sessionId);
    this.runRepository.deleteBySession(sessionId);
    this.toolExecutionRepository.deleteBySession(sessionId);
    this.systemPromptRepository.deleteBySession(sessionId);
    this.messageRepository.deleteBySession(sessionId);
    this.sessionRepository.delete(sessionId);
  }

  resetAll() {
    this.emotionService.resetAll();
    this.memoryService.resetAll();
    this.assistantProfileRepository.clear();
    this.toolExecutionRepository.deleteAll();
    this.runRepository.deleteAll();
    this.systemPromptRepository.deleteAll();
    this.messageRepository.deleteAll();
    this.sessionRepository.deleteAll();
    return this.createSession();
  }

  deleteMemory(memoryId: string) {
    return this.memoryService.deleteMemory(memoryId);
  }

  updateMemory(memoryId: string, patch: { subject?: string; value?: string }) {
    return this.memoryService.updateMemory(memoryId, patch);
  }

  touchSession(sessionId: string) {
    this.sessionRepository.touch(sessionId);
  }

  renameSession(sessionId: string, title: string) {
    this.sessionRepository.updateTitle(sessionId, title);
  }

  updateSessionProviderAndModel(sessionId: string, input: { provider: string; model: string }) {
    this.sessionRepository.updateProviderAndModel(sessionId, input);
    return this.loadSession(sessionId);
  }

  updateDefaults(defaults: { provider: string; model: string }) {
    this.defaults = defaults;
  }

  resetEmotion(sessionId: string) {
    this.emotionService.resetSession(sessionId);
    return this.loadSession(sessionId);
  }

  private createResolutionContext(): ResolutionContext {
    return {
      messagesBySessionId: new Map(),
      sessionsById: new Map(),
    };
  }

  private resolveMemoryDetail(memory: MemoryRecord, context: ResolutionContext): MemoryDetailRecord {
    /**
     * memory record 里只保存 source refs。
     * 这里把 message/run/tool 这些引用解析成 UI 可展示的 evidence，方便用户回看这条记忆来自哪一轮对话。
     */
    const parsedRefs = memory.sourceRefs.map((ref) => this.parseSourceRef(ref)).filter((ref): ref is ParsedSourceRef => Boolean(ref));
    const inferredSessionId = this.findSessionIdFromRefs(parsedRefs, context);

    return {
      memory,
      evidence: parsedRefs.map((ref) => this.resolveEvidenceRef(ref, inferredSessionId, context)),
    };
  }

  private parseSourceRef(ref: string): ParsedSourceRef | null {
    const separatorIndex = ref.indexOf(":");
    if (separatorIndex <= 0) {
      return null;
    }

    const kind = ref.slice(0, separatorIndex);
    const refId = ref.slice(separatorIndex + 1).trim();
    if (!refId || (kind !== "message" && kind !== "assistant" && kind !== "run" && kind !== "tool")) {
      return null;
    }

    return {
      kind,
      refId,
      rawRef: ref,
    };
  }

  private findSessionIdFromRefs(refs: ParsedSourceRef[], context: ResolutionContext) {
    for (const ref of refs) {
      if (ref.kind === "run") {
        const run = this.runRepository.getById(ref.refId);
        if (run) {
          return run.sessionId;
        }
      }

      if (ref.kind === "tool") {
        const execution = this.toolExecutionRepository.getById(ref.refId);
        if (execution) {
          return execution.sessionId;
        }
      }
    }

    for (const ref of refs) {
      if (ref.kind !== "message" && ref.kind !== "assistant") {
        continue;
      }

      const sessionId = this.findMessageSessionId(ref.refId, context);
      if (sessionId) {
        return sessionId;
      }
    }

    return undefined;
  }

  private resolveEvidenceRef(
    ref: ParsedSourceRef,
    inferredSessionId: string | undefined,
    context: ResolutionContext,
  ): MemoryEvidenceRecord {
    if (ref.kind === "run") {
      const run = this.runRepository.getById(ref.refId);
      if (!run) {
        return {
          rawRef: ref.rawRef,
          kind: ref.kind,
          refId: ref.refId,
          unresolvedReason: "run not found",
        };
      }

      const userMessage = this.resolveMessageSummary(run.sessionId, run.userMessageId, context);
      const assistantMessage = this.resolveMessageSummary(run.sessionId, run.assistantMessageId, context);
      return {
        rawRef: ref.rawRef,
        kind: ref.kind,
        refId: ref.refId,
        sessionId: run.sessionId,
        sessionTitle: this.resolveSessionTitle(run.sessionId, context)?.title,
        runId: run.id,
        message: userMessage ?? assistantMessage ?? undefined,
        unresolvedReason: userMessage || assistantMessage ? undefined : "messages not found",
      };
    }

    if (ref.kind === "tool") {
      const execution = this.toolExecutionRepository.getById(ref.refId);
      if (!execution) {
        return {
          rawRef: ref.rawRef,
          kind: ref.kind,
          refId: ref.refId,
          unresolvedReason: "tool execution not found",
        };
      }

      return {
        rawRef: ref.rawRef,
        kind: ref.kind,
        refId: ref.refId,
        sessionId: execution.sessionId,
        sessionTitle: this.resolveSessionTitle(execution.sessionId, context)?.title,
        runId: execution.runId,
        toolName: execution.toolName,
        message: execution.messageId ? this.resolveMessageSummary(execution.sessionId, execution.messageId, context) ?? undefined : undefined,
        unresolvedReason: execution.messageId ? undefined : "message not linked",
      };
    }

    const sessionId = inferredSessionId ?? this.findMessageSessionId(ref.refId, context);
    if (!sessionId) {
      return {
        rawRef: ref.rawRef,
        kind: ref.kind,
        refId: ref.refId,
        unresolvedReason: "session context not found",
      };
    }

    const message = this.resolveMessageSummary(sessionId, ref.refId, context);
    return {
      rawRef: ref.rawRef,
      kind: ref.kind,
      refId: ref.refId,
      sessionId,
      sessionTitle: this.resolveSessionTitle(sessionId, context)?.title,
      message: message ?? undefined,
      unresolvedReason: message ? undefined : "message not found",
    };
  }

  private resolveSessionTitle(sessionId: string, context: ResolutionContext) {
    if (context.sessionsById.has(sessionId)) {
      return context.sessionsById.get(sessionId) ?? null;
    }

    const session = this.sessionRepository.getById(sessionId);
    context.sessionsById.set(sessionId, session);
    return session;
  }

  private resolveMessageSummary(sessionId: string, messageId: string, context: ResolutionContext): MemoryEvidenceMessageSummary | null {
    const message = this.getMessagesBySession(sessionId, context).find((item) => item.id === messageId);
    if (!message) {
      return null;
    }

    return {
      id: message.id,
      role: message.role,
      preview: sanitizeSingleLineText(messageContentToPlainText(message.content), 100),
      createdAt: message.createdAt,
    };
  }

  private findMessageSessionId(messageId: string, context: ResolutionContext) {
    const sessions = this.sessionRepository.list();
    for (const session of sessions) {
      const message = this.getMessagesBySession(session.id, context).find((item) => item.id === messageId);
      if (message) {
        return message.sessionId;
      }
    }

    return undefined;
  }

  private getMessagesBySession(sessionId: string, context: ResolutionContext) {
    const cached = context.messagesBySessionId.get(sessionId);
    if (cached) {
      return cached;
    }

    const messages = this.messageRepository.listBySession(sessionId);
    context.messagesBySessionId.set(sessionId, messages);
    return messages;
  }
}
