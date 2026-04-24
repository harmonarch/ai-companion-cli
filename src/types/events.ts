import type { ToolExecutionRecord } from "./tool.js";

export type ChatRuntimeEvent =
  | { type: "message_started"; messageId: string }
  | { type: "message_chunk"; messageId: string; chunk: string }
  | { type: "message_completed"; messageId: string; content: string }
  | { type: "tool_pending_confirmation"; execution: ToolExecutionRecord }
  | { type: "tool_started"; execution: ToolExecutionRecord }
  | { type: "tool_completed"; execution: ToolExecutionRecord }
  | { type: "tool_failed"; execution: ToolExecutionRecord; error: string }
  | { type: "run_failed"; error: string };
