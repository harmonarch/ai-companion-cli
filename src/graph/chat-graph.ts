import { HumanMessage, AIMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { ProviderRuntime } from "../providers/types.js";
import { messageContentToPlainText, type ChatMessage, type MessageContent } from "../types/chat.js";

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
