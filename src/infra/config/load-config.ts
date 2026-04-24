import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import TOML from "toml";
import { z } from "zod";

const rawConfigSchema = z.object({
  defaultProvider: z.literal("deepseek").optional(),
  defaultModel: z.string().min(1).optional(),
  databasePath: z.string().min(1).optional(),
}).partial();

export interface AppConfig {
  defaultProvider: "deepseek";
  defaultModel: string;
  deepseekBaseUrl: string;
  databasePath: string;
  workspaceRoot: string;
  deepseekApiKey?: string;
}

function getConfigCandidates() {
  const explicitPath = process.env.AI_COMPANION_CONFIG_PATH;
  return [
    explicitPath,
    path.join(homedir(), ".config", "ai-companion", "config.toml"),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function readTomlConfig() {
  for (const candidate of getConfigCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const parsed = TOML.parse(readFileSync(candidate, "utf8"));
      return rawConfigSchema.parse(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse config file ${candidate}: ${message}`);
    }
  }

  return {};
}

export function loadConfig(): AppConfig {
  const fileConfig = readTomlConfig();

  return {
    defaultProvider: "deepseek",
    defaultModel: process.env.AI_COMPANION_MODEL ?? fileConfig.defaultModel ?? "deepseek-chat",
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    databasePath: process.env.AI_COMPANION_DB_PATH ?? fileConfig.databasePath ?? path.join(homedir(), ".ai-companion", "ai-companion.db"),
    workspaceRoot: process.cwd(),
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  };
}
