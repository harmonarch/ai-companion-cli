import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { handleAppCommand } from "./handle-app-command.js";
import type { ChatController } from "../controller/chat-controller.js";
import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { AssistantProfileRepository } from "../infra/repositories/assistant-profile-repository.js";
import { parseSlashCommand } from "../controller/slash-commands.js";
import {
  appendTextMessageContent,
  type ChatMessage,
  type MessageContent,
} from "../types/chat.js";
import type { SessionSummary } from "../types/session.js";
import type { ToolConfirmationRequest, ToolExecutionRecord } from "../types/tool.js";
import type { UiAction } from "./ui-state.js";

interface UseSubmitHandlerOptions {
  activeSnapshot: SessionSnapshot | null;
  assistantProfileRepository: AssistantProfileRepository | null;
  controller: ChatController | null;
  dispatch: Dispatch<UiAction>;
  onExitRequested(): void;
  pendingProfileClearConfirmation: boolean;
  pendingResetConfirmation: boolean;
  sessionStore: SessionStore | null;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}

export function useSubmitHandler({
  activeSnapshot,
  assistantProfileRepository,
  controller,
  dispatch,
  onExitRequested,
  pendingProfileClearConfirmation,
  pendingResetConfirmation,
  sessionStore,
  setSessions,
  setSnapshot,
}: UseSubmitHandlerOptions) {
  const submitInFlightRef = useRef(false);

  return useCallback(async (value: string) => {
    if (!activeSnapshot || !controller || !sessionStore || !assistantProfileRepository) {
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
          assistantProfileRepository,
          command,
          dispatch,
          pendingProfileClearConfirmation,
          pendingResetConfirmation,
          sessionStore,
          onExitRequested,
          setSnapshot,
          setSessions,
        });
        dispatch({ type: "input/set", value: "" });
        return;
      }

      dispatch({ type: "input/set", value: "" });
      dispatch({ type: "status/set", value: undefined });
      dispatch({ type: "reset-confirmation/set", value: false });
      dispatch({ type: "profile-clear-confirmation/set", value: false });
      dispatch({ type: "streaming/set", value: true });

      let streamingCleared = false;
      const clearStreaming = () => {
        if (streamingCleared) {
          return;
        }
        streamingCleared = true;
        dispatch({ type: "streaming/set", value: false });
      };

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
                  message.id === messageId
                    ? { ...message, content: appendTextMessageContent(message.content, chunk) }
                    : message,
                ),
              };
            });
          },
          onAssistantReady() {
            clearStreaming();
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
            return requestToolConfirmation(dispatch, request);
          },
        });
      } finally {
        clearStreaming();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "status/set", value: `Error: ${message}` });
    } finally {
      submitInFlightRef.current = false;
    }
  }, [
    activeSnapshot,
    assistantProfileRepository,
    controller,
    dispatch,
    onExitRequested,
    pendingProfileClearConfirmation,
    pendingResetConfirmation,
    sessionStore,
    setSessions,
    setSnapshot,
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
  dispatch: Dispatch<UiAction>,
  request: ToolConfirmationRequest,
) {
  return new Promise<boolean>((resolve) => {
    dispatch({ type: "confirmations/enqueue", request, resolve });
  });
}
