import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { SessionSummary } from "../types/session.js";
import { sanitizeSingleLineText } from "../utils/sanitize-text.js";

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
