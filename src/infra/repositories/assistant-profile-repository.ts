import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { FileStore } from "#src/infra/storage/file-store.js";
import {
  assistantProfileRelativePath,
  assistantProfileSchema,
  legacyAssistantProfileRelativePath,
  type AssistantProfile,
  type AssistantProfileField,
} from "#src/types/assistant-profile.js";

export class AssistantProfileRepository {
  private readonly filePath: string;
  private readonly legacyFilePath: string;

  constructor(
    private readonly fileStore: FileStore,
    workspaceRoot: string,
  ) {
    this.filePath = this.fileStore.resolve(assistantProfileRelativePath);
    this.legacyFilePath = path.join(workspaceRoot, legacyAssistantProfileRelativePath);
  }

  get() {
    const currentProfile = this.readCurrentProfile();
    if (currentProfile) {
      return currentProfile;
    }

    return this.migrateLegacyProfile();
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

    this.fileStore.writeJson(assistantProfileRelativePath, nextProfile);
    return nextProfile;
  }

  clear() {
    this.fileStore.delete(assistantProfileRelativePath);
    rmSync(this.legacyFilePath, { force: true });
  }

  private readCurrentProfile() {
    const parsed = this.fileStore.readJson(assistantProfileRelativePath);
    if (parsed === null) {
      return undefined;
    }

    try {
      return assistantProfileSchema.parse(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse assistant profile ${this.filePath}: ${message}`);
    }
  }

  private migrateLegacyProfile() {
    if (!existsSync(this.legacyFilePath)) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.legacyFilePath, "utf8"));
      const profile = assistantProfileSchema.parse(parsed);
      this.fileStore.writeJson(assistantProfileRelativePath, profile);
      rmSync(this.legacyFilePath, { force: true });
      return profile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse assistant profile ${this.legacyFilePath}: ${message}`);
    }
  }
}
