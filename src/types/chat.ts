import type { ToolExecutionRecord } from "#src/types/tool.js";

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageKind = MessageRole;

export interface TextMessageContentPart {
  type: "text";
  text: string;
}

export interface ToolCallMessageContentPart {
  type: "tool_call";
  callId: string;
  toolName: string;
  input: unknown;
}

export interface ToolResultMessageContentPart {
  type: "tool_result";
  callId: string;
  toolName: string;
  output: unknown;
  isError?: boolean;
}

export type MessageContentPart = TextMessageContentPart | ToolCallMessageContentPart | ToolResultMessageContentPart;
export type MessageContent = MessageContentPart[];

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  kind: MessageKind;
  content: MessageContent;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface AssistantDraft {
  id: string;
  sessionId: string;
  content: MessageContent;
  isStreaming: boolean;
  toolExecutions: ToolExecutionRecord[];
  error?: string;
}

export function createTextMessageContent(text: string): MessageContent {
  return text ? [{ type: "text", text }] : [];
}

export function appendTextMessageContent(content: MessageContent, text: string): MessageContent {
  if (!text) {
    return content;
  }

  const lastPart = content.at(-1);
  if (lastPart?.type === "text") {
    return [
      ...content.slice(0, -1),
      { ...lastPart, text: lastPart.text + text },
    ];
  }

  return [...content, { type: "text", text }];
}

export function appendToolCallMessageContent(
  content: MessageContent,
  part: ToolCallMessageContentPart,
): MessageContent {
  return [...content, part];
}

export function appendToolResultMessageContent(
  content: MessageContent,
  part: ToolResultMessageContentPart,
): MessageContent {
  return [...content, part];
}

export function messageContentToPlainText(content: MessageContent): string {
  return content
    .map((part) => part.type === "text" ? part.text : "")
    .join("");
}
