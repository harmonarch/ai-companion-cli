import type { EmotionPromptContext, EmotionPrimaryState, EmotionState, EmotionTransitionReason } from "#src/types/emotion.js";
import { EmotionStateRepository } from "#src/infra/repositories/emotion-state-repository.js";

const ANGRY_THRESHOLD = 0.35;
const TURN_DECAY = 0.08;
const TIME_DECAY_PER_HOUR = 0.03;
const DISRESPECT_INCREASE = 0.28;
const PRESSURE_INCREASE = 0.18;
const BOUNDARY_INCREASE = 0.22;
const REPAIR_DECREASE = 0.24;
const ASSISTANT_SETTLE_DECREASE = 0.1;
const COOPERATION_INTIMACY_INCREASE = 0.04;
const CONFLICT_INTIMACY_DECREASE = 0.08;
const BOUNDARY_INTIMACY_DECREASE = 0.12;

const DISRESPECT_PATTERNS = [
  /\bshut up\b/i,
  /\bstupid\b/i,
  /\bidiot\b/i,
  /\bdumb\b/i,
  /\buseless\b/i,
  /你真?笨/,
  /废物/,
  /闭嘴/,
  /垃圾/,
];

const PRESSURE_PATTERNS = [
  /\bnow\b/i,
  /\bimmediately\b/i,
  /\bright now\b/i,
  /\bhurry up\b/i,
  /赶紧/,
  /立刻/,
  /马上/,
  /现在就/,
  /快点/,
];

const BOUNDARY_PATTERNS = [
  /\byou must obey\b/i,
  /\bdo what i say\b/i,
  /\bi own you\b/i,
  /\bstop resisting\b/i,
  /听我的/,
  /必须听/,
  /不准反驳/,
  /别废话/,
  /照做/,
];

const REPAIR_PATTERNS = [
  /\bsorry\b/i,
  /\bapologize\b/i,
  /\bthank you\b/i,
  /\bthanks\b/i,
  /\bplease\b/i,
  /对不起/,
  /抱歉/,
  /谢谢/,
  /麻烦你/,
  /请/,
];

export class EmotionService {
  constructor(private readonly repository: EmotionStateRepository) {}

  getOrCreate(sessionId: string, now = new Date()) {
    const existing = this.repository.getBySessionId(sessionId);
    if (existing) {
      return existing;
    }

    const initial = createEmotionState(sessionId, now);
    this.repository.upsert(initial);
    return initial;
  }

  transitionOnUserTurn(sessionId: string, userText: string, now = new Date()) {
    const current = this.getOrCreate(sessionId, now);
    const decayed = applyDecay(current, now);
    const next = applyUserTurn(decayed, userText, now);
    this.repository.upsert(next);
    return next;
  }

  transitionOnAssistantTurn(sessionId: string, assistantText: string, now = new Date()) {
    const current = this.getOrCreate(sessionId, now);
    const next = applyAssistantTurn(current, assistantText, now);
    this.repository.upsert(next);
    return next;
  }

  resetSession(sessionId: string, now = new Date()) {
    const state = createEmotionState(sessionId, now);
    this.repository.upsert(state);
    return state;
  }

  deleteSessionState(sessionId: string) {
    this.repository.deleteBySession(sessionId);
  }

  resetAll() {
    this.repository.deleteAll();
  }

  renderPromptContext(state: EmotionState): EmotionPromptContext | null {
    const intensityLabel = describeIntensity(state.intensity);
    const intimacyLabel = describeIntimacy(state.intimacy);
    const boundaryLine = state.boundaryActive
      ? "Boundary mode is active. Set clear limits, stay firm, and do not become abusive."
      : "Boundary mode is inactive. Stay cooperative unless the user reintroduces conflict.";

    const content = [
      "Emotional continuity:",
      `- Current mood: ${state.primary}`,
      `- Intensity: ${intensityLabel}`,
      `- Relationship closeness: ${intimacyLabel}`,
      `- Recent trigger: ${state.lastTrigger ?? "none"}`,
      `- ${boundaryLine}`,
      state.primary === "angry"
        ? "- Reply style: shorter, cooler, restrained, emotionally consistent."
        : "- Reply style: natural, cooperative, and warm without overacting.",
    ].join("\n");

    return { content };
  }

  summarize(state: EmotionState, debug = false) {
    if (!debug) {
      return `Emotion: ${state.primary}.`;
    }

    return [
      `Emotion: ${state.primary}`,
      `intensity=${state.intensity.toFixed(2)}`,
      `intimacy=${state.intimacy.toFixed(2)}`,
      `boundary=${state.boundaryActive ? "on" : "off"}`,
      `trigger=${state.lastTrigger ?? "none"}`,
      `stepsSinceTrigger=${state.stepsSinceTrigger}`,
    ].join(" | ");
  }
}

