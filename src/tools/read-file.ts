import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const readFileToolDefinition = {
  name: "read_file",
  description: "Read a UTF-8 text file from the current workspace.",
  riskLevel: "low" as const,
  schema: z.object({
    path: z.string().min(1).describe("Path relative to the workspace root."),
  }),
  summarize(input: { path: string }) {
    return `Read file ${input.path}`;
  },
  async execute(input: { path: string }, context: { workspaceRoot: string }) {
    const { rootPath, targetPath } = await resolveWorkspacePath(context.workspaceRoot, input.path);
    const content = await readFile(targetPath, "utf8");
    return {
      path: path.relative(rootPath, targetPath) || path.basename(targetPath),
      content: content.slice(0, 20_000),
      truncated: content.length > 20_000,
    };
  },
};

async function resolveWorkspacePath(workspaceRoot: string, requestedPath: string) {
  const rootPath = await realpath(workspaceRoot);
  const candidatePath = path.resolve(rootPath, requestedPath);
  const targetPath = await realpath(candidatePath);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("Path escapes the workspace root.");
  }

  return { rootPath, targetPath };
}
