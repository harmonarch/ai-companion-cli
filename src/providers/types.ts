import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AppConfig, ProviderSettings } from "../infra/config/load-config.js";
import type { PromptLoader } from "../prompts/loader.js";
import type { SessionRecord } from "../types/session.js";

export type ProviderId = string;

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
  createChatModel(config: AppConfig, session: SessionRecord): BaseChatModel;
  resolveSystemPrompt(context: SystemPromptContext): string;
}

export function readProviderSettings(
  providerSettings: Record<string, ProviderSettings>,
  providerId: ProviderId,
): ProviderSettings {
  return providerSettings[providerId] ?? {};
}
