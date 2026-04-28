import React, { useEffect, useRef, useState } from "react";
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
  const [cursorIndex, setCursorIndex] = useState(() => Array.from(value).length);
  const cursorIndexRef = useRef(cursorIndex);
  const characters = Array.from(value);
  const textLengthRef = useRef(characters.length);

  useEffect(() => {
    textLengthRef.current = characters.length;
  }, [characters.length]);

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

  useEffect(() => {
    const clampedCursorIndex = Math.min(Math.max(0, cursorIndexRef.current), characters.length);
    cursorIndexRef.current = clampedCursorIndex;
    setCursorIndex(clampedCursorIndex);
  }, [characters.length]);

  const moveCursor = (nextIndex: number, maxLength = textLengthRef.current) => {
    const clamped = Math.min(Math.max(0, nextIndex), maxLength);
    cursorIndexRef.current = clamped;
    setCursorIndex(clamped);
  };

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

    if (key.leftArrow) {
      moveCursor(cursorIndexRef.current - 1);
      return;
    }

    if (key.rightArrow) {
      moveCursor(cursorIndexRef.current + 1);
      return;
    }

    if (key.home) {
      moveCursor(0);
      return;
    }

    if (key.end) {
      moveCursor(characters.length);
      return;
    }

    if (key.backspace) {
      if (cursorIndexRef.current === 0) {
        return;
      }

      const deleteIndex = cursorIndexRef.current - 1;
      onChange((current) => {
        const currentCharacters = Array.from(current);
        if (deleteIndex < 0 || deleteIndex >= currentCharacters.length) {
          return current;
        }

        currentCharacters.splice(deleteIndex, 1);
        textLengthRef.current = currentCharacters.length;
        return currentCharacters.join("");
      });
      moveCursor(deleteIndex, Math.max(0, textLengthRef.current - 1));
      return;
    }

    if (key.delete) {
      const deleteIndex = cursorIndexRef.current;
      onChange((current) => {
        const currentCharacters = Array.from(current);
        if (deleteIndex >= currentCharacters.length) {
          return current;
        }

        currentCharacters.splice(deleteIndex, 1);
        textLengthRef.current = currentCharacters.length;
        return currentCharacters.join("");
      });
      if (deleteIndex < textLengthRef.current) {
        textLengthRef.current = Math.max(0, textLengthRef.current - 1);
      }
      return;
    }

    if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.tab) {
      return;
    }

    if (input) {
      const insertedCharacters = Array.from(input);
      const insertAt = cursorIndexRef.current;
      const nextLength = textLengthRef.current + insertedCharacters.length;
      onChange((current) => {
        const currentCharacters = Array.from(current);
        currentCharacters.splice(Math.min(insertAt, currentCharacters.length), 0, ...insertedCharacters);
        textLengthRef.current = currentCharacters.length;
        return currentCharacters.join("");
      });
      textLengthRef.current = nextLength;
      moveCursor(insertAt + insertedCharacters.length, nextLength);
    }
  }, { isActive: !disabled });

  usePaste((text) => {
    if (disabled || !text) {
      return;
    }

    const pastedCharacters = Array.from(text);
    const insertAt = cursorIndexRef.current;
    const nextLength = textLengthRef.current + pastedCharacters.length;
    onChange((current) => {
      const currentCharacters = Array.from(current);
      currentCharacters.splice(Math.min(insertAt, currentCharacters.length), 0, ...pastedCharacters);
      textLengthRef.current = currentCharacters.length;
      return currentCharacters.join("");
    });
    textLengthRef.current = nextLength;
    moveCursor(insertAt + pastedCharacters.length, nextLength);
  }, { isActive: !disabled });

  const isFocused = !disabled && hasTerminalFocus;
  const placeholder = getPlaceholder(disabledReason);
  const hasValue = characters.length > 0;
  const isCursorAtEnd = cursorIndex >= characters.length;
  const beforeCursor = sanitizeSingleLineText(characters.slice(0, cursorIndex).join(""), 500);
  const cursorCharacter = characters[cursorIndex] ?? " ";
  const visibleCursorCharacter = sanitizeSingleLineText(cursorCharacter, 1) || " ";
  const afterCursor = sanitizeSingleLineText(
    characters.slice(cursorIndex + (isCursorAtEnd ? 0 : 1)).join(""),
    500,
  );

  return (
    <Box>
      <Text>
        {pc.white("❯ ")}
        {hasValue ? (
          <>
            {beforeCursor}
            {isFocused ? pc.black(pc.bgWhite(visibleCursorCharacter)) : isCursorAtEnd ? "" : visibleCursorCharacter}
            {afterCursor}
          </>
        ) : isFocused ? pc.bgWhite(" ") : pc.gray(placeholder)}
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
