import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import { getSlashCommandSpecs } from "../controller/slash-commands.js";

export function HelpList() {
  const helpItems = getSlashCommandSpecs();

  return (
    <Box flexDirection="column">
      <Text>{pc.gray("help")}</Text>
      {helpItems.map(({ usage, description }) => (
        <Text key={usage}>
          {pc.whiteBright(usage.padEnd(15, " "))}
          {pc.gray(description)}
        </Text>
      ))}
      <Text>{pc.gray("memory: pick a session first · then Enter view · e edit · d delete · Esc back")}</Text>
      <Text>{pc.gray("esc close")}</Text>
    </Box>
  );
}
