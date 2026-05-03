import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { ProviderRuntime } from "../providers/types.js";
import { messageContentToPlainText, type ChatMessage } from "../types/chat.js";

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
      history.push(new AIMessage(messageContentToPlainText(message.content)));
    }
  }

  return { messages: history };
}
