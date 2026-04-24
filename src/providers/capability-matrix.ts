import type { ModelCapabilities, ProviderId } from "./types.js";

const defaultCapabilities: ModelCapabilities = {
  supportsStreaming: true,
  supportsToolCalling: true,
  allowedTools: ["read_file", "list_dir", "search_text", "http_fetch"],
};

const matrix: Record<ProviderId, Record<string, ModelCapabilities>> = {
  deepseek: {
    "deepseek-chat": defaultCapabilities,
  },
};

export function getModelCapabilities(provider: ProviderId, model: string): ModelCapabilities {
  return matrix[provider]?.[model] ?? defaultCapabilities;
}
