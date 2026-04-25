import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import { sanitizeSingleLineText } from "../utils/sanitize-text.js";
import type { SessionRecord } from "../types/session.js";

const modeLabels = {
  ready: "ready",
  streaming: "streaming",
  confirm: "confirm",
  sessions: "sessions",
} as const;

export function StatusBar({
  session,
  mode,
  statusMessage,
}: {
  session: SessionRecord;
  mode: "ready" | "streaming" | "confirm" | "sessions";
  statusMessage?: string;
}) {
  const safeTitle = sanitizeSingleLineText(session.title, 80);
  const safeProvider = sanitizeSingleLineText(session.provider, 40);
  const safeModel = sanitizeSingleLineText(session.model, 40);
  const safeStatusMessage = statusMessage ? sanitizeSingleLineText(statusMessage, 120) : undefined;

  return (
    <Box justifyContent="space-between">
      <Text>
        {pc.whiteBright(safeTitle)} {pc.gray(`· ${safeProvider}/${safeModel}`)}
      </Text>
      <Text>
        {pc.gray(modeLabels[mode])}
        {safeStatusMessage ? `${pc.gray(" · ")}${pc.yellow(safeStatusMessage)}` : ""}
      </Text>
    </Box>
  );
}
