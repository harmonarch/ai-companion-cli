/**
 * DeepSeek provider 定义。
 * 负责声明模型列表、API key 校验、runtime 创建，以及当前 provider 使用哪份 system prompt。
 */
import { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "#src/infra/config/load-config.js";
import type { SessionRecord } from "#src/types/session.js";
import { getDeepseekModelCapabilities, listDeepseekModels } from "#src/providers/capability-matrix.js";
import { createLangChainRuntime } from "#src/providers/langchain-runtime.js";
import { readProviderSettings } from "#src/providers/types.js";
import type { ProviderDefinition, ValidateApiKeyInput } from "#src/providers/types.js";

const defaultBaseUrl = "https://api.deepseek.com/v1";

export const deepseekProvider: ProviderDefinition = {
  /**
   * provider definition 只描述 DeepSeek 这一接入点本身的行为边界。
   * 真正统一的消息抽取、工具调用和事件转换逻辑仍然下沉在 langchain runtime 适配层。
   */
  id: "deepseek",
  defaultModel: "deepseek-chat",
  listModels() {
    return listDeepseekModels();
  },
  async validateApiKey(config, input) {
    const apiKey = readStringSetting(input.apiKey);
    if (!apiKey) {
      throw new Error("API key is required.");
    }

    const resolved = resolveDeepseekValidationInput(config, input);
    try {
      const client = new ChatOpenAI({
        model: resolved.model,
        apiKey,
        temperature: 0,
        maxTokens: 1,
        configuration: {
          baseURL: resolved.baseUrl,
        },
      });
      await client.invoke([{ role: "user", content: "ping" }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`DeepSeek API key validation failed: ${message}`);
    }
  },
  getCapabilities(model) {
    return getDeepseekModelCapabilities(model);
  },
  createRuntime(config: AppConfig, session: SessionRecord) {
    const settings = getDeepseekSettings(config);
    if (!settings.apiKey) {
      throw new Error("Missing DEEPSEEK_API_KEY.");
    }

    return createLangChainRuntime(new ChatOpenAI({
      model: session.model,
      apiKey: settings.apiKey,
      temperature: 0.2,
      streaming: true,
      configuration: {
        baseURL: settings.baseUrl,
      },
    }));
  },
  resolveSystemPrompt({ config, promptLoader }) {
    return promptLoader.load("deepseek", {
      workspaceRoot: config.workspaceRoot,
    });
  },
};

export function getDeepseekSettings(config: AppConfig) {
  const settings = readProviderSettings(config.providerSettings, "deepseek");

  return {
    apiKey: readStringSetting(settings.apiKey),
    baseUrl: readStringSetting(settings.baseUrl) ?? defaultBaseUrl,
  };
}

export function resolveDeepseekValidationInput(config: AppConfig, input: ValidateApiKeyInput): ValidateApiKeyInput {
  const settings = getDeepseekSettings(config);
  return {
    apiKey: input.apiKey,
    baseUrl: input.baseUrl ?? settings.baseUrl,
    model: input.model ?? config.defaultModel ?? "deepseek-chat",
  };
}

function readStringSetting(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
