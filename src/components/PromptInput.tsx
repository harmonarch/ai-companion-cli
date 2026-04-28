import React, { useEffect, useState } from "react";
import { Box, Text, useInput, usePaste, useStdin, useStdout } from "ink";
import pc from "picocolors";
import { sanitizeSingleLineText } from "../utils/sanitize-text.js";

const TERMINAL_FOCUS_IN = "[I";
const TERMINAL_FOCUS_OUT = "[O";
const TERMINAL_FOCUS_EVENTS_ENABLE = "[?1004h";
const TERMINAL_FOCUS_EVENTS_DISABLE = "[?1004l";

export function PromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
  disabledReason,
}: {
  value: string;
  onChange: React.Dispatch<React.SetStateAction<string>>;
  onSubmit(value: string): void;
  disabled?: boolean;
  disabledReason?: "streaming" | "confirm" | "sessions" | "memory" | "help";
}) {
  const { stdin, isRawModeSupported } = useStdin();
  const { write } = useStdout();
  const [hasTerminalFocus, setHasTerminalFocus] = useState(true);

  useEffect(() => {
    if (!isRawModeSupported) {
      return;
    }

    write(TERMINAL_FOCUS_EVENTS_ENABLE);

    let pending = "";

    const handleData = (data: Buffer | string) => {
      const chunk = pending + data.toString();
      const lastFocusInIndex = chunk.lastIndexOf(TERMINAL_FOCUS_IN);
      const lastFocusOutIndex = chunk.lastIndexOf(TERMINAL_FOCUS_OUT);

      if (lastFocusInIndex > lastFocusOutIndex) {
        setHasTerminalFocus(true);
      } else if (lastFocusOutIndex > lastFocusInIndex) {
        setHasTerminalFocus(false);
      }

      const endsWithEsc = chunk.endsWith("");
      const endsWithEscBracket = chunk.endsWith("[");
      pending = endsWithEscBracket ? "[" : endsWithEsc ? "" : "";
    };

    stdin.on("data", handleData);

    return () => {
      stdin.off("data", handleData);
      write(TERMINAL_FOCUS_EVENTS_DISABLE);
    };
  }, [isRawModeSupported, stdin, write]);

  useInput((input, key) => {
    if (disabled) {
      return;
    }

    if (input === "[I" || input === "[O") {
      return;
    }

    if (key.return) {
      const next = value.trim();
      if (next) {
        onSubmit(next);
      }
      return;
    }

    if (key.backspace || key.delete) {
      onChange((current) => Array.from(current).slice(0, -1).join(""));
      return;
    }

    if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.tab) {
      return;
    }

    if (input) {
      onChange((current) => current + input);
    }
  }, { isActive: !disabled });

  usePaste((text) => {
    if (disabled) {
      return;
    }

    if (text) {
      onChange((current) => current + text);
    }
  }, { isActive: !disabled });

  const isFocused = !disabled && hasTerminalFocus;
  const placeholder = getPlaceholder(disabledReason);
  const safeValue = sanitizeSingleLineText(value, 500);
  const hasValue = safeValue.length > 0;
  const caret = isFocused ? pc.bgWhite(" ") : "";

  return (
    <Box>
      <Text>
        {pc.white("❯ ")}
        {hasValue ? safeValue : isFocused ? caret : pc.gray(placeholder)}
        {hasValue && isFocused ? caret : ""}
      </Text>
    </Box>
  );
}

function getPlaceholder(disabledReason?: "streaming" | "confirm" | "sessions" | "memory" | "help") {
  switch (disabledReason) {
    case "streaming":
      return "Assistant is responding...";
    case "confirm":
      return "Approve or deny the tool request above";
    case "sessions":
      return "Select a session above";
    case "memory":
      return "Memory is open. Press Esc to close";
    case "help":
      return "Help is open. Press Esc to close";
    default:
      return "Type a message or /help";
  }
}
