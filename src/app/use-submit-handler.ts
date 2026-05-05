/**
 * 输入提交流量的总分发点。
 * 顺序是：slash command -> setup API key -> setup 阻断 -> 正常聊天消息。
 */
import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { handleAppCommand } from "#src/app/handle-app-command.js";
import { formatSetupStatus, isSetupCommandAllowed } from "#src/app/setup-flow.js";
import type { ChatController } from "#src/controller/chat-controller.js";
import type { SessionSnapshot, SessionStore } from "#src/controller/session-store.js";
import type { RuntimeConfigService } from "#src/infra/config/runtime-config-service.js";
import type { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import { parseSlashCommand } from "#src/controller/slash-commands.js";
import { getProvider } from "#src/providers/registry.js";
import {
  appendTextMessageContent,
  type ChatMessage,
} from "#src/types/chat.js";
import type { SessionSummary } from "#src/types/session.js";
import type { ToolConfirmationRequest, ToolExecutionRecord } from "#src/types/tool.js";
import type { UiAction, UiState } from "#src/app/ui-state.js";

interface UseSubmitHandlerOptions {
  activeSnapshot: SessionSnapshot | null;
  assistantProfileRepository: AssistantProfileRepository | null;
  controller: ChatController | null;
  dispatch: Dispatch<UiAction>;
  onExitRequested(): void;
  pendingProfileClearConfirmation: boolean;
  pendingResetConfirmation: boolean;
  runtimeConfig: RuntimeConfigService | null;
  sessionStore: SessionStore | null;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  uiState: UiState;
}

export function useSubmitHandler({
  activeSnapshot,
  assistantProfileRepository,
  controller,
  dispatch,
  onExitRequested,
  pendingProfileClearConfirmation,
  pendingResetConfirmation,
  runtimeConfig,
  sessionStore,
  setSessions,
  setSnapshot,
  uiState,
}: UseSubmitHandlerOptions) {
  const submitInFlightRef = useRef(false);

  /**
   * 这里集中处理所有提交入口，并用 submitInFlightRef 保证同一时刻只跑一条提交流程。
   * 对 UI 来说，输入框只关心“提交”，具体是命令、配置还是聊天，都在这里分流。
   */
  return useCallback(async (value: string) => {
    if (!activeSnapshot || !controller || !sessionStore || !assistantProfileRepository || !runtimeConfig) {
      return;
    }

    if (submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;

    try {
      const command = parseSlashCommand(value);
      if (command) {
        await submitCommand({
          activeSnapshot,
          assistantProfileRepository,
          command,
          dispatch,
          onExitRequested,
          pendingProfileClearConfirmation,
          pendingResetConfirmation,
          runtimeConfig,
          sessionStore,
          setSessions,
          setSnapshot,
        });
        return;
      }

      if (uiState.setupInput.mode === "awaiting-api-key") {
        await submitApiKey({
          dispatch,
          runtimeConfig,
          setupInput: uiState.setupInput,
          value,
        });
        return;
      }

      if (runtimeConfig.getSetupState().setupRequired) {
        dispatch({ type: "status/set", value: formatSetupStatus(runtimeConfig.getSetupState()) });
        return;
      }

      await submitMessage({
        activeSnapshot,
        controller,
        dispatch,
        sessionStore,
        setSessions,
        setSnapshot,
        value,
      });
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
    runtimeConfig,
    sessionStore,
    setSessions,
    setSnapshot,
    uiState,
  ]);
}

async function submitCommand({
  activeSnapshot,
  assistantProfileRepository,
  command,
  dispatch,
  onExitRequested,
  pendingProfileClearConfirmation,
  pendingResetConfirmation,
  runtimeConfig,
  sessionStore,
  setSessions,
  setSnapshot,
}: {
  activeSnapshot: SessionSnapshot;
  assistantProfileRepository: AssistantProfileRepository;
  command: NonNullable<ReturnType<typeof parseSlashCommand>>;
  dispatch: Dispatch<UiAction>;
  onExitRequested(): void;
  pendingProfileClearConfirmation: boolean;
  pendingResetConfirmation: boolean;
  runtimeConfig: RuntimeConfigService;
  sessionStore: SessionStore;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}) {
  if (runtimeConfig.getSetupState().setupRequired && !isSetupCommandAllowed(command)) {
    dispatch({ type: "status/set", value: formatSetupStatus(runtimeConfig.getSetupState()) });
    return;
  }

  await handleAppCommand({
    activeSnapshot,
    assistantProfileRepository,
    command,
    dispatch,
    pendingProfileClearConfirmation,
    pendingResetConfirmation,
    runtimeConfig,
    sessionStore,
    onExitRequested,
    setSnapshot,
    setSessions,
  });
  dispatch({ type: "input/set", value: "" });
}

async function submitApiKey({
  dispatch,
  runtimeConfig,
  setupInput,
  value,
}: {
  dispatch: Dispatch<UiAction>;
  runtimeConfig: RuntimeConfigService;
  setupInput: Extract<UiState["setupInput"], { mode: "awaiting-api-key" }>;
  value: string;
}) {
  const provider = getProvider(setupInput.providerId);
  if (!provider) {
    throw new Error(`Unsupported provider: ${setupInput.providerId}`);
  }

  try {
    await provider.validateApiKey(runtimeConfig.getConfig(), {
      apiKey: value,
      model: setupInput.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dispatch({ type: "input/set", value: "" });
    dispatch({
      type: "status/set",
      value: `Invalid API key for ${setupInput.providerId} / ${setupInput.model}: ${message}`,
    });
    return;
  }

  runtimeConfig.saveProviderApiKey({
    providerId: setupInput.providerId,
    apiKey: value,
  });
  dispatch({ type: "setup/input/clear" });
  dispatch({ type: "input/set", value: "" });
  dispatch({
    type: "status/set",
    value: `Saved API key for ${setupInput.providerId} / ${setupInput.model}.`,
  });
}

async function submitMessage({
  activeSnapshot,
  controller,
  dispatch,
  sessionStore,
  setSessions,
  setSnapshot,
  value,
}: {
  activeSnapshot: SessionSnapshot;
  controller: ChatController;
  dispatch: Dispatch<UiAction>;
  sessionStore: SessionStore;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  value: string;
}) {
  /**
   * 这一层负责把 controller 的持久化/流式事件翻译成 UI snapshot 更新。
   * controller 管真实业务状态，hook 只维护当前界面的即时反馈。
   */
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
