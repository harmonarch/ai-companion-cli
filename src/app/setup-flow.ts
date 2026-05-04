import type { AppConfigSetup } from "#src/infra/config/load-config.js";
import type { SlashCommand } from "#src/controller/slash-commands.js";

export function formatSetupStatus(setup: AppConfigSetup, input?: { providerId?: string; model?: string }) {
  if (!setup.setupRequired) {
    return undefined;
  }

  if (setup.setupReason === "missing_api_key" && input?.providerId && input?.model) {
    return `Enter the API key for ${input.providerId} / ${input.model}.`;
  }

  return "Setup required. Run /model to choose a model.";
}

export function formatAwaitingApiKeyStatus(input: { providerId: string; model: string }) {
  return `Model set to ${input.providerId} / ${input.model}. Enter the API key as the next message to save it to config.`;
}

export function isSetupCommandAllowed(command: SlashCommand) {
  return command.type === "model" || command.type === "help" || command.type === "exit";
}
