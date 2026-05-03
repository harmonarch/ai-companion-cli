import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { SessionSummary } from "#src/types/session.js";
import { sanitizeSingleLineText } from "#src/utils/sanitize-text.js";

export function SessionList({
  title = "sessions",
  sessions,
  selectedIndex,
  deleteConfirmSessionId,
  mode = "manage",
}: {
  title?: string;
  sessions: SessionSummary[];
  selectedIndex: number;
  deleteConfirmSessionId: string | null;
  mode?: "manage" | "select";
}) {
  return (
    <Box flexDirection="column">
      <Text>{pc.gray(title)}</Text>
      {sessions.map((session, index) => {
        const selected = index === selectedIndex;
        const confirmingDelete = mode === "manage" && session.id === deleteConfirmSessionId;
        const safeTitle = sanitizeSingleLineText(session.title, 80);
        const safeProvider = sanitizeSingleLineText(session.provider, 40);
        const safeModel = sanitizeSingleLineText(session.model, 40);

        return (
          <Text key={session.id}>
            {selected ? pc.cyan(">") : " "} {selected ? pc.whiteBright(safeTitle) : safeTitle}{" "}
            {pc.gray(`· ${session.messageCount} msgs · ${safeProvider}/${safeModel}`)}
            {confirmingDelete ? pc.yellow(" · Enter delete / Esc cancel") : ""}
          </Text>
        );
      })}
      <Text>{pc.gray(mode === "select"
        ? "↑ ↓ move · Enter open · Esc close"
        : deleteConfirmSessionId ? "Enter delete / Esc cancel" : "↑ ↓ move · enter switch · d delete · esc close")}</Text>
    </Box>
  );
}
