import React, { useCallback, useEffect, useReducer, useState } from "react";
import { Box, Text, useApp } from "ink";
import pc from "picocolors";
import { createAppServices } from "#src/app/create-app-services.js";
import { resolveInitialSession } from "#src/app/resolve-initial-session.js";
import { formatSetupStatus } from "#src/app/setup-flow.js";
import {
  getActiveConfirmation,
  getMemoryOverlay,
  getModelOverlay,
  getPromptInputDisabledReason,
  getSessionsOverlay,
  getStatusMode,
  initialUiState,
  isPanelVisible,
  isPromptDisabled,
  uiReducer,
} from "#src/app/ui-state.js";
import { applyModelSelection } from "#src/app/handle-app-command.js";
import { useAppInput } from "#src/app/use-app-input.js";
import { useSubmitHandler } from "#src/app/use-submit-handler.js";
import { ChatList } from "#src/components/ChatList.js";
import { HelpList } from "#src/components/HelpList.js";
import { HorizontalDivider } from "#src/components/HorizontalDivider.js";
import { MemoryList } from "#src/components/MemoryList.js";
import { ModelList } from "#src/components/ModelList.js";
import { PromptInput } from "#src/components/PromptInput.js";
import { SessionList } from "#src/components/SessionList.js";
import { StatusBar } from "#src/components/StatusBar.js";
import { parseSlashCommand } from "#src/controller/slash-commands.js";
import type { ChatController } from "#src/controller/chat-controller.js";
import type { SessionSnapshot, SessionStore } from "#src/controller/session-store.js";
import type { RuntimeConfigService } from "#src/infra/config/runtime-config-service.js";
import type { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import { listProviderCatalog } from "#src/providers/registry.js";
import type { SessionSummary } from "#src/types/session.js";
import { sanitizeSingleLineText } from "#src/utils/sanitize-text.js";

interface AppServices {
  sessionStore: SessionStore | null;
  controller: ChatController | null;
  assistantProfileRepository: AssistantProfileRepository | null;
  runtimeConfig: RuntimeConfigService | null;
  error: string | null;
}

interface PromptHistoryState {
  draft: string;
  index: number | null;
  sessionId: string | null;
  sessionMessages: Record<string, string[]>;
}

const initialPromptHistoryState: PromptHistoryState = {
  draft: "",
  index: null,
  sessionId: null,
  sessionMessages: {},
};

export function App({
  initialSessionId,
  onExitRequested,
}: {
  initialSessionId?: string;
  onExitRequested?: () => void;
}) {
  const { exit } = useApp();
  const [services, setServices] = useState<AppServices>({
    sessionStore: null,
    controller: null,
    assistantProfileRepository: null,
    runtimeConfig: null,
    error: null,
  });
  const [uiState, dispatch] = useReducer(uiReducer, initialUiState);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [promptHistory, setPromptHistory] = useState<PromptHistoryState>(initialPromptHistoryState);
  const sessionStore = services.sessionStore;
  const runtimeConfig = services.runtimeConfig;
  const modelCatalog = listProviderCatalog();

  useEffect(() => {
    try {
      const nextServices = createAppServices();
      setServices({
        sessionStore: nextServices.sessionStore,
        controller: nextServices.controller,
        assistantProfileRepository: nextServices.assistantProfileRepository,
        runtimeConfig: nextServices.runtimeConfig,
        error: null,
      });

      return () => {
        nextServices.close();
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setServices({
        sessionStore: null,
        controller: null,
        assistantProfileRepository: null,
        runtimeConfig: null,
        error: `Startup error: ${message}`,
      });
      return;
    }
  }, []);

  useEffect(() => {
    if (!sessionStore || !runtimeConfig) {
      return;
    }

    const resolution = resolveInitialSession(sessionStore, initialSessionId);

    if (resolution.snapshot) {
      setSnapshot(resolution.snapshot);
    }

    if (resolution.sessions) {
      setSessions(resolution.sessions);
    }

    const setup = runtimeConfig.getSetupState();
    const providerId = resolution.snapshot?.session.provider ?? runtimeConfig.getConfig().defaultProvider;
    const model = resolution.snapshot?.session.model ?? runtimeConfig.getConfig().defaultModel;

    if (setup.setupReason === "missing_api_key") {
      dispatch({ type: "setup/input/await-api-key", providerId, model });
    } else {
      dispatch({ type: "setup/input/clear" });
    }

    dispatch({
      type: "status/set",
      value: resolution.statusMessage ?? formatSetupStatus(setup, { providerId, model }),
    });
  }, [initialSessionId, runtimeConfig, sessionStore]);

  const activeConfirmation = getActiveConfirmation(uiState);
  const memoryOverlay = getMemoryOverlay(uiState);
  const modelOverlay = getModelOverlay(uiState);
  const sessionsOverlay = getSessionsOverlay(uiState);
  const activeSessionId = snapshot?.session.id ?? null;
  const promptHistoryEntries = activeSessionId
    ? (promptHistory.sessionMessages[activeSessionId] ?? [])
    : [];

  useEffect(() => {
    if (!memoryOverlay || !snapshot) {
      return;
    }

    const memoryIds = new Set(snapshot.memories.map((memory) => memory.id));
    const maxIndex = Math.max(0, snapshot.memories.length - 1);

    if (memoryOverlay.selectedIndex > maxIndex) {
      dispatch({ type: "overlay/memory/select", selectedIndex: maxIndex });
    }

    if (memoryOverlay.deleteConfirmMemoryId && !memoryIds.has(memoryOverlay.deleteConfirmMemoryId)) {
      dispatch({ type: "overlay/memory/delete-confirm", memoryId: null });
    }

    if (memoryOverlay.viewMemoryId && !memoryIds.has(memoryOverlay.viewMemoryId)) {
      dispatch({ type: "overlay/memory/view", memoryId: null });
    }

    if (memoryOverlay.editState && !memoryIds.has(memoryOverlay.editState.memoryId)) {
      dispatch({ type: "overlay/memory/edit", value: null });
    }
  }, [memoryOverlay, snapshot]);

  const handleModelSelected = useCallback((option: { providerId: string; model: string }) => {
    if (!runtimeConfig || !sessionStore) {
      return;
    }

    try {
      applyModelSelection({
        activeSnapshot: snapshot,
        dispatch,
        option,
        runtimeConfig,
        sessionStore,
        setSnapshot,
        setSessions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "status/set", value: `Error: ${message}` });
    }
  }, [runtimeConfig, sessionStore, snapshot]);

  useAppInput({
    activeConfirmation,
    activeSnapshot: snapshot,
    dispatch,
    modelCatalog,
    onModelSelected: handleModelSelected,
    sessionStore,
    sessions,
    setSessions,
    setSnapshot,
    uiState,
  });

  const handleSubmit = useSubmitHandler({
    activeSnapshot: snapshot,
    assistantProfileRepository: services.assistantProfileRepository,
    controller: services.controller,
    dispatch,
    onExitRequested: onExitRequested ?? exit,
    pendingProfileClearConfirmation: uiState.pendingProfileClearConfirmation,
    pendingResetConfirmation: uiState.pendingResetConfirmation,
    runtimeConfig,
    sessionStore,
    setSessions,
    setSnapshot,
    uiState,
  });

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    setPromptHistory((current) => {
      if (current.sessionId === activeSessionId && current.index === null) {
        return current;
      }

      return {
        ...current,
        draft: "",
        index: null,
        sessionId: activeSessionId,
      };
    });
  }, [activeSessionId]);

  const handleHistoryUp = () => {
    if (!activeSessionId || promptHistoryEntries.length === 0) {
      return;
    }

    setPromptHistory((current) => {
      const sessionMessages = current.sessionMessages;
      const baseState = current.sessionId === activeSessionId
        ? current
        : { ...initialPromptHistoryState, sessionId: activeSessionId, sessionMessages };
      const nextIndex = baseState.index === null
        ? promptHistoryEntries.length - 1
        : Math.max(0, baseState.index - 1);

      dispatch({ type: "input/set", value: promptHistoryEntries[nextIndex] ?? "" });

      return {
        draft: baseState.index === null ? uiState.input : baseState.draft,
        index: nextIndex,
        sessionId: activeSessionId,
        sessionMessages,
      };
    });
  };

  const handleHistoryDown = () => {
    if (!activeSessionId) {
      return;
    }

    setPromptHistory((current) => {
      if (current.sessionId !== activeSessionId || current.index === null) {
        return current.sessionId === activeSessionId
          ? current
          : { ...current, draft: "", index: null, sessionId: activeSessionId };
      }

      if (current.index >= promptHistoryEntries.length - 1) {
        dispatch({ type: "input/set", value: current.draft });
        return {
          ...current,
          draft: "",
          index: null,
          sessionId: activeSessionId,
        };
      }

      const nextIndex = current.index + 1;
      dispatch({ type: "input/set", value: promptHistoryEntries[nextIndex] ?? "" });
      return {
        ...current,
        index: nextIndex,
      };
    });
  };

  const handlePromptSubmit = (next: string) => {
    const command = parseSlashCommand(next);
    const setupRequired = runtimeConfig?.getSetupState().setupRequired ?? false;
    const shouldStoreInHistory = !command && uiState.setupInput.mode !== "awaiting-api-key" && !setupRequired;

    setPromptHistory((current) => {
      const nextSessionId = activeSessionId ?? current.sessionId;
      if (!nextSessionId) {
        return current;
      }

      const sessionMessages = shouldStoreInHistory
        ? {
            ...current.sessionMessages,
            [nextSessionId]: [...(current.sessionMessages[nextSessionId] ?? []), next],
          }
        : current.sessionMessages;

      return {
        draft: "",
        index: null,
        sessionId: nextSessionId,
        sessionMessages,
      };
    });

    void handleSubmit(next);
  };

  if (services.error) {
    return <Text>{sanitizeSingleLineText(services.error, 240)}</Text>;
  }

  if (!services.controller || !services.assistantProfileRepository || !runtimeConfig || !sessionStore) {
    return <Text>{uiState.statusMessage ? sanitizeSingleLineText(uiState.statusMessage, 240) : "Loading..."}</Text>;
  }

  if (!snapshot) {
    return <Text>{uiState.statusMessage ? sanitizeSingleLineText(uiState.statusMessage, 240) : "Loading..."}</Text>;
  }

  const activeSnapshot = snapshot;
  const mode = getStatusMode(uiState);
  const inputDisabledReason = getPromptInputDisabledReason(uiState);

  return (
    <Box flexDirection="column">
      <Box marginTop={1} flexDirection="column">
        {activeConfirmation ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text>{pc.yellow("confirm")} {pc.white(sanitizeSingleLineText(activeConfirmation.request.toolName, 120))}</Text>
            <Text>{pc.gray(sanitizeSingleLineText(activeConfirmation.request.summary, 240))}</Text>
            <Text>{pc.gray("press y to approve · n or esc to deny")}</Text>
            {uiState.pendingConfirmations.length > 1 ? (
              <Text>{pc.gray(`${uiState.pendingConfirmations.length - 1} more queued`)}</Text>
            ) : null}
          </Box>
        ) : null}
        {uiState.overlay.kind === "help" ? (
          <Box marginBottom={1}>
            <HelpList />
          </Box>
        ) : null}
        {modelOverlay ? (
          <Box marginBottom={1}>
            <ModelList
              options={modelCatalog.flatMap((entry) => entry.models.map((model) => ({
                providerId: entry.providerId,
                model,
              })))}
              selectedIndex={modelOverlay.selectedIndex}
              currentProvider={activeSnapshot.session.provider}
              currentModel={activeSnapshot.session.model}
            />
          </Box>
        ) : null}
        {memoryOverlay ? (
          <Box marginBottom={1}>
            <MemoryList
              memoryDetails={activeSnapshot.memoryDetails}
              selectedIndex={memoryOverlay.selectedIndex}
              deleteConfirmMemoryId={memoryOverlay.deleteConfirmMemoryId}
              viewMemoryId={memoryOverlay.viewMemoryId}
              editState={memoryOverlay.editState}
            />
          </Box>
        ) : null}
        {sessionsOverlay ? (
          <Box marginBottom={1}>
            <SessionList
              sessions={sessions}
              selectedIndex={sessionsOverlay.selectedIndex}
              deleteConfirmSessionId={sessionsOverlay.deleteConfirmSessionId}
            />
          </Box>
        ) : null}
        {isPanelVisible(uiState) ? null : (
          <ChatList messages={activeSnapshot.messages} toolExecutions={activeSnapshot.toolExecutions} />
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <HorizontalDivider />
        <PromptInput
          value={uiState.input}
          onChange={(value) => {
            dispatch({ type: "input/set", value });
          }}
          onSubmit={handlePromptSubmit}
          onHistoryUp={handleHistoryUp}
          onHistoryDown={handleHistoryDown}
          disabled={isPromptDisabled(uiState)}
          disabledReason={inputDisabledReason}
        />
        <HorizontalDivider />
      </Box>
      <StatusBar
        session={activeSnapshot.session}
        mode={mode}
        emotion={activeSnapshot.emotion.primary}
        statusMessage={uiState.statusMessage}
      />
    </Box>
  );
}
