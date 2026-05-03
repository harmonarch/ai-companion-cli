import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import { sanitizeMultilineText } from "#src/utils/sanitize-text.js";

export function MarkdownText({ content }: { content: string }) {
  const lines = sanitizeMultilineText(content, 8000).split(/\n/);
  let inCodeBlock = false;

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => {
        if (line.startsWith("```")) {
          inCodeBlock = !inCodeBlock;
          return <Text key={`fence-${index}`}>{pc.gray(line)}</Text>;
        }

        if (inCodeBlock) {
          return <Text key={index}>{pc.gray(line || " ")}</Text>;
        }

        if (line.startsWith("# ")) {
          return <Text key={index}>{pc.whiteBright(line.slice(2))}</Text>;
        }

        if (line.startsWith("## ")) {
          return <Text key={index}>{pc.white(line.slice(3))}</Text>;
        }

        if (line.startsWith("> ")) {
          return <Text key={index}>{pc.gray(`│ ${line.slice(2)}`)}</Text>;
        }

        if (/^[-*]\s+/.test(line)) {
          return <Text key={index}>{`• ${line.replace(/^[-*]\s+/, "")}`}</Text>;
        }

        return <Text key={index}>{renderInlineCode(line || " ", index)}</Text>;
      })}
    </Box>
  );
}

function renderInlineCode(line: string, lineIndex: number) {
  const parts = line.split(/(`[^`]+`)/g);

  return parts.map((part, partIndex) => {
    if (/^`[^`]+`$/.test(part)) {
      return (
        <Text key={`${lineIndex}-${partIndex}`} color="yellow">
          {part.slice(1, -1)}
        </Text>
      );
    }

    return <Text key={`${lineIndex}-${partIndex}`}>{part}</Text>;
  });
}
