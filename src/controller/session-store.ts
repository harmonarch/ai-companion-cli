import type { MessageRepository } from "../infra/repositories/message-repository.js";
import type { RunRepository } from "../infra/repositories/run-repository.js";
import type { SessionRepository } from "../infra/repositories/session-repository.js";
import type { ToolExecutionRepository } from "../infra/repositories/tool-execution-repository.js";
import type { AssistantProfileRepository } from "../infra/repositories/assistant-profile-repository.js";
import type { ChatMessage } from "../types/chat.js";
import type {
  MemoryDetailRecord,
  MemoryEvidenceKind,
  MemoryEvidenceMessageSummary,
  MemoryEvidenceRecord,
  MemoryRecord,
} from "../types/memory.js";
import type { SessionRecord, SessionSummary } from "../types/session.js";
import type { ToolExecutionRecord } from "../types/tool.js";
import type { MemoryService } from "./memory-service.js";
import { sanitizeSingleLineText } from "../utils/sanitize-text.js";

export interface SessionSnapshot {
  session: SessionRecord;
  messages: ChatMessage[];
  toolExecutions: ToolExecutionRecord[];
  memories: MemoryRecord[];
  memoryDetails: MemoryDetailRecord[];
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
    private readonly memoryService: MemoryService,
    private readonly assistantProfileRepository: AssistantProfileRepository,
    private readonly defaults: { provider: string; model: string },
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
    };
  }

  loadSession(sessionId: string): SessionSnapshot {
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
    };
  }

  deleteSession(sessionId: string) {
    this.memoryService.deleteSessionState(sessionId);
    this.runRepository.deleteBySession(sessionId);
    this.toolExecutionRepository.deleteBySession(sessionId);
    this.messageRepository.deleteBySession(sessionId);
    this.sessionRepository.delete(sessionId);
  }

  resetAll() {
    this.memoryService.resetAll();
    this.assistantProfileRepository.clear();
    this.toolExecutionRepository.deleteAll();
    this.runRepository.deleteAll();
    this.messageRepository.deleteAll();
    this.sessionRepository.deleteAll();
    return this.createSession();
  }

  deleteMemory(memoryId: string, sessionId?: string) {
    return this.memoryService.deleteMemory(memoryId, sessionId);
  }

  updateMemory(memoryId: string, patch: { subject?: string; value?: string }, sessionId?: string) {
    return this.memoryService.updateMemory(memoryId, patch, sessionId);
  }

  touchSession(sessionId: string) {
    this.sessionRepository.touch(sessionId);
  }

  renameSession(sessionId: string, title: string) {
    this.sessionRepository.updateTitle(sessionId, title);
  }

  private createResolutionContext(): ResolutionContext {
    return {
      messagesBySessionId: new Map(),
      sessionsById: new Map(),
    };
  }

  private resolveMemoryDetail(memory: MemoryRecord, context: ResolutionContext): MemoryDetailRecord {
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
      preview: sanitizeSingleLineText(message.content, 100),
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
