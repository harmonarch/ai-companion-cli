import React from "react";
import { Box, Text, useInput } from "ink";
import pc from "picocolors";
import { sanitizeSingleLineText } from "../utils/sanitize-text.js";

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
  disabledReason?: "streaming" | "confirm" | "sessions";
}) {
  useInput((input, key) => {
    if (disabled) {
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

  const placeholder = getPlaceholder(disabledReason);
  const safeValue = sanitizeSingleLineText(value, 500);

  return (
    <Box>
      <Text>{pc.white("❯ ")}{safeValue || pc.gray(placeholder)}</Text>
    </Box>
  );
}

function getPlaceholder(disabledReason?: "streaming" | "confirm" | "sessions") {
  switch (disabledReason) {
    case "streaming":
      return "Assistant is responding...";
    case "confirm":
      return "Approve or deny the tool request above";
    case "sessions":
      return "Select a session above";
    default:
      return "Type a message or /help";
  }
}
