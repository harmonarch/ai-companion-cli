import type { ModelCapabilities } from "#src/providers/types.js";

const defaultCapabilities: ModelCapabilities = {
  supportsStreaming: true,
  supportsToolCalling: true,
  allowedTools: ["read_file", "list_dir", "search_text", "http_fetch"],
};

const deepseekCapabilities: Record<string, ModelCapabilities> = {
  "deepseek-chat": defaultCapabilities,
};

export function getDeepseekModelCapabilities(model: string): ModelCapabilities {
  return deepseekCapabilities[model] ?? defaultCapabilities;
}

export function listDeepseekModels() {
  return Object.keys(deepseekCapabilities);
}
