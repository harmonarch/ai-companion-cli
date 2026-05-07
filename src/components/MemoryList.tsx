import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { MemoryEditState } from "#src/app/ui-state.js";
import type { MemoryDetailRecord, MemoryPromptUsageRecord } from "#src/types/memory.js";
import { sanitizeSingleLineText } from "#src/utils/sanitize-text.js";

const MAX_EVIDENCE_ITEMS = 3;
const MAX_PROMPT_USAGE_ITEMS = 4;

export function MemoryList({
  memoryDetails,
  selectedIndex,
  deleteConfirmMemoryId,
  viewMemoryId,
  editState,
  escapeHint = "Esc close",
}: {
  memoryDetails: MemoryDetailRecord[];
  selectedIndex: number;
  deleteConfirmMemoryId: string | null;
  viewMemoryId: string | null;
  editState: MemoryEditState | null;
  escapeHint?: string;
}) {
  if (memoryDetails.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{pc.gray("memory · workspace")}</Text>
        <Text>{pc.gray("No long-term memories in this workspace.")}</Text>
        <Text>{pc.gray(escapeHint)}</Text>
      </Box>
    );
  }

  const isEditing = Boolean(editState);
  const footer = deleteConfirmMemoryId
    ? "Enter delete · Esc cancel"
    : isEditing
      ? "Tab switch field · Enter save · Esc cancel"
      : `↑ ↓ move · Enter view · e edit · d delete · ${escapeHint}`;

  return (
    <Box flexDirection="column">
      <Text>{pc.gray("memory · workspace")}</Text>
      {memoryDetails.map(({ memory, evidence, promptHitCount, lastInjectedAt, promptDecisions }, index) => {
        const selected = index === selectedIndex;
        const confirmingDelete = memory.id === deleteConfirmMemoryId;
        const expanded = memory.id === viewMemoryId || editState?.memoryId === memory.id;
        const subject = sanitizeSingleLineText(memory.subject, 60);
        const value = sanitizeSingleLineText(memory.value, 80);
        const timestamp = memory.lastConfirmedAt ?? memory.updatedAt;
        const tone = memory.status === "active" ? pc.green : memory.status === "superseded" ? pc.yellow : pc.white;
        const visibleEvidence = evidence.slice(0, MAX_EVIDENCE_ITEMS);
        const remainingEvidenceCount = Math.max(0, evidence.length - visibleEvidence.length);
        const visiblePromptUsage = promptDecisions.slice(0, MAX_PROMPT_USAGE_ITEMS);
        const remainingPromptUsageCount = Math.max(0, promptDecisions.length - visiblePromptUsage.length);

        return (
          <Box key={memory.id} flexDirection="column" marginBottom={1}>
            <Text>
              {selected ? pc.cyan(">") : " "} {selected ? pc.whiteBright(subject) : subject} {pc.gray(`· ${memory.type} · ${tone(memory.status)} · ${timestamp}`)}
            </Text>
            <Text>{pc.gray(`  ${value}`)}</Text>
            {confirmingDelete ? <Text>{pc.yellow("  Delete this memory? Enter confirm · Esc cancel")}</Text> : null}
            {expanded ? (
              <Box flexDirection="column">
                <Text>{pc.gray(`  id ${memory.id}`)}</Text>
                <Text>{pc.gray(`  evidence ${memory.sourceRefs.length}`)}</Text>
                <Text>{pc.gray(`  created ${memory.createdAt}`)}</Text>
                <Text>{pc.gray(`  updated ${memory.updatedAt}`)}</Text>
                {editState?.memoryId === memory.id ? (
                  <>
                    <Text>{editState.activeField === "subject" ? pc.cyan("  subject>") : pc.gray("  subject ")}<EditableField value={editState.subject.value} cursorIndex={editState.subject.cursorIndex} active={editState.activeField === "subject"} /></Text>
                    <Text>{editState.activeField === "value" ? pc.cyan("  value> ") : pc.gray("  value  ")}<EditableField value={editState.value.value} cursorIndex={editState.value.cursorIndex} active={editState.activeField === "value"} /></Text>
                  </>
                ) : (
                  <>
                    <Text>{pc.gray("  subject")} {sanitizeSingleLineText(memory.subject, 200)}</Text>
                    <Text>{pc.gray("  value")} {sanitizeSingleLineText(memory.value, 400)}</Text>
                    <Text>{pc.gray(`  prompt usage ${promptHitCount}`)}</Text>
                    <Text>{pc.gray(`  last injected ${lastInjectedAt ?? "never"}`)}</Text>
                    <Text>{pc.gray("  recent prompt decisions")}</Text>
                    {visiblePromptUsage.length === 0 ? <Text>{pc.gray("    no prompt decisions in this session")}</Text> : null}
                    {visiblePromptUsage.map((item, promptUsageIndex) => (
                      <Text key={`${item.assistantMessageId}-${promptUsageIndex}`}>
                        {pc.gray(`    ${formatPromptDecision(item)}`)}
                      </Text>
                    ))}
                    {remainingPromptUsageCount > 0 ? <Text>{pc.gray(`    +${remainingPromptUsageCount} more prompt decisions`)}</Text> : null}
                    <Text>{pc.gray("  evidence")}</Text>
                    {visibleEvidence.map((item, evidenceIndex) => (
                      <Box key={`${item.rawRef}-${evidenceIndex}`} flexDirection="column" marginBottom={1}>
                        <Text>{pc.gray(`    source session ${sanitizeSingleLineText(item.sessionTitle ?? item.sessionId ?? "unknown", 80)} · ${item.message?.role ?? item.kind}${item.toolName ? ` · ${sanitizeSingleLineText(item.toolName, 40)}` : ""}${item.message?.createdAt ? ` · ${item.message.createdAt}` : ""}`)}</Text>
                        <Text>{pc.gray(`    ${sanitizeSingleLineText(item.message?.preview ?? item.rawRef, 140)}`)}</Text>
                        {item.unresolvedReason ? <Text>{pc.yellow(`    ${sanitizeSingleLineText(item.unresolvedReason, 120)}`)}</Text> : null}
                      </Box>
                    ))}
                    {remainingEvidenceCount > 0 ? <Text>{pc.gray(`    +${remainingEvidenceCount} more evidence refs`)}</Text> : null}
                  </>
                )}
              </Box>
            ) : null}
          </Box>
        );
      })}
      <Text>{pc.gray(footer)}</Text>
    </Box>
  );
}

