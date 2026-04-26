import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";

const helpItems = [
  ["/new", "create a new session"],
  ["/sessions", "open the session list"],
  ["/switch <n|id>", "switch to a session"],
  ["/help", "open this help panel"],
  ["/exit", "exit the app and hide the current screen"],
] as const;

export function HelpList() {
  return (
    <Box flexDirection="column">
      <Text>{pc.gray("help")}</Text>
      {helpItems.map(([command, description]) => (
        <Text key={command}>
          {pc.whiteBright(command.padEnd(15, " "))}
          {pc.gray(description)}
        </Text>
      ))}
      <Text>{pc.gray("esc close")}</Text>
    </Box>
  );
}
