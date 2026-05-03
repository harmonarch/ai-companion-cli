import { ChatController } from "#src/controller/chat-controller.js";
import { EmotionService } from "#src/controller/emotion-service.js";
import { MemoryService } from "#src/controller/memory-service.js";
import { SessionStore } from "#src/controller/session-store.js";
import { loadConfig } from "#src/infra/config/load-config.js";
import { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import { EmotionStateRepository } from "#src/infra/repositories/emotion-state-repository.js";
import { MemoryAuditRepository } from "#src/infra/repositories/memory-audit-repository.js";
import { MemoryCandidateRepository } from "#src/infra/repositories/memory-candidate-repository.js";
import { MemoryRecordRepository } from "#src/infra/repositories/memory-record-repository.js";
import { MessageRepository } from "#src/infra/repositories/message-repository.js";
import { RunRepository } from "#src/infra/repositories/run-repository.js";
import { SessionRepository } from "#src/infra/repositories/session-repository.js";
import { SessionScratchpadRepository } from "#src/infra/repositories/session-scratchpad-repository.js";
import { ToolExecutionRepository } from "#src/infra/repositories/tool-execution-repository.js";
import { FileStore } from "#src/infra/storage/file-store.js";
import { PromptLoader } from "#src/prompts/loader.js";
import { getProviders, getProvider, listProviderIds } from "#src/providers/registry.js";

export interface AppServiceBundle {
  sessionStore: SessionStore;
  controller: ChatController;
  assistantProfileRepository: AssistantProfileRepository;
  close(): void;
}

export function createAppServices(): AppServiceBundle {
  const config = loadConfig();
  const fileStore = new FileStore(config.storagePath);
  const sessionRepository = new SessionRepository(fileStore);
  const messageRepository = new MessageRepository(fileStore);
  const runRepository = new RunRepository(fileStore);
  const toolExecutionRepository = new ToolExecutionRepository(fileStore);
  const emotionStateRepository = new EmotionStateRepository(fileStore);
  const scratchpadRepository = new SessionScratchpadRepository(fileStore);
  const candidateRepository = new MemoryCandidateRepository(fileStore);
  const memoryRecordRepository = new MemoryRecordRepository(fileStore);
  const memoryAuditRepository = new MemoryAuditRepository(fileStore);
  const assistantProfileRepository = new AssistantProfileRepository(config.workspaceRoot);
  const promptLoader = new PromptLoader(config, assistantProfileRepository);
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
  const emotionService = new EmotionService(emotionStateRepository);
  const defaultProvider = getProvider(config.defaultProvider);
  if (!defaultProvider) {
    throw new Error(`Unsupported default provider: ${config.defaultProvider}. Available providers: ${listProviderIds().join(", ")}`);
  }

  const sessionStore = new SessionStore(
    sessionRepository,
    messageRepository,
    runRepository,
    toolExecutionRepository,
    memoryService,
    emotionService,
    assistantProfileRepository,
    {
      provider: config.defaultProvider,
      model: config.defaultModel || defaultProvider.defaultModel,
    },
  );
  const controller = new ChatController(
    config,
    getProviders(),
    promptLoader,
    sessionStore,
    messageRepository,
    runRepository,
    toolExecutionRepository,
    memoryService,
    emotionService,
  );

  return {
    sessionStore,
    controller,
    assistantProfileRepository,
    close() {},
  };
}
