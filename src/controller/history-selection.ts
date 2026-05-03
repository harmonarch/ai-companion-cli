import type { ChatMessage } from "#src/types/chat.js";

export function selectHistory(messages: ChatMessage[], maxMessages: number) {
  if (messages.length <= maxMessages) {
    return messages;
  }

  const window = messages.slice(-maxMessages);
  const firstUserIndex = window.findIndex((message) => message.role === "user");

  if (firstUserIndex <= 0) {
    return window;
  }

  return window.slice(firstUserIndex);
}
