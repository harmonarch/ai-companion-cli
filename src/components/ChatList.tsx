import React, { useMemo } from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { ChatMessage } from "../types/chat.js";
import type { ToolExecutionRecord } from "../types/tool.js";
import { sanitizeMultilineText, sanitizeSingleLineText } from "../utils/sanitize-text.js";
import { InlineToolState } from "./InlineToolState.js";
import { MarkdownText } from "./MarkdownText.js";

export function ChatList({
  messages,
  toolExecutions,
}: {
  messages: ChatMessage[];
  toolExecutions: ToolExecutionRecord[];
}) {
  const toolExecutionsByMessage = useMemo(() => {
    const groups = new Map<string, ToolExecutionRecord[]>();
    for (const execution of toolExecutions) {
      if (!execution.messageId) {
        continue;
      }
      const entries = groups.get(execution.messageId) ?? [];
      entries.push(execution);
      groups.set(execution.messageId, entries);
    }
    return groups;
  }, [toolExecutions]);

  if (messages.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{pc.gray("Start a conversation.")}</Text>
        <Text>{pc.gray("Use /help for commands.")}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {messages.map((message, index) => {
        const color = message.role === "user" ? pc.cyan : message.role === "assistant" ? pc.green : pc.yellow;
        const label = message.role === "user"
          ? "you"
          : message.role === "assistant"
            ? "assistant"
            : sanitizeSingleLineText(String(message.role), 20);
        const executions = toolExecutionsByMessage.get(message.id) ?? [];
        const isLastMessage = index === messages.length - 1;
        const safeContent = sanitizeMultilineText(message.content, 8000);

        return (
          <Box key={message.id} flexDirection="column" marginBottom={isLastMessage ? 0 : 1}>
            <Text>{color(label)}</Text>
            <Box marginLeft={2} flexDirection="column">
              {message.role === "assistant" ? <MarkdownText content={safeContent} /> : <Text>{safeContent || " "}</Text>}
              {executions.map((execution) => (
                <InlineToolState key={execution.id} execution={execution} />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
