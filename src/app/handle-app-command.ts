import type { Dispatch, SetStateAction } from "react";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { SlashCommand } from "../controller/slash-commands.js";
import type { SessionSummary } from "../types/session.js";

interface HandleAppCommandOptions {
  command: SlashCommand;
  sessionStore: SessionStore;
  onExitRequested(): void;
  setHelpVisible: Dispatch<SetStateAction<boolean>>;
  setMemoryVisible: Dispatch<SetStateAction<boolean>>;
  setSessionDeleteConfirmId: Dispatch<SetStateAction<string | null>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSessionsVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedSessionIndex: Dispatch<SetStateAction<number>>;
  setStatusMessage: Dispatch<SetStateAction<string | undefined>>;
}

export async function handleAppCommand({
  command,
  sessionStore,
  onExitRequested,
  setHelpVisible,
  setMemoryVisible,
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
      setHelpVisible(false);
      setMemoryVisible(false);
      setSessionDeleteConfirmId(null);
      setSnapshot(nextSnapshot);
      setSessions(sessionStore.listSessions());
      setStatusMessage("Created a new session.");
      return;
    }
    case "sessions": {
      setHelpVisible(false);
      setMemoryVisible(false);
      setSessionDeleteConfirmId(null);
      setSessions(sessionStore.listSessions());
      setSelectedSessionIndex(0);
      setSessionsVisible(true);
      return;
    }
    case "switch": {
      if (!command.target) {
        setHelpVisible(false);
        setMemoryVisible(false);
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
        setHelpVisible(false);
        setMemoryVisible(false);
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
      if (command.target?.toLowerCase().startsWith("delete ")) {
        const memoryId = command.target.slice("delete ".length).trim();
        if (!memoryId) {
          setStatusMessage("Memory id is required.");
          return;
        }

        try {
          sessionStore.deleteMemory(memoryId);
          setSnapshot((current) => current ? sessionStore.loadSession(current.session.id) : current);
          setMemoryVisible(false);
          setStatusMessage(`Deleted memory ${memoryId}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`Error: ${message}`);
        }
        return;
      }

      setHelpVisible(false);
      setSessionsVisible(false);
      setSessionDeleteConfirmId(null);
      setMemoryVisible(true);
      setStatusMessage("Memory opened. Press Esc to close.");
      return;
    }
    case "help": {
      setMemoryVisible(false);
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
