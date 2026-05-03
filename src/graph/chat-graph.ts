import { HumanMessage, AIMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { ProviderRuntime, RuntimeToolCall } from "#src/providers/types.js";
import type { ChatRuntimeEvent } from "#src/types/events.js";
import { messageContentToPlainText, type ChatMessage, type MessageContent, type ToolCallMessageContentPart } from "#src/types/chat.js";

export function buildGraph(runtime: ProviderRuntime, tools: unknown[]) {
  const toolNode = new ToolNode(tools as never[]);
  const runtimeWithTools = runtime.bindTools(tools);

  return new StateGraph(MessagesAnnotation)
    .addNode("agent", async (state) => ({
      messages: [await runtimeWithTools.invoke(state.messages)],
    }))
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges(
      "agent",
      (state) => runtime.hasToolCalls(state.messages.at(-1)) ? "tools" : END,
      {
        tools: "tools",
        [END]: END,
      },
    )
    .addEdge("tools", "agent")
    .compile();
}

export async function* streamCanonicalEvents(
  graph: ReturnType<typeof buildGraph>,
  input: ReturnType<typeof buildGraphInput>,
  runtime: ProviderRuntime,
  context: {
    sessionId: string;
    runId: string;
    assistantMessageId: string;
    provider: string;
    model: string;
  },
): AsyncGenerator<ChatRuntimeEvent> {
  yield {
    type: "response_started",
    sessionId: context.sessionId,
    runId: context.runId,
    assistantMessageId: context.assistantMessageId,
    provider: context.provider,
    model: context.model,
    timestamp: new Date().toISOString(),
  };

  let finalText = "";
  const finalToolCalls: ToolCallMessageContentPart[] = [];
  let finalUsage = undefined;
  let finishReason = undefined;

  try {
    for await (const event of graph.streamEvents(input, { version: "v2" })) {
      if (event.event === "on_chat_model_stream") {
        const text = runtime.extractText(event.data?.chunk);
        if (text) {
          finalText += text;
          yield {
            type: "text_delta",
            sessionId: context.sessionId,
            runId: context.runId,
            assistantMessageId: context.assistantMessageId,
            text,
            timestamp: new Date().toISOString(),
          };
        }

        const usage = runtime.extractUsage(event.data?.chunk);
        if (usage && hasUsageValues(usage)) {
          finalUsage = usage;
          yield {
            type: "usage_updated",
            sessionId: context.sessionId,
            runId: context.runId,
            assistantMessageId: context.assistantMessageId,
            usage,
            timestamp: new Date().toISOString(),
          };
        }

        continue;
      }

      if (event.event !== "on_chat_model_end") {
        continue;
      }

      const outputText = runtime.extractText(event.data?.output);
      if (!finalText && outputText) {
        finalText = outputText;
      }

      const toolCalls = runtime.extractToolCalls(event.data?.output);
      for (const toolCall of toolCalls) {
        const part = toToolCallPart(toolCall);
        finalToolCalls.push(part);
        yield {
          type: "tool_call_recorded",
          sessionId: context.sessionId,
          runId: context.runId,
          assistantMessageId: context.assistantMessageId,
          part,
          timestamp: new Date().toISOString(),
        };
      }

      const usage = runtime.extractUsage(event.data?.output);
      if (usage && hasUsageValues(usage)) {
        finalUsage = usage;
        yield {
          type: "usage_updated",
          sessionId: context.sessionId,
          runId: context.runId,
          assistantMessageId: context.assistantMessageId,
          usage,
          timestamp: new Date().toISOString(),
        };
      }

      finishReason = runtime.extractFinishReason(event.data?.output) ?? finishReason;
    }

    yield {
      type: "response_completed",
      sessionId: context.sessionId,
      runId: context.runId,
      assistantMessageId: context.assistantMessageId,
      response: {
        text: finalText || undefined,
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
        usage: finalUsage,
        finishReason,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    yield {
      type: "response_failed",
      sessionId: context.sessionId,
      runId: context.runId,
      assistantMessageId: context.assistantMessageId,
      error: { message },
      timestamp: new Date().toISOString(),
    };
  }
}

export function buildGraphInput(messages: ChatMessage[], systemPrompt: string, memoryContext?: string, emotionContext?: string) {
  const history: BaseMessage[] = [new SystemMessage(systemPrompt)];

  if (memoryContext) {
    history.push(new SystemMessage(memoryContext));
  }

  if (emotionContext) {
    history.push(new SystemMessage(emotionContext));
  }

  for (const message of messages) {
    if (message.role === "user") {
      history.push(new HumanMessage(messageContentToPlainText(message.content)));
      continue;
    }

    if (message.role === "assistant") {
      history.push(...buildAssistantHistory(message.content));
    }
  }

  return { messages: history };
}

function toToolCallArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return { value };
}

function buildAssistantHistory(content: MessageContent): BaseMessage[] {
  const text = messageContentToPlainText(content);
  const toolCalls = content
    .filter((part) => part.type === "tool_call")
    .map((part) => ({
      id: part.callId,
      name: part.toolName,
      args: toToolCallArgs(part.input),
    }));
  const messages: BaseMessage[] = [];

  if (text || toolCalls.length > 0) {
    messages.push(new AIMessage({
      content: text,
      tool_calls: toolCalls,
    }));
  }

  for (const part of content) {
    if (part.type !== "tool_result") {
      continue;
    }

    messages.push(new ToolMessage({
      tool_call_id: part.callId,
      name: part.toolName,
      content: typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2),
    }));
  }

  return messages;
}

function toToolCallPart(toolCall: RuntimeToolCall): ToolCallMessageContentPart {
  return {
    type: "tool_call",
    callId: toolCall.callId,
    toolName: toolCall.toolName,
    input: toolCall.input,
  };
}

function hasUsageValues(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
  return usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.totalTokens !== undefined;
}
