import { ChatController } from "../controller/chat-controller.js";
import { MemoryService } from "../controller/memory-service.js";
import { SessionStore } from "../controller/session-store.js";
import { loadConfig } from "../infra/config/load-config.js";
import { MemoryAuditRepository } from "../infra/repositories/memory-audit-repository.js";
import { MemoryCandidateRepository } from "../infra/repositories/memory-candidate-repository.js";
import { MemoryRecordRepository } from "../infra/repositories/memory-record-repository.js";
import { MessageRepository } from "../infra/repositories/message-repository.js";
import { RunRepository } from "../infra/repositories/run-repository.js";
import { SessionRepository } from "../infra/repositories/session-repository.js";
import { SessionScratchpadRepository } from "../infra/repositories/session-scratchpad-repository.js";
import { ToolExecutionRepository } from "../infra/repositories/tool-execution-repository.js";
import { FileStore } from "../infra/storage/file-store.js";
import { PromptLoader } from "../prompts/loader.js";
import { deepseekProvider } from "../providers/deepseek-provider.js";

export interface AppServiceBundle {
  sessionStore: SessionStore;
  controller: ChatController;
  close(): void;
}

export function createAppServices(): AppServiceBundle {
  const config = loadConfig();
  const fileStore = new FileStore(config.storagePath);
  const sessionRepository = new SessionRepository(fileStore);
  const messageRepository = new MessageRepository(fileStore);
  const runRepository = new RunRepository(fileStore);
  const toolExecutionRepository = new ToolExecutionRepository(fileStore);
  const scratchpadRepository = new SessionScratchpadRepository(fileStore);
  const candidateRepository = new MemoryCandidateRepository(fileStore);
  const memoryRecordRepository = new MemoryRecordRepository(fileStore);
  const memoryAuditRepository = new MemoryAuditRepository(fileStore);
  const promptLoader = new PromptLoader(config);
  const memoryService = new MemoryService(
    {
      enabled: config.memory.enabled,
      userId: config.memory.userId,
      autoWriteLowRisk: config.memory.autoWriteLowRisk,
      workspaceScope: config.workspaceRoot,
    },
    promptLoader,
    scratchpadRepository,
    candidateRepository,
    memoryRecordRepository,
    memoryAuditRepository,
  );
  const sessionStore = new SessionStore(
    sessionRepository,
    messageRepository,
    runRepository,
    toolExecutionRepository,
    memoryService,
    {
      provider: config.defaultProvider,
      model: config.defaultModel,
    },
  );
  const providers = {
    deepseek: deepseekProvider,
  };
  const controller = new ChatController(
    config,
    providers,
    promptLoader,
    sessionStore,
    messageRepository,
    runRepository,
    toolExecutionRepository,
    memoryService,
  );

  return {
    sessionStore,
    controller,
    close() {},
  };
}
