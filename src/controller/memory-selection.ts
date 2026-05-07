import type { MemoryRecord, MemoryType, MemoryPromptDecisionReason, MemoryPromptSelectionEntry } from "#src/types/memory.js";

export const PROMPT_MEMORY_LIMIT = 8;

export interface PromptMemorySelectionResult {
  selectedRecords: MemoryRecord[];
  selectedEntries: MemoryPromptSelectionEntry[];
  omittedEntries: MemoryPromptSelectionEntry[];
}

interface ScoredMemoryRecord {
  record: MemoryRecord;
  score: number;
  selectedReason: Extract<MemoryPromptDecisionReason, "selected_subject_match" | "selected_value_match"> | null;
}

export function selectMemoriesForPrompt(records: MemoryRecord[], query: string): PromptMemorySelectionResult {
  const normalizedQuery = normalizeMemoryText(query);
  const dedupedRecords = dedupeActiveRecords(records);
  const selectedRecords: MemoryRecord[] = [];
  const selectedEntries: MemoryPromptSelectionEntry[] = [];
  const omittedEntries: MemoryPromptSelectionEntry[] = [];
  const scoredRecords: ScoredMemoryRecord[] = [];

  for (const record of records) {
    if (record.status !== "active") {
      omittedEntries.push(createDecision(record.id, "omitted", "superseded"));
      continue;
    }

    if (record.deletedAt) {
      omittedEntries.push(createDecision(record.id, "omitted", "superseded"));
      continue;
    }

    if (record.supersededBy) {
      omittedEntries.push(createDecision(record.id, "omitted", "superseded"));
      continue;
    }

    if (record.sensitivity === "high") {
      omittedEntries.push(createDecision(record.id, "omitted", "high_sensitivity"));
      continue;
    }

    if (dedupedRecords.shadowedIds.has(record.id)) {
      omittedEntries.push(createDecision(record.id, "omitted", "shadowed_by_newer_exact_match"));
      continue;
    }

    const score = scoreMemoryRecord(record, normalizedQuery);
    scoredRecords.push({
      record,
      score,
      selectedReason: getSelectedReason(record, normalizedQuery),
    });
  }

  const relevantRecords = scoredRecords
    .filter((entry) => entry.score > 0)
    .sort((left, right) => compareSelectedMemoryRecords(left, right));

  const selectedIds = new Set(relevantRecords.slice(0, PROMPT_MEMORY_LIMIT).map((entry) => entry.record.id));

  for (const entry of relevantRecords) {
    if (selectedIds.has(entry.record.id)) {
      selectedRecords.push(entry.record);
      selectedEntries.push(createDecision(
        entry.record.id,
        "selected",
        entry.selectedReason ?? "selected_value_match",
        entry.score,
      ));
      continue;
    }

    omittedEntries.push(createDecision(entry.record.id, "omitted", "lower_ranked", entry.score));
  }

  for (const entry of scoredRecords) {
    if (entry.score > 0 || selectedIds.has(entry.record.id)) {
      continue;
    }

    omittedEntries.push(createDecision(entry.record.id, "omitted", "no_query_match", entry.score));
  }

  return {
    selectedRecords,
    selectedEntries,
    omittedEntries,
  };
}

export function comparePromptMemoryRecords(a: MemoryRecord, b: MemoryRecord) {
  const priorityDiff = getPromptPriority(b.type) - getPromptPriority(a.type);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const recencyDiff = (b.lastConfirmedAt ?? b.updatedAt).localeCompare(a.lastConfirmedAt ?? a.updatedAt);
  if (recencyDiff !== 0) {
    return recencyDiff;
  }

  return a.id.localeCompare(b.id);
}

