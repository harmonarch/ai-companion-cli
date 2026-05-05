import { flattenModelCatalog } from "#src/components/ModelList.js";
import type { SessionSnapshot, SessionStore } from "#src/controller/session-store.js";
import type { SlashCommand } from "#src/controller/slash-commands.js";
import type { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import { listProviderCatalog } from "#src/providers/registry.js";
import type { AssistantProfileField } from "#src/types/assistant-profile.js";
import type { AppCommandResult } from "#src/app/app-command-result.js";

const profileUsage = "/profile, /profile set <name|role|selfReference|persona> <value>, /profile clear, /profile clear confirm, /profile clear cancel";
const profileSetUsage = "/profile set <name|role|selfReference|persona> <value>";

export function executeAppCommand({
  activeSnapshot,
  assistantProfileRepository,
  command,
  pendingProfileClearConfirmation,
  pendingResetConfirmation,
  sessionStore,
}: {
  activeSnapshot: SessionSnapshot | null;
  assistantProfileRepository: AssistantProfileRepository;
  command: SlashCommand;
  pendingProfileClearConfirmation: boolean;
  pendingResetConfirmation: boolean;
  sessionStore: SessionStore;
}): AppCommandResult {
  switch (command.type) {
    case "new": {
      const nextSnapshot = sessionStore.createSession();
      return {
        effects: [
          { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "overlay/close" } },
          { type: "setSnapshot", snapshot: nextSnapshot },
          { type: "setSessions", sessions: sessionStore.listSessions() },
          { type: "dispatch", action: { type: "status/set", value: "Created a new session." } },
        ],
      };
    }
    case "sessions": {
      return {
        effects: [
          { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "overlay/sessions/open", selectedIndex: 0 } },
          { type: "setSessions", sessions: sessionStore.listSessions() },
        ],
      };
    }
    case "switch": {
      if (!command.target) {
        return {
          effects: [
            { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "overlay/sessions/open", selectedIndex: 0 } },
            { type: "setSessions", sessions: sessionStore.listSessions() },
          ],
        };
      }

      const targetInput = command.target;
      const currentSessions = sessionStore.listSessions();
      const byIndex = Number(targetInput);
      const target = Number.isInteger(byIndex) && byIndex > 0
        ? currentSessions[byIndex - 1]
        : currentSessions.find((session) => session.id.startsWith(targetInput));

      if (!target) {
        return {
          effects: [
            { type: "dispatch", action: { type: "status/set", value: `Session not found: ${targetInput}` } },
          ],
        };
      }

      try {
        return {
          effects: [
            { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "overlay/close" } },
            { type: "setSnapshot", snapshot: sessionStore.loadSession(target.id) },
            { type: "dispatch", action: { type: "status/set", value: `Switched to ${target.title}.` } },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          effects: [
            { type: "dispatch", action: { type: "status/set", value: `Error: ${message}` } },
          ],
        };
      }
    }
    case "memory": {
      if (command.target) {
        const normalizedTarget = command.target.trim().toLowerCase();
        if (normalizedTarget === "delete" || normalizedTarget.startsWith("delete ")) {
          return {
            effects: [
              { type: "dispatch", action: { type: "status/set", value: "Use /memory, select a record, then press d to delete." } },
            ],
          };
        }
      }

      const effects = [] as AppCommandResult["effects"];
      if (!activeSnapshot) {
        effects.push({ type: "setSnapshot", snapshot: sessionStore.ensureSession() });
      }

      effects.push(
        { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
        { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
        { type: "dispatch", action: { type: "overlay/memory/open", selectedIndex: 0 } },
        { type: "setSessions", sessions: sessionStore.listSessions() },
        { type: "dispatch", action: { type: "status/set", value: "Memory opened." } },
      );

      return { effects };
    }
    case "emotion": {
      const snapshot = activeSnapshot ?? sessionStore.ensureSession();
      const effects = [] as AppCommandResult["effects"];
      if (!activeSnapshot) {
        effects.push({ type: "setSnapshot", snapshot });
      }

      effects.push(
        { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
        { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
        { type: "dispatch", action: { type: "overlay/close" } },
      );

      const action = command.target?.trim().toLowerCase();
      if (!action) {
        effects.push({ type: "dispatch", action: { type: "status/set", value: formatEmotionSummary(snapshot, false) } });
        return { effects };
      }

      if (action === "debug") {
        effects.push({ type: "dispatch", action: { type: "status/set", value: formatEmotionSummary(snapshot, true) } });
        return { effects };
      }

      if (action === "reset") {
        effects.push(
          { type: "setSnapshot", snapshot: sessionStore.resetEmotion(snapshot.session.id) },
          { type: "dispatch", action: { type: "status/set", value: "Emotion state reset." } },
        );
        return { effects };
      }

      effects.push({ type: "dispatch", action: { type: "status/set", value: "Usage: /emotion, /emotion debug, /emotion reset" } });
      return { effects };
    }
    case "profile": {
      if (!command.target) {
        return {
          effects: [
            { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "overlay/close" } },
            { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "status/set", value: formatAssistantProfile(assistantProfileRepository) } },
          ],
        };
      }

      const trimmedTarget = command.target.trim();
      const action = /^\S+/.exec(trimmedTarget)?.[0]?.toLowerCase();

      if (action === "clear") {
        const subcommand = /^clear\s+(\S+)/i.exec(trimmedTarget)?.[1]?.toLowerCase();

        if (!subcommand) {
          return {
            effects: [
              { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
              { type: "dispatch", action: { type: "overlay/close" } },
              { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: true } },
              { type: "dispatch", action: { type: "status/set", value: "Profile clear staged. Run /profile clear confirm to remove the assistant profile, or /profile clear cancel to abort." } },
            ],
          };
        }

        if (subcommand === "cancel") {
          return {
            effects: [
              { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
              { type: "dispatch", action: { type: "overlay/close" } },
              { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
              { type: "dispatch", action: { type: "status/set", value: "Profile clear canceled." } },
            ],
          };
        }

        if (subcommand !== "confirm") {
          return {
            effects: [
              { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
              { type: "dispatch", action: { type: "overlay/close" } },
              { type: "dispatch", action: { type: "status/set", value: `Usage: ${profileUsage}` } },
            ],
          };
        }

        if (!pendingProfileClearConfirmation) {
          return {
            effects: [
              { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
              { type: "dispatch", action: { type: "overlay/close" } },
              { type: "dispatch", action: { type: "status/set", value: "Run /profile clear first, then /profile clear confirm." } },
            ],
          };
        }

        assistantProfileRepository.clear();
        return {
          effects: [
            { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "overlay/close" } },
            { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "status/set", value: "Assistant profile cleared." } },
          ],
        };
      }

      if (action !== "set") {
        return {
          effects: [
            { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "overlay/close" } },
            { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "status/set", value: `Usage: ${profileUsage}` } },
          ],
        };
      }

      const setMatch = /^set\s+(\S+)\s+([\s\S]+)$/i.exec(trimmedTarget);
      const field = setMatch?.[1] as AssistantProfileField | undefined;
      const value = setMatch?.[2]?.trim();
      if (!isAssistantProfileField(field) || !value) {
        return {
          effects: [
            { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "overlay/close" } },
            { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "status/set", value: `Usage: ${profileSetUsage}` } },
          ],
        };
      }

      const nextProfile = assistantProfileRepository.setField(field, value);
      return {
        effects: [
          { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "overlay/close" } },
          { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "status/set", value: `Assistant profile updated: ${formatProfileField(field)} = ${formatProfileValueForStatus(field, readProfileField(nextProfile, field))}` } },
        ],
      };
    }
    case "model": {
      const options = flattenModelCatalog(listProviderCatalog());
      if (options.length === 0) {
        return {
          effects: [
            { type: "dispatch", action: { type: "status/set", value: "No models are available." } },
          ],
        };
      }

      return {
        effects: [
          { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "overlay/model/open", selectedIndex: findCurrentModelIndex(options, activeSnapshot) } },
          { type: "dispatch", action: { type: "status/set", value: "Model chooser opened. Use ↑ ↓ and Enter." } },
        ],
      };
    }
    case "reset": {
      const action = command.target?.trim().toLowerCase();

      if (!action) {
        return {
          effects: [
            { type: "dispatch", action: { type: "reset-confirmation/set", value: true } },
            { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "overlay/close" } },
            { type: "dispatch", action: { type: "status/set", value: "Reset staged. Run /reset confirm to clear all chat history, memory, and assistant profile, or /reset cancel to abort." } },
          ],
        };
      }

      if (action === "cancel") {
        return {
          effects: [
            { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
            { type: "dispatch", action: { type: "status/set", value: "Reset canceled." } },
          ],
        };
      }

      if (action !== "confirm") {
        return {
          effects: [
            { type: "dispatch", action: { type: "status/set", value: "Usage: /reset, /reset confirm, /reset cancel" } },
          ],
        };
      }

      if (!pendingResetConfirmation) {
        return {
          effects: [
            { type: "dispatch", action: { type: "status/set", value: "Run /reset first, then /reset confirm." } },
          ],
        };
      }

      const nextSnapshot = sessionStore.resetAll();
      return {
        effects: [
          { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "profile-clear-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "overlay/close" } },
          { type: "setSnapshot", snapshot: nextSnapshot },
          { type: "setSessions", sessions: sessionStore.listSessions() },
          { type: "dispatch", action: { type: "status/set", value: "All chat history, memory, and assistant profile have been reset." } },
        ],
      };
    }
    case "help": {
      return {
        effects: [
          { type: "dispatch", action: { type: "reset-confirmation/set", value: false } },
          { type: "dispatch", action: { type: "overlay/help/open" } },
          { type: "dispatch", action: { type: "status/set", value: "Help opened. Press Esc to close." } },
        ],
      };
    }
    case "exit": {
      return {
        effects: [
          { type: "requestExit" },
        ],
      };
    }
    case "unknown": {
      return {
        effects: [
          { type: "dispatch", action: { type: "status/set", value: `Unknown command: /${command.name}` } },
        ],
      };
    }
    default:
      return { effects: [] };
  }
}

export function findCurrentModelIndex(
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
  return field === "name" || field === "role" || field === "selfReference" || field === "persona";
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
    profile.persona ? `persona: ${summarizePersona(profile.persona)}` : "persona: —",
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

function formatProfileValueForStatus(field: AssistantProfileField, value: string | undefined) {
  if (!value) {
    return "—";
  }

  if (field !== "persona") {
    return value;
  }

  return summarizePersona(value);
}

function summarizePersona(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const preview = normalized.slice(0, 80);
  const suffix = preview.length < normalized.length ? "…" : "";
  return `${preview}${suffix} (${value.length} chars)`;
}
