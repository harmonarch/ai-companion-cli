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

export const rawConfigSchema = z.object({
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

export type RawConfig = z.infer<typeof rawConfigSchema>;

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

export interface AppConfigSetup {
  configPath: string;
  configFileExists: boolean;
  defaultProviderConfigured: boolean;
  defaultModelConfigured: boolean;
  providerApiKeysConfigured: Record<string, boolean>;
  setupRequired: boolean;
  setupReason:
    | "missing_config_file"
    | "missing_default_provider"
    | "missing_default_model"
    | "missing_api_key"
    | "ready";
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
  setup: AppConfigSetup;
}

interface ParsedTomlConfig {
  config: RawConfig;
  configDir?: string;
  configFileExists: boolean;
  configPath: string;
}

export function getConfigPath() {
  return process.env.AI_COMPANION_CONFIG_PATH
    ?? path.join(homedir(), ".config", "ai-companion", "config.toml");
}

function readTomlConfig(): ParsedTomlConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {
      config: {},
      configDir: path.dirname(configPath),
      configFileExists: false,
      configPath,
    };
  }

  try {
    const parsed = TOML.parse(readFileSync(configPath, "utf8"));
    return {
      config: rawConfigSchema.parse(parsed),
      configDir: path.dirname(configPath),
      configFileExists: true,
      configPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse config file ${configPath}: ${message}`);
  }
}

export function loadConfig(): AppConfig {
  const {
    config: fileConfig,
    configDir,
    configFileExists,
    configPath,
  } = readTomlConfig();
  const workspaceRoot = process.cwd();
  const historyMaxMessages = readPositiveInt(process.env.AI_COMPANION_HISTORY_MAX_MESSAGES)
    ?? fileConfig.history?.maxMessages
    ?? defaultHistoryMaxMessages;
  const defaultProvider = process.env.AI_COMPANION_PROVIDER ?? fileConfig.defaultProvider ?? "deepseek";
  const defaultModel = process.env.AI_COMPANION_MODEL ?? fileConfig.defaultModel ?? "deepseek-chat";
  const providerSettings = resolveProviderSettings(fileConfig);
  const setup = resolveSetupState({
    configFileExists,
    configPath,
    defaultProvider,
    defaultProviderConfigured: Boolean(fileConfig.defaultProvider),
    defaultModelConfigured: Boolean(fileConfig.defaultModel),
    providerSettings,
  });

  return {
    defaultProvider,
    defaultModel,
    storagePath: process.env.AI_COMPANION_STORAGE_PATH ?? fileConfig.storagePath ?? path.join(homedir(), ".ai-companion"),
    historyMaxMessages,
    workspaceRoot,
    prompts: {
      defaultSystemFile: resolveConfigPath(configDir, fileConfig.prompts?.defaultSystemFile),
      providers: resolvePromptFiles(configDir, fileConfig.prompts?.providers),
    },
    providerSettings,
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
    setup,
  };
}

function resolveSetupState({
  configFileExists,
  configPath,
  defaultProvider,
  defaultProviderConfigured,
  defaultModelConfigured,
  providerSettings,
}: {
  configFileExists: boolean;
  configPath: string;
  defaultProvider: string;
  defaultProviderConfigured: boolean;
  defaultModelConfigured: boolean;
  providerSettings: Record<string, ProviderSettings>;
}): AppConfigSetup {
  const providerApiKeysConfigured = Object.fromEntries(
    Object.entries(providerSettings).map(([providerId, settings]) => [providerId, hasApiKeySetting(providerId, settings)]),
  );
  const hasSelectedProviderApiKey = providerApiKeysConfigured[defaultProvider] ?? hasApiKeySetting(defaultProvider, providerSettings[defaultProvider] ?? {});

  let setupReason: AppConfigSetup["setupReason"] = "ready";
  if (!configFileExists) {
    setupReason = "missing_config_file";
  } else if (!defaultProviderConfigured) {
    setupReason = "missing_default_provider";
  } else if (!defaultModelConfigured) {
    setupReason = "missing_default_model";
  } else if (!hasSelectedProviderApiKey) {
    setupReason = "missing_api_key";
  }

  return {
    configPath,
    configFileExists,
    defaultProviderConfigured,
    defaultModelConfigured,
    providerApiKeysConfigured,
    setupRequired: setupReason !== "ready",
    setupReason,
  };
}

function hasApiKeySetting(providerId: string, settings: ProviderSettings) {
  const envKey = process.env[getProviderApiKeyEnvName(providerId)];
  if (typeof envKey === "string" && envKey.trim()) {
    return true;
  }

  return typeof settings.apiKey === "string" && settings.apiKey.trim().length > 0;
}

export function getProviderApiKeyEnvName(providerId: string) {
  return `${providerId.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_API_KEY`;
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
    apiKey: configuredProviders.deepseek?.apiKey,
    baseUrl: configuredProviders.deepseek?.baseUrl,
  };

  return {
    ...configuredProviders,
    deepseek: deepseekSettings,
  };
}
