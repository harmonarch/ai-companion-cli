import type { SetStateAction } from "react";
import type { ToolConfirmationRequest } from "../types/tool.js";

export interface PendingConfirmation {
  request: ToolConfirmationRequest;
  resolve(value: boolean): void;
}

export interface MemoryEditState {
  memoryId: string;
  activeField: "subject" | "value";
  subject: {
    value: string;
    cursorIndex: number;
  };
  value: {
    value: string;
    cursorIndex: number;
  };
}

export type OverlayState =
  | { kind: "none" }
  | { kind: "help" }
  | {
      kind: "sessions";
      selectedIndex: number;
      deleteConfirmSessionId: string | null;
    }
  | {
      kind: "memory";
      selectedIndex: number;
      deleteConfirmMemoryId: string | null;
      viewMemoryId: string | null;
      editState: MemoryEditState | null;
    };

export interface UiState {
  input: string;
  isStreaming: boolean;
  statusMessage?: string;
  pendingResetConfirmation: boolean;
  pendingConfirmations: PendingConfirmation[];
  overlay: OverlayState;
}

export type UiAction =
  | { type: "input/set"; value: SetStateAction<string> }
  | { type: "streaming/set"; value: boolean }
  | { type: "status/set"; value: string | undefined }
  | { type: "reset-confirmation/set"; value: boolean }
  | { type: "confirmations/enqueue"; request: ToolConfirmationRequest; resolve(value: boolean): void }
  | { type: "confirmations/shift" }
  | { type: "overlay/help/open" }
  | { type: "overlay/close" }
  | { type: "overlay/sessions/open"; selectedIndex: number }
  | { type: "overlay/sessions/select"; selectedIndex: number }
  | { type: "overlay/sessions/delete-confirm"; sessionId: string | null }
  | { type: "overlay/memory/open"; selectedIndex: number }
  | { type: "overlay/memory/select"; selectedIndex: number }
  | { type: "overlay/memory/delete-confirm"; memoryId: string | null }
  | { type: "overlay/memory/view"; memoryId: string | null }
  | { type: "overlay/memory/edit"; value: SetStateAction<MemoryEditState | null> };

export const initialUiState: UiState = {
  input: "",
  isStreaming: false,
  statusMessage: undefined,
  pendingResetConfirmation: false,
  pendingConfirmations: [],
  overlay: { kind: "none" },
};

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "input/set":
      return {
        ...state,
        input: applyUpdate(state.input, action.value),
      };
    case "streaming/set":
      return {
        ...state,
        isStreaming: action.value,
      };
    case "status/set":
      return {
        ...state,
        statusMessage: action.value,
      };
    case "reset-confirmation/set":
      return {
        ...state,
        pendingResetConfirmation: action.value,
      };
    case "confirmations/enqueue":
      return {
        ...state,
        pendingConfirmations: [...state.pendingConfirmations, { request: action.request, resolve: action.resolve }],
      };
    case "confirmations/shift":
      return {
        ...state,
        pendingConfirmations: state.pendingConfirmations.slice(1),
      };
    case "overlay/help/open":
      return {
        ...state,
        overlay: { kind: "help" },
      };
    case "overlay/close":
      return {
        ...state,
        overlay: { kind: "none" },
      };
    case "overlay/sessions/open":
      return {
        ...state,
        overlay: {
          kind: "sessions",
          selectedIndex: action.selectedIndex,
          deleteConfirmSessionId: null,
        },
      };
    case "overlay/sessions/select":
      if (state.overlay.kind !== "sessions") {
        return state;
      }
      return {
        ...state,
        overlay: {
          ...state.overlay,
          selectedIndex: action.selectedIndex,
        },
      };
    case "overlay/sessions/delete-confirm":
      if (state.overlay.kind !== "sessions") {
        return state;
      }
      return {
        ...state,
        overlay: {
          ...state.overlay,
          deleteConfirmSessionId: action.sessionId,
        },
      };
    case "overlay/memory/open":
      return {
        ...state,
        overlay: {
          kind: "memory",
          selectedIndex: action.selectedIndex,
          deleteConfirmMemoryId: null,
          viewMemoryId: null,
          editState: null,
        },
      };
    case "overlay/memory/select":
      if (state.overlay.kind !== "memory") {
        return state;
      }
      return {
        ...state,
        overlay: {
          ...state.overlay,
          selectedIndex: action.selectedIndex,
        },
      };
    case "overlay/memory/delete-confirm":
      if (state.overlay.kind !== "memory") {
        return state;
      }
      return {
        ...state,
        overlay: {
          ...state.overlay,
          deleteConfirmMemoryId: action.memoryId,
        },
      };
    case "overlay/memory/view":
      if (state.overlay.kind !== "memory") {
        return state;
      }
      return {
        ...state,
        overlay: {
          ...state.overlay,
          viewMemoryId: action.memoryId,
        },
      };
    case "overlay/memory/edit":
      if (state.overlay.kind !== "memory") {
        return state;
      }
      return {
        ...state,
        overlay: {
          ...state.overlay,
          editState: applyUpdate(state.overlay.editState, action.value),
        },
      };
    default:
      return state;
  }
}

export function getActiveConfirmation(state: UiState) {
  return state.pendingConfirmations[0] ?? null;
}

export function getOverlayMode(state: UiState): "confirm" | "sessions" | "memory" | "help" | null {
  if (state.pendingConfirmations.length > 0) {
    return "confirm";
  }

  switch (state.overlay.kind) {
    case "sessions":
      return "sessions";
    case "memory":
      return "memory";
    case "help":
      return "help";
    default:
      return null;
  }
}

export function getPromptInputDisabledReason(state: UiState): "streaming" | "confirm" | "sessions" | "memory" | "help" | undefined {
  const overlayMode = getOverlayMode(state);
  return overlayMode ?? (state.isStreaming ? "streaming" : undefined);
}

export function getStatusMode(state: UiState): "confirm" | "sessions" | "memory" | "help" | "streaming" | "ready" {
  const overlayMode = getOverlayMode(state);
  return overlayMode ?? (state.isStreaming ? "streaming" : "ready");
}

export function isPanelVisible(state: UiState) {
  return state.overlay.kind !== "none";
}

export function isPromptDisabled(state: UiState) {
  return Boolean(getPromptInputDisabledReason(state));
}

export function getSessionsOverlay(state: UiState) {
  return state.overlay.kind === "sessions" ? state.overlay : null;
}

export function getMemoryOverlay(state: UiState) {
  return state.overlay.kind === "memory" ? state.overlay : null;
}

function applyUpdate<T>(current: T, update: SetStateAction<T>) {
  return typeof update === "function"
    ? (update as (value: T) => T)(current)
    : update;
}
