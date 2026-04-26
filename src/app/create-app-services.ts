import { ChatController } from "../controller/chat-controller.js";
import { SessionStore } from "../controller/session-store.js";
import { loadConfig } from "../infra/config/load-config.js";
import { MessageRepository } from "../infra/repositories/message-repository.js";
import { RunRepository } from "../infra/repositories/run-repository.js";
import { SessionRepository } from "../infra/repositories/session-repository.js";
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
  const sessionStore = new SessionStore(
    sessionRepository,
    messageRepository,
    runRepository,
    toolExecutionRepository,
    {
      provider: config.defaultProvider,
      model: config.defaultModel,
    },
  );
  const providers = {
    deepseek: deepseekProvider,
  };
  const promptLoader = new PromptLoader(config);
  const controller = new ChatController(
    config,
    providers,
    promptLoader,
    sessionStore,
    messageRepository,
    runRepository,
    toolExecutionRepository,
  );

  return {
    sessionStore,
    controller,
    close() {},
  };
}
