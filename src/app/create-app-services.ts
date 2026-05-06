/**
 * 运行时装配入口。
 * 这里把配置、文件存储、各类 repository、memory/emotion service、session store 和 chat controller 串成一套可运行服务。
 */
import { ChatController } from "#src/controller/chat-controller.js";
import { EmotionService } from "#src/controller/emotion-service.js";
import { MemoryService } from "#src/controller/memory-service.js";
import { SessionStore } from "#src/controller/session-store.js";
import { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import { EmotionStateRepository } from "#src/infra/repositories/emotion-state-repository.js";
import { MemoryAuditRepository } from "#src/infra/repositories/memory-audit-repository.js";
import { MemoryCandidateRepository } from "#src/infra/repositories/memory-candidate-repository.js";
import { MemoryRecordRepository } from "#src/infra/repositories/memory-record-repository.js";
import { MessageRepository } from "#src/infra/repositories/message-repository.js";
import { RunRepository } from "#src/infra/repositories/run-repository.js";
import { SessionRepository } from "#src/infra/repositories/session-repository.js";
import { SessionScratchpadRepository } from "#src/infra/repositories/session-scratchpad-repository.js";
import { SystemPromptRepository } from "#src/infra/repositories/system-prompt-repository.js";
import { ToolExecutionRepository } from "#src/infra/repositories/tool-execution-repository.js";
import { createRuntimeConfigService, type RuntimeConfigService } from "#src/infra/config/runtime-config-service.js";
import { FileStore } from "#src/infra/storage/file-store.js";
import { PromptLoader } from "#src/prompts/loader.js";
import { getProviders, getProvider, listProviderIds } from "#src/providers/registry.js";

export interface AppServiceBundle {
  sessionStore: SessionStore;
  controller: ChatController;
  assistantProfileRepository: AssistantProfileRepository;
  runtimeConfig: RuntimeConfigService;
  close(): void;
}

export function createAppServices(): AppServiceBundle {
  /**
   * 装配顺序基本遵循：配置 -> 存储原语 -> repository -> domain service -> store/controller。
   * 这样新人沿着依赖方向往下读，就能看到一轮对话需要哪些基础能力。
   */
  const runtimeConfig = createRuntimeConfigService();
  const config = runtimeConfig.getConfig();
  const fileStore = new FileStore(config.storagePath);
  const sessionRepository = new SessionRepository(fileStore);
  const messageRepository = new MessageRepository(fileStore);
  const runRepository = new RunRepository(fileStore);
  const toolExecutionRepository = new ToolExecutionRepository(fileStore);
  const systemPromptRepository = new SystemPromptRepository(fileStore);
  const emotionStateRepository = new EmotionStateRepository(fileStore);
  const scratchpadRepository = new SessionScratchpadRepository(fileStore);
  const candidateRepository = new MemoryCandidateRepository(fileStore);
  const memoryRecordRepository = new MemoryRecordRepository(fileStore);
  const memoryAuditRepository = new MemoryAuditRepository(fileStore);
  const assistantProfileRepository = new AssistantProfileRepository(fileStore, config.workspaceRoot);
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
    systemPromptRepository,
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
    systemPromptRepository,
    memoryService,
    emotionService,
  );

  return {
    sessionStore,
    controller,
    assistantProfileRepository,
    runtimeConfig,
    close() {},
  };
}
