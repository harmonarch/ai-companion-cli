import React from "react";
import { Box, Text } from "ink";
import pc from "picocolors";
import type { ProviderCatalogEntry } from "#src/providers/registry.js";

interface ModelOption {
  providerId: string;
  model: string;
}

export function ModelList({
  options,
  selectedIndex,
  currentProvider,
  currentModel,
}: {
  options: ModelOption[];
  selectedIndex: number;
  currentProvider?: string;
  currentModel?: string;
}) {
  return (
    <Box flexDirection="column">
      <Text>{pc.gray("model")}</Text>
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const isCurrent = option.providerId === currentProvider && option.model === currentModel;
        return (
          <Text key={`${option.providerId}:${option.model}`}>
            {selected ? pc.cyan(">") : " "} {selected ? pc.whiteBright(`${option.providerId} / ${option.model}`) : `${option.providerId} / ${option.model}`}
            {isCurrent ? pc.gray(" · current") : ""}
          </Text>
        );
      })}
      <Text>{pc.gray("↑ ↓ move · Enter select · Esc close")}</Text>
    </Box>
  );
}

export function flattenModelCatalog(entries: ProviderCatalogEntry[]): ModelOption[] {
  return entries.flatMap((entry) => entry.models.map((model) => ({
    providerId: entry.providerId,
    model,
  })));
}
