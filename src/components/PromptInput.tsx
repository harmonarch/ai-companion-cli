import React from "react";
import { Box, Text, useInput } from "ink";
import pc from "picocolors";

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
      <Text>{pc.gray("> ")}{safeValue || pc.gray(placeholder)}</Text>
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
