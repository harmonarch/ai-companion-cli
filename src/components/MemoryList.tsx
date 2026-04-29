import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { MemoryEditState } from "../app/ui-state.js";
import type { MemoryDetailRecord } from "../types/memory.js";
import { sanitizeSingleLineText } from "../utils/sanitize-text.js";

const MAX_EVIDENCE_ITEMS = 3;

export function MemoryList({
  memoryDetails,
  selectedIndex,
  deleteConfirmMemoryId,
  viewMemoryId,
  editState,
  sessionTitle,
  escapeHint = "Esc close",
}: {
  memoryDetails: MemoryDetailRecord[];
  selectedIndex: number;
  deleteConfirmMemoryId: string | null;
  viewMemoryId: string | null;
  editState: MemoryEditState | null;
  sessionTitle?: string;
  escapeHint?: string;
}) {
  if (memoryDetails.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{pc.gray(sessionTitle ? `memory · ${sanitizeSingleLineText(sessionTitle, 80)}` : "memory")}</Text>
        <Text>{pc.gray("No long-term memories for this session.")}</Text>
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
      <Text>{pc.gray(sessionTitle ? `memory · ${sanitizeSingleLineText(sessionTitle, 80)}` : "memory")}</Text>
      {memoryDetails.map(({ memory, evidence }, index) => {
        const selected = index === selectedIndex;
        const confirmingDelete = memory.id === deleteConfirmMemoryId;
        const expanded = memory.id === viewMemoryId || editState?.memoryId === memory.id;
        const subject = sanitizeSingleLineText(memory.subject, 60);
        const value = sanitizeSingleLineText(memory.value, 80);
        const timestamp = memory.lastConfirmedAt ?? memory.updatedAt;
        const tone = memory.status === "active" ? pc.green : memory.status === "superseded" ? pc.yellow : pc.white;
        const visibleEvidence = evidence.slice(0, MAX_EVIDENCE_ITEMS);
        const remainingEvidenceCount = Math.max(0, evidence.length - visibleEvidence.length);

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
                <Text>{pc.gray(`  kind ${memory.kind} · confidence ${memory.confidence.toFixed(2)} · evidence ${memory.sourceRefs.length}`)}</Text>
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
                    <Text>{pc.gray("  evidence")}</Text>
                    {visibleEvidence.map((item, evidenceIndex) => (
                      <Box key={`${item.rawRef}-${evidenceIndex}`} flexDirection="column" marginBottom={1}>
                        <Text>{pc.gray(`    ${sanitizeSingleLineText(item.sessionTitle ?? item.sessionId ?? "unknown session", 80)} · ${item.message?.role ?? item.kind}${item.toolName ? ` · ${sanitizeSingleLineText(item.toolName, 40)}` : ""}${item.message?.createdAt ? ` · ${item.message.createdAt}` : ""}`)}</Text>
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
