import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import TOML from "toml";
import { z } from "zod";
import type { ProviderId } from "../../providers/types.js";

const defaultHistoryMaxMessages = 24;

const rawConfigSchema = z.object({
  defaultProvider: z.literal("deepseek").optional(),
  defaultModel: z.string().min(1).optional(),
  databasePath: z.string().min(1).optional(),
  history: z.object({
    maxMessages: z.number().int().positive().optional(),
  }).partial().optional(),
  prompts: z.object({
    defaultSystemFile: z.string().min(1).optional(),
    providers: z.object({
      deepseek: z.string().min(1).optional(),
    }).partial().optional(),
  }).partial().optional(),
}).partial();

type RawConfig = z.infer<typeof rawConfigSchema>;

export interface PromptConfig {
  defaultSystemFile?: string;
  providers: Partial<Record<ProviderId, string>>;
}

export interface AppConfig {
  defaultProvider: "deepseek";
  defaultModel: string;
  deepseekBaseUrl: string;
  databasePath: string;
  historyMaxMessages: number;
  workspaceRoot: string;
  deepseekApiKey?: string;
  prompts: PromptConfig;
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
  const historyMaxMessages = readPositiveInt(process.env.AI_COMPANION_HISTORY_MAX_MESSAGES)
    ?? fileConfig.history?.maxMessages
    ?? defaultHistoryMaxMessages;

  return {
    defaultProvider: "deepseek",
    defaultModel: process.env.AI_COMPANION_MODEL ?? fileConfig.defaultModel ?? "deepseek-chat",
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    databasePath: process.env.AI_COMPANION_DB_PATH ?? fileConfig.databasePath ?? path.join(homedir(), ".ai-companion", "ai-companion.db"),
    historyMaxMessages,
    workspaceRoot: process.cwd(),
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    prompts: {
      defaultSystemFile: resolveConfigPath(configDir, fileConfig.prompts?.defaultSystemFile),
      providers: {
        deepseek: resolveConfigPath(configDir, fileConfig.prompts?.providers?.deepseek),
      },
    },
  };
}

function readPositiveInt(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  return Number(value);
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
