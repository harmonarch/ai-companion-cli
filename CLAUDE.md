# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指引。

## 常用命令

- `npm run dev` —— 通过 `tsx src/cli.ts` 以开发模式运行 CLI
- `npm run build` —— 使用 `tsup` 打包 CLI，并将 prompt 模板复制到 `dist/templates/`
- `npm run start` —— 从 `dist/cli.js` 运行已构建的 CLI
- `npm run typecheck` —— 使用 `tsc --noEmit` 运行 TypeScript 类型检查

## 测试与 lint

- `package.json` 中没有 `test` 脚本。
- 仓库里没有测试运行器配置，因此当前没有受支持的单测命令。
- 仓库里没有 `lint` 脚本，也没有 lint 配置。
- `npm run typecheck` 是目前唯一内置的校验命令。

## 事实来源

仓库中的部分文档描述的是规划中的架构，不一定等同于当前实现。遇到 `README.md`、`AGENTS.md` 或更早的设计文档与源码冲突时，以源码为准。

当前已经确认的 README 漂移点：

- `README.md` 提到了多个规划中的 provider，但运行时注册表当前只接入了 `deepseek`。
- `README.md` 提到了更宽的命令面，实际支持的 slash commands 以 `src/controller/slash-commands.ts` 和 `src/app/handle-app-command.ts` 为准。

## 运行时架构

这是一个以终端为主的聊天应用，核心技术栈是 Ink、LangGraph，以及基于文件的持久化层。

主要运行路径如下：

1. `src/cli.ts` 用 `cac` 解析 CLI 参数，检测是否为交互式 TTY，并在交互式终端里以 `alternateScreen` 渲染 Ink 应用。
2. `src/app.tsx` 持有顶层 UI 状态，解析初始会话，渲染 overlay 与聊天面板，并把输入提交流转给 controller。
3. `src/app/create-app-services.ts` 负责组装配置、文件仓储、memory 与 emotion 服务、assistant profile、session store 和 chat controller。
4. `src/app/use-submit-handler.ts` 负责把输入分流到 slash command 处理或聊天回合，并将流式更新写回当前会话快照。
5. `src/controller/chat-controller.ts` 编排完整的一轮对话：持久化用户消息、创建 assistant 占位消息和 run 记录、构建运行时工具、裁剪历史、流式消费 graph 事件、持久化工具执行、更新 memory 与 emotion 状态，并收尾 assistant 消息。
6. `src/graph/chat-graph.ts` 构建 LangGraph 循环（`agent -> tools -> agent`），把持久化消息转换成 LangChain 消息对象，并把运行时输出转换成 controller 可消费的规范事件流。
7. `src/tools/index.ts` 定义内置工具面、持久化每次工具执行、为中风险工具请求确认，并把工具结果 part 回灌到 assistant 消息流。
8. `src/controller/session-store.ts` 从持久化的 sessions、messages、tool executions、memory records 和 emotion state 重建可供 UI 渲染的会话快照。

## 建议先读的文件

- `src/cli.ts` —— CLI 入口与 Ink 启动逻辑
- `src/app.tsx` —— 顶层 UI 状态与面板渲染
- `src/app/create-app-services.ts` —— 运行时装配入口
- `src/app/use-submit-handler.ts` —— 命令与聊天输入分流
- `src/controller/chat-controller.ts` —— 单轮聊天编排
- `src/graph/chat-graph.ts` —— LangGraph 循环与事件流
- `src/tools/index.ts` —— 工具注册、持久化与确认流程
- `src/controller/session-store.ts` —— 基于仓储的会话重建
- `src/infra/config/load-config.ts` —— 配置优先级与环境变量支持
- `src/infra/storage/file-store.ts` —— 存储原语与原子写入

## 当前实现细节

### Providers

