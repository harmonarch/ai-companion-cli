import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { AppConfig } from "#src/infra/config/load-config.js";
import type { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import type { AssistantProfile } from "#src/types/assistant-profile.js";
import type { MemoryRecord } from "#src/types/memory.js";
import type { ProviderId } from "#src/providers/types.js";

const builtInMemoryExtractionPromptFiles = resolveBuiltInPromptFiles("memory.extract.md");
const builtInMemoryContextPromptFiles = resolveBuiltInPromptFiles("memory.context.md");

interface PromptVariables {
  workspaceRoot: string;
}

export class PromptLoader {
  constructor(
    private readonly config: AppConfig,
    private readonly assistantProfileRepository: AssistantProfileRepository,
  ) {}

  load(providerId: ProviderId, variables: PromptVariables): string {
    const promptBody = this.loadPromptBody(providerId, variables);
    const assistantIdentity = renderAssistantIdentityBlock(this.assistantProfileRepository.get() ?? this.config.assistantProfile);
    return assistantIdentity ? `${assistantIdentity}\n\n${promptBody}` : promptBody;
  }

  loadMemoryExtractionPrompt() {
    return readRequiredBuiltInAuxiliaryPromptFile(builtInMemoryExtractionPromptFiles, "memory extraction");
  }

  renderMemoryContext(records: MemoryRecord[]) {
    if (records.length === 0) {
      return "";
    }

    const template = readRequiredBuiltInAuxiliaryPromptFile(builtInMemoryContextPromptFiles, "memory context");
    const memoryLines = records
      .map((record) => `- ${record.subject}: ${record.value} (${record.kind}, ${record.type}, confidence ${record.confidence.toFixed(2)})`)
      .join("\n");

    return template.trim().replaceAll("{{memoryLines}}", memoryLines);
  }

  private loadPromptBody(providerId: ProviderId, variables: PromptVariables) {
    const configuredProviderFile = this.config.prompts.providers[providerId];
    if (configuredProviderFile) {
      return renderTemplate(readPromptFile(configuredProviderFile), variables);
    }

    const configuredDefaultFile = this.config.prompts.defaultSystemFile;
    if (configuredDefaultFile) {
      return renderTemplate(readPromptFile(configuredDefaultFile), variables);
    }

    const builtInProviderTemplate = readBuiltInPromptFile(providerId);
    if (builtInProviderTemplate) {
      return renderTemplate(builtInProviderTemplate, variables);
    }

    return renderTemplate(readRequiredBuiltInPromptFile("default"), variables);
  }
}

function renderAssistantIdentityBlock(profile: AssistantProfile | undefined) {
  if (!profile) {
    return "";
  }

  const identityLines = [
    profile.name ? `- Name: ${profile.name}` : null,
    profile.role ? `- Role: ${profile.role}` : null,
    profile.selfReference ? `- Self-reference: ${profile.selfReference}` : null,
    "- These fields describe the assistant, not the user.",
  ].filter((line): line is string => Boolean(line));

  return ["Assistant identity:", ...identityLines].join("\n");
}

function readPromptFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }

  return readFileSync(filePath, "utf8").trim();
}

function renderTemplate(template: string, variables: PromptVariables): string {
  return template.trim().replaceAll("{{workspaceRoot}}", variables.workspaceRoot);
}

function readBuiltInPromptFile(providerId: ProviderId | "default") {
  for (const filePath of resolveBuiltInPromptFiles(`${providerId}.system.md`)) {
    if (existsSync(filePath)) {
      return readFileSync(filePath, "utf8").trim();
    }
  }

  return undefined;
}

function readRequiredBuiltInPromptFile(providerId: ProviderId | "default") {
  const template = readBuiltInPromptFile(providerId);
  if (!template) {
    throw new Error(`Built-in prompt file not found for provider: ${providerId}`);
  }

  return template;
}

function readRequiredBuiltInAuxiliaryPromptFile(filePaths: string[], purpose: string) {
  for (const filePath of filePaths) {
    if (existsSync(filePath)) {
      return readFileSync(filePath, "utf8").trim();
    }
  }

  throw new Error(`Built-in prompt file not found for ${purpose}.`);
}

function resolveBuiltInPromptFiles(fileName: string) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  return [
    path.resolve(currentDir, "templates", fileName),
    path.resolve(currentDir, "..", "src", "prompts", "templates", fileName),
  ];
}
