import { useInput, type Key } from "ink";
import type { Dispatch, SetStateAction } from "react";
import type { MemoryEditState, MemoryOverlayMode } from "../app.js";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { MemoryRecord } from "../types/memory.js";
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
  memoryDeleteConfirmId: string | null;
  memoryEditState: MemoryEditState | null;
  memoryOverlayMode: MemoryOverlayMode;
  memorySnapshot: SessionSnapshot | null;
  memoryViewId: string | null;
  sessionDeleteConfirmId: string | null;
  sessionsVisible: boolean;
  sessions: SessionSummary[];
  selectedMemoryIndex: number;
  selectedMemorySessionIndex: number;
  selectedSessionIndex: number;
  sessionStore: SessionStore | null;
  setHelpVisible: Dispatch<SetStateAction<boolean>>;
  setMemoryDeleteConfirmId: Dispatch<SetStateAction<string | null>>;
  setMemoryEditState: Dispatch<SetStateAction<MemoryEditState | null>>;
  setMemoryOverlayMode: Dispatch<SetStateAction<MemoryOverlayMode>>;
  setMemorySnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setMemoryViewId: Dispatch<SetStateAction<string | null>>;
  setPendingConfirmations: Dispatch<SetStateAction<PendingConfirmation[]>>;
  setSessionDeleteConfirmId: Dispatch<SetStateAction<string | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setStatusMessage: Dispatch<SetStateAction<string | undefined>>;
  setSessionsVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedMemoryIndex: Dispatch<SetStateAction<number>>;
  setSelectedMemorySessionIndex: Dispatch<SetStateAction<number>>;
  setSelectedSessionIndex: Dispatch<SetStateAction<number>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}

