import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assistantProfileRelativePath,
  assistantProfileSchema,
  type AssistantProfile,
  type AssistantProfileField,
} from "#src/types/assistant-profile.js";

export class AssistantProfileRepository {
  private readonly filePath: string;

  constructor(private readonly workspaceRoot: string) {
    this.filePath = path.join(workspaceRoot, assistantProfileRelativePath);
  }

  get() {
    if (!existsSync(this.filePath)) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
      return assistantProfileSchema.parse(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse assistant profile ${this.filePath}: ${message}`);
    }
  }

  setField(field: AssistantProfileField, value: string) {
    const current = this.get();
    const nextProfile: AssistantProfile = assistantProfileSchema.parse({
      version: 1,
      ...current,
      [field]: value.trim(),
      meta: {
        updatedAt: new Date().toISOString(),
        updatedBy: "user",
      },
    });

    writeJsonAtomically(this.filePath, nextProfile);
    return nextProfile;
  }

  clear() {
    rmSync(this.filePath, { force: true });
  }
}

function writeJsonAtomically(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
}
