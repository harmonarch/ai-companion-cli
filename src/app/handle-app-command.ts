import type { Dispatch, SetStateAction } from "react";
import { formatAwaitingApiKeyStatus } from "#src/app/setup-flow.js";
import { flattenModelCatalog } from "#src/components/ModelList.js";
import type { SessionSnapshot, SessionStore } from "#src/controller/session-store.js";
import type { SlashCommand } from "#src/controller/slash-commands.js";
import type { RuntimeConfigService } from "#src/infra/config/runtime-config-service.js";
import type { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import { getProvider, listProviderCatalog } from "#src/providers/registry.js";
import type { AssistantProfileField } from "#src/types/assistant-profile.js";
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
  switch (command.type) {
    case "new": {
      const nextSnapshot = sessionStore.createSession();
      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "overlay/close" });
      setSnapshot(nextSnapshot);
      setSessions(sessionStore.listSessions());
      dispatch({ type: "status/set", value: "Created a new session." });
      return;
    }
    case "sessions": {
      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "overlay/sessions/open", selectedIndex: 0 });
      setSessions(sessionStore.listSessions());
      return;
    }
    case "switch": {
      if (!command.target) {
        dispatch({ type: "reset-confirmation/set", value: false });
        dispatch({ type: "overlay/sessions/open", selectedIndex: 0 });
        setSessions(sessionStore.listSessions());
        return;
      }

      const targetInput = command.target;
      const currentSessions = sessionStore.listSessions();
      const byIndex = Number(targetInput);
      const target = Number.isInteger(byIndex) && byIndex > 0
        ? currentSessions[byIndex - 1]
        : currentSessions.find((session) => session.id.startsWith(targetInput));

      if (!target) {
        dispatch({ type: "status/set", value: `Session not found: ${targetInput}` });
        return;
      }

      try {
        dispatch({ type: "reset-confirmation/set", value: false });
        dispatch({ type: "overlay/close" });
        setSnapshot(sessionStore.loadSession(target.id));
        dispatch({ type: "status/set", value: `Switched to ${target.title}.` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        dispatch({ type: "status/set", value: `Error: ${message}` });
      }
      return;
    }
    case "memory": {
      if (command.target) {
        const normalizedTarget = command.target.trim().toLowerCase();
        if (normalizedTarget === "delete" || normalizedTarget.startsWith("delete ")) {
          dispatch({ type: "status/set", value: "Use /memory, select a record, then press d to delete." });
          return;
        }
      }

      if (!activeSnapshot) {
        setSnapshot(sessionStore.ensureSession());
      }

      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "profile-clear-confirmation/set", value: false });
      dispatch({ type: "overlay/memory/open", selectedIndex: 0 });
      setSessions(sessionStore.listSessions());
      dispatch({ type: "status/set", value: "Memory opened." });
      return;
    }
    case "emotion": {
      const snapshot = activeSnapshot ?? sessionStore.ensureSession();
      if (!activeSnapshot) {
        setSnapshot(snapshot);
      }

      const action = command.target?.trim().toLowerCase();
      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "profile-clear-confirmation/set", value: false });
      dispatch({ type: "overlay/close" });

      if (!action) {
        dispatch({ type: "status/set", value: formatEmotionSummary(snapshot, false) });
        return;
      }

      if (action === "debug") {
        dispatch({ type: "status/set", value: formatEmotionSummary(snapshot, true) });
        return;
      }

      if (action === "reset") {
        const nextSnapshot = sessionStore.resetEmotion(snapshot.session.id);
        setSnapshot(nextSnapshot);
        dispatch({ type: "status/set", value: "Emotion state reset." });
        return;
      }

      dispatch({ type: "status/set", value: "Usage: /emotion, /emotion debug, /emotion reset" });
      return;
    }
    case "profile": {
      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "overlay/close" });

      if (!command.target) {
        dispatch({ type: "profile-clear-confirmation/set", value: false });
        dispatch({ type: "status/set", value: formatAssistantProfile(assistantProfileRepository) });
        return;
      }

      const parts = command.target.trim().split(/\s+/);
      const action = parts[0]?.toLowerCase();

      if (action === "clear") {
        const subcommand = parts[1]?.toLowerCase();

        if (!subcommand) {
          dispatch({ type: "profile-clear-confirmation/set", value: true });
          dispatch({ type: "status/set", value: "Profile clear staged. Run /profile clear confirm to remove the assistant profile, or /profile clear cancel to abort." });
          return;
        }

        if (subcommand === "cancel") {
          dispatch({ type: "profile-clear-confirmation/set", value: false });
          dispatch({ type: "status/set", value: "Profile clear canceled." });
          return;
        }

        if (subcommand !== "confirm") {
          dispatch({ type: "status/set", value: "Usage: /profile, /profile set <name|role|selfReference> <value>, /profile clear, /profile clear confirm, /profile clear cancel" });
          return;
        }

        if (!pendingProfileClearConfirmation) {
          dispatch({ type: "status/set", value: "Run /profile clear first, then /profile clear confirm." });
          return;
        }

        assistantProfileRepository.clear();
        dispatch({ type: "profile-clear-confirmation/set", value: false });
        dispatch({ type: "status/set", value: "Assistant profile cleared." });
        return;
      }

      if (action !== "set") {
        dispatch({ type: "profile-clear-confirmation/set", value: false });
        dispatch({ type: "status/set", value: "Usage: /profile, /profile set <name|role|selfReference> <value>, /profile clear, /profile clear confirm, /profile clear cancel" });
        return;
      }

      const field = parts[1] as AssistantProfileField | undefined;
      const value = parts.slice(2).join(" ").trim();
      if (!isAssistantProfileField(field) || !value) {
        dispatch({ type: "profile-clear-confirmation/set", value: false });
        dispatch({ type: "status/set", value: "Usage: /profile set <name|role|selfReference> <value>" });
        return;
      }

      const nextProfile = assistantProfileRepository.setField(field, value);
      dispatch({ type: "profile-clear-confirmation/set", value: false });
      dispatch({ type: "status/set", value: `Assistant profile updated: ${formatProfileField(field)} = ${readProfileField(nextProfile, field)}` });
      return;
    }
    case "model": {
      const options = flattenModelCatalog(listProviderCatalog());
      if (options.length === 0) {
        dispatch({ type: "status/set", value: "No models are available." });
        return;
      }

      const selectedIndex = findCurrentModelIndex(options, activeSnapshot);
      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "profile-clear-confirmation/set", value: false });
      dispatch({ type: "overlay/model/open", selectedIndex });
      dispatch({ type: "status/set", value: "Model chooser opened. Use ↑ ↓ and Enter." });
      return;
    }
    case "reset": {
      const action = command.target?.trim().toLowerCase();

      if (!action) {
        dispatch({ type: "reset-confirmation/set", value: true });
        dispatch({ type: "profile-clear-confirmation/set", value: false });
        dispatch({ type: "overlay/close" });
        dispatch({ type: "status/set", value: "Reset staged. Run /reset confirm to clear all chat history, memory, and assistant profile, or /reset cancel to abort." });
        return;
      }

      if (action === "cancel") {
        dispatch({ type: "reset-confirmation/set", value: false });
        dispatch({ type: "status/set", value: "Reset canceled." });
        return;
      }

      if (action !== "confirm") {
        dispatch({ type: "status/set", value: "Usage: /reset, /reset confirm, /reset cancel" });
        return;
      }

      if (!pendingResetConfirmation) {
        dispatch({ type: "status/set", value: "Run /reset first, then /reset confirm." });
        return;
      }

      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "profile-clear-confirmation/set", value: false });
      const nextSnapshot = sessionStore.resetAll();
      dispatch({ type: "overlay/close" });
      setSnapshot(nextSnapshot);
      setSessions(sessionStore.listSessions());
      dispatch({ type: "status/set", value: "All chat history, memory, and assistant profile have been reset." });
      return;
    }
    case "help": {
      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "overlay/help/open" });
      dispatch({ type: "status/set", value: "Help opened. Press Esc to close." });
      return;
    }
    case "exit": {
      onExitRequested();
      return;
    }
    case "unknown": {
      dispatch({ type: "status/set", value: `Unknown command: /${command.name}` });
      return;
    }
    default:
      return;
  }
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

