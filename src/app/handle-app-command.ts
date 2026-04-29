import type { Dispatch, SetStateAction } from "react";
import type { MemoryEditState, MemoryOverlayMode } from "../app.js";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { SlashCommand } from "../controller/slash-commands.js";
import type { SessionSummary } from "../types/session.js";

interface HandleAppCommandOptions {
  activeSnapshot: SessionSnapshot | null;
  command: SlashCommand;
  pendingResetConfirmation: boolean;
  sessionStore: SessionStore;
  onExitRequested(): void;
  setHelpVisible: Dispatch<SetStateAction<boolean>>;
  setMemoryDeleteConfirmId: Dispatch<SetStateAction<string | null>>;
  setMemoryEditState: Dispatch<SetStateAction<MemoryEditState | null>>;
  setMemoryOverlayMode: Dispatch<SetStateAction<MemoryOverlayMode>>;
  setMemorySnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setMemoryViewId: Dispatch<SetStateAction<string | null>>;
  setPendingResetConfirmation: Dispatch<SetStateAction<boolean>>;
  setSelectedMemoryIndex: Dispatch<SetStateAction<number>>;
  setSelectedMemorySessionIndex: Dispatch<SetStateAction<number>>;
  setSessionDeleteConfirmId: Dispatch<SetStateAction<string | null>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSessionsVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedSessionIndex: Dispatch<SetStateAction<number>>;
  setStatusMessage: Dispatch<SetStateAction<string | undefined>>;
}

