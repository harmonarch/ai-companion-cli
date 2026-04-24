import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist"]);

export const searchTextToolDefinition = {
  name: "search_text",
  description: "Search for a text query within workspace files.",
  riskLevel: "low" as const,
  schema: z.object({
    query: z.string().min(1).describe("Text to search for."),
    path: z.string().default(".").describe("Path relative to the workspace root to start searching from."),
  }),
  summarize(input: { query: string; path: string }) {
    return `Search text "${input.query}" in ${input.path}`;
  },
  async execute(input: { query: string; path: string }, context: { workspaceRoot: string }) {
    const { rootPath, targetPath } = await resolveWorkspacePath(context.workspaceRoot, input.path);
    const files: string[] = [];
    const targetStats = await lstat(targetPath);
    if (targetStats.isFile()) {
      files.push(targetPath);
    } else {
      await collectFiles(rootPath, targetPath, files, 200);
    }

    const matches: Array<{ path: string; snippet: string }> = [];
    for (const filePath of files) {
      if (matches.length >= 50) {
        break;
      }

      const content = await readFile(filePath, "utf8").catch(() => null);
      if (!content || !content.includes(input.query)) {
        continue;
      }

      const snippet = content
        .split(/\r?\n/)
        .filter((line) => line.includes(input.query))
        .slice(0, 3)
        .join("\n");

      matches.push({
        path: path.relative(rootPath, filePath) || path.basename(filePath),
        snippet: snippet.slice(0, 500),
      });
    }

    return {
      query: input.query,
      searchedFiles: files.length,
      matches,
    };
  },
};

async function collectFiles(rootPath: string, currentPath: string, output: string[], maxFiles: number) {
  if (output.length >= maxFiles) {
    return;
  }

  const statEntries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
  for (const entry of statEntries) {
    if (output.length >= maxFiles || entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const realEntryPath = await realpath(entryPath).catch(() => null);
      if (!realEntryPath || (realEntryPath !== rootPath && !realEntryPath.startsWith(`${rootPath}${path.sep}`))) {
        continue;
      }

      await collectFiles(rootPath, realEntryPath, output, maxFiles);
      continue;
    }

    if (entry.isFile()) {
      output.push(entryPath);
    }
  }
}

async function resolveWorkspacePath(workspaceRoot: string, requestedPath: string) {
  const rootPath = await realpath(workspaceRoot);
  const candidatePath = path.resolve(rootPath, requestedPath);
  const targetPath = await realpath(candidatePath);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("Path escapes the workspace root.");
  }

  return { rootPath, targetPath };
}
