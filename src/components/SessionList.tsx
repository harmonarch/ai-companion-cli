import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { SessionSummary } from "../types/session.js";

export function SessionList({
  sessions,
  selectedIndex,
}: {
  sessions: SessionSummary[];
  selectedIndex: number;
}) {
  return (
    <Box flexDirection="column">
      <Text>{pc.gray("sessions")}</Text>
      {sessions.map((session, index) => {
        const selected = index === selectedIndex;
        const safeTitle = sanitizeSingleLineText(session.title, 80);
        const safeProvider = sanitizeSingleLineText(session.provider, 40);
        const safeModel = sanitizeSingleLineText(session.model, 40);

        return (
          <Text key={session.id}>
            {selected ? pc.cyan(">") : " "} {selected ? pc.whiteBright(safeTitle) : safeTitle}{" "}
            {pc.gray(`· ${session.messageCount} msgs · ${safeProvider}/${safeModel}`)}
          </Text>
        );
      })}
      <Text>{pc.gray("↑ ↓ move · enter switch · esc close")}</Text>
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
