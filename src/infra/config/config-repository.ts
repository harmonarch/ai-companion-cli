import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import TOML from "toml";
import {
  getConfigPath,
  rawConfigSchema,
  type RawConfig,
} from "#src/infra/config/load-config.js";

export class ConfigRepository {
  getPath() {
    return getConfigPath();
  }

  read() {
    const filePath = this.getPath();
    if (!existsSync(filePath)) {
      return {} satisfies RawConfig;
    }

    try {
      const parsed = TOML.parse(readFileSync(filePath, "utf8"));
      return rawConfigSchema.parse(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse config file ${filePath}: ${message}`);
    }
  }

  saveModelSelection(input: { providerId: string; model: string }) {
    const current = this.read();
    this.write({
      ...current,
      defaultProvider: input.providerId,
      defaultModel: input.model,
    });
  }

  saveProviderApiKey(input: { providerId: string; apiKey: string }) {
    const current = this.read();
    const providerSettings = current.providers ?? {};
    this.write({
      ...current,
      providers: {
        ...providerSettings,
        [input.providerId]: {
          ...(providerSettings[input.providerId] ?? {}),
          apiKey: input.apiKey,
        },
      },
    });
  }

  private write(config: RawConfig) {
    const filePath = this.getPath();
    const serialized = `${serializeToml(config)}\n`;
    mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    writeFileSync(tempPath, serialized, "utf8");
    renameSync(tempPath, filePath);
  }
}

function serializeToml(config: RawConfig) {
  const lines = serializeTomlTable(config);
  return lines.length > 0 ? lines.join("\n") : "";
}

function serializeTomlTable(value: Record<string, unknown>, pathParts: string[] = []) {
  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)
    .sort(([left], [right]) => left.localeCompare(right));
  const scalarLines: string[] = [];
  const tableBlocks: string[][] = [];

  for (const [key, entryValue] of entries) {
    if (isPlainObject(entryValue)) {
      const nestedLines = serializeTomlTable(entryValue, [...pathParts, key]);
      if (nestedLines.length > 0) {
        tableBlocks.push(nestedLines);
      }
      continue;
    }

    scalarLines.push(`${formatTomlKey(key)} = ${formatTomlValue(entryValue)}`);
  }

  const lines: string[] = [];
  if (pathParts.length > 0 && (scalarLines.length > 0 || tableBlocks.length > 0)) {
    lines.push(`[${pathParts.map(formatTomlKey).join(".")}]`);
  }

  lines.push(...scalarLines);

  for (const [index, block] of tableBlocks.entries()) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(...block);
    if (index < tableBlocks.length - 1) {
      lines.push("");
    }
  }

  return trimTrailingBlankLines(lines);
}

function formatTomlKey(key: string) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function formatTomlValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => formatTomlValue(item)).join(", ")}]`;
  }

  throw new Error(`Unsupported TOML value: ${String(value)}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimTrailingBlankLines(lines: string[]) {
  const nextLines = [...lines];
  while (nextLines.at(-1) === "") {
    nextLines.pop();
  }
  return nextLines;
}
