import { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "../infra/config/load-config.js";
import type { SessionRecord } from "../types/session.js";
import { getModelCapabilities } from "./capability-matrix.js";
import type { ProviderDefinition } from "./types.js";

export const deepseekProvider: ProviderDefinition = {
  id: "deepseek",
  defaultModel: "deepseek-chat",
  getCapabilities(model) {
    return getModelCapabilities("deepseek", model);
  },
  createChatModel(config: AppConfig, session: SessionRecord) {
    if (!config.deepseekApiKey) {
      throw new Error("Missing DEEPSEEK_API_KEY.");
    }

    return new ChatOpenAI({
      model: session.model,
      apiKey: config.deepseekApiKey,
      temperature: 0.2,
      streaming: true,
      configuration: {
        baseURL: config.deepseekBaseUrl,
      },
    });
  },
  resolveSystemPrompt({ config, promptLoader }) {
    return promptLoader.load("deepseek", {
      workspaceRoot: config.workspaceRoot,
    });
  },
};
