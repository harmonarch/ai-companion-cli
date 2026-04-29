import type { Dispatch, SetStateAction } from "react";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { SlashCommand } from "../controller/slash-commands.js";
import type { SessionSummary } from "../types/session.js";
import type { UiAction } from "./ui-state.js";

interface HandleAppCommandOptions {
  activeSnapshot: SessionSnapshot | null;
  command: SlashCommand;
  dispatch: Dispatch<UiAction>;
  pendingResetConfirmation: boolean;
  sessionStore: SessionStore;
  onExitRequested(): void;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
}

export async function handleAppCommand({
  activeSnapshot,
  command,
  dispatch,
  pendingResetConfirmation,
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

      const initialMemorySnapshot = activeSnapshot ?? sessionStore.ensureSession();
      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "overlay/memory/open", snapshot: initialMemorySnapshot, selectedIndex: 0 });
      setSessions(sessionStore.listSessions());
      dispatch({ type: "status/set", value: "Memory opened." });
      return;
    }
    case "reset": {
      const action = command.target?.trim().toLowerCase();

      if (!action) {
        dispatch({ type: "reset-confirmation/set", value: true });
        dispatch({ type: "overlay/close" });
        dispatch({ type: "status/set", value: "Reset staged. Run /reset confirm to clear all chat history and memory, or /reset cancel to abort." });
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
      const nextSnapshot = sessionStore.resetAll();
      dispatch({ type: "overlay/close" });
      setSnapshot(nextSnapshot);
      setSessions(sessionStore.listSessions());
      dispatch({ type: "status/set", value: "All chat history and memory have been reset." });
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