export function useAppInput({
  activeConfirmation,
  activeSnapshot,
  helpVisible,
  memoryDeleteConfirmId,
  memoryEditState,
  memoryOverlayMode,
  memorySnapshot,
  memoryViewId,
  sessionDeleteConfirmId,
  sessionsVisible,
  sessions,
  selectedMemoryIndex,
  selectedMemorySessionIndex,
  selectedSessionIndex,
  sessionStore,
  setHelpVisible,
  setMemoryDeleteConfirmId,
  setMemoryEditState,
  setMemoryOverlayMode,
  setMemorySnapshot,
  setMemoryViewId,
  setPendingConfirmations,
  setSessionDeleteConfirmId,
  setSessions,
  setStatusMessage,
  setSessionsVisible,
  setSelectedMemoryIndex,
  setSelectedMemorySessionIndex,
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

    if (memoryOverlayMode !== "hidden") {
      handleMemoryInput({
        inputChar,
        key,
        activeSnapshot,
        memoryDeleteConfirmId,
        memoryEditState,
        memoryOverlayMode,
        memorySnapshot,
        memoryViewId,
        selectedMemoryIndex,
        selectedMemorySessionIndex,
        sessionStore,
        sessions,
        setMemoryDeleteConfirmId,
        setMemoryEditState,
        setMemoryOverlayMode,
        setMemorySnapshot,
        setMemoryViewId,
        setSelectedMemoryIndex,
        setSelectedMemorySessionIndex,
        setSnapshot,
        setStatusMessage,
      });
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

function handleMemoryInput({
  inputChar,
  key,
  activeSnapshot,
  memoryDeleteConfirmId,
  memoryEditState,
  memoryOverlayMode,
  memorySnapshot,
  memoryViewId,
  selectedMemoryIndex,
  selectedMemorySessionIndex,
  sessionStore,
  sessions,
  setMemoryDeleteConfirmId,
  setMemoryEditState,
  setMemoryOverlayMode,
  setMemorySnapshot,
  setMemoryViewId,
  setSelectedMemoryIndex,
  setSelectedMemorySessionIndex,
  setSnapshot,
  setStatusMessage,
}: {
  inputChar: string;
  key: Key;
  activeSnapshot: SessionSnapshot | null;
  memoryDeleteConfirmId: string | null;
  memoryEditState: MemoryEditState | null;
  memoryOverlayMode: MemoryOverlayMode;
  memorySnapshot: SessionSnapshot | null;
  memoryViewId: string | null;
  selectedMemoryIndex: number;
  selectedMemorySessionIndex: number;
  sessionStore: SessionStore | null;
  sessions: SessionSummary[];
  setMemoryDeleteConfirmId: UseAppInputOptions["setMemoryDeleteConfirmId"];
  setMemoryEditState: UseAppInputOptions["setMemoryEditState"];
  setMemoryOverlayMode: UseAppInputOptions["setMemoryOverlayMode"];
  setMemorySnapshot: UseAppInputOptions["setMemorySnapshot"];
  setMemoryViewId: UseAppInputOptions["setMemoryViewId"];
  setSelectedMemoryIndex: UseAppInputOptions["setSelectedMemoryIndex"];
  setSelectedMemorySessionIndex: UseAppInputOptions["setSelectedMemorySessionIndex"];
  setSnapshot: UseAppInputOptions["setSnapshot"];
  setStatusMessage: UseAppInputOptions["setStatusMessage"];
}) {
  if (memoryOverlayMode === "session_list") {
    handleMemorySessionListInput({
      key,
      sessions,
      selectedMemorySessionIndex,
      sessionStore,
      setMemoryDeleteConfirmId,
      setMemoryEditState,
      setMemoryOverlayMode,
      setMemorySnapshot,
      setMemoryViewId,
      setSelectedMemoryIndex,
      setSelectedMemorySessionIndex,
      setSnapshot,
      setStatusMessage,
    });
    return;
  }

  const memories = memorySnapshot?.memories ?? [];
  const selected = memories[selectedMemoryIndex];

  if (memoryEditState && selected) {
    if (key.escape) {
      setMemoryEditState(null);
      setStatusMessage("Canceled memory edit.");
      return;
    }

    if (key.tab) {
      setMemoryEditState((current) => current
        ? { ...current, activeField: current.activeField === "subject" ? "value" : "subject" }
        : current);
      return;
    }

    if (key.return && sessionStore && memorySnapshot) {
      try {
        sessionStore.updateMemory(memoryEditState.memoryId, {
          subject: memoryEditState.subject.value,
          value: memoryEditState.value.value,
        }, memorySnapshot.session.id);
        const nextSnapshot = sessionStore.loadSession(memorySnapshot.session.id);
        setSnapshot((current) => current?.session.id === nextSnapshot.session.id ? nextSnapshot : current);
        setMemorySnapshot(nextSnapshot);
        setMemoryEditState(null);
        setMemoryViewId(memoryEditState.memoryId);
        setStatusMessage("Memory updated.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`Error: ${message}`);
      }
      return;
    }

    if (applyTextEditKey(key, inputChar, setMemoryEditState)) {
      return;
    }

    return;
  }

  if (!selected || !sessionStore || !memorySnapshot) {
    if (key.escape) {
      setMemoryDeleteConfirmId(null);
      setMemoryEditState(null);
      setMemoryViewId(null);
      setMemorySnapshot(null);
      setMemoryOverlayMode("session_list");
    }
    return;
  }

  if (memoryDeleteConfirmId) {
    if (key.escape) {
      setMemoryDeleteConfirmId(null);
      return;
    }

    if (!key.return || selected.id !== memoryDeleteConfirmId) {
      return;
    }

    try {
      const deletedIndex = selectedMemoryIndex;
      sessionStore.deleteMemory(selected.id, memorySnapshot.session.id);
      const nextSnapshot = sessionStore.loadSession(memorySnapshot.session.id);
      setSnapshot((current) => current?.session.id === nextSnapshot.session.id ? nextSnapshot : current);
      setMemorySnapshot(nextSnapshot);
      setSelectedMemoryIndex(clampListIndex(deletedIndex, nextSnapshot.memories.length));
      setMemoryDeleteConfirmId(null);
      setMemoryViewId((current) => current === selected.id ? null : current);
      setMemoryEditState((current) => current?.memoryId === selected.id ? null : current);
      setStatusMessage(`Deleted memory ${selected.id}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMemoryDeleteConfirmId(null);
      setStatusMessage(`Error: ${message}`);
    }
    return;
  }

  if (key.escape) {
    setMemoryDeleteConfirmId(null);
    setMemoryEditState(null);
    setMemoryViewId(null);
    setMemorySnapshot(null);
    setMemoryOverlayMode("session_list");
    return;
  }

  if (key.upArrow) {
    setSelectedMemoryIndex((current) => Math.max(0, current - 1));
    return;
  }

  if (key.downArrow) {
    setSelectedMemoryIndex((current) => Math.min(Math.max(0, memories.length - 1), current + 1));
    return;
  }

  if (inputChar === "d" || inputChar === "D") {
    setMemoryDeleteConfirmId(selected.id);
    return;
  }

  if (inputChar === "e" || inputChar === "E") {
    setMemoryDeleteConfirmId(null);
    setMemoryEditState(createMemoryEditState(selected));
    setMemoryViewId(selected.id);
    return;
  }

  if (key.return || inputChar === "v" || inputChar === "V") {
    setMemoryViewId((current) => current === selected.id ? null : selected.id);
  }
}

function handleMemorySessionListInput({
  key,
  sessions,
  selectedMemorySessionIndex,
  sessionStore,
  setMemoryDeleteConfirmId,
  setMemoryEditState,
  setMemoryOverlayMode,
  setMemorySnapshot,
  setMemoryViewId,
  setSelectedMemoryIndex,
  setSelectedMemorySessionIndex,
  setSnapshot,
  setStatusMessage,
}: {
  key: Key;
  sessions: SessionSummary[];
  selectedMemorySessionIndex: number;
  sessionStore: SessionStore | null;
  setMemoryDeleteConfirmId: UseAppInputOptions["setMemoryDeleteConfirmId"];
  setMemoryEditState: UseAppInputOptions["setMemoryEditState"];
  setMemoryOverlayMode: UseAppInputOptions["setMemoryOverlayMode"];
  setMemorySnapshot: UseAppInputOptions["setMemorySnapshot"];
  setMemoryViewId: UseAppInputOptions["setMemoryViewId"];
  setSelectedMemoryIndex: UseAppInputOptions["setSelectedMemoryIndex"];
  setSelectedMemorySessionIndex: UseAppInputOptions["setSelectedMemorySessionIndex"];
  setSnapshot: UseAppInputOptions["setSnapshot"];
  setStatusMessage: UseAppInputOptions["setStatusMessage"];
}) {
  const selected = sessions[selectedMemorySessionIndex];

  if (!selected || !sessionStore) {
    if (key.escape) {
      setMemoryOverlayMode("hidden");
      setMemorySnapshot(null);
    }
    return;
  }

  if (key.escape) {
    setMemoryOverlayMode("hidden");
    setMemorySnapshot(null);
    return;
  }

  if (key.upArrow) {
    setSelectedMemorySessionIndex((current) => Math.max(0, current - 1));
    return;
  }

  if (key.downArrow) {
    setSelectedMemorySessionIndex((current) => Math.min(Math.max(0, sessions.length - 1), current + 1));
    return;
  }

  if (!key.return) {
    return;
  }

  try {
    const nextSnapshot = sessionStore.loadSession(selected.id);
    setMemorySnapshot(nextSnapshot);
    setSelectedMemoryIndex(0);
    setMemoryDeleteConfirmId(null);
    setMemoryEditState(null);
    setMemoryViewId(null);
    setMemoryOverlayMode("memory_list");
    setStatusMessage(`Viewing memories for ${selected.title}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatusMessage(`Error: ${message}`);
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
      let nextSelectedIndex = clampListIndex(deletedIndex, nextSessions.length);

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

function applyTextEditKey(
  key: Key,
  inputChar: string,
  setMemoryEditState: UseAppInputOptions["setMemoryEditState"],
) {
  if (key.leftArrow) {
    setMemoryEditState((current) => current ? moveActiveCursor(current, current[current.activeField].cursorIndex - 1) : current);
    return true;
  }

  if (key.rightArrow) {
    setMemoryEditState((current) => current ? moveActiveCursor(current, current[current.activeField].cursorIndex + 1) : current);
    return true;
  }

  if (key.home) {
    setMemoryEditState((current) => current ? moveActiveCursor(current, 0) : current);
    return true;
  }

  if (key.end) {
    setMemoryEditState((current) => current ? moveActiveCursor(current, Array.from(current[current.activeField].value).length) : current);
    return true;
  }

  if (key.backspace) {
    setMemoryEditState((current) => current ? deleteFromActiveField(current, true) : current);
    return true;
  }

  if (key.delete) {
    setMemoryEditState((current) => current ? deleteFromActiveField(current, false) : current);
    return true;
  }

  if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.tab || !inputChar) {
    return false;
  }

  setMemoryEditState((current) => current ? insertIntoActiveField(current, inputChar) : current);
  return true;
}

function createMemoryEditState(memory: MemoryRecord): MemoryEditState {
  return {
    memoryId: memory.id,
    activeField: "value",
    subject: {
      value: memory.subject,
      cursorIndex: Array.from(memory.subject).length,
    },
    value: {
      value: memory.value,
      cursorIndex: Array.from(memory.value).length,
    },
  };
}

function moveActiveCursor(state: MemoryEditState, nextIndex: number): MemoryEditState {
  const field = state.activeField;
  const length = Array.from(state[field].value).length;
  return {
    ...state,
    [field]: {
      ...state[field],
      cursorIndex: Math.min(Math.max(0, nextIndex), length),
    },
  };
}

function insertIntoActiveField(state: MemoryEditState, inputChar: string): MemoryEditState {
  const field = state.activeField;
  const current = state[field];
  const characters = Array.from(current.value);
  const inserted = Array.from(inputChar);
  characters.splice(Math.min(current.cursorIndex, characters.length), 0, ...inserted);
  return {
    ...state,
    [field]: {
      value: characters.join(""),
      cursorIndex: current.cursorIndex + inserted.length,
    },
  };
}

function deleteFromActiveField(state: MemoryEditState, backward: boolean): MemoryEditState {
  const field = state.activeField;
  const current = state[field];
  const characters = Array.from(current.value);
  const deleteIndex = backward ? current.cursorIndex - 1 : current.cursorIndex;

  if (deleteIndex < 0 || deleteIndex >= characters.length) {
    return state;
  }

  characters.splice(deleteIndex, 1);
  return {
    ...state,
    [field]: {
      value: characters.join(""),
      cursorIndex: backward ? deleteIndex : Math.min(deleteIndex, characters.length),
    },
  };
}

function clampListIndex(index: number, itemCount: number) {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(0, index), itemCount - 1);
}
