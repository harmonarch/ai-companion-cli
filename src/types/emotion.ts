export type EmotionPrimaryState = "neutral" | "angry";

export type EmotionTransitionReason =
  | "disrespect"
  | "pressure"
  | "boundary"
  | "repair"
  | "cooperation"
  | "assistant_settle"
  | "time_decay";

export interface EmotionState {
  sessionId: string;
  primary: EmotionPrimaryState;
  intensity: number;
  intimacy: number;
  boundaryActive: boolean;
  lastTrigger?: EmotionTransitionReason;
  stepsSinceTrigger: number;
  updatedAt: string;
}

export interface EmotionPromptContext {
  content: string;
}