export function normalizeMemoryText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeActiveRecords(records: MemoryRecord[]) {
  const newestByKey = new Map<string, MemoryRecord>();
  const shadowedIds = new Set<string>();

  for (const record of records) {
    if (record.status !== "active" || record.deletedAt || record.supersededBy) {
      continue;
    }

    const key = `${record.type}:${normalizeMemoryText(record.subject).toLowerCase()}`;
    const current = newestByKey.get(key);
    if (!current) {
      newestByKey.set(key, record);
      continue;
    }

    const winner = compareRecordFreshness(record, current) < 0 ? current : record;
    const loser = winner.id === record.id ? current : record;
    newestByKey.set(key, winner);
    shadowedIds.add(loser.id);
  }

  return {
    shadowedIds,
  };
}

function compareSelectedMemoryRecords(left: ScoredMemoryRecord, right: ScoredMemoryRecord) {
  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return comparePromptMemoryRecords(left.record, right.record);
}

function compareRecordFreshness(a: MemoryRecord, b: MemoryRecord) {
  const timestampDiff = (a.lastConfirmedAt ?? a.updatedAt).localeCompare(b.lastConfirmedAt ?? b.updatedAt);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return b.id.localeCompare(a.id);
}

function scoreMemoryRecord(record: MemoryRecord, normalizedQuery: string) {
  if (!normalizedQuery) {
    return 0;
  }

  const queryTokens = tokenize(normalizedQuery);
  const normalizedSubject = normalizeMemoryText(record.subject).toLowerCase();
  const normalizedValue = normalizeMemoryText(record.value).toLowerCase();
  const subjectTokens = tokenize(normalizedSubject);
  const valueTokens = tokenize(normalizedValue);
  const subjectOverlap = countOverlap(queryTokens, subjectTokens);
  const valueOverlap = countOverlap(queryTokens, valueTokens);
  const subjectSubstringBonus = normalizedSubject.includes(normalizedQuery.toLowerCase()) ? 12 : 0;
  const valueSubstringBonus = normalizedValue.includes(normalizedQuery.toLowerCase()) ? 6 : 0;
  const baseRelevance = subjectSubstringBonus + valueSubstringBonus + (subjectOverlap * 5) + (valueOverlap * 2);
  if (baseRelevance <= 0) {
    return 0;
  }

  const hitCountBonus = Math.min(record.promptHitCount ?? 0, 5);
  const lastInjectedBonus = record.lastInjectedAt ? 1 : 0;
  const lastConfirmedBonus = record.lastConfirmedAt ? 1 : 0;

  return baseRelevance
    + getPromptPriority(record.type)
    + hitCountBonus
    + lastInjectedBonus
    + lastConfirmedBonus;
}

function getSelectedReason(
  record: MemoryRecord,
  normalizedQuery: string,
): Extract<MemoryPromptDecisionReason, "selected_subject_match" | "selected_value_match"> | null {
  if (!normalizedQuery) {
    return null;
  }

  const queryTokens = tokenize(normalizedQuery);
  const normalizedSubject = normalizeMemoryText(record.subject).toLowerCase();
  const normalizedValue = normalizeMemoryText(record.value).toLowerCase();
  const subjectTokens = tokenize(normalizedSubject);
  const valueTokens = tokenize(normalizedValue);

  if (normalizedSubject.includes(normalizedQuery.toLowerCase()) || countOverlap(queryTokens, subjectTokens) > 0) {
    return "selected_subject_match";
  }

  if (normalizedValue.includes(normalizedQuery.toLowerCase()) || countOverlap(queryTokens, valueTokens) > 0) {
    return "selected_value_match";
  }

  return null;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

function countOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  return left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
}

function getPromptPriority(type: MemoryType) {
  switch (type) {
    case "preference":
      return 6;
    case "constraint":
      return 5;
    case "goal":
      return 4;
    case "relationship":
      return 3;
    case "event":
      return 2;
    case "pattern":
      return 1;
  }
}

function createDecision(
  memoryId: string,
  status: "selected" | "omitted",
  reason: MemoryPromptDecisionReason,
  score?: number,
): MemoryPromptSelectionEntry {
  return score === undefined
    ? { memoryId, status, reason }
    : { memoryId, status, reason, score };
}