export async function handleAppCommand({
  activeSnapshot,
  command,
  pendingResetConfirmation,
  sessionStore,
  onExitRequested,
  setHelpVisible,
  setMemoryDeleteConfirmId,
  setMemoryEditState,
  setMemoryOverlayMode,
  setMemorySnapshot,
  setMemoryViewId,
  setPendingResetConfirmation,
  setSelectedMemoryIndex,
  setSelectedMemorySessionIndex,
  setSessionDeleteConfirmId,
  setSnapshot,
  setSessions,
  setSessionsVisible,
  setSelectedSessionIndex,
  setStatusMessage,
}: HandleAppCommandOptions) {
  switch (command.type) {
    case "new": {
      const nextSnapshot = sessionStore.createSession();
      setPendingResetConfirmation(false);
      setHelpVisible(false);
      setSessionsVisible(false);
      setMemoryDeleteConfirmId(null);
      setMemoryEditState(null);
      setMemorySnapshot(null);
      setMemoryViewId(null);
      setMemoryOverlayMode("hidden");
      setSessionDeleteConfirmId(null);
      setSnapshot(nextSnapshot);
      setSessions(sessionStore.listSessions());
      setStatusMessage("Created a new session.");
      return;
    }
    case "sessions": {
      setPendingResetConfirmation(false);
      setHelpVisible(false);
      setMemoryDeleteConfirmId(null);
      setMemoryEditState(null);
      setMemorySnapshot(null);
      setMemoryViewId(null);
      setMemoryOverlayMode("hidden");
      setSessionDeleteConfirmId(null);
      setSessions(sessionStore.listSessions());
      setSelectedSessionIndex(0);
      setSessionsVisible(true);
      return;
    }
    case "switch": {
      if (!command.target) {
        setPendingResetConfirmation(false);
        setHelpVisible(false);
        setMemoryDeleteConfirmId(null);
        setMemoryEditState(null);
        setMemorySnapshot(null);
        setMemoryViewId(null);
        setMemoryOverlayMode("hidden");
        setSessionDeleteConfirmId(null);
        setSessions(sessionStore.listSessions());
        setSelectedSessionIndex(0);
        setSessionsVisible(true);
        return;
      }

      const targetInput = command.target;
      const currentSessions = sessionStore.listSessions();
      const byIndex = Number(targetInput);
      const target = Number.isInteger(byIndex) && byIndex > 0
        ? currentSessions[byIndex - 1]
        : currentSessions.find((session) => session.id.startsWith(targetInput));

      if (!target) {
        setStatusMessage(`Session not found: ${targetInput}`);
        return;
      }

      try {
        setPendingResetConfirmation(false);
        setHelpVisible(false);
        setSessionsVisible(false);
        setMemoryDeleteConfirmId(null);
        setMemoryEditState(null);
        setMemorySnapshot(null);
        setMemoryViewId(null);
        setMemoryOverlayMode("hidden");
        setSessionDeleteConfirmId(null);
        setSnapshot(sessionStore.loadSession(target.id));
        setStatusMessage(`Switched to ${target.title}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`Error: ${message}`);
      }
      return;
    }
    case "memory": {
      if (command.target) {
        const normalizedTarget = command.target.trim().toLowerCase();
        if (normalizedTarget === "delete" || normalizedTarget.startsWith("delete ")) {
          setStatusMessage("Use /memory, select a record, then press d to delete.");
          return;
        }
      }

      const nextSessions = sessionStore.listSessions();
      const currentSessionId = activeSnapshot?.session.id ?? nextSessions[0]?.id;
      const selectedIndex = findSessionIndex(nextSessions, currentSessionId);
      const initialMemorySnapshot = currentSessionId ? sessionStore.loadSession(currentSessionId) : null;
      setPendingResetConfirmation(false);
      setHelpVisible(false);
      setSessionsVisible(false);
      setSessionDeleteConfirmId(null);
      setMemoryDeleteConfirmId(null);
      setMemoryEditState(null);
      setMemorySnapshot(initialMemorySnapshot);
      setMemoryViewId(null);
      setSessions(nextSessions);
      setSelectedMemoryIndex(0);
      setSelectedMemorySessionIndex(selectedIndex);
      setMemoryOverlayMode("session_list");
      setStatusMessage("Memory opened. Select a session to view its memories.");
      return;
    }
    case "reset": {
      const action = command.target?.trim().toLowerCase();

      if (!action) {
        setPendingResetConfirmation(true);
        setHelpVisible(false);
        setSessionsVisible(false);
        setSessionDeleteConfirmId(null);
        setMemoryDeleteConfirmId(null);
        setMemoryEditState(null);
        setMemorySnapshot(null);
        setMemoryViewId(null);
        setMemoryOverlayMode("hidden");
        setStatusMessage("Reset staged. Run /reset confirm to clear all chat history and memory, or /reset cancel to abort.");
        return;
      }

      if (action === "cancel") {
        setPendingResetConfirmation(false);
        setStatusMessage("Reset canceled.");
        return;
      }

      if (action !== "confirm") {
        setStatusMessage("Usage: /reset, /reset confirm, /reset cancel");
        return;
      }

      if (!pendingResetConfirmation) {
        setStatusMessage("Run /reset first, then /reset confirm.");
        return;
      }

      setPendingResetConfirmation(false);
      const nextSnapshot = sessionStore.resetAll();
      setHelpVisible(false);
      setSessionsVisible(false);
      setSessionDeleteConfirmId(null);
      setMemoryDeleteConfirmId(null);
      setMemoryEditState(null);
      setMemorySnapshot(null);
      setMemoryViewId(null);
      setMemoryOverlayMode("hidden");
      setSelectedSessionIndex(0);
      setSelectedMemorySessionIndex(0);
      setSelectedMemoryIndex(0);
      setSnapshot(nextSnapshot);
      setSessions(sessionStore.listSessions());
      setStatusMessage("All chat history and memory have been reset.");
      return;
    }
    case "help": {
      setPendingResetConfirmation(false);
      setMemoryDeleteConfirmId(null);
      setMemoryEditState(null);
      setMemorySnapshot(null);
      setMemoryViewId(null);
      setMemoryOverlayMode("hidden");
      setSessionDeleteConfirmId(null);
      setSessionsVisible(false);
      setHelpVisible(true);
      setStatusMessage("Help opened. Press Esc to close.");
      return;
    }
    case "exit": {
      onExitRequested();
      return;
    }
    case "unknown": {
      setStatusMessage(`Unknown command: /${command.name}`);
      return;
    }
    default:
      return;
  }
}

function findSessionIndex(sessions: SessionSummary[], sessionId: string | undefined) {
  if (!sessionId) {
    return 0;
  }

  const index = sessions.findIndex((session) => session.id === sessionId);
  return index === -1 ? 0 : index;
}