- Provider 抽象定义位于 `src/providers/types.ts`。
- 运行时注册表 `src/providers/registry.ts` 当前只注册了 `deepseek`。
- `src/providers/deepseek-provider.ts` 负责创建 provider runtime。
- `src/providers/langchain-runtime.ts` 把 LangChain 模型行为适配到仓库内部的 runtime 接口。
- `src/providers/capability-matrix.ts` 保存运行时使用的静态能力数据。

### Slash commands

支持的 slash commands 定义在 `src/controller/slash-commands.ts`，执行逻辑在 `src/app/handle-app-command.ts`。

当前命令如下：

- `/new`
- `/sessions`
- `/switch <n|id>`
- `/memory`
- `/emotion`
- `/profile`
- `/reset`
- `/help`
- `/exit`

### 内置工具

当前运行时工具注册在 `src/tools/index.ts`：

- `read_file`
- `list_dir`
- `search_text`
- `http_fetch`
- `local_time`

工具层需要注意的行为：

- 每次工具执行都会被持久化，并以内联形式显示在聊天 UI 中。
- 中风险工具需要用户显式确认。
- 工作区内工具访问受限于当前 workspace root。
- `http_fetch` 的附加网络限制定义在对应工具实现中。

### 存储模型

当前持久化是文件存储，不是 SQLite。

`src/infra/storage/file-store.ts` 提供核心存储能力：

- 以配置的存储根目录为边界做路径解析
- 通过临时文件替换实现 JSON 原子写入
- 提供 JSONL 记录的追加与读取辅助方法

仓储数据按目录存放在配置的存储根目录下，主要包括：

- `sessions/`
- `messages/`
- `runs/`
- `tool-executions/`

UI 中展示的 session snapshot 依赖这些仓储的协同读取，以及 `src/controller/session-store.ts` 中的 memory 和 emotion 状态装配。

### 配置加载

配置加载逻辑位于 `src/infra/config/load-config.ts`。

优先级如下：

1. 环境变量
2. TOML 配置文件：`AI_COMPANION_CONFIG_PATH` 指定路径，或 `~/.config/ai-companion/config.toml`
3. 硬编码默认值

重要运行时配置包括：

- `AI_COMPANION_PROVIDER`
- `AI_COMPANION_MODEL`
- `AI_COMPANION_STORAGE_PATH`
- `AI_COMPANION_HISTORY_MAX_MESSAGES`
- `AI_COMPANION_MEMORY_ENABLED`
- `AI_COMPANION_MEMORY_USER_ID`
- `AI_COMPANION_MEMORY_AUTO_WRITE_LOW_RISK`

### Prompt 加载与构建产物

- Prompt 加载逻辑在 `src/prompts/loader.ts`。
- 构建产物依赖 `dist/templates/` 下的 prompt 模板。
- 修改构建流程时，必须保留 `package.json` 里的模板复制步骤，否则构建后的 CLI 无法加载内置 prompt。

### Memory、emotion 与 assistant profile

这些能力已经处于当前运行时中：

- `src/app/create-app-services.ts` 会把 `MemoryService` 和 `EmotionService` 装配进应用。
- `src/controller/chat-controller.ts` 会在每轮对话中更新 scratchpad、emotion transition，以及完成回合后的 memory 处理。
- `src/controller/session-store.ts` 会把 memories、解析后的 memory evidence 和 emotion state 一起装入会话快照。
- `src/infra/config/load-config.ts` 会从 workspace 状态中读取 assistant profile，`/profile` 命令通过 `src/app/handle-app-command.ts` 使用的 repository 修改这份 profile。

## 后续修改时要注意

- 在相信 README 里的架构描述或 provider 列表之前，先核对源码现状。
- 增加 provider 支持时，通常要同时检查配置加载、provider registry、provider 实现、capability 数据和 prompt 解析。
- 修改持久化方案时，要一起检查所有 repository 和 `src/controller/session-store.ts`，因为 UI 快照依赖多类记录的联合重建。
- 修改工具行为时，要同时检查工具定义本身以及 `src/tools/index.ts`，后者负责执行持久化和确认流程。
