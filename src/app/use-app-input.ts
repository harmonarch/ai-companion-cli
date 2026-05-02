import { useInput, type Key } from "ink";
import type { Dispatch, SetStateAction } from "react";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { MemoryRecord } from "../types/memory.js";
import type { SessionSummary } from "../types/session.js";
import type { UiAction, UiState, MemoryEditState, PendingConfirmation } from "./ui-state.js";

interface UseAppInputOptions {
  activeConfirmation: PendingConfirmation | null;
  activeSnapshot: SessionSnapshot | null;
  dispatch: Dispatch<UiAction>;
  sessionStore: SessionStore | null;
  sessions: SessionSummary[];
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  uiState: UiState;
}

export function useAppInput({
  activeConfirmation,
  activeSnapshot,
  dispatch,
  sessionStore,
  sessions,
  setSessions,
  setSnapshot,
  uiState,
}: UseAppInputOptions) {
  useInput((inputChar, key) => {
    if (activeConfirmation) {
      handleConfirmationInput(inputChar, key, activeConfirmation, dispatch);
      return;
    }

    if (uiState.overlay.kind === "help") {
      handleHelpInput(key, dispatch);
      return;
    }

    if (uiState.overlay.kind === "memory") {
      handleMemoryInput({
        activeSnapshot,
        dispatch,
        inputChar,
        key,
        memoryOverlay: uiState.overlay,
        sessionStore,
        setSnapshot,
      });
      return;
    }

    if (uiState.overlay.kind !== "sessions") {
      return;
    }

    handleSessionListInput({
      inputChar,
      key,
      activeSnapshot,
      dispatch,
      sessions,
      sessionsOverlay: uiState.overlay,
      sessionStore,
      setSessions,
      setSnapshot,
    });
  });
}

function handleConfirmationInput(
  inputChar: string,
  key: Key,
  activeConfirmation: PendingConfirmation,
  dispatch: Dispatch<UiAction>,
) {
  if (inputChar.toLowerCase() === "y") {
    activeConfirmation.resolve(true);
    dispatch({ type: "confirmations/shift" });
    dispatch({ type: "status/set", value: "Tool execution approved." });
    return;
  }

  if (inputChar.toLowerCase() === "n" || key.escape) {
    activeConfirmation.resolve(false);
    dispatch({ type: "confirmations/shift" });
    dispatch({ type: "status/set", value: "Tool execution denied." });
  }
}

function handleHelpInput(
  key: Key,
  dispatch: Dispatch<UiAction>,
) {
  if (key.escape) {
    dispatch({ type: "overlay/close" });
  }
}

