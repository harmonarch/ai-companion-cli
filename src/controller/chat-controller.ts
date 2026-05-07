/**
 * 单轮对话编排器。
 * 它把“用户输入”推进成一整轮完整流程：持久化消息、创建 run、组装工具和 prompt、消费图事件、落盘 assistant 结果，并在回合结束后更新 memory / emotion。
 */
import type { AppConfig } from "#src/infra/config/load-config.js";
import { MessageRepository } from "#src/infra/repositories/message-repository.js";
import { RunRepository } from "#src/infra/repositories/run-repository.js";
import type { ToolExecutionRepository } from "#src/infra/repositories/tool-execution-repository.js";
import type { SystemPromptRepository } from "#src/infra/repositories/system-prompt-repository.js";
import { buildGraph, buildGraphInput, streamCanonicalEvents } from "#src/graph/chat-graph.js";
import type { PromptLoader } from "#src/prompts/loader.js";
import type { ProviderDefinition, ProviderId, RuntimeToolCall } from "#src/providers/types.js";
import { createRuntimeTools } from "#src/tools/index.js";
import {
  appendTextMessageContent,
  appendToolCallMessageContent,
  appendToolResultMessageContent,
  createTextMessageContent,
  type ChatMessage,
  type MessageContent,
} from "#src/types/chat.js";
import type { ChatRuntimeEvent } from "#src/types/events.js";
import type { SessionRecord } from "#src/types/session.js";
import type { ToolConfirmationRequest, ToolExecutionRecord } from "#src/types/tool.js";
import { selectHistory } from "#src/controller/history-selection.js";
import type { EmotionService } from "#src/controller/emotion-service.js";
import type { MemoryService } from "#src/controller/memory-service.js";
import { StreamBuffer } from "#src/controller/stream-buffer.js";
import type { SessionStore } from "#src/controller/session-store.js";

