import { ChatController } from "../controller/chat-controller.js";
import { SessionStore } from "../controller/session-store.js";
import { loadConfig } from "../infra/config/load-config.js";
import { MessageRepository } from "../infra/repositories/message-repository.js";
import { RunRepository } from "../infra/repositories/run-repository.js";
import { SessionRepository } from "../infra/repositories/session-repository.js";
import { ToolExecutionRepository } from "../infra/repositories/tool-execution-repository.js";
import { openDatabase } from "../infra/storage/db.js";
import { runMigrations } from "../infra/storage/migrate.js";
import { PromptLoader } from "../prompts/loader.js";
import { deepseekProvider } from "../providers/deepseek-provider.js";

export interface AppServiceBundle {
  sessionStore: SessionStore;
  controller: ChatController;
  close(): void;
}

export function createAppServices(): AppServiceBundle {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);

  try {
    runMigrations(db);
    const sessionRepository = new SessionRepository(db);
    const messageRepository = new MessageRepository(db);
    const runRepository = new RunRepository(db);
    const toolExecutionRepository = new ToolExecutionRepository(db);
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
      close() {
        db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
