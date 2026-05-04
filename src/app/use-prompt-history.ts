import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch } from "react";
import { parseSlashCommand } from "#src/controller/slash-commands.js";
import type { UiAction, UiState } from "#src/app/ui-state.js";

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

export function usePromptHistory({
  activeSessionId,
  dispatch,
  input,
  onSubmit,
  setupInput,
  setupRequired,
}: {
  activeSessionId: string | null;
  dispatch: Dispatch<UiAction>;
  input: string;
  onSubmit(value: string): void;
  setupInput: UiState["setupInput"];
  setupRequired: boolean;
}) {
  const [promptHistory, setPromptHistory] = useState<PromptHistoryState>(initialPromptHistoryState);

  const promptHistoryEntries = useMemo(
    () => (activeSessionId ? (promptHistory.sessionMessages[activeSessionId] ?? []) : []),
    [activeSessionId, promptHistory.sessionMessages],
  );

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

  const applyHistoryNavigation = useCallback((updater: (current: PromptHistoryState) => { nextState: PromptHistoryState; nextInput?: string }) => {
    let nextInput: string | undefined;
    setPromptHistory((current) => {
      const result = updater(current);
      nextInput = result.nextInput;
      return result.nextState;
    });

    if (nextInput !== undefined) {
      dispatch({ type: "input/set", value: nextInput });
    }
  }, [dispatch]);

  const handleHistoryUp = useCallback(() => {
    if (!activeSessionId || promptHistoryEntries.length === 0) {
      return;
    }

    applyHistoryNavigation((current) => {
      const sessionMessages = current.sessionMessages;
      const baseState = current.sessionId === activeSessionId
        ? current
        : { ...initialPromptHistoryState, sessionId: activeSessionId, sessionMessages };
      const nextIndex = baseState.index === null
        ? promptHistoryEntries.length - 1
        : Math.max(0, baseState.index - 1);

      return {
        nextInput: promptHistoryEntries[nextIndex] ?? "",
        nextState: {
          draft: baseState.index === null ? input : baseState.draft,
          index: nextIndex,
          sessionId: activeSessionId,
          sessionMessages,
        },
      };
    });
  }, [activeSessionId, applyHistoryNavigation, input, promptHistoryEntries]);

  const handleHistoryDown = useCallback(() => {
    if (!activeSessionId) {
      return;
    }

    applyHistoryNavigation((current) => {
      if (current.sessionId !== activeSessionId || current.index === null) {
        return {
          nextState: current.sessionId === activeSessionId
            ? current
            : { ...current, draft: "", index: null, sessionId: activeSessionId },
        };
      }

      if (current.index >= promptHistoryEntries.length - 1) {
        return {
          nextInput: current.draft,
          nextState: {
            ...current,
            draft: "",
            index: null,
            sessionId: activeSessionId,
          },
        };
      }

      const nextIndex = current.index + 1;
      return {
        nextInput: promptHistoryEntries[nextIndex] ?? "",
        nextState: {
          ...current,
          index: nextIndex,
        },
      };
    });
  }, [activeSessionId, applyHistoryNavigation, promptHistoryEntries]);

  const handlePromptSubmit = useCallback((next: string) => {
    const command = parseSlashCommand(next);
    const shouldStoreInHistory = !command && setupInput.mode !== "awaiting-api-key" && !setupRequired;

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

    onSubmit(next);
  }, [activeSessionId, onSubmit, setupInput.mode, setupRequired]);

  return {
    handleHistoryDown,
    handleHistoryUp,
    handlePromptSubmit,
  };
}
