import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import pc from "picocolors";
import { ChatList } from "./components/ChatList.js";
import { PromptInput } from "./components/PromptInput.js";
import { SessionList } from "./components/SessionList.js";
import { StatusBar } from "./components/StatusBar.js";
import { ChatController } from "./controller/chat-controller.js";
import { SessionStore, type SessionSnapshot } from "./controller/session-store.js";
import { parseSlashCommand } from "./controller/slash-commands.js";
import { loadConfig } from "./infra/config/load-config.js";
import { MessageRepository } from "./infra/repositories/message-repository.js";
import { RunRepository } from "./infra/repositories/run-repository.js";
import { SessionRepository } from "./infra/repositories/session-repository.js";
import { ToolExecutionRepository } from "./infra/repositories/tool-execution-repository.js";
import { openDatabase } from "./infra/storage/db.js";
import { runMigrations } from "./infra/storage/migrate.js";
import { deepseekProvider } from "./providers/deepseek-provider.js";
import type { SessionSummary } from "./types/session.js";
import type { ToolConfirmationRequest } from "./types/tool.js";

interface PendingConfirmation {
  request: ToolConfirmationRequest;
  resolve(value: boolean): void;
}

interface AppServices {
  sessionStore: SessionStore | null;
  controller: ChatController | null;
  error: string | null;
}

