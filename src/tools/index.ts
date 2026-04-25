import { tool } from "@langchain/core/tools";
import type { ZodTypeAny, infer as Infer } from "zod";
import type { ToolExecutionRepository } from "../infra/repositories/tool-execution-repository.js";
import type { ToolConfirmationRequest, ToolDescriptor, ToolExecutionRecord } from "../types/tool.js";
import { httpFetchToolDefinition } from "./http-fetch.js";
import { listDirToolDefinition } from "./list-dir.js";
import { readFileToolDefinition } from "./read-file.js";
import { searchTextToolDefinition } from "./search-text.js";

interface ToolDefinition<TSchema extends ZodTypeAny = ZodTypeAny> extends ToolDescriptor {
  schema: TSchema;
  summarize(input: Infer<TSchema>): string;
  execute(input: Infer<TSchema>, context: { workspaceRoot: string }): Promise<Record<string, unknown>>;
}

export interface ToolRuntimeContext {
  workspaceRoot: string;
  sessionId: string;
  runId: string;
  messageId: string;
  toolExecutionRepository: ToolExecutionRepository;
  onExecutionUpdate(execution: ToolExecutionRecord): void;
  requestConfirmation(request: ToolConfirmationRequest): Promise<boolean>;
}

const toolDefinitions: readonly ToolDefinition[] = [
  readFileToolDefinition,
  listDirToolDefinition,
  searchTextToolDefinition,
  httpFetchToolDefinition,
];

export function createRuntimeTools(context: ToolRuntimeContext) {
  return toolDefinitions.map((definition) =>
    tool(
      async (input) => runTool(definition, input as Record<string, unknown>, context),
      {
        name: definition.name,
        description: definition.description,
        schema: definition.schema,
      },
    ),
  );
}

async function runTool(
  definition: ToolDefinition,
  input: Record<string, unknown>,
  context: ToolRuntimeContext,
) {
  const initialStatus = definition.riskLevel === "medium" ? "pending" : "running";
  let execution = context.toolExecutionRepository.create({
    sessionId: context.sessionId,
    runId: context.runId,
    messageId: context.messageId,
    toolName: definition.name,
    riskLevel: definition.riskLevel,
    status: initialStatus,
    summary: definition.summarize(input),
    input,
    output: {},
  });
  context.onExecutionUpdate(execution);

  if (definition.riskLevel === "medium") {
    const approved = await context.requestConfirmation({
      id: execution.id,
      toolName: execution.toolName,
      riskLevel: execution.riskLevel,
      summary: execution.summary,
      input: execution.input,
    });

    if (!approved) {
      execution = context.toolExecutionRepository.update(execution.id, {
        status: "denied",
        summary: `${execution.summary} (denied)`,
        output: { denied: true },
      });
      context.onExecutionUpdate(execution);
      return JSON.stringify({ denied: true, message: "User denied this tool execution." }, null, 2);
    }

    execution = context.toolExecutionRepository.update(execution.id, {
      status: "running",
      summary: execution.summary,
      output: {},
    });
    context.onExecutionUpdate(execution);
  }

  try {
    const output = await definition.execute(input, { workspaceRoot: context.workspaceRoot });
    execution = context.toolExecutionRepository.update(execution.id, {
      status: "completed",
      summary: execution.summary,
      output,
    });
    context.onExecutionUpdate(execution);
    return JSON.stringify(output, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    execution = context.toolExecutionRepository.update(execution.id, {
      status: "failed",
      summary: `${execution.summary} (failed)`,
      output: { error: message },
    });
    context.onExecutionUpdate(execution);
    throw error;
  }
}
