import type { ModelCapabilities } from "#src/providers/types.js";

const defaultCapabilities: ModelCapabilities = {
  supportsStreaming: true,
  supportsToolCalling: true,
  allowedTools: ["read_file", "list_dir", "search_text", "http_fetch"],
};

const deepseekCapabilities: Record<string, ModelCapabilities> = {
  "deepseek-chat": defaultCapabilities,
};

const glmCapabilities: Record<string, ModelCapabilities> = {
  "glm-5.1": defaultCapabilities,
};

export function getDeepseekModelCapabilities(model: string): ModelCapabilities {
  return deepseekCapabilities[model] ?? defaultCapabilities;
}

export function listDeepseekModels() {
  return Object.keys(deepseekCapabilities);
}

export function getGlmModelCapabilities(model: string): ModelCapabilities {
  return glmCapabilities[model] ?? defaultCapabilities;
}

export function listGlmModels() {
  return Object.keys(glmCapabilities);
}
