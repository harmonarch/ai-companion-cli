export interface SessionRecord {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummary extends SessionRecord {
  messageCount: number;
}
