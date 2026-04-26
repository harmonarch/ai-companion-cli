import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { ChatOpenAI } from "@langchain/openai";
import type { ChatMessage } from "../types/chat.js";

export function buildGraph(model: ChatOpenAI, tools: unknown[]) {
  const modelWithTools = tools.length > 0 ? model.bindTools(tools as never[]) : model;
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

export function buildGraphInput(messages: ChatMessage[], systemPrompt: string) {
  const history: BaseMessage[] = [new SystemMessage(systemPrompt)];

  for (const message of messages) {
    if (message.role === "user") {
      history.push(new HumanMessage(message.content));
      continue;
    }

    if (message.role === "assistant") {
      history.push(new AIMessage(message.content));
    }
  }

  return { messages: history };
}
