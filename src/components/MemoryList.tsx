import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { MemoryRecord } from "../types/memory.js";

export function MemoryList({ memories }: { memories: MemoryRecord[] }) {
  if (memories.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{pc.gray("memory")}</Text>
        <Text>{pc.gray("No long-term memories.")}</Text>
        <Text>{pc.gray("Use /memory delete <id> to remove a memory.")}</Text>
        <Text>{pc.gray("esc close")}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>{pc.gray("memory")}</Text>
      {memories.map((memory) => {
        const timestamp = memory.lastConfirmedAt ?? memory.createdAt;
        const tone = memory.status === "active" ? pc.green : memory.status === "superseded" ? pc.yellow : pc.white;
        return (
          <Box key={memory.id} flexDirection="column" marginBottom={1}>
            <Text>{tone(memory.id)}</Text>
            <Text>{pc.white(`${memory.subject}: ${memory.value}`)}</Text>
            <Text>{pc.gray(`${memory.kind} · ${memory.type} · ${memory.status} · ${timestamp}`)}</Text>
            <Text>{pc.gray(`confidence ${memory.confidence.toFixed(2)} · evidence ${memory.sourceRefs.length}`)}</Text>
          </Box>
        );
      })}
      <Text>{pc.gray("Use /memory delete <id> to remove a memory.")}</Text>
      <Text>{pc.gray("esc close")}</Text>
    </Box>
  );
}
