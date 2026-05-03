import { deepseekProvider } from "#src/providers/deepseek-provider.js";
import type { ProviderDefinition, ProviderId } from "#src/providers/types.js";

export const providerRegistry: Record<ProviderId, ProviderDefinition> = {
  [deepseekProvider.id]: deepseekProvider,
};

export function getProviders() {
  return providerRegistry;
}

export function getProvider(providerId: ProviderId) {
  return providerRegistry[providerId];
}

export function listProviderIds() {
  return Object.keys(providerRegistry);
}
