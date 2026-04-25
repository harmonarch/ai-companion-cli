import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { ToolExecutionRecord, ToolExecutionStatus } from "../types/tool.js";
import { sanitizeSingleLineText } from "../utils/sanitize-text.js";

const statusLabels: Record<ToolExecutionStatus, string> = {
  pending: "pending",
  running: "running",
  completed: "ok",
  failed: "failed",
  denied: "denied",
};

const statusColors: Record<ToolExecutionStatus, (value: string) => string> = {
  pending: pc.yellow,
  running: pc.blue,
  completed: pc.green,
  failed: pc.red,
  denied: pc.gray,
};

export function InlineToolState({ execution }: { execution: ToolExecutionRecord }) {
  const safeStatus = getSafeStatus(execution.status as string);
  const outputSummary = summarizeOutput(execution);
  const riskLabel = execution.riskLevel === "medium" ? pc.yellow("medium") : pc.gray("low");
  const safeToolName = sanitizeSingleLineText(execution.toolName, 80);
  const safeSummary = sanitizeSingleLineText(execution.summary, 160);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        {statusColors[safeStatus](statusLabels[safeStatus])}
        {pc.gray(" tool ")}
        {pc.white(safeToolName)}
        {pc.gray(" · ")}
        {pc.gray(safeSummary)}
        {pc.gray(" · ")}
        {riskLabel}
      </Text>
      {outputSummary ? <Text>{pc.gray(sanitizeSingleLineText(outputSummary, 240))}</Text> : null}
    </Box>
  );
}

function summarizeOutput(execution: ToolExecutionRecord) {
  if (execution.status === "failed") {
    const error = execution.output.error;
    return typeof error === "string" ? `error: ${error}` : "tool failed";
  }

  if (execution.status === "denied") {
    return "execution denied";
  }

  if (execution.status !== "completed") {
    return "";
  }

  if (typeof execution.output.path === "string") {
    return `path: ${execution.output.path}`;
  }

  if (typeof execution.output.url === "string" && typeof execution.output.status === "number") {
    return `status ${execution.output.status}: ${execution.output.url}`;
  }

  if (Array.isArray(execution.output.matches)) {
    return `${execution.output.matches.length} matches`;
  }

  if (Array.isArray(execution.output.entries)) {
    return `${execution.output.entries.length} entries`;
  }

  return "completed";
}

function getSafeStatus(status: string): ToolExecutionStatus {
  switch (status) {
    case "pending":
    case "running":
    case "completed":
    case "failed":
    case "denied":
      return status;
    default:
      return "failed";
  }
}
