/**
 * slash command 协议定义与解析工具。
 * 这里维护支持的命令集合、自动补全所需信息，以及从用户输入到命令对象的转换。
 */
export type SlashCommand =
  | { type: "new" }
  | { type: "sessions" }
  | { type: "switch"; target?: string }
  | { type: "memory"; target?: string }
  | { type: "emotion"; target?: string }
  | { type: "profile"; target?: string }
  | { type: "model"; target?: string }
  | { type: "reset"; target?: string }
  | { type: "help" }
  | { type: "exit" }
  | { type: "unknown"; name: string };

type KnownSlashCommand = Exclude<SlashCommand, { type: "unknown" }>;

export interface SlashCommandSpec {
  name: KnownSlashCommand["type"];
  usage: string;
  description: string;
  build(target?: string): KnownSlashCommand;
}

interface SlashCommandAnalysis {
  commandTokenEnd: number;
  commonPrefix: string;
  typedName: string;
  uniqueMatch: SlashCommandSpec | null;
}

export const SLASH_COMMAND_SPECS = [
  {
    name: "new",
    usage: "/new",
    description: "create a new session",
    build: () => ({ type: "new" }),
  },
  {
    name: "sessions",
    usage: "/sessions",
    description: "open the session list",
    build: () => ({ type: "sessions" }),
  },
  {
    name: "switch",
    usage: "/switch <n|id>",
    description: "switch to a session",
    build: (target) => ({ type: "switch", target }),
  },
  {
    name: "memory",
    usage: "/memory",
    description: "choose a session, then view that session's memories",
    build: (target) => ({ type: "memory", target }),
  },
  {
    name: "emotion",
    usage: "/emotion | /emotion debug | /emotion reset",
    description: "view, inspect, or reset the current session emotion state",
    build: (target) => ({ type: "emotion", target }),
  },
  {
    name: "profile",
    usage: "/profile | /profile set <name|role|selfReference|persona> <value> | /profile clear [confirm|cancel]",
    description: "view the assistant profile, set name/role/selfReference/persona, or clear it",
    build: (target) => ({ type: "profile", target }),
  },
  {
    name: "model",
    usage: "/model",
    description: "choose the active model and enter its API key if needed",
    build: (target) => ({ type: "model", target }),
  },
  {
    name: "reset",
    usage: "/reset",
    description: "stage a full reset of chat history, memory, and assistant profile",
    build: (target) => ({ type: "reset", target }),
  },
  {
    name: "help",
    usage: "/help",
    description: "open this help panel",
    build: () => ({ type: "help" }),
  },
  {
    name: "exit",
    usage: "/exit",
    description: "exit the app and hide the current screen",
    build: () => ({ type: "exit" }),
  },
] as const satisfies readonly SlashCommandSpec[];

const SLASH_COMMAND_SPEC_MAP = new Map<string, SlashCommandSpec>(
  SLASH_COMMAND_SPECS.map((command) => [command.name, command]),
);

export function getSlashCommandSpecs(): readonly SlashCommandSpec[] {
  return SLASH_COMMAND_SPECS;
}

export function getSlashCommandPreviewSuffix(input: string, cursorIndex: number): string | null {
  const analysis = analyzeSlashCommandInput(input, cursorIndex);
  if (!analysis || !analysis.uniqueMatch || cursorIndex !== analysis.commandTokenEnd) {
    return null;
  }

  const previewSuffix = analysis.uniqueMatch.name.slice(analysis.typedName.length);
  return previewSuffix || null;
}

export function completeSlashCommand(input: string, cursorIndex: number) {
  const analysis = analyzeSlashCommandInput(input, cursorIndex);
  if (!analysis) {
    return null;
  }

  const completedName = analysis.uniqueMatch?.name
    ?? (analysis.commonPrefix.length > analysis.typedName.length ? analysis.commonPrefix : null);

  if (!completedName || completedName === analysis.typedName) {
    return null;
  }

  const characters = Array.from(input);
  const nextValue = `/${completedName}${characters.slice(analysis.commandTokenEnd).join("")}`;
  return {
    nextCursorIndex: Array.from(`/${completedName}`).length,
    nextValue,
  };
}

export function parseSlashCommand(input: string): SlashCommand | null {
  /**
   * 解析阶段只负责识别命令名和原始 target，不在这里做业务校验。
   * 具体命令怎么执行，交给后面的应用层和命令执行层处理。
   */
  if (!input.startsWith("/")) {
    return null;
  }

  const trimmedInput = input.trim();
  const commandMatch = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(trimmedInput);
  if (!commandMatch) {
    return null;
  }

  const [, rawName = "", rawTarget] = commandMatch;
  const name = rawName.toLowerCase();
  if (!name) {
    return null;
  }

  const target = rawTarget?.trim() || undefined;
  const spec = SLASH_COMMAND_SPEC_MAP.get(name);
  if (!spec) {
    return { type: "unknown", name };
  }

  return spec.build(target);
}

function analyzeSlashCommandInput(input: string, cursorIndex: number): SlashCommandAnalysis | null {
  const characters = Array.from(input);
  if (characters[0] !== "/") {
    return null;
  }

  const commandTokenEnd = findCommandTokenEnd(characters);
  const typedName = characters.slice(1, commandTokenEnd).join("").toLowerCase();
  if (!typedName || cursorIndex < 1 || cursorIndex > commandTokenEnd) {
    return null;
  }

  const matches = SLASH_COMMAND_SPECS.filter((command) => command.name.startsWith(typedName));
  return {
    commandTokenEnd,
    commonPrefix: getLongestCommonPrefix(matches.map((command) => command.name)),
    typedName,
    uniqueMatch: matches.length === 1 ? (matches[0] ?? null) : null,
  };
}

function findCommandTokenEnd(characters: string[]) {
  const whitespaceIndex = characters.findIndex((character, index) => index > 0 && /\s/.test(character));
  return whitespaceIndex === -1 ? characters.length : whitespaceIndex;
}

function getLongestCommonPrefix(values: readonly string[]) {
  const [first = ""] = values;
  if (!first) {
    return "";
  }

  let prefix = first;
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }

    if (!prefix) {
      break;
    }
  }

  return prefix;
}
