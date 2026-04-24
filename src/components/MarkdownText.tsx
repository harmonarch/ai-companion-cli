import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";

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
