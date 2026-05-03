import { AIMessageChunk } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Runnable } from "@langchain/core/runnables";
import type { ProviderRuntime } from "./types.js";

type InvokableModel = Pick<BaseChatModel, "invoke"> | Pick<Runnable, "invoke">;
type ToolBindableModel = InvokableModel & {
  bindTools?(tools: unknown[]): InvokableModel;
};

export function createLangChainRuntime(model: ToolBindableModel): ProviderRuntime {
  return {
    invoke(input) {
      return model.invoke(input as never);
    },
    bindTools(tools) {
      const boundModel = tools.length > 0 ? model.bindTools?.(tools as never[]) ?? model : model;
      return createLangChainRuntime(boundModel);
    },
    hasToolCalls(message) {
      if (!message || typeof message !== "object") {
        return false;
      }

      const toolCalls = "tool_calls" in message ? (message as { tool_calls?: unknown }).tool_calls : undefined;
      return Array.isArray(toolCalls) && toolCalls.length > 0;
    },
    extractText(value) {
      return extractLangChainText(value);
    },
  };
}

function extractLangChainText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof AIMessageChunk) {
    return extractLangChainText(value.content);
  }

  if (value && typeof value === "object" && "content" in value) {
    return extractLangChainText((value as { content: unknown }).content);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }

  return "";
}
