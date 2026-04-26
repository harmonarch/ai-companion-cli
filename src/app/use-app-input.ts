import type { Dispatch, SetStateAction } from "react";
import { useInput, type Key } from "ink";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { SessionSummary } from "../types/session.js";
import type { ToolConfirmationRequest } from "../types/tool.js";

export interface PendingConfirmation {
  request: ToolConfirmationRequest;
  resolve(value: boolean): void;
}

interface UseAppInputOptions {
  activeConfirmation: PendingConfirmation | null;
  helpVisible: boolean;
  sessionsVisible: boolean;
  sessions: SessionSummary[];
  selectedSessionIndex: number;
  sessionStore: SessionStore | null;
  setHelpVisible: Dispatch<SetStateAction<boolean>>;
  setPendingConfirmations: Dispatch<SetStateAction<PendingConfirmation[]>>;
  setStatusMessage: Dispatch<SetStateAction<string | undefined>>;
  setSessionsVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedSessionIndex: Dispatch<SetStateAction<number>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}

export function useAppInput({
  activeConfirmation,
  helpVisible,
  sessionsVisible,
  sessions,
  selectedSessionIndex,
  sessionStore,
  setHelpVisible,
  setPendingConfirmations,
  setStatusMessage,
  setSessionsVisible,
  setSelectedSessionIndex,
  setSnapshot,
}: UseAppInputOptions) {
  useInput((inputChar, key) => {
    if (activeConfirmation) {
      handleConfirmationInput(inputChar, key, activeConfirmation, setPendingConfirmations, setStatusMessage);
      return;
    }

    if (helpVisible) {
      handleHelpInput(key, setHelpVisible);
      return;
    }

    if (!sessionsVisible) {
      return;
    }

    handleSessionListInput({
      key,
      sessions,
      selectedSessionIndex,
      sessionStore,
      setSessionsVisible,
      setSelectedSessionIndex,
      setSnapshot,
      setStatusMessage,
    });
  });
}

function handleConfirmationInput(
  inputChar: string,
  key: Key,
  activeConfirmation: PendingConfirmation,
  setPendingConfirmations: UseAppInputOptions["setPendingConfirmations"],
  setStatusMessage: UseAppInputOptions["setStatusMessage"],
) {
  if (inputChar.toLowerCase() === "y") {
    activeConfirmation.resolve(true);
    setPendingConfirmations((current) => current.slice(1));
    setStatusMessage("Tool execution approved.");
    return;
  }

  if (inputChar.toLowerCase() === "n" || key.escape) {
    activeConfirmation.resolve(false);
    setPendingConfirmations((current) => current.slice(1));
    setStatusMessage("Tool execution denied.");
  }
}

function handleHelpInput(
  key: Key,
  setHelpVisible: UseAppInputOptions["setHelpVisible"],
) {
  if (key.escape) {
    setHelpVisible(false);
  }
}

function handleSessionListInput({
  key,
  sessions,
  selectedSessionIndex,
  sessionStore,
  setSessionsVisible,
  setSelectedSessionIndex,
  setSnapshot,
  setStatusMessage,
}: {
  key: Key;
  sessions: SessionSummary[];
  selectedSessionIndex: number;
  sessionStore: SessionStore | null;
  setSessionsVisible: UseAppInputOptions["setSessionsVisible"];
  setSelectedSessionIndex: UseAppInputOptions["setSelectedSessionIndex"];
  setSnapshot: UseAppInputOptions["setSnapshot"];
  setStatusMessage: UseAppInputOptions["setStatusMessage"];
}) {
  if (key.escape) {
    setSessionsVisible(false);
    return;
  }

  if (key.upArrow) {
    setSelectedSessionIndex((current) => Math.max(0, current - 1));
    return;
  }

  if (key.downArrow) {
    setSelectedSessionIndex((current) => Math.min(Math.max(0, sessions.length - 1), current + 1));
    return;
  }

  if (!key.return) {
    return;
  }

  const selected = sessions[selectedSessionIndex];
  if (!selected || !sessionStore) {
    return;
  }

  try {
    setSnapshot(sessionStore.loadSession(selected.id));
    setSessionsVisible(false);
    setStatusMessage(`Switched to ${selected.title}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatusMessage(`Error: ${message}`);
  }
}