function handleMemoryInput({
  activeSnapshot,
  dispatch,
  inputChar,
  key,
  memoryOverlay,
  sessionStore,
  setSnapshot,
}: {
  activeSnapshot: SessionSnapshot | null;
  dispatch: Dispatch<UiAction>;
  inputChar: string;
  key: Key;
  memoryOverlay: Extract<UiState["overlay"], { kind: "memory" }>;
  sessionStore: SessionStore | null;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}) {
  const memories = activeSnapshot?.memories ?? [];
  const selected = memories[memoryOverlay.selectedIndex];
  const memoryEditState = memoryOverlay.editState;
  const sessionId = activeSnapshot?.session.id;

  if (memoryEditState && selected) {
    if (key.escape) {
      dispatch({ type: "overlay/memory/edit", value: null });
      dispatch({ type: "status/set", value: "Canceled memory edit." });
      return;
    }

    if (key.tab) {
      dispatch({
        type: "overlay/memory/edit",
        value: (current) => current
          ? { ...current, activeField: current.activeField === "subject" ? "value" : "subject" }
          : current,
      });
      return;
    }

    if (key.return && sessionStore && sessionId) {
      try {
        sessionStore.updateMemory(memoryEditState.memoryId, {
          subject: memoryEditState.subject.value,
          value: memoryEditState.value.value,
        }, sessionId);
        const nextSnapshot = sessionStore.loadSession(sessionId);
        setSnapshot((current) => current?.session.id === nextSnapshot.session.id ? nextSnapshot : current);
        dispatch({ type: "overlay/memory/edit", value: null });
        dispatch({ type: "overlay/memory/view", memoryId: memoryEditState.memoryId });
        dispatch({ type: "status/set", value: "Memory updated." });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        dispatch({ type: "status/set", value: `Error: ${message}` });
      }
      return;
    }

    if (applyTextEditKey(key, inputChar, dispatch)) {
      return;
    }

    return;
  }

  if (!selected || !sessionStore || !sessionId) {
    if (key.escape) {
      dispatch({ type: "overlay/close" });
    }
    return;
  }

  if (memoryOverlay.deleteConfirmMemoryId) {
    if (key.escape) {
      dispatch({ type: "overlay/memory/delete-confirm", memoryId: null });
      return;
    }

    if (!key.return || selected.id !== memoryOverlay.deleteConfirmMemoryId) {
      return;
    }

    try {
      const deletedIndex = memoryOverlay.selectedIndex;
      sessionStore.deleteMemory(selected.id, sessionId);
      const nextSnapshot = sessionStore.loadSession(sessionId);
      setSnapshot((current) => current?.session.id === nextSnapshot.session.id ? nextSnapshot : current);
      dispatch({ type: "overlay/memory/select", selectedIndex: clampListIndex(deletedIndex, nextSnapshot.memories.length) });
      dispatch({ type: "overlay/memory/delete-confirm", memoryId: null });
      dispatch({ type: "overlay/memory/view", memoryId: memoryOverlay.viewMemoryId === selected.id ? null : memoryOverlay.viewMemoryId });
      dispatch({
        type: "overlay/memory/edit",
        value: (current) => current?.memoryId === selected.id ? null : current,
      });
      dispatch({ type: "status/set", value: `Deleted memory ${selected.id}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "overlay/memory/delete-confirm", memoryId: null });
      dispatch({ type: "status/set", value: `Error: ${message}` });
    }
    return;
  }

  if (key.escape) {
    dispatch({ type: "overlay/close" });
    return;
  }

  if (key.upArrow) {
    dispatch({ type: "overlay/memory/select", selectedIndex: Math.max(0, memoryOverlay.selectedIndex - 1) });
    return;
  }

  if (key.downArrow) {
    dispatch({
      type: "overlay/memory/select",
      selectedIndex: Math.min(Math.max(0, memories.length - 1), memoryOverlay.selectedIndex + 1),
    });
    return;
  }

  if (inputChar === "d" || inputChar === "D") {
    dispatch({ type: "overlay/memory/delete-confirm", memoryId: selected.id });
    return;
  }

  if (inputChar === "e" || inputChar === "E") {
    dispatch({ type: "overlay/memory/delete-confirm", memoryId: null });
    dispatch({ type: "overlay/memory/edit", value: createMemoryEditState(selected) });
    dispatch({ type: "overlay/memory/view", memoryId: selected.id });
    return;
  }

  if (key.return || inputChar === "v" || inputChar === "V") {
    dispatch({
      type: "overlay/memory/view",
      memoryId: memoryOverlay.viewMemoryId === selected.id ? null : selected.id,
    });
  }
}

function handleSessionListInput({
  inputChar,
  key,
  activeSnapshot,
  dispatch,
  sessions,
  sessionsOverlay,
  sessionStore,
  setSessions,
  setSnapshot,
}: {
  inputChar: string;
  key: Key;
  activeSnapshot: SessionSnapshot | null;
  dispatch: Dispatch<UiAction>;
  sessions: SessionSummary[];
  sessionsOverlay: Extract<UiState["overlay"], { kind: "sessions" }>;
  sessionStore: SessionStore | null;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}) {
  const selected = sessions[sessionsOverlay.selectedIndex];
  if (!selected) {
    if (key.escape || sessions.length === 0 || !sessionStore) {
      dispatch({ type: "overlay/close" });
      return;
    }

    dispatch({
      type: "overlay/sessions/select",
      selectedIndex: clampListIndex(sessionsOverlay.selectedIndex, sessions.length),
    });
    return;
  }

  if (!sessionStore) {
    if (key.escape) {
      dispatch({ type: "overlay/close" });
    }
    return;
  }

  if (sessionsOverlay.deleteConfirmSessionId) {
    if (key.escape) {
      dispatch({ type: "overlay/sessions/delete-confirm", sessionId: null });
      return;
    }

    if (!key.return || selected.id !== sessionsOverlay.deleteConfirmSessionId) {
      return;
    }

    try {
      const deletedIndex = sessionsOverlay.selectedIndex;
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
      dispatch({ type: "overlay/sessions/select", selectedIndex: nextSelectedIndex });
      dispatch({ type: "overlay/sessions/delete-confirm", sessionId: null });
      dispatch({ type: "status/set", value: `Deleted ${selected.title}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "overlay/sessions/delete-confirm", sessionId: null });
      dispatch({ type: "status/set", value: `Error: ${message}` });
    }
    return;
  }

  if (key.escape) {
    dispatch({ type: "overlay/close" });
    return;
  }

  if (key.upArrow) {
    dispatch({ type: "overlay/sessions/select", selectedIndex: Math.max(0, sessionsOverlay.selectedIndex - 1) });
    return;
  }

  if (key.downArrow) {
    dispatch({
      type: "overlay/sessions/select",
      selectedIndex: Math.min(Math.max(0, sessions.length - 1), sessionsOverlay.selectedIndex + 1),
    });
    return;
  }

  if (inputChar === "d" || inputChar === "D") {
    dispatch({ type: "overlay/sessions/delete-confirm", sessionId: selected.id });
    return;
  }

  if (!key.return) {
    return;
  }

  try {
    dispatch({ type: "overlay/sessions/delete-confirm", sessionId: null });
    setSnapshot(sessionStore.loadSession(selected.id));
    dispatch({ type: "overlay/close" });
    dispatch({ type: "status/set", value: `Switched to ${selected.title}.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dispatch({ type: "status/set", value: `Error: ${message}` });
  }
}

function applyTextEditKey(
  key: Key,
  inputChar: string,
  dispatch: Dispatch<UiAction>,
) {
  if (key.leftArrow) {
    dispatch({ type: "overlay/memory/edit", value: (current) => current ? moveActiveCursor(current, current[current.activeField].cursorIndex - 1) : current });
    return true;
  }

  if (key.rightArrow) {
    dispatch({ type: "overlay/memory/edit", value: (current) => current ? moveActiveCursor(current, current[current.activeField].cursorIndex + 1) : current });
    return true;
  }

  if (key.home) {
    dispatch({ type: "overlay/memory/edit", value: (current) => current ? moveActiveCursor(current, 0) : current });
    return true;
  }

  if (key.end) {
    dispatch({ type: "overlay/memory/edit", value: (current) => current ? moveActiveCursor(current, Array.from(current[current.activeField].value).length) : current });
    return true;
  }

  if (key.backspace) {
    dispatch({ type: "overlay/memory/edit", value: (current) => current ? deleteFromActiveField(current, true) : current });
    return true;
  }

  if (key.delete) {
    dispatch({ type: "overlay/memory/edit", value: (current) => current ? deleteFromActiveField(current, false) : current });
    return true;
  }

  if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.tab || !inputChar) {
    return false;
  }

  dispatch({ type: "overlay/memory/edit", value: (current) => current ? insertIntoActiveField(current, inputChar) : current });
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
