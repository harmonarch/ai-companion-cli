import type { Dispatch, SetStateAction } from "react";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { SlashCommand } from "../controller/slash-commands.js";
import type { SessionSummary } from "../types/session.js";

interface HandleAppCommandOptions {
  command: SlashCommand;
  sessionStore: SessionStore;
  exit(): void;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSessionsVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedSessionIndex: Dispatch<SetStateAction<number>>;
  setStatusMessage: Dispatch<SetStateAction<string | undefined>>;
}

export async function handleAppCommand({
  command,
  sessionStore,
  exit,
  setSnapshot,
  setSessions,
  setSessionsVisible,
  setSelectedSessionIndex,
  setStatusMessage,
}: HandleAppCommandOptions) {
  switch (command.type) {
    case "new": {
      const nextSnapshot = sessionStore.createSession();
      setSnapshot(nextSnapshot);
      setSessions(sessionStore.listSessions());
      setStatusMessage("Created a new session.");
      return;
    }
    case "sessions": {
      setSessions(sessionStore.listSessions());
      setSelectedSessionIndex(0);
      setSessionsVisible(true);
      return;
    }
    case "switch": {
      if (!command.target) {
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
        setSnapshot(sessionStore.loadSession(target.id));
        setStatusMessage(`Switched to ${target.title}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`Error: ${message}`);
      }
      return;
    }
    case "help": {
      setStatusMessage("Commands: /new /sessions /switch <n|id> /help /exit");
      return;
    }
    case "exit": {
      exit();
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
