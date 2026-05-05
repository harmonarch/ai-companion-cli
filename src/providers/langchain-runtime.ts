/**
 * LangChain 模型适配层。
 * 这里把 LangChain 的调用接口和消息结构规整成仓库内部统一的 ProviderRuntime，减少上层对具体 SDK 细节的感知。
 */
import { AIMessageChunk } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Runnable } from "@langchain/core/runnables";
import type { CanonicalUsage } from "#src/types/events.js";
import type { ProviderRuntime, RuntimeToolCall } from "#src/providers/types.js";

type InvokableModel = Pick<BaseChatModel, "invoke"> | Pick<Runnable, "invoke">;
type ToolBindableModel = InvokableModel & {
  bindTools?(tools: unknown[]): InvokableModel;
};

export function createLangChainRuntime(model: ToolBindableModel): ProviderRuntime {
  /**
   * 运行时对外暴露的接口很小：调用、绑定工具、提取文本、提取工具调用、提取 usage、提取 finish reason。
   * 具体 provider 只要能接入这套接口，就能被 graph 和 controller 复用。
   */
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
    extractToolCalls(value) {
      return extractLangChainToolCalls(value);
    },
    extractUsage(value) {
      return extractLangChainUsage(value);
    },
    extractFinishReason(value) {
      return extractLangChainFinishReason(value);
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

function extractLangChainToolCalls(value: unknown): RuntimeToolCall[] {
  const toolCalls = readToolCalls(value);
  return toolCalls.flatMap((toolCall, index) => {
    const callId = typeof toolCall.id === "string" && toolCall.id ? toolCall.id : `tool-call-${index + 1}`;
    const toolName = typeof toolCall.name === "string" ? toolCall.name : undefined;
    const input = readToolCallInput(toolCall.args);
    if (!toolName || input === undefined) {
      return [];
    }

    return [{ callId, toolName, input }];
  });
}

function extractLangChainUsage(value: unknown): CanonicalUsage | undefined {
  const usage = readUsageMetadata(value);
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: readOptionalNumber(usage.input_tokens),
    outputTokens: readOptionalNumber(usage.output_tokens),
    totalTokens: readOptionalNumber(usage.total_tokens),
  };
}

function extractLangChainFinishReason(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const responseMetadata = "response_metadata" in value
    ? (value as { response_metadata?: unknown }).response_metadata
    : undefined;
  if (!responseMetadata || typeof responseMetadata !== "object") {
    return undefined;
  }

  const finishReason = (responseMetadata as { finish_reason?: unknown }).finish_reason;
  return typeof finishReason === "string" && finishReason ? finishReason : undefined;
}

function readToolCalls(value: unknown): Array<{ id?: unknown; name?: unknown; args?: unknown }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if ("tool_calls" in value) {
    const toolCalls = (value as { tool_calls?: unknown }).tool_calls;
    return Array.isArray(toolCalls) ? toolCalls as Array<{ id?: unknown; name?: unknown; args?: unknown }> : [];
  }

  if ("content" in value) {
    return readToolCalls((value as { content?: unknown }).content);
  }

  return [];
}

function readToolCallInput(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  return value;
}

function readUsageMetadata(value: unknown): { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown } | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if ("usage_metadata" in value) {
    const usageMetadata = (value as { usage_metadata?: unknown }).usage_metadata;
    return usageMetadata && typeof usageMetadata === "object"
      ? usageMetadata as { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown }
      : undefined;
  }

  if ("content" in value) {
    return readUsageMetadata((value as { content?: unknown }).content);
  }

  return undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
