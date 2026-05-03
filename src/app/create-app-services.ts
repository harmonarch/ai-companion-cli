import { ChatController } from "../controller/chat-controller.js";
import { EmotionService } from "../controller/emotion-service.js";
import { MemoryService } from "../controller/memory-service.js";
import { SessionStore } from "../controller/session-store.js";
import { loadConfig } from "../infra/config/load-config.js";
import { AssistantProfileRepository } from "../infra/repositories/assistant-profile-repository.js";
import { EmotionStateRepository } from "../infra/repositories/emotion-state-repository.js";
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
import { getProviders, getProvider, listProviderIds } from "../providers/registry.js";

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
