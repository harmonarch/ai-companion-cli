import type { AppConfig } from "../infra/config/load-config.js";
import { MessageRepository } from "../infra/repositories/message-repository.js";
import { RunRepository } from "../infra/repositories/run-repository.js";
import type { ToolExecutionRepository } from "../infra/repositories/tool-execution-repository.js";
import { buildGraph, buildGraphInput } from "../graph/chat-graph.js";
import type { PromptLoader } from "../prompts/loader.js";
import type { ProviderDefinition, ProviderId } from "../providers/types.js";
import { createRuntimeTools } from "../tools/index.js";
import {
  createTextMessageContent,
  type ChatMessage,
} from "../types/chat.js";
import type { SessionRecord } from "../types/session.js";
import type { ToolConfirmationRequest, ToolExecutionRecord } from "../types/tool.js";
import { selectHistory } from "./history-selection.js";
import type { EmotionService } from "./emotion-service.js";
import type { MemoryService } from "./memory-service.js";
import { StreamBuffer } from "./stream-buffer.js";
import type { SessionStore } from "./session-store.js";

interface SendMessageHandlers {
  onUserMessage(message: ChatMessage): void;
  onAssistantMessage(message: ChatMessage): void;
  onAssistantChunk(messageId: string, chunk: string): void;
  onAssistantReady(messageId: string, content: string): void;
  onAssistantCompleted(messageId: string, content: string): void;
  onToolExecution(execution: ToolExecutionRecord): void;
  onSessionUpdated(session: SessionRecord): void;
  requestConfirmation(request: ToolConfirmationRequest): Promise<boolean>;
}

export class ChatController {
  constructor(
    private readonly config: AppConfig,
    private readonly providers: Record<ProviderId, ProviderDefinition>,
    private readonly promptLoader: PromptLoader,
    private readonly sessionStore: SessionStore,
    private readonly messageRepository: MessageRepository,
    private readonly runRepository: RunRepository,
    private readonly toolExecutionRepository: ToolExecutionRepository,
    private readonly memoryService: MemoryService,
    private readonly emotionService: EmotionService,
  ) {}

  async sendMessage(session: SessionRecord, input: string, handlers: SendMessageHandlers) {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const userMessage = this.messageRepository.create({
      sessionId: session.id,
      role: "user",
      kind: "user",
      content: createTextMessageContent(trimmed),
    });
    handlers.onUserMessage(userMessage);

    const sessionSnapshot = this.sessionStore.loadSession(session.id);
    this.memoryService.updateScratchpad(session.id, trimmed, sessionSnapshot.toolExecutions);
    const emotionState = this.emotionService.transitionOnUserTurn(session.id, trimmed);
    const emotionContext = this.emotionService.renderPromptContext(emotionState)?.content;
    if (sessionSnapshot.messages.length === 1 && session.title.startsWith("Session ")) {
      const nextTitle = trimmed.slice(0, 48) || session.title;
      this.sessionStore.renameSession(session.id, nextTitle);
      session = { ...session, title: nextTitle, updatedAt: new Date().toISOString() };
      handlers.onSessionUpdated(session);
    }

    const assistantMessage = this.messageRepository.create({
      sessionId: session.id,
      role: "assistant",
      kind: "assistant",
      content: [],
    });
    handlers.onAssistantMessage(assistantMessage);

    const run = this.runRepository.create({
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      provider: session.provider,
      model: session.model,
    });

    let assistantText = "";
    let fallbackText = "";
    let firstTokenRecorded = false;
    const buffer = new StreamBuffer((chunk) => {
      assistantText += chunk;
      handlers.onAssistantChunk(assistantMessage.id, chunk);
    });

    try {
      const runtimeTools = createRuntimeTools({
        workspaceRoot: this.config.workspaceRoot,
        sessionId: session.id,
        runId: run.id,
        messageId: assistantMessage.id,
        toolExecutionRepository: this.toolExecutionRepository,
        onExecutionUpdate: handlers.onToolExecution,
        requestConfirmation: handlers.requestConfirmation,
      });

      const provider = this.providers[session.provider as ProviderId];
      if (!provider) {
        throw new Error(`Unsupported provider: ${session.provider}`);
      }

      const runtime = provider.createRuntime(this.config, session);
      const graph = buildGraph(runtime, runtimeTools);
      const history = this.messageRepository.listBySession(session.id).filter((message) => message.id !== assistantMessage.id);
      const selectedHistory = selectHistory(history, this.config.historyMaxMessages);
      const systemPrompt = provider.resolveSystemPrompt({
        config: this.config,
        promptLoader: this.promptLoader,
        session,
      });
      const memoryContext = this.memoryService.retrieveForPrompt().context;

      for await (const event of graph.streamEvents(buildGraphInput(selectedHistory, systemPrompt, memoryContext, emotionContext), { version: "v2" })) {
        switch (event.event) {
          case "on_chat_model_stream": {
            const text = runtime.extractText(event.data?.chunk);
            if (text) {
              if (!firstTokenRecorded) {
                this.runRepository.markFirstToken(run.id);
                firstTokenRecorded = true;
              }
              buffer.push(text);
            }
            break;
          }
          case "on_chat_model_end": {
            const outputText = runtime.extractText(event.data?.output);
            if (outputText) {
              if (!firstTokenRecorded) {
                this.runRepository.markFirstToken(run.id);
                firstTokenRecorded = true;
              }
              fallbackText += outputText;
            }
            break;
          }
          default:
            break;
        }
      }

      buffer.close();
      if (!assistantText && fallbackText) {
        assistantText = fallbackText;
        handlers.onAssistantChunk(assistantMessage.id, fallbackText);
      }

      this.messageRepository.updateContent(session.id, assistantMessage.id, createTextMessageContent(assistantText), {});
      handlers.onAssistantReady(assistantMessage.id, assistantText);
      this.emotionService.transitionOnAssistantTurn(session.id, assistantText);
      const completedAssistantMessage = {
        ...assistantMessage,
        content: createTextMessageContent(assistantText),
      };
      await this.memoryService.processCompletedTurn({
        session,
        userMessage,
        assistantMessage: completedAssistantMessage,
        run,
        toolExecutions: this.toolExecutionRepository.listBySession(session.id).filter((execution) => execution.runId === run.id),
        extractMemoryCandidates: async (prompt) => {
          const response = await runtime.invoke(prompt);
          return runtime.extractText(response);
        },
      });
      this.sessionStore.touchSession(session.id);
      handlers.onAssistantCompleted(assistantMessage.id, assistantText);
      this.runRepository.markCompleted(run.id);
    } catch (error) {
      buffer.close();
      const errorMessage = error instanceof Error ? error.message : String(error);
      const persistedContent = assistantText || `Error: ${errorMessage}`;
      this.messageRepository.updateContent(session.id, assistantMessage.id, createTextMessageContent(persistedContent), { error: errorMessage });
      handlers.onAssistantCompleted(assistantMessage.id, persistedContent);
      try {
        this.runRepository.markFailed(run.id, errorMessage);
      } catch (markFailedError) {
        const persistMessage = markFailedError instanceof Error ? markFailedError.message : String(markFailedError);
        throw new Error(`Failed to persist run failure: ${persistMessage}`, { cause: error });
      }
      throw error;
    }
  }
}
