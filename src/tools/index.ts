/**
 * 运行时工具注册层。
 * 它把每个工具定义包装成 LangChain tool，并统一负责执行记录持久化、风险确认和 tool result 回灌消息流。
 */
import { tool } from "@langchain/core/tools";
import type { ZodTypeAny, infer as Infer } from "zod";
import type { ToolExecutionRepository } from "#src/infra/repositories/tool-execution-repository.js";
import type { ToolCallMessageContentPart, ToolResultMessageContentPart } from "#src/types/chat.js";
import type { ToolConfirmationRequest, ToolDescriptor, ToolExecutionRecord } from "#src/types/tool.js";
import { httpFetchToolDefinition } from "#src/tools/http-fetch.js";
import { listDirToolDefinition } from "#src/tools/list-dir.js";
import { readFileToolDefinition } from "#src/tools/read-file.js";
import { searchTextToolDefinition } from "#src/tools/search-text.js";
import { localTimeToolDefinition } from "#src/tools/local-time.js";

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
  onToolResult(part: ToolResultMessageContentPart): void;
  requestConfirmation(request: ToolConfirmationRequest): Promise<boolean>;
  resolveCall(toolName: string, input: Record<string, unknown>): ToolCallMessageContentPart;
}

const toolDefinitions: readonly ToolDefinition[] = [
  readFileToolDefinition,
  listDirToolDefinition,
  searchTextToolDefinition,
  httpFetchToolDefinition,
  localTimeToolDefinition,
];

export function createRuntimeTools(context: ToolRuntimeContext) {
  /**
   * 每个工具定义在这里被适配成模型可调用的 runtime tool。
   * 具体工具逻辑分散在各文件里，但执行生命周期统一走 runTool。
   */
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
  /**
   * runTool 统一处理一次工具调用的完整生命周期：分配 callId、创建执行记录、可选确认、执行、回写结果。
   * controller 只需要消费执行更新和 tool result，不必关心每个工具自己的细节。
   */
  const toolCall = context.resolveCall(definition.name, input);
  const initialStatus = definition.riskLevel === "medium" ? "pending" : "running";
  let execution = context.toolExecutionRepository.create({
    sessionId: context.sessionId,
    runId: context.runId,
    messageId: context.messageId,
    callId: toolCall.callId,
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
      const deniedOutput = { denied: true, message: "User denied this tool execution." };
      execution = context.toolExecutionRepository.update(execution.id, {
        status: "denied",
        summary: `${execution.summary} (denied)`,
        output: deniedOutput,
      });
      context.onExecutionUpdate(execution);
      context.onToolResult({
        type: "tool_result",
        callId: toolCall.callId,
        toolName: definition.name,
        output: deniedOutput,
        isError: true,
      });
      return JSON.stringify(deniedOutput, null, 2);
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
    context.onToolResult({
      type: "tool_result",
      callId: toolCall.callId,
      toolName: definition.name,
      output,
    });
    return JSON.stringify(output, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = { error: message };
    execution = context.toolExecutionRepository.update(execution.id, {
      status: "failed",
      summary: `${execution.summary} (failed)`,
      output,
    });
    context.onExecutionUpdate(execution);
    context.onToolResult({
      type: "tool_result",
      callId: toolCall.callId,
      toolName: definition.name,
      output,
      isError: true,
    });
    throw error;
  }
}
