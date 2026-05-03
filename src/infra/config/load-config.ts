import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import TOML from "toml";
import { z } from "zod";
import type { ProviderId } from "#src/providers/types.js";
import { assistantProfileRelativePath, assistantProfileSchema, type AssistantProfile } from "#src/types/assistant-profile.js";

const defaultHistoryMaxMessages = 24;

const providerPromptSchema = z.record(z.string(), z.string().min(1));
const providerSettingsSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

const rawConfigSchema = z.object({
  defaultProvider: z.string().min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  storagePath: z.string().min(1).optional(),
  history: z.object({
    maxMessages: z.number().int().positive().optional(),
  }).partial().optional(),
  prompts: z.object({
    defaultSystemFile: z.string().min(1).optional(),
    providers: providerPromptSchema.optional(),
  }).partial().optional(),
  providers: providerSettingsSchema.optional(),
  memory: z.object({
    enabled: z.boolean().optional(),
    userId: z.string().min(1).optional(),
    autoWriteLowRisk: z.boolean().optional(),
  }).partial().optional(),
}).partial();

type RawConfig = z.infer<typeof rawConfigSchema>;

export type ProviderSettings = Record<string, unknown>;

export interface PromptConfig {
  defaultSystemFile?: string;
  providers: Partial<Record<ProviderId, string>>;
}

export interface MemoryConfig {
  enabled: boolean;
  userId: string;
  autoWriteLowRisk: boolean;
}

export interface AppConfig {
  defaultProvider: ProviderId;
  defaultModel: string;
  storagePath: string;
  historyMaxMessages: number;
  workspaceRoot: string;
  prompts: PromptConfig;
  providerSettings: Record<string, ProviderSettings>;
  memory: MemoryConfig;
  assistantProfile?: AssistantProfile;
}

function getConfigCandidates() {
  const explicitPath = process.env.AI_COMPANION_CONFIG_PATH;
  return [
    explicitPath,
    path.join(homedir(), ".config", "ai-companion", "config.toml"),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function readTomlConfig(): { config: RawConfig; configDir?: string } {
  for (const candidate of getConfigCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const parsed = TOML.parse(readFileSync(candidate, "utf8"));
      return {
        config: rawConfigSchema.parse(parsed),
        configDir: path.dirname(candidate),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse config file ${candidate}: ${message}`);
    }
  }

  return {
    config: {},
    configDir: undefined,
  };
}

export function loadConfig(): AppConfig {
  const { config: fileConfig, configDir } = readTomlConfig();
  const workspaceRoot = process.cwd();
  const historyMaxMessages = readPositiveInt(process.env.AI_COMPANION_HISTORY_MAX_MESSAGES)
    ?? fileConfig.history?.maxMessages
    ?? defaultHistoryMaxMessages;

  return {
    defaultProvider: process.env.AI_COMPANION_PROVIDER ?? fileConfig.defaultProvider ?? "deepseek",
    defaultModel: process.env.AI_COMPANION_MODEL ?? fileConfig.defaultModel ?? "deepseek-chat",
    storagePath: process.env.AI_COMPANION_STORAGE_PATH ?? fileConfig.storagePath ?? path.join(homedir(), ".ai-companion"),
    historyMaxMessages,
    workspaceRoot,
    prompts: {
      defaultSystemFile: resolveConfigPath(configDir, fileConfig.prompts?.defaultSystemFile),
      providers: resolvePromptFiles(configDir, fileConfig.prompts?.providers),
    },
    providerSettings: resolveProviderSettings(fileConfig),
    memory: {
      enabled: readBoolean(process.env.AI_COMPANION_MEMORY_ENABLED)
        ?? fileConfig.memory?.enabled
        ?? true,
      userId: process.env.AI_COMPANION_MEMORY_USER_ID
        ?? fileConfig.memory?.userId
        ?? "local-user",
      autoWriteLowRisk: readBoolean(process.env.AI_COMPANION_MEMORY_AUTO_WRITE_LOW_RISK)
        ?? fileConfig.memory?.autoWriteLowRisk
        ?? true,
    },
    assistantProfile: readAssistantProfile(workspaceRoot),
  };
}

function readAssistantProfile(workspaceRoot: string) {
  const filePath = path.join(workspaceRoot, assistantProfileRelativePath);
  if (!existsSync(filePath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return assistantProfileSchema.parse(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse assistant profile ${filePath}: ${message}`);
  }
}

function readPositiveInt(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  return Number(value);
}

function readBoolean(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function resolveConfigPath(configDir: string | undefined, filePath: string | undefined) {
  if (!filePath) {
    return undefined;
  }

  if (path.isAbsolute(filePath) || !configDir) {
    return filePath;
  }

  return path.resolve(configDir, filePath);
}

function resolvePromptFiles(
  configDir: string | undefined,
  providers: Record<string, string> | undefined,
): Partial<Record<ProviderId, string>> {
  if (!providers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(providers).map(([providerId, filePath]) => [providerId, resolveConfigPath(configDir, filePath)]),
  );
}

function resolveProviderSettings(fileConfig: RawConfig): Record<string, ProviderSettings> {
  const configuredProviders = fileConfig.providers ?? {};
  const deepseekSettings = {
    ...(configuredProviders.deepseek ?? {}),
    apiKey: process.env.DEEPSEEK_API_KEY ?? configuredProviders.deepseek?.apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? configuredProviders.deepseek?.baseUrl,
  };

  return {
    ...configuredProviders,
    deepseek: deepseekSettings,
  };
}
