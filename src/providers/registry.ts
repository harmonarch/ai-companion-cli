import { deepseekProvider } from "#src/providers/deepseek-provider.js";
import type { ProviderDefinition, ProviderId } from "#src/providers/types.js";

export const providerRegistry: Record<ProviderId, ProviderDefinition> = {
  [deepseekProvider.id]: deepseekProvider,
};

export interface ProviderCatalogEntry {
  providerId: ProviderId;
  defaultModel: string;
  models: string[];
}

export function getProviders() {
  return providerRegistry;
}

export function getProvider(providerId: ProviderId) {
  return providerRegistry[providerId];
}

export function listProviderIds() {
  return Object.keys(providerRegistry);
}

export function listProviderCatalog(): ProviderCatalogEntry[] {
  return Object.values(providerRegistry).map((provider) => ({
    providerId: provider.id,
    defaultModel: provider.defaultModel,
    models: provider.listModels(),
  }));
}
