import type {
  MessageContent,
  ToolCallMessageContentPart,
  ToolResultMessageContentPart,
} from "./chat.js";

interface RuntimeEventEnvelope {
  sessionId: string;
  runId: string;
  assistantMessageId: string;
  timestamp: string;
}

export interface CanonicalUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface CanonicalError {
  message: string;
  code?: string;
}

export interface ModelResponse {
  text?: string;
  toolCalls?: ToolCallMessageContentPart[];
  usage?: CanonicalUsage;
  finishReason?: string;
  content?: MessageContent;
}

export type ChatRuntimeEvent =
  | (RuntimeEventEnvelope & {
      type: "response_started";
      provider: string;
      model: string;
    })
  | (RuntimeEventEnvelope & {
      type: "text_delta";
      text: string;
    })
  | (RuntimeEventEnvelope & {
      type: "tool_call_recorded";
      part: ToolCallMessageContentPart;
    })
  | (RuntimeEventEnvelope & {
      type: "tool_result_recorded";
      part: ToolResultMessageContentPart;
    })
  | (RuntimeEventEnvelope & {
      type: "usage_updated";
      usage: CanonicalUsage;
    })
  | (RuntimeEventEnvelope & {
      type: "response_completed";
      response: ModelResponse;
    })
  | (RuntimeEventEnvelope & {
      type: "response_failed";
      error: CanonicalError;
    });
