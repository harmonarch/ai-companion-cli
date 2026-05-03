import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import { sanitizeSingleLineText } from "#src/utils/sanitize-text.js";
import type { EmotionPrimaryState } from "#src/types/emotion.js";
import type { SessionRecord } from "#src/types/session.js";

const modeLabels = {
  ready: "ready",
  streaming: "streaming",
  confirm: "confirm",
  sessions: "sessions",
  memory: "memory",
  help: "help",
} as const;

export function StatusBar({
  session,
  mode,
  emotion,
  statusMessage,
}: {
  session: SessionRecord;
  mode: "ready" | "streaming" | "confirm" | "sessions" | "memory" | "help";
  emotion: EmotionPrimaryState;
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
        {pc.gray(" · ")}
        {pc.cyan(`mood: ${emotion}`)}
        {safeStatusMessage ? `${pc.gray(" · ")}${pc.yellow(safeStatusMessage)}` : ""}
      </Text>
    </Box>
  );
}
