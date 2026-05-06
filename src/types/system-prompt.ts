export interface SystemPromptRecord {
  assistantMessageId: string;
  sessionId: string;
  runId: string;
  provider: string;
  model: string;
  systemPrompt: string;
  memoryContext?: string;
  emotionContext?: string;
  temporalContext?: string;
  messages: string[];
  createdAt: string;
}
