export type SlashCommand =
  | { type: "new" }
  | { type: "sessions" }
  | { type: "switch"; target?: string }
  | { type: "memory"; target?: string }
  | { type: "reset"; target?: string }
  | { type: "help" }
  | { type: "exit" }
  | { type: "unknown"; name: string };

export function parseSlashCommand(input: string): SlashCommand | null {
  if (!input.startsWith("/")) {
    return null;
  }

  const [rawName = "", ...rest] = input.trim().split(/\s+/);
  if (!rawName) {
    return null;
  }

  const name = rawName.slice(1).toLowerCase();
  const target = rest.join(" ").trim();

  switch (name) {
    case "new":
      return { type: "new" };
    case "sessions":
      return { type: "sessions" };
    case "switch":
      return { type: "switch", target: target || undefined };
    case "memory":
      return { type: "memory", target: target || undefined };
    case "reset":
      return { type: "reset", target: target || undefined };
    case "help":
      return { type: "help" };
    case "exit":
      return { type: "exit" };
    default:
      return { type: "unknown", name };
  }
}
