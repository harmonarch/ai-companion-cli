import React, { useEffect, useReducer, useState } from "react";
import { Box, Text, useApp } from "ink";
import pc from "picocolors";
import { createAppServices } from "./app/create-app-services.js";
import { resolveInitialSession } from "./app/resolve-initial-session.js";
import {
  getActiveConfirmation,
  getMemoryOverlay,
  getPromptInputDisabledReason,
  getSessionsOverlay,
  getStatusMode,
  initialUiState,
  isPanelVisible,
  isPromptDisabled,
  uiReducer,
} from "./app/ui-state.js";
import { useAppInput } from "./app/use-app-input.js";
import { useSubmitHandler } from "./app/use-submit-handler.js";
import { ChatList } from "./components/ChatList.js";
import { HelpList } from "./components/HelpList.js";
import { HorizontalDivider } from "./components/HorizontalDivider.js";
import { MemoryList } from "./components/MemoryList.js";
import { PromptInput } from "./components/PromptInput.js";
import { SessionList } from "./components/SessionList.js";
import { StatusBar } from "./components/StatusBar.js";
import type { ChatController } from "./controller/chat-controller.js";
import type { SessionSnapshot, SessionStore } from "./controller/session-store.js";
import type { SessionSummary } from "./types/session.js";
import { sanitizeSingleLineText } from "./utils/sanitize-text.js";

interface AppServices {
  sessionStore: SessionStore | null;
  controller: ChatController | null;
  error: string | null;
}

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
    error: null,
  });
  const [uiState, dispatch] = useReducer(uiReducer, initialUiState);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    try {
      const nextServices = createAppServices();
      setServices({
        sessionStore: nextServices.sessionStore,
        controller: nextServices.controller,
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
        error: `Startup error: ${message}`,
      });
      return;
    }
  }, []);

  useEffect(() => {
    if (!services.sessionStore) {
      return;
    }

    const resolution = resolveInitialSession(services.sessionStore, initialSessionId);

    if (resolution.snapshot) {
      setSnapshot(resolution.snapshot);
    }

    if (resolution.sessions) {
      setSessions(resolution.sessions);
    }

    dispatch({ type: "status/set", value: resolution.statusMessage });
  }, [initialSessionId, services]);

  const activeConfirmation = getActiveConfirmation(uiState);
  const memoryOverlay = getMemoryOverlay(uiState);
  const sessionsOverlay = getSessionsOverlay(uiState);

  useAppInput({
    activeConfirmation,
    activeSnapshot: snapshot,
    dispatch,
    sessionStore: services.sessionStore,
    sessions,
    setSessions,
    setSnapshot,
    uiState,
  });

  const handleSubmit = useSubmitHandler({
    activeSnapshot: snapshot,
    controller: services.controller,
    dispatch,
    onExitRequested: onExitRequested ?? exit,
    pendingResetConfirmation: uiState.pendingResetConfirmation,
    sessionStore: services.sessionStore,
    setSessions,
    setSnapshot,
  });

  if (services.error) {
    return <Text>{sanitizeSingleLineText(services.error, 240)}</Text>;
  }

  if (!services.controller || !services.sessionStore) {
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
      <StatusBar session={activeSnapshot.session} mode={mode} statusMessage={uiState.statusMessage} />
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
        {memoryOverlay ? (
          <Box marginBottom={1}>
            <MemoryList
              memoryDetails={memoryOverlay.sessionSnapshot?.memoryDetails ?? []}
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
          onSubmit={(next) => {
            void handleSubmit(next);
          }}
          disabled={isPromptDisabled(uiState)}
          disabledReason={inputDisabledReason}
        />
        <HorizontalDivider />
      </Box>
    </Box>
  );
}