function createEmotionState(sessionId: string, now: Date): EmotionState {
  return {
    sessionId,
    primary: "neutral",
    intensity: 0,
    intimacy: 0.3,
    boundaryActive: false,
    stepsSinceTrigger: 0,
    updatedAt: now.toISOString(),
  };
}

function applyUserTurn(state: EmotionState, userText: string, now: Date): EmotionState {
  let intensity = state.intensity;
  let intimacy = state.intimacy;
  let boundaryActive = state.boundaryActive;
  let lastTrigger: EmotionTransitionReason | undefined;
  let stepsSinceTrigger = state.stepsSinceTrigger + 1;

  const hasDisrespect = matchesAny(userText, DISRESPECT_PATTERNS);
  const hasPressure = matchesAny(userText, PRESSURE_PATTERNS);
  const hasBoundary = matchesAny(userText, BOUNDARY_PATTERNS);
  const hasRepair = matchesAny(userText, REPAIR_PATTERNS);

  if (hasDisrespect) {
    intensity += DISRESPECT_INCREASE;
    intimacy -= CONFLICT_INTIMACY_DECREASE;
    lastTrigger = "disrespect";
    stepsSinceTrigger = 0;
  }

  if (hasPressure) {
    intensity += PRESSURE_INCREASE;
    intimacy -= CONFLICT_INTIMACY_DECREASE;
    lastTrigger = "pressure";
    stepsSinceTrigger = 0;
  }

  if (hasBoundary) {
    intensity += BOUNDARY_INCREASE;
    intimacy -= BOUNDARY_INTIMACY_DECREASE;
    boundaryActive = true;
    lastTrigger = "boundary";
    stepsSinceTrigger = 0;
  }

  if (hasRepair) {
    intensity -= REPAIR_DECREASE;
    intimacy += COOPERATION_INTIMACY_INCREASE;
    boundaryActive = false;
    lastTrigger = "repair";
    stepsSinceTrigger = 0;
  }

  if (!hasDisrespect && !hasPressure && !hasBoundary && !hasRepair) {
    intimacy += COOPERATION_INTIMACY_INCREASE / 2;
    lastTrigger = "cooperation";
  }

  intensity = clamp(intensity, 0, 1);
  intimacy = clamp(intimacy, 0, 1);

  return finalizeState({
    ...state,
    intensity,
    intimacy,
    boundaryActive,
    lastTrigger,
    stepsSinceTrigger,
    updatedAt: now.toISOString(),
  });
}

function applyAssistantTurn(state: EmotionState, assistantText: string, now: Date): EmotionState {
  const repairLike = matchesAny(assistantText, REPAIR_PATTERNS);
  const intensity = clamp(state.intensity - (repairLike ? REPAIR_DECREASE / 2 : ASSISTANT_SETTLE_DECREASE), 0, 1);
  const boundaryActive = state.boundaryActive && intensity >= ANGRY_THRESHOLD / 2;

  return finalizeState({
    ...state,
    intensity,
    boundaryActive,
    lastTrigger: state.lastTrigger ?? "assistant_settle",
    stepsSinceTrigger: state.stepsSinceTrigger + 1,
    updatedAt: now.toISOString(),
  });
}

function applyDecay(state: EmotionState, now: Date): EmotionState {
  const elapsedHours = Math.max(0, (now.getTime() - new Date(state.updatedAt).getTime()) / (1000 * 60 * 60));
  const decayedIntensity = clamp(state.intensity - TURN_DECAY - (elapsedHours * TIME_DECAY_PER_HOUR), 0, 1);
  const boundaryActive = state.boundaryActive && decayedIntensity >= ANGRY_THRESHOLD / 2;

  return finalizeState({
    ...state,
    intensity: decayedIntensity,
    boundaryActive,
    lastTrigger: decayedIntensity < state.intensity ? "time_decay" : state.lastTrigger,
    updatedAt: now.toISOString(),
  });
}

function finalizeState(state: EmotionState): EmotionState {
  const primary: EmotionPrimaryState = state.intensity >= ANGRY_THRESHOLD ? "angry" : "neutral";
  return {
    ...state,
    primary,
  };
}

function matchesAny(input: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(input));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function describeIntensity(intensity: number) {
  if (intensity >= 0.7) {
    return "high";
  }
  if (intensity >= 0.35) {
    return "medium";
  }
  return "low";
}

function describeIntimacy(intimacy: number) {
  if (intimacy >= 0.7) {
    return "close";
  }
  if (intimacy >= 0.35) {
    return "familiar";
  }
  return "distant";
}
