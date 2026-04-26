# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指引。

## 开发命令

- `npm run dev` —— 通过 `tsx src/cli.ts` 以开发模式运行 CLI
- `npm run build` —— 使用 `tsup` 打包 CLI，并将 prompt 模板复制到 `dist/templates/`
- `npm run start` —— 从 `dist/cli.js` 运行已构建的 CLI
- `npm run typecheck` —— 运行 TypeScript 类型检查

## 测试与 lint

- 当前仓库没有 `test` 脚本，也没有测试配置。
- 当前仓库没有 `lint` 脚本，也没有 lint 配置。
- 目前唯一内置的校验命令是 `npm run typecheck`。

## 运行时概览

这个项目是一个以终端为核心的 AI 聊天应用，技术栈是 Ink、LangGraph，以及基于文件的本地持久化层。

运行流程如下：

1. `src/cli.ts` 使用 `cac` 解析 CLI 参数，并渲染 Ink 应用。
2. `src/app.tsx` 持有 UI 状态、会话选择、确认队列和提交流程。
3. `src/app/create-app-services.ts` 负责组装配置、prompt 加载、repositories、session store 和 chat controller。
4. `src/controller/chat-controller.ts` 负责持久化用户消息、创建空的 assistant 消息、创建 run 记录、构建 LangGraph 运行时、流式处理模型输出、执行工具，并更新最终 run 状态。
5. `src/graph/chat-graph.ts` 使用简单的 `agent -> tools -> agent` 图实现核心 agent / tools 循环。
6. `src/tools/index.ts` 中创建工具调用，将执行记录持久化，并以内联方式展示到聊天 UI。
7. `src/controller/session-store.ts` 通过持久化的 session / message / tool 数据重建会话快照。

## 当前源码与旧文档的关系

仓库中的部分文档描述的是更早期的设计。以源码为准，不要以旧架构说明为准。

当前实现情况：

- 持久化通过 `src/infra/storage/file-store.ts` 实现，使用的是文件存储，不是 SQLite。
- session、message、run、tool execution 数据以 JSON / JSONL 形式存储在配置的存储目录下。
- 当前只实现了 `deepseek` provider。
- 当前支持的 slash commands 是 `/new`、`/sessions`、`/switch`、`/help`、`/exit`。

## 关键模块

- `src/cli.ts` —— CLI 入口
- `src/app.tsx` —— 顶层 Ink 应用和 UI 状态
- `src/app/` —— 应用组装、初始会话解析、输入处理、提交处理、slash command 分发
- `src/components/` —— 终端 UI 组件，包括聊天列表、输入框、会话列表、帮助面板、状态栏、内联工具状态和 Markdown 渲染
- `src/controller/chat-controller.ts` —— 单轮聊天生命周期与流式编排
- `src/controller/session-store.ts` —— 会话创建、加载、删除、重命名和快照组装
- `src/controller/slash-commands.ts` —— slash command 解析
- `src/controller/history-selection.ts` —— 在图执行前裁剪持久化消息历史
- `src/controller/stream-buffer.ts` —— 批量处理流式 chunk，减少 UI 更新频率
- `src/graph/chat-graph.ts` —— LangGraph 状态图
- `src/tools/` —— 内置工具及其安全边界
- `src/providers/` —— provider 抽象、能力矩阵和 DeepSeek 实现
- `src/prompts/loader.ts` —— 从配置文件或内置模板中解析 system prompt
- `src/infra/config/load-config.ts` —— TOML / 环境变量配置加载
- `src/infra/repositories/` —— 基于文件的 session、message、run、tool execution 仓储层
- `src/types/` —— 共享运行时类型

## 存储模型

`FileStore` 会写入配置的存储根目录，并通过临时文件替换的方式原子更新 JSON 文件。

当前各个 repository 的持久化结构：

- `sessions/` —— 每个 session 一个 JSON 文件
- `messages/` —— 每个 session 一个 JSONL 文件
- `runs/` —— 每个 run 一个 JSON 文件
- `tool-executions/` —— 每个 session 一个 JSONL 文件

默认存储路径是 `~/.ai-companion`，也可以通过配置或环境变量覆盖。

## 配置

配置加载逻辑位于 `src/infra/config/load-config.ts`。

关键配置项的解析优先级：

- 环境变量
- TOML 配置文件：`AI_COMPANION_CONFIG_PATH` 指定路径，或 `~/.config/ai-companion/config.toml`
- 硬编码默认值

重要运行时配置：

- `DEEPSEEK_API_KEY` —— 实际调用模型时必需
- `DEEPSEEK_BASE_URL` —— 可选，用于覆盖 DeepSeek 兼容接口地址
- `AI_COMPANION_MODEL` —— 默认模型覆盖项
- `AI_COMPANION_STORAGE_PATH` —— 存储位置覆盖项
- `AI_COMPANION_HISTORY_MAX_MESSAGES` —— 图执行前可带入的持久化历史消息上限

prompt 模板也可以通过配置覆盖。内置模板位于 `src/prompts/templates/`，构建时会复制到 `dist/templates/`。

## Provider 与模型行为

provider 抽象定义位于 `src/providers/types.ts`。

当前行为：

- `ProviderId` 目前只有 `deepseek`
- `src/providers/deepseek-provider.ts` 创建了一个指向 DeepSeek OpenAI 兼容接口的 `ChatOpenAI` 客户端
- 能力查找逻辑位于 `src/providers/capability-matrix.ts`，采用本地静态映射
- 默认模型是 `deepseek-chat`

## 工具执行模型

内置工具包括：

- `read_file`
- `list_dir`
- `search_text`
- `http_fetch`

工具运行时行为位于 `src/tools/index.ts`。

重要约束：

- 低风险工具会直接执行
- 中风险工具需要用户显式确认
- 每次工具执行都会被持久化，并回推到 UI 状态中
- `read_file`、`list_dir`、`search_text` 只能访问当前 workspace root 内的内容
- `http_fetch` 会拦截 localhost、私网、loopback、link-local 目标，限制重定向次数，并截断过大的响应体

## UI 行为

UI 是单屏 Ink 输出；在交互式终端中运行时会使用 alternate screen。

需要注意的行为：

- 除非传入 `--session <id>`，否则应用会恢复最近一次会话
- 第一条用户消息会将自动生成的会话标题改成消息内容摘要
- assistant 消息会先以空内容创建，再在流式输出结束时补全
- 工具确认会暂停普通输入，并通过应用中的确认队列状态处理
- UI 中展示的聊天历史来自持久化数据重建，不只存在于内存中

## Prompt 与历史消息

- System prompt 由 `PromptLoader` 从配置的 prompt 文件或内置模板中解析。
- `buildGraphInput()` 会把持久化的聊天消息转换成 LangChain 的 `SystemMessage`、`HumanMessage` 和 `AIMessage` 对象。
- `selectHistory()` 会根据 `historyMaxMessages`，在将历史消息传入图之前先做裁剪。

## 后续修改时的注意点

- 在相信 `README.md`、`arch.md`、`observer.md`、`observability-plan.md` 之前，先核对源码；这些文档包含设计意图和更早期的架构状态。
- 修改构建行为时，记得 prompt 模板仍然需要复制到 `dist/templates/`，否则构建后的 CLI 无法正确加载它们。
- 新增 provider 时，相关改动会同时涉及配置加载、provider 类型、能力矩阵、provider 实现，以及 prompt 模板解析。
- 修改持久化方案时，需要一起检查所有 repository，因为 session snapshot 依赖 sessions、messages、runs、tool executions 之间的协同读取。
