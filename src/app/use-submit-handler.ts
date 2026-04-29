import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { handleAppCommand } from "./handle-app-command.js";
import type { PendingConfirmation } from "./use-app-input.js";
import type { ChatController } from "../controller/chat-controller.js";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import { parseSlashCommand } from "../controller/slash-commands.js";
import type { ChatMessage } from "../types/chat.js";
import type { SessionSummary } from "../types/session.js";
import type { ToolConfirmationRequest, ToolExecutionRecord } from "../types/tool.js";
import type { MemoryEditState, MemoryOverlayMode } from "../app.js";

interface UseSubmitHandlerOptions {
  activeSnapshot: SessionSnapshot | null;
  controller: ChatController | null;
  onExitRequested(): void;
  pendingResetConfirmation: boolean;
  sessionStore: SessionStore | null;
  setHelpVisible: Dispatch<SetStateAction<boolean>>;
  setMemoryDeleteConfirmId: Dispatch<SetStateAction<string | null>>;
  setMemoryEditState: Dispatch<SetStateAction<MemoryEditState | null>>;
  setMemoryOverlayMode: Dispatch<SetStateAction<MemoryOverlayMode>>;
  setMemorySnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setMemoryViewId: Dispatch<SetStateAction<string | null>>;
  setInput: Dispatch<SetStateAction<string>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setPendingConfirmations: Dispatch<SetStateAction<PendingConfirmation[]>>;
  setPendingResetConfirmation: Dispatch<SetStateAction<boolean>>;
  setSelectedMemoryIndex: Dispatch<SetStateAction<number>>;
  setSelectedSessionIndex: Dispatch<SetStateAction<number>>;
  setSessionDeleteConfirmId: Dispatch<SetStateAction<string | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSessionsVisible: Dispatch<SetStateAction<boolean>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setStatusMessage: Dispatch<SetStateAction<string | undefined>>;
}

export function useSubmitHandler({
  activeSnapshot,
  controller,
  onExitRequested,
  pendingResetConfirmation,
  sessionStore,
  setHelpVisible,
  setMemoryDeleteConfirmId,
  setMemoryEditState,
  setMemoryOverlayMode,
  setMemorySnapshot,
  setMemoryViewId,
  setInput,
  setIsStreaming,
  setPendingConfirmations,
  setPendingResetConfirmation,
  setSelectedMemoryIndex,
  setSelectedSessionIndex,
  setSessionDeleteConfirmId,
  setSessions,
  setSessionsVisible,
  setSnapshot,
  setStatusMessage,
}: UseSubmitHandlerOptions) {
  const submitInFlightRef = useRef(false);

  return useCallback(async (value: string) => {
    if (!activeSnapshot || !controller || !sessionStore) {
      return;
    }

    if (submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;

    try {
      const command = parseSlashCommand(value);
      if (command) {
        await handleAppCommand({
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
          setSessionDeleteConfirmId,
          setSnapshot,
          setSessions,
          setSessionsVisible,
          setSelectedMemoryIndex,
          setSelectedSessionIndex,
          setStatusMessage,
        });
        setInput("");
        return;
      }

      setInput("");
      setStatusMessage(undefined);
      setPendingResetConfirmation(false);
      setIsStreaming(true);

      try {
        await controller.sendMessage(activeSnapshot.session, value, {
          onUserMessage(message) {
            appendMessage(setSnapshot, message);
          },
          onAssistantMessage(message) {
            appendMessage(setSnapshot, message);
          },
          onAssistantChunk(messageId, chunk) {
            setSnapshot((current) => {
              if (!current) {
                return current;
              }

              return {
                ...current,
                messages: current.messages.map((message) =>
                  message.id === messageId ? { ...message, content: message.content + chunk } : message,
                ),
              };
            });
          },
          onAssistantCompleted(messageId, content) {
            setSnapshot((current) => {
              if (!current) {
                return current;
              }

              const nextSnapshot = sessionStore.loadSession(current.session.id);
              return {
                ...nextSnapshot,
                messages: nextSnapshot.messages.map((message) =>
                  message.id === messageId ? { ...message, content } : message,
                ),
              };
            });
            setSessions(sessionStore.listSessions());
          },
          onToolExecution(execution) {
            upsertToolExecution(setSnapshot, execution);
          },
          onSessionUpdated(session) {
            setSnapshot((current) => (current ? { ...current, session } : current));
            setSessions(sessionStore.listSessions());
          },
          requestConfirmation(request) {
            return requestToolConfirmation(setPendingConfirmations, request);
          },
        });
      } finally {
        setIsStreaming(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Error: ${message}`);
    } finally {
      submitInFlightRef.current = false;
    }
  }, [
    activeSnapshot,
    controller,
    onExitRequested,
    pendingResetConfirmation,
    sessionStore,
    setHelpVisible,
    setMemoryDeleteConfirmId,
    setMemoryEditState,
    setMemoryOverlayMode,
    setMemorySnapshot,
    setMemoryViewId,
    setInput,
    setIsStreaming,
    setPendingConfirmations,
    setPendingResetConfirmation,
    setSelectedMemoryIndex,
    setSelectedSessionIndex,
    setSessionDeleteConfirmId,
    setSessions,
    setSessionsVisible,
    setSnapshot,
    setStatusMessage,
  ]);
}

function appendMessage(
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>,
  message: ChatMessage,
) {
  setSnapshot((current) => (current ? { ...current, messages: [...current.messages, message] } : current));
}

function upsertToolExecution(
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>,
  execution: ToolExecutionRecord,
) {
  setSnapshot((current) => {
    if (!current) {
      return current;
    }

    const existing = current.toolExecutions.find((item) => item.id === execution.id);
    return {
      ...current,
      toolExecutions: existing
        ? current.toolExecutions.map((item) => (item.id === execution.id ? execution : item))
        : [...current.toolExecutions, execution],
    };
  });
}

function requestToolConfirmation(
  setPendingConfirmations: Dispatch<SetStateAction<PendingConfirmation[]>>,
  request: ToolConfirmationRequest,
) {
  return new Promise<boolean>((resolve) => {
    setPendingConfirmations((current) => [...current, { request, resolve }]);
  });
}
