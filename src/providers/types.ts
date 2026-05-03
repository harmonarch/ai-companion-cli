import type { AppConfig, ProviderSettings } from "#src/infra/config/load-config.js";
import type { PromptLoader } from "#src/prompts/loader.js";
import type { CanonicalUsage } from "#src/types/events.js";
import type { SessionRecord } from "#src/types/session.js";

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

export interface RuntimeToolCall {
  callId: string;
  toolName: string;
  input: unknown;
}

export interface ProviderRuntime {
  invoke(input: unknown): Promise<unknown>;
  bindTools(tools: unknown[]): ProviderRuntime;
  hasToolCalls(message: unknown): boolean;
  extractText(value: unknown): string;
  extractToolCalls(value: unknown): RuntimeToolCall[];
  extractUsage(value: unknown): CanonicalUsage | undefined;
  extractFinishReason(value: unknown): string | undefined;
}

export interface ProviderDefinition {
  id: ProviderId;
  defaultModel: string;
  getCapabilities(model: string): ModelCapabilities;
  createRuntime(config: AppConfig, session: SessionRecord): ProviderRuntime;
  resolveSystemPrompt(context: SystemPromptContext): string;
}

export function readProviderSettings(
  providerSettings: Record<string, ProviderSettings>,
  providerId: ProviderId,
): ProviderSettings {
  return providerSettings[providerId] ?? {};
}
