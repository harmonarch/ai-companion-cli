import React, { useMemo } from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { ChatMessage } from "../types/chat.js";
import type { ToolExecutionRecord } from "../types/tool.js";
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

function sanitizeSingleLineText(value: string, maxLength: number) {
  return truncateText(filterUntrustedText(value, true), maxLength);
}

function sanitizeMultilineText(value: string, maxLength: number) {
  return truncateText(filterUntrustedText(value, false), maxLength);
}

function filterUntrustedText(value: string, singleLine: boolean) {
  let result = "";

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;

    if (code === 0x1b) {
      continue;
    }

    if (code === 0x0009 || code === 0x000a || code === 0x000d || code === 0x2028 || code === 0x2029) {
      result += singleLine ? " " : code === 0x000d ? "" : "\n";
      continue;
    }

    if (
      (code >= 0x0000 && code <= 0x0008)
      || (code >= 0x000b && code <= 0x001a)
      || (code >= 0x001c && code <= 0x001f)
      || (code >= 0x007f && code <= 0x009f)
      || code === 0x061c
      || code === 0x200e
      || code === 0x200f
      || (code >= 0x202a && code <= 0x202e)
      || (code >= 0x2066 && code <= 0x2069)
      || (code >= 0x200b && code <= 0x200d)
      || code === 0x2060
      || code === 0xfeff
    ) {
      continue;
    }

    result += char;
  }

  return result;
}

function truncateText(value: string, maxLength: number) {
  const characters = Array.from(value);

  if (characters.length <= maxLength) {
    return value;
  }

  return `${characters.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}
