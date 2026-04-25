import React from "react";
import { Text, useWindowSize } from "ink";
import pc from "picocolors";

export function HorizontalDivider() {
  const { columns } = useWindowSize();
  const width = Math.max(1, columns || 1);

  return <Text>{pc.gray("─".repeat(width))}</Text>;
}
