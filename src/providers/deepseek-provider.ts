import { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "../infra/config/load-config.js";
import type { SessionRecord } from "../types/session.js";
import { getDeepseekModelCapabilities } from "./capability-matrix.js";
import { readProviderSettings } from "./types.js";
import type { ProviderDefinition } from "./types.js";

export const deepseekProvider: ProviderDefinition = {
  id: "deepseek",
  defaultModel: "deepseek-chat",
  getCapabilities(model) {
    return getDeepseekModelCapabilities(model);
  },
  createChatModel(config: AppConfig, session: SessionRecord) {
    const settings = getDeepseekSettings(config);
    if (!settings.apiKey) {
      throw new Error("Missing DEEPSEEK_API_KEY.");
    }

    return new ChatOpenAI({
      model: session.model,
      apiKey: settings.apiKey,
      temperature: 0.2,
      streaming: true,
      configuration: {
        baseURL: settings.baseUrl,
      },
    });
  },
  resolveSystemPrompt({ config, promptLoader }) {
    return promptLoader.load("deepseek", {
      workspaceRoot: config.workspaceRoot,
    });
  },
};

function getDeepseekSettings(config: AppConfig) {
  const settings = readProviderSettings(config.providerSettings, "deepseek");

  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? readStringSetting(settings.apiKey),
    baseUrl: process.env.DEEPSEEK_BASE_URL
      ?? readStringSetting(settings.baseUrl)
      ?? "https://api.deepseek.com/v1",
  };
}

function readStringSetting(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
