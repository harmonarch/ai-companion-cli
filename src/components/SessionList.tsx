import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { SessionSummary } from "../types/session.js";
import { sanitizeSingleLineText } from "../utils/sanitize-text.js";

export function SessionList({
  sessions,
  selectedIndex,
  deleteConfirmSessionId,
}: {
  sessions: SessionSummary[];
  selectedIndex: number;
  deleteConfirmSessionId: string | null;
}) {
  return (
    <Box flexDirection="column">
      <Text>{pc.gray("sessions")}</Text>
      {sessions.map((session, index) => {
        const selected = index === selectedIndex;
        const confirmingDelete = session.id === deleteConfirmSessionId;
        const safeTitle = sanitizeSingleLineText(session.title, 80);
        const safeProvider = sanitizeSingleLineText(session.provider, 40);
        const safeModel = sanitizeSingleLineText(session.model, 40);

        return (
          <Text key={session.id}>
            {selected ? pc.cyan(">") : " "} {selected ? pc.whiteBright(safeTitle) : safeTitle}{" "}
            {pc.gray(`· ${session.messageCount} msgs · ${safeProvider}/${safeModel}`)}
            {confirmingDelete ? pc.yellow(" · Enter 删除 / Esc 取消") : ""}
          </Text>
        );
      })}
      <Text>{pc.gray(deleteConfirmSessionId ? "Enter 删除 / Esc 取消" : "↑ ↓ move · enter switch · d delete · esc close")}</Text>
    </Box>
  );
}
