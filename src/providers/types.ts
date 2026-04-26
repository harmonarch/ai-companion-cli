import type { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "../infra/config/load-config.js";
import type { PromptLoader } from "../prompts/loader.js";
import type { SessionRecord } from "../types/session.js";

export type ProviderId = "deepseek";

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  allowedTools: string[];
}

export interface SystemPromptContext {
  config: AppConfig;
  promptLoader: PromptLoader;
  session: SessionRecord;
}

export interface ProviderDefinition {
  id: ProviderId;
  defaultModel: string;
  getCapabilities(model: string): ModelCapabilities;
  createChatModel(config: AppConfig, session: SessionRecord): ChatOpenAI;
  resolveSystemPrompt(context: SystemPromptContext): string;
}
