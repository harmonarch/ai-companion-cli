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
  activeSnapshot: SessionSnapshot | null;
  helpVisible: boolean;
  memoryVisible: boolean;
  sessionDeleteConfirmId: string | null;
  sessionsVisible: boolean;
  sessions: SessionSummary[];
  selectedSessionIndex: number;
  sessionStore: SessionStore | null;
  setHelpVisible: Dispatch<SetStateAction<boolean>>;
  setMemoryVisible: Dispatch<SetStateAction<boolean>>;
  setPendingConfirmations: Dispatch<SetStateAction<PendingConfirmation[]>>;
  setSessionDeleteConfirmId: Dispatch<SetStateAction<string | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setStatusMessage: Dispatch<SetStateAction<string | undefined>>;
  setSessionsVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedSessionIndex: Dispatch<SetStateAction<number>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}

export function useAppInput({
  activeConfirmation,
  activeSnapshot,
  helpVisible,
  memoryVisible,
  sessionDeleteConfirmId,
  sessionsVisible,
  sessions,
  selectedSessionIndex,
  sessionStore,
  setHelpVisible,
  setMemoryVisible,
  setPendingConfirmations,
  setSessionDeleteConfirmId,
  setSessions,
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

    if (memoryVisible) {
      handleMemoryInput(key, setMemoryVisible);
      return;
    }

    if (!sessionsVisible) {
      return;
    }

    handleSessionListInput({
      inputChar,
      key,
      activeSnapshot,
      sessionDeleteConfirmId,
      sessions,
      selectedSessionIndex,
      sessionStore,
      setSessionDeleteConfirmId,
      setSessions,
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

function handleMemoryInput(
  key: Key,
  setMemoryVisible: UseAppInputOptions["setMemoryVisible"],
) {
  if (key.escape) {
    setMemoryVisible(false);
  }
}

function handleSessionListInput({
  inputChar,
  key,
  activeSnapshot,
  sessionDeleteConfirmId,
  sessions,
  selectedSessionIndex,
  sessionStore,
  setSessionDeleteConfirmId,
  setSessions,
  setSessionsVisible,
  setSelectedSessionIndex,
  setSnapshot,
  setStatusMessage,
}: {
  inputChar: string;
  key: Key;
  activeSnapshot: SessionSnapshot | null;
  sessionDeleteConfirmId: string | null;
  sessions: SessionSummary[];
  selectedSessionIndex: number;
  sessionStore: SessionStore | null;
  setSessionDeleteConfirmId: UseAppInputOptions["setSessionDeleteConfirmId"];
  setSessions: UseAppInputOptions["setSessions"];
  setSessionsVisible: UseAppInputOptions["setSessionsVisible"];
  setSelectedSessionIndex: UseAppInputOptions["setSelectedSessionIndex"];
  setSnapshot: UseAppInputOptions["setSnapshot"];
  setStatusMessage: UseAppInputOptions["setStatusMessage"];
}) {
  const selected = sessions[selectedSessionIndex];
  if (!selected || !sessionStore) {
    if (key.escape) {
      setSessionDeleteConfirmId(null);
      setSessionsVisible(false);
    }
    return;
  }

  if (sessionDeleteConfirmId) {
    if (key.escape) {
      setSessionDeleteConfirmId(null);
      return;
    }

    if (!key.return || selected.id !== sessionDeleteConfirmId) {
      return;
    }

    try {
      const deletedIndex = selectedSessionIndex;
      sessionStore.deleteSession(selected.id);
      let nextSessions = sessionStore.listSessions();
      let nextSelectedIndex = clampSessionIndex(deletedIndex, nextSessions.length);

      if (activeSnapshot?.session.id === selected.id) {
        if (nextSessions.length === 0) {
          const nextSnapshot = sessionStore.createSession();
          setSnapshot(nextSnapshot);
          nextSessions = sessionStore.listSessions();
          nextSelectedIndex = 0;
        } else {
          const nextSelected = nextSessions[nextSelectedIndex];
          if (!nextSelected) {
            throw new Error("Replacement session not found.");
          }
          setSnapshot(sessionStore.loadSession(nextSelected.id));
        }
      }

      setSessions(nextSessions);
      setSelectedSessionIndex(nextSelectedIndex);
      setSessionDeleteConfirmId(null);
      setStatusMessage(`Deleted ${selected.title}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSessionDeleteConfirmId(null);
      setStatusMessage(`Error: ${message}`);
    }
    return;
  }

  if (key.escape) {
    setSessionDeleteConfirmId(null);
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

  if (inputChar === "d" || inputChar === "D") {
    setSessionDeleteConfirmId(selected.id);
    return;
  }

  if (!key.return) {
    return;
  }

  try {
    setSessionDeleteConfirmId(null);
    setSnapshot(sessionStore.loadSession(selected.id));
    setSessionsVisible(false);
    setStatusMessage(`Switched to ${selected.title}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatusMessage(`Error: ${message}`);
  }
}

function clampSessionIndex(index: number, sessionCount: number) {
  if (sessionCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(0, index), sessionCount - 1);
}
