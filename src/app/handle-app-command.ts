import type { Dispatch, SetStateAction } from "react";
import { formatAwaitingApiKeyStatus } from "#src/app/setup-flow.js";
import { applyAppCommandResult } from "#src/app/app-command-result.js";
import { executeAppCommand, findCurrentModelIndex } from "#src/app/execute-app-command.js";
import { flattenModelCatalog } from "#src/components/ModelList.js";
import type { SessionSnapshot, SessionStore } from "#src/controller/session-store.js";
import type { SlashCommand } from "#src/controller/slash-commands.js";
import type { RuntimeConfigService } from "#src/infra/config/runtime-config-service.js";
import type { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import { getProvider, listProviderCatalog } from "#src/providers/registry.js";
import type { SessionSummary } from "#src/types/session.js";
import type { UiAction } from "#src/app/ui-state.js";

interface HandleAppCommandOptions {
  activeSnapshot: SessionSnapshot | null;
  assistantProfileRepository: AssistantProfileRepository;
  command: SlashCommand;
  dispatch: Dispatch<UiAction>;
  pendingProfileClearConfirmation: boolean;
  pendingResetConfirmation: boolean;
  runtimeConfig: RuntimeConfigService;
  sessionStore: SessionStore;
  onExitRequested(): void;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
}

export async function handleAppCommand({
  activeSnapshot,
  assistantProfileRepository,
  command,
  dispatch,
  pendingProfileClearConfirmation,
  pendingResetConfirmation,
  runtimeConfig,
  sessionStore,
  onExitRequested,
  setSnapshot,
  setSessions,
}: HandleAppCommandOptions) {
  const result = executeAppCommand({
    activeSnapshot,
    assistantProfileRepository,
    command,
    pendingProfileClearConfirmation,
    pendingResetConfirmation,
    sessionStore,
  });

  applyAppCommandResult({
    dispatch,
    onExitRequested,
    result,
    setSessions,
    setSnapshot,
  });
}

export function applyModelSelection({
  activeSnapshot,
  dispatch,
  option,
  runtimeConfig,
  sessionStore,
  setSnapshot,
  setSessions,
}: {
  activeSnapshot: SessionSnapshot | null;
  dispatch: Dispatch<UiAction>;
  option: { providerId: string; model: string };
  runtimeConfig: RuntimeConfigService;
  sessionStore: SessionStore;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
}) {
  const provider = getProvider(option.providerId);
  if (!provider) {
    throw new Error(`Unsupported provider: ${option.providerId}`);
  }

  if (!provider.listModels().includes(option.model)) {
    throw new Error(`Unsupported model for ${option.providerId}: ${option.model}`);
  }

  runtimeConfig.saveModelSelection(option);
  sessionStore.updateDefaults({
    provider: option.providerId,
    model: option.model,
  });

  if (activeSnapshot) {
    const nextSnapshot = sessionStore.updateSessionProviderAndModel(activeSnapshot.session.id, {
      provider: option.providerId,
      model: option.model,
    });
    setSnapshot(nextSnapshot);
  }

  setSessions(sessionStore.listSessions());
  dispatch({ type: "overlay/close" });
  dispatch({ type: "setup/input/await-api-key", providerId: option.providerId, model: option.model });
  dispatch({ type: "status/set", value: formatAwaitingApiKeyStatus(option) });
}

export { findCurrentModelIndex };