interface SendMessageHandlers {
  onUserMessage(message: ChatMessage): void;
  onAssistantMessage(message: ChatMessage): void;
  onAssistantChunk(messageId: string, chunk: string): void;
  onAssistantReady(messageId: string, content: string): void;
  onAssistantCompleted(messageId: string, content: MessageContent): void;
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
    private readonly systemPromptRepository: SystemPromptRepository,
    private readonly memoryService: MemoryService,
    private readonly emotionService: EmotionService,
  ) {}

  async sendMessage(session: SessionRecord, input: string, handlers: SendMessageHandlers) {
    /**
     * sendMessage 是整轮对话的主链路。
     * 大致阶段：写入用户消息 -> 初始化 assistant/run -> 组装 runtime/tools/history/prompt -> 消费 graph 事件 -> 收尾持久化。
     */
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

    /**
     * scratchpad 和 emotion 都以当前用户输入为起点先更新一轮。
     * 它们随后会被拼进 prompt 或 session snapshot，影响本轮生成和界面展示。
     */
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

    let assistantContent: MessageContent = [];
    let assistantText = "";
    let firstTokenRecorded = false;
    let failureMessage: string | null = null;
    const pendingToolCalls = new Map<string, RuntimeToolCall[]>();
    const recordToolCalls = (toolCalls: RuntimeToolCall[]) => {
      for (const toolCall of toolCalls) {
        const key = createToolCallKey(toolCall.toolName, toolCall.input);
        pendingToolCalls.set(key, [...(pendingToolCalls.get(key) ?? []), toolCall]);
      }
    };
    const markFirstVisibleEvent = () => {
      if (firstTokenRecorded) {
        return;
      }
      this.runRepository.markFirstToken(run.id);
      firstTokenRecorded = true;
    };
    const buffer = new StreamBuffer((event) => {
      assistantText += event.text;
      assistantContent = appendTextMessageContent(assistantContent, event.text);
      handlers.onAssistantChunk(assistantMessage.id, event.text);
    });
    const handleRuntimeEvent = (event: ChatRuntimeEvent) => {
      switch (event.type) {
        case "response_started":
        case "usage_updated":
          return;
        case "text_delta":
          markFirstVisibleEvent();
          buffer.push(event);
          return;
        case "tool_call_recorded": {
          markFirstVisibleEvent();
          assistantContent = appendToolCallMessageContent(assistantContent, event.part);
          recordToolCalls([{ callId: event.part.callId, toolName: event.part.toolName, input: event.part.input }]);
          return;
        }
        case "tool_result_recorded":
          markFirstVisibleEvent();
          assistantContent = appendToolResultMessageContent(assistantContent, event.part);
          return;
        case "response_completed":
          if (!assistantText && event.response.text) {
            assistantText = event.response.text;
            assistantContent = appendTextMessageContent(assistantContent, event.response.text);
            handlers.onAssistantChunk(assistantMessage.id, event.response.text);
          }
          return;
        case "response_failed":
          failureMessage = event.error.message;
          return;
      }
    };

    try {
      const provider = this.providers[session.provider as ProviderId];
      if (!provider) {
        throw new Error(`Unsupported provider: ${session.provider}`);
      }

      const runtime = provider.createRuntime(this.config, session);
      const runtimeTools = createRuntimeTools({
        workspaceRoot: this.config.workspaceRoot,
        sessionId: session.id,
        runId: run.id,
        messageId: assistantMessage.id,
        toolExecutionRepository: this.toolExecutionRepository,
        onExecutionUpdate: handlers.onToolExecution,
        onToolResult(part) {
          handleRuntimeEvent({
            type: "tool_result_recorded",
            sessionId: session.id,
            runId: run.id,
            assistantMessageId: assistantMessage.id,
            part,
            timestamp: new Date().toISOString(),
          });
        },
        requestConfirmation: handlers.requestConfirmation,
        resolveCall(toolName, toolInput) {
          const key = createToolCallKey(toolName, toolInput);
          const pending = pendingToolCalls.get(key);
          if (pending?.length) {
            const nextCall = pending[0];
            if (nextCall) {
              const rest = pending.slice(1);
              if (rest.length > 0) {
                pendingToolCalls.set(key, rest);
              } else {
                pendingToolCalls.delete(key);
              }
              return {
                type: "tool_call",
                callId: nextCall.callId,
                toolName: nextCall.toolName,
                input: nextCall.input,
              };
            }
          }

          return {
            type: "tool_call",
            callId: `${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            toolName,
            input: toolInput,
          };
        },
      });

      /**
       * graphInput 会把持久化历史、system prompt、memory、emotion 和时间上下文折叠成模型可消费的消息序列。
       * 这里决定了模型在本轮真正能看到哪些信息。
       */
      const graph = buildGraph(runtime, runtimeTools);
      const history = this.messageRepository.listBySession(session.id).filter((message) => message.id !== assistantMessage.id);
      const selectedHistory = selectHistory(history, this.config.historyMaxMessages);
      const systemPrompt = provider.resolveSystemPrompt({
        config: this.config,
        promptLoader: this.promptLoader,
        session,
      });
      const promptMemory = this.memoryService.retrieveForPrompt(trimmed);
      const memoryContext = promptMemory.context;
      this.memoryService.recordPromptHits(promptMemory.records.map((record) => record.id), assistantMessage.createdAt);
      const temporalContext = buildTemporalContext(selectedHistory);
      this.systemPromptRepository.create({
        assistantMessageId: assistantMessage.id,
        sessionId: session.id,
        runId: run.id,
        provider: session.provider,
        model: session.model,
        systemPrompt,
        memoryContext: memoryContext || undefined,
        memorySelection: promptMemory.memorySelection,
        emotionContext: emotionContext || undefined,
        temporalContext,
        messages: [systemPrompt, memoryContext, emotionContext, temporalContext].filter((value): value is string => Boolean(value)),
      });
      const graphInput = buildGraphInput(selectedHistory, systemPrompt, memoryContext, emotionContext, temporalContext);

      for await (const event of streamCanonicalEvents(graph, graphInput, runtime, {
        sessionId: session.id,
        runId: run.id,
        assistantMessageId: assistantMessage.id,
        provider: session.provider,
        model: session.model,
      })) {
        handleRuntimeEvent(event);
      }

      buffer.close();
      if (failureMessage) {
        throw new Error(failureMessage);
      }

      this.messageRepository.updateContent(session.id, assistantMessage.id, assistantContent, {});
      handlers.onAssistantReady(assistantMessage.id, assistantText);
      this.emotionService.transitionOnAssistantTurn(session.id, assistantText);
      const completedAssistantMessage = {
        ...assistantMessage,
        content: assistantContent,
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
      handlers.onAssistantCompleted(assistantMessage.id, assistantContent);
      this.runRepository.markCompleted(run.id);
    } catch (error) {
      buffer.close();
      const errorMessage = error instanceof Error ? error.message : String(error);
      const persistedContent = sanitizeFailedAssistantContent(assistantContent, errorMessage);
      this.messageRepository.updateContent(session.id, assistantMessage.id, persistedContent, { error: errorMessage });
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

function buildTemporalContext(messages: ChatMessage[]) {
  /**
   * 恢复旧会话时，把本地时间和距上一条消息的间隔显式告诉模型。
   * 这样模型更容易区分“连续追问”和“隔了很久后的恢复会话”。
   */
  const latestMessage = messages.at(-1);
  if (!latestMessage) {
    return undefined;
  }

  const latestMessageTime = new Date(latestMessage.createdAt);
  if (Number.isNaN(latestMessageTime.getTime())) {
    return undefined;
  }

  const now = new Date();
  const elapsedMs = Math.max(0, now.getTime() - latestMessageTime.getTime());
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const lines = [
    "Temporal context:",
    `Current local time: ${formatTimestamp(now)}`,
    `Timezone: ${timezone}`,
    `Latest prior message time: ${formatTimestamp(latestMessageTime)}`,
    `Elapsed since latest prior message: ${formatElapsedDuration(elapsedMs)}`,
  ];

  if (elapsedMs >= 24 * 60 * 60 * 1000) {
    lines.push("This conversation is resuming after a multi-day gap.");
  }

  return lines.join("\n");
}

function formatTimestamp(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
    hour12: false,
  }).format(date);
}

function formatElapsedDuration(elapsedMs: number) {
  const totalMinutes = Math.floor(elapsedMs / (60 * 1000));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return joinDurationParts([
      pluralize(days, "day"),
      hours > 0 ? pluralize(hours, "hour") : undefined,
    ]);
  }

  if (totalHours > 0) {
    return joinDurationParts([
      pluralize(totalHours, "hour"),
      minutes > 0 ? pluralize(minutes, "minute") : undefined,
    ]);
  }

  return pluralize(Math.max(1, totalMinutes), "minute");
}

function joinDurationParts(parts: Array<string | undefined>) {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}

function pluralize(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function createToolCallKey(toolName: string, input: unknown) {
  return `${toolName}:${stableStringify(input)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

  function sanitizeFailedAssistantContent(content: MessageContent, errorMessage: string):MessageContent {
    const toolCallIds = new Set(
      content
        .filter((part) => part.type === "tool_call")
        .map((part) => part.callId),
    );

    const resolvedCallIds = new Set(
      content
        .filter((part) => part.type === "tool_result")
        .map((part) => part.callId),
    );

    const safeParts = content.filter((part) => {
      if (part.type === "tool_call") {
        return resolvedCallIds.has(part.callId);
      }

      if (part.type === "tool_result") {
        return toolCallIds.has(part.callId);
      }

      return true;
    });

    return safeParts.length > 0
      ? safeParts
      : createTextMessageContent(`Error: ${errorMessage}`);
  }