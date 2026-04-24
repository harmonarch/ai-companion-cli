import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const listDirToolDefinition = {
  name: "list_dir",
  description: "List directory entries inside the current workspace.",
  riskLevel: "low" as const,
  schema: z.object({
    path: z.string().default(".").describe("Directory path relative to the workspace root."),
  }),
  summarize(input: { path: string }) {
    return `List directory ${input.path}`;
  },
  async execute(input: { path: string }, context: { workspaceRoot: string }) {
    const { rootPath, targetPath } = await resolveWorkspacePath(context.workspaceRoot, input.path);
    const entries = await readdir(targetPath, { withFileTypes: true });
    return {
      path: path.relative(rootPath, targetPath) || ".",
      entries: entries
        .filter((entry) => !entry.isSymbolicLink())
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, 200)
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
        })),
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
