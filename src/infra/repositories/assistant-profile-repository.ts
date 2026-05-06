import { FileStore } from "#src/infra/storage/file-store.js";
import {
  assistantProfileRelativePath,
  assistantProfileSchema,
  type AssistantProfile,
  type AssistantProfileField,
} from "#src/types/assistant-profile.js";

export class AssistantProfileRepository {
  private readonly filePath: string;

  constructor(
    private readonly fileStore: FileStore,
    _workspaceRoot: string,
  ) {
    this.filePath = this.fileStore.resolve(assistantProfileRelativePath);
  }

  get() {
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
  }
}
