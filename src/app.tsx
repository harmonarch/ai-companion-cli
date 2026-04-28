import React, { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import pc from "picocolors";
import { createAppServices } from "./app/create-app-services.js";
import { resolveInitialSession } from "./app/resolve-initial-session.js";
import { useAppInput, type PendingConfirmation } from "./app/use-app-input.js";
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

  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [helpVisible, setHelpVisible] = useState(false);
  const [memoryVisible, setMemoryVisible] = useState(false);
  const [sessionsVisible, setSessionsVisible] = useState(false);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [sessionDeleteConfirmId, setSessionDeleteConfirmId] = useState<string | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);

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

    setStatusMessage(resolution.statusMessage);
  }, [initialSessionId, services]);

  const activeConfirmation = pendingConfirmations[0] ?? null;

  useAppInput({
    activeConfirmation,
    activeSnapshot: snapshot,
    helpVisible,
    memoryVisible,
    sessionDeleteConfirmId,
    sessionsVisible,
    sessions,
    selectedSessionIndex,
    sessionStore: services.sessionStore,
    setHelpVisible,
    setMemoryVisible,
    setPendingConfirmations,
    setSessionDeleteConfirmId,
    setSessions,
    setStatusMessage,
    setSessionsVisible,
    setSelectedSessionIndex,
    setSnapshot,
  });

  const handleSubmit = useSubmitHandler({
    activeSnapshot: snapshot,
    controller: services.controller,
    onExitRequested: onExitRequested ?? exit,
    sessionStore: services.sessionStore,
    setHelpVisible,
    setMemoryVisible,
    setInput,
    setIsStreaming,
    setPendingConfirmations,
    setSelectedSessionIndex,
    setSessionDeleteConfirmId,
    setSessions,
    setSessionsVisible,
    setSnapshot,
    setStatusMessage,
  });

  if (services.error) {
    return <Text>{sanitizeSingleLineText(services.error, 240)}</Text>;
  }

  if (!services.controller || !services.sessionStore) {
    return <Text>{statusMessage ? sanitizeSingleLineText(statusMessage, 240) : "Loading..."}</Text>;
  }

  if (!snapshot) {
    return <Text>{statusMessage ? sanitizeSingleLineText(statusMessage, 240) : "Loading..."}</Text>;
  }

  const activeSnapshot = snapshot;
  let overlayMode: "confirm" | "sessions" | "memory" | "help" | null = null;
  if (activeConfirmation) {
    overlayMode = "confirm";
  } else if (sessionsVisible) {
    overlayMode = "sessions";
  } else if (memoryVisible) {
    overlayMode = "memory";
  } else if (helpVisible) {
    overlayMode = "help";
  }
  const mode = overlayMode ?? (isStreaming ? "streaming" : "ready");
  const inputDisabledReason = overlayMode ?? (isStreaming ? "streaming" : undefined);

  return (
    <Box flexDirection="column">
      <StatusBar session={activeSnapshot.session} mode={mode} statusMessage={statusMessage} />
      <Box marginTop={1} flexDirection="column">
        {activeConfirmation ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text>{pc.yellow("confirm")} {pc.white(sanitizeSingleLineText(activeConfirmation.request.toolName, 120))}</Text>
            <Text>{pc.gray(sanitizeSingleLineText(activeConfirmation.request.summary, 240))}</Text>
            <Text>{pc.gray("press y to approve · n or esc to deny")}</Text>
            {pendingConfirmations.length > 1 ? (
              <Text>{pc.gray(`${pendingConfirmations.length - 1} more queued`)}</Text>
            ) : null}
          </Box>
        ) : null}
        {helpVisible ? (
          <Box marginBottom={1}>
            <HelpList />
          </Box>
        ) : null}
        {memoryVisible ? (
          <Box marginBottom={1}>
            <MemoryList memories={activeSnapshot.memories} />
          </Box>
        ) : null}
        {sessionsVisible ? (
          <Box marginBottom={1}>
            <SessionList
              sessions={sessions}
              selectedIndex={selectedSessionIndex}
              deleteConfirmSessionId={sessionDeleteConfirmId}
            />
          </Box>
        ) : null}
        <ChatList messages={activeSnapshot.messages} toolExecutions={activeSnapshot.toolExecutions} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <HorizontalDivider />
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={(next) => {
            void handleSubmit(next);
          }}
          disabled={isStreaming || helpVisible || memoryVisible || sessionsVisible || Boolean(activeConfirmation)}
          disabledReason={inputDisabledReason}
        />
        <HorizontalDivider />
      </Box>
    </Box>
  );
}
