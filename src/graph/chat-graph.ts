import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { messageContentToPlainText, type ChatMessage } from "../types/chat.js";

export function buildGraph(model: BaseChatModel, tools: unknown[]) {
  const modelWithTools = tools.length > 0 ? model.bindTools?.(tools as never[]) ?? model : model;
  const toolNode = new ToolNode(tools as never[]);

  return new StateGraph(MessagesAnnotation)
    .addNode("agent", async (state) => ({
      messages: [await modelWithTools.invoke(state.messages)],
    }))
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges(
      "agent",
      (state) => {
        const lastMessage = state.messages.at(-1) as { tool_calls?: unknown[] } | undefined;
        return lastMessage?.tool_calls?.length ? "tools" : END;
      },
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
