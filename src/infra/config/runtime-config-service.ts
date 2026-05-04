import { ConfigRepository } from "#src/infra/config/config-repository.js";
import { loadConfig, type AppConfig } from "#src/infra/config/load-config.js";

export class RuntimeConfigService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: ConfigRepository,
  ) {}

  getConfig() {
    return this.config;
  }

  getSetupState() {
    return this.config.setup;
  }

  getConfigPath() {
    return this.repository.getPath();
  }

  refresh() {
    syncConfig(this.config, loadConfig());
    return this.config;
  }

  saveModelSelection(input: { providerId: string; model: string }) {
    this.repository.saveModelSelection(input);
    return this.refresh();
  }

  saveProviderApiKey(input: { providerId: string; apiKey: string }) {
    this.repository.saveProviderApiKey(input);
    return this.refresh();
  }
}

export function createRuntimeConfigService() {
  const config = loadConfig();
  return new RuntimeConfigService(config, new ConfigRepository());
}

function syncConfig(target: AppConfig, next: AppConfig) {
  for (const key of Object.keys(target) as (keyof AppConfig)[]) {
    Reflect.deleteProperty(target, key);
  }

  Object.assign(target, next);
}
