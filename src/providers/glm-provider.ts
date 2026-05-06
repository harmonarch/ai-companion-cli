import { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "#src/infra/config/load-config.js";
import { getGlmModelCapabilities, listGlmModels } from "#src/providers/capability-matrix.js";
import { createLangChainRuntime } from "#src/providers/langchain-runtime.js";
import { readProviderSettings } from "#src/providers/types.js";
import type { ProviderDefinition, ValidateApiKeyInput } from "#src/providers/types.js";
import type { SessionRecord } from "#src/types/session.js";

const defaultBaseUrl = "https://open.bigmodel.cn/api/paas/v4/";

export const glmProvider: ProviderDefinition = {
  id: "glm",
  defaultModel: "glm-5.1",
  listModels() {
    return listGlmModels();
  },
  async validateApiKey(config, input) {
    const apiKey = readStringSetting(input.apiKey);
    if (!apiKey) {
      throw new Error("API key is required.");
    }

    const resolved = resolveGlmValidationInput(config, input);
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
      throw new Error(`GLM API key validation failed: ${message}`);
    }
  },
  getCapabilities(model) {
    return getGlmModelCapabilities(model);
  },
  createRuntime(config: AppConfig, session: SessionRecord) {
    const settings = getGlmSettings(config);
    if (!settings.apiKey) {
      throw new Error("Missing GLM_API_KEY.");
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
    return promptLoader.load("glm", {
      workspaceRoot: config.workspaceRoot,
    });
  },
};

export function getGlmSettings(config: AppConfig) {
  const settings = readProviderSettings(config.providerSettings, "glm");

  return {
    apiKey: readStringSetting(settings.apiKey),
    baseUrl: readStringSetting(settings.baseUrl) ?? defaultBaseUrl,
  };
}

export function resolveGlmValidationInput(config: AppConfig, input: ValidateApiKeyInput): ValidateApiKeyInput {
  const settings = getGlmSettings(config);
  return {
    apiKey: input.apiKey,
    baseUrl: input.baseUrl ?? settings.baseUrl,
    model: input.model ?? config.defaultModel ?? "glm-5.1",
  };
}

function readStringSetting(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