function findCurrentModelIndex(
  options: ReturnType<typeof flattenModelCatalog>,
  activeSnapshot: SessionSnapshot | null,
) {
  const currentProvider = activeSnapshot?.session.provider;
  const currentModel = activeSnapshot?.session.model;
  const selectedIndex = options.findIndex((option) => option.providerId === currentProvider && option.model === currentModel);
  return selectedIndex >= 0 ? selectedIndex : 0;
}

function formatEmotionSummary(snapshot: SessionSnapshot, debug: boolean) {
  const state = snapshot.emotion;
  if (!debug) {
    return `Emotion: ${state.primary}.`;
  }

  return [
    `Emotion: ${state.primary}`,
    `intensity=${state.intensity.toFixed(2)}`,
    `intimacy=${state.intimacy.toFixed(2)}`,
    `boundary=${state.boundaryActive ? "on" : "off"}`,
    `trigger=${state.lastTrigger ?? "none"}`,
    `stepsSinceTrigger=${state.stepsSinceTrigger}`,
  ].join(" | ");
}

function isAssistantProfileField(field: string | undefined): field is AssistantProfileField {
  return field === "name" || field === "role" || field === "selfReference";
}

function formatAssistantProfile(assistantProfileRepository: AssistantProfileRepository) {
  const profile = assistantProfileRepository.get();
  if (!profile) {
    return "No assistant profile configured.";
  }

  return [
    "Assistant profile:",
    profile.name ? `name: ${profile.name}` : "name: —",
    profile.role ? `role: ${profile.role}` : "role: —",
    profile.selfReference ? `selfReference: ${profile.selfReference}` : "selfReference: —",
    `updatedAt: ${profile.meta.updatedAt}`,
    `updatedBy: ${profile.meta.updatedBy}`,
  ].join(" | ");
}

function formatProfileField(field: AssistantProfileField) {
  return field;
}

function readProfileField(
  profile: NonNullable<ReturnType<AssistantProfileRepository["get"]>>,
  field: AssistantProfileField,
) {
  return profile[field];
}
