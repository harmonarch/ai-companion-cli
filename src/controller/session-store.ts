import type { MessageRepository } from "../infra/repositories/message-repository.js";
import type { SessionRepository } from "../infra/repositories/session-repository.js";
import type { ToolExecutionRepository } from "../infra/repositories/tool-execution-repository.js";
import type { ChatMessage } from "../types/chat.js";
import type { SessionRecord, SessionSummary } from "../types/session.js";
import type { ToolExecutionRecord } from "../types/tool.js";

export interface SessionSnapshot {
  session: SessionRecord;
  messages: ChatMessage[];
  toolExecutions: ToolExecutionRecord[];
}

export class SessionStore {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly messageRepository: MessageRepository,
    private readonly toolExecutionRepository: ToolExecutionRepository,
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

    return {
      session,
      messages: [],
      toolExecutions: [],
    };
  }

  loadSession(sessionId: string): SessionSnapshot {
    const session = this.sessionRepository.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      session,
      messages: this.messageRepository.listBySession(sessionId).filter((message) => message.content.length > 0),
      toolExecutions: this.toolExecutionRepository.listBySession(sessionId),
    };
  }

  touchSession(sessionId: string) {
    this.sessionRepository.touch(sessionId);
  }

  renameSession(sessionId: string, title: string) {
    this.sessionRepository.updateTitle(sessionId, title);
  }
}
