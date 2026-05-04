import React, { useMemo } from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import { messageContentToPlainText, type ChatMessage } from "#src/types/chat.js";
import type { ToolExecutionRecord } from "#src/types/tool.js";
import { sanitizeMultilineText, sanitizeSingleLineText } from "#src/utils/sanitize-text.js";
import { InlineToolState } from "#src/components/InlineToolState.js";
import { MarkdownText } from "#src/components/MarkdownText.js";

export function ChatList({
  messages,
  toolExecutions,
  assistantLabel,
}: {
  messages: ChatMessage[];
  toolExecutions: ToolExecutionRecord[];
  assistantLabel?: string;
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
            ? sanitizeSingleLineText(assistantLabel?.trim() || "assistant", 40)
            : sanitizeSingleLineText(String(message.role), 20);
        const executions = toolExecutionsByMessage.get(message.id) ?? [];
        const isLastMessage = index === messages.length - 1;
        const safeContent = sanitizeMultilineText(messageContentToPlainText(message.content), 8000);
        const isUserMessage = message.role === "user";

        return (
          <Box
            key={message.id}
            width="100%"
            flexDirection="column"
            alignItems={isUserMessage ? "flex-end" : "flex-start"}
            marginBottom={isLastMessage ? 0 : 1}
          >
            <Text>{color(label)}</Text>
            <Box
              flexDirection="column"
              marginLeft={isUserMessage ? 0 : 2}
              marginRight={isUserMessage ? 2 : 0}
            >
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