function EditableField({
  value,
  cursorIndex,
  active,
}: {
  value: string;
  cursorIndex: number;
  active: boolean;
}) {
  const characters = Array.from(value);
  const safeCursorIndex = Math.min(Math.max(0, cursorIndex), characters.length);
  const before = sanitizeSingleLineText(characters.slice(0, safeCursorIndex).join(""), 200);
  const atEnd = safeCursorIndex >= characters.length;
  const currentCharacter = characters[safeCursorIndex] ?? " ";
  const visibleCursorCharacter = sanitizeSingleLineText(currentCharacter, 1) || " ";
  const after = sanitizeSingleLineText(characters.slice(safeCursorIndex + (atEnd ? 0 : 1)).join(""), 200);

  if (!active) {
    return <>{sanitizeSingleLineText(value, 400)}</>;
  }

  return (
    <>
      {before}
      {pc.black(pc.bgWhite(visibleCursorCharacter))}
      {after}
    </>
  );
}

function formatPromptDecision(record: MemoryPromptUsageRecord) {
  const statusLabel = record.status === "selected" ? "selected" : "omitted";
  const reasonLabel = record.reason.replaceAll("_", " ");
  const scoreLabel = record.score === undefined ? "" : ` · score ${record.score}`;
  const queryLabel = record.queryPreview ? ` · ${sanitizeSingleLineText(record.queryPreview, 60)}` : "";
  return `${record.createdAt} · ${statusLabel} · ${reasonLabel}${scoreLabel}${queryLabel}`;
}