export function App({ initialSessionId }: { initialSessionId?: string }) {
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
  const [sessionsVisible, setSessionsVisible] = useState(false);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    let db: ReturnType<typeof openDatabase> | null = null;

    try {
      const config = loadConfig();
      db = openDatabase(config.databasePath);
      runMigrations(db);
      const sessionRepository = new SessionRepository(db);
      const messageRepository = new MessageRepository(db);
      const runRepository = new RunRepository(db);
      const toolExecutionRepository = new ToolExecutionRepository(db);
      const sessionStore = new SessionStore(
        sessionRepository,
        messageRepository,
        toolExecutionRepository,
        {
          provider: config.defaultProvider,
          model: config.defaultModel,
        },
      );
      const controller = new ChatController(
        config,
        deepseekProvider,
        sessionStore,
        messageRepository,
        runRepository,
        toolExecutionRepository,
      );

      setServices({
        sessionStore,
        controller,
        error: null,
      });
    } catch (error) {
      db?.close();
      const message = error instanceof Error ? error.message : String(error);
      setServices({
        sessionStore: null,
        controller: null,
        error: `Startup error: ${message}`,
      });
      return;
    }

    return () => {
      db?.close();
    };
  }, []);

  useEffect(() => {
    if (!services.sessionStore) {
      return;
    }

    try {
      const nextSnapshot = initialSessionId
        ? services.sessionStore.loadSession(initialSessionId)
        : services.sessionStore.ensureSession();

      setSnapshot(nextSnapshot);
      setSessions(services.sessionStore.listSessions());
      return;
    } catch (error) {
      if (initialSessionId) {
        try {
          const fallbackSnapshot = services.sessionStore.ensureSession();
          setSnapshot(fallbackSnapshot);
          setSessions(services.sessionStore.listSessions());
          setStatusMessage(`Could not load session ${initialSessionId}. Opened the most recent session.`);
          return;
        } catch (fallbackError) {
          const primaryMessage = error instanceof Error ? error.message : String(error);
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          setStatusMessage(`Error: ${primaryMessage}; fallback failed: ${fallbackMessage}`);
          return;
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Error: ${message}`);
    }
  }, [initialSessionId, services]);

  const activeConfirmation = pendingConfirmations[0] ?? null;

  useInput((inputChar, key) => {
    if (activeConfirmation) {
      if (inputChar.toLowerCase() === "y") {
        activeConfirmation.resolve(true);
        setPendingConfirmations((current) => current.slice(1));
        setStatusMessage("Tool execution approved.");
      } else if (inputChar.toLowerCase() === "n" || key.escape) {
        activeConfirmation.resolve(false);
        setPendingConfirmations((current) => current.slice(1));
        setStatusMessage("Tool execution denied.");
      }
      return;
    }

    if (!sessionsVisible) {
      return;
    }

    if (key.escape) {
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

    if (key.return) {
      const selected = sessions[selectedSessionIndex];
      if (selected && services.sessionStore) {
        try {
          setSnapshot(services.sessionStore.loadSession(selected.id));
          setSessionsVisible(false);
          setStatusMessage(`Switched to ${selected.title}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`Error: ${message}`);
        }
      }
    }
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
  const controller = services.controller;
  const sessionStore = services.sessionStore;
  const mode = activeConfirmation ? "confirm" : sessionsVisible ? "sessions" : isStreaming ? "streaming" : "ready";
  const inputDisabledReason = activeConfirmation ? "confirm" : sessionsVisible ? "sessions" : isStreaming ? "streaming" : undefined;

  async function handleSubmit(value: string) {
    if (submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;

    try {
      const command = parseSlashCommand(value);
      if (command) {
        await handleCommand(command);
        setInput("");
        return;
      }

      setInput("");
      setStatusMessage(undefined);
      setIsStreaming(true);

      try {
        await controller.sendMessage(activeSnapshot.session, value, {
          onUserMessage(message) {
            setSnapshot((current) => (current ? { ...current, messages: [...current.messages, message] } : current));
          },
          onAssistantMessage(message) {
            setSnapshot((current) => (current ? { ...current, messages: [...current.messages, message] } : current));
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

              return {
                ...current,
                messages: current.messages.map((message) =>
                  message.id === messageId ? { ...message, content } : message,
                ),
              };
            });
            setSessions(sessionStore.listSessions());
          },
          onToolExecution(execution) {
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
          },
          onSessionUpdated(session) {
            setSnapshot((current) => (current ? { ...current, session } : current));
            setSessions(sessionStore.listSessions());
          },
          requestConfirmation(request) {
            return new Promise((resolve) => {
              setPendingConfirmations((current) => [...current, { request, resolve }]);
            });
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
  }

  async function handleCommand(command: ReturnType<typeof parseSlashCommand>) {
    switch (command?.type) {
      case "new": {
        const nextSnapshot = sessionStore.createSession();
        setSnapshot(nextSnapshot);
        setSessions(sessionStore.listSessions());
        setStatusMessage("Created a new session.");
        return;
      }
      case "sessions": {
        setSessions(sessionStore.listSessions());
        setSelectedSessionIndex(0);
        setSessionsVisible(true);
        return;
      }
      case "switch": {
        if (!command.target) {
          setSessions(sessionStore.listSessions());
          setSelectedSessionIndex(0);
          setSessionsVisible(true);
          return;
        }

        const targetInput = command.target;
        const currentSessions = sessionStore.listSessions();
        const byIndex = Number(targetInput);
        const target = Number.isInteger(byIndex) && byIndex > 0
          ? currentSessions[byIndex - 1]
          : currentSessions.find((session) => session.id.startsWith(targetInput));

        if (!target) {
          setStatusMessage(`Session not found: ${targetInput}`);
          return;
        }

        try {
          setSnapshot(sessionStore.loadSession(target.id));
          setStatusMessage(`Switched to ${target.title}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`Error: ${message}`);
        }
        return;
      }
      case "help": {
        setStatusMessage("Commands: /new /sessions /switch <n|id> /help /exit");
        return;
      }
      case "exit": {
        exit();
        return;
      }
      case "unknown": {
        setStatusMessage(`Unknown command: /${command.name}`);
        return;
      }
      default:
        return;
    }
  }

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
        {sessionsVisible ? (
          <Box marginBottom={1}>
            <SessionList sessions={sessions} selectedIndex={selectedSessionIndex} />
          </Box>
        ) : null}
        <ChatList messages={activeSnapshot.messages} toolExecutions={activeSnapshot.toolExecutions} />
      </Box>
      <Box marginTop={1}>
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={(next) => {
            void handleSubmit(next);
          }}
          disabled={isStreaming || sessionsVisible || Boolean(activeConfirmation)}
          disabledReason={inputDisabledReason}
        />
      </Box>
    </Box>
  );
}

function sanitizeSingleLineText(value: string, maxLength: number) {
  return truncateText(filterUntrustedText(value, true), maxLength);
}

function filterUntrustedText(value: string, singleLine: boolean) {
  let result = "";

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;

    if (code === 0x1b) {
      continue;
    }

    if (code === 0x0009 || code === 0x000a || code === 0x000d || code === 0x2028 || code === 0x2029) {
      result += singleLine ? " " : code === 0x000d ? "" : "\n";
      continue;
    }

    if (
      (code >= 0x0000 && code <= 0x0008)
      || (code >= 0x000b && code <= 0x001a)
      || (code >= 0x001c && code <= 0x001f)
      || (code >= 0x007f && code <= 0x009f)
      || code === 0x061c
      || code === 0x200e
      || code === 0x200f
      || (code >= 0x202a && code <= 0x202e)
      || (code >= 0x2066 && code <= 0x2069)
      || (code >= 0x200b && code <= 0x200d)
      || code === 0x2060
      || code === 0xfeff
    ) {
      continue;
    }

    result += char;
  }

  return result;
}

function truncateText(value: string, maxLength: number) {
  const characters = Array.from(value);
  if (characters.length <= maxLength) {
    return value;
  }

  return `${characters.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}
