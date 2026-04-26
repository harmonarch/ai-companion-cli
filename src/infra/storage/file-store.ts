import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export class FileStore {
  private readonly absoluteRootPath: string;

  constructor(rootPath: string) {
    this.absoluteRootPath = path.resolve(rootPath);
  }

  resolve(...segments: string[]) {
    const resolvedPath = path.resolve(this.absoluteRootPath, ...segments);
    const relativePath = path.relative(this.absoluteRootPath, resolvedPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Resolved path escapes storage root: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  ensureDir(...segments: string[]) {
    mkdirSync(this.resolve(...segments), { recursive: true });
  }

  writeJson(relativePath: string, value: unknown) {
    const filePath = this.resolve(relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = createTempPath(filePath);
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(tempPath, filePath);
  }

  readJson(relativePath: string): unknown | null {
    try {
      const content = readFileSync(this.resolve(relativePath), "utf8");
      return JSON.parse(content);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  appendJsonLine(relativePath: string, value: unknown) {
    const filePath = this.resolve(relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
  }

  readJsonLines(relativePath: string): unknown[] {
    try {
      const content = readFileSync(this.resolve(relativePath), "utf8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  writeJsonLines(relativePath: string, values: unknown[]) {
    const filePath = this.resolve(relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const content = values.map((value) => JSON.stringify(value)).join("\n");
    const tempPath = createTempPath(filePath);
    writeFileSync(tempPath, content ? `${content}\n` : "", "utf8");
    renameSync(tempPath, filePath);
  }

  delete(relativePath: string) {
    rmSync(this.resolve(relativePath), { force: true });
  }

  list(relativeDir: string) {
    try {
      return readdirSync(this.resolve(relativeDir), { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.posix.join(relativeDir, entry.name));
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }
}

function createTempPath(filePath: string) {
  return `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
}

function isNotFoundError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
