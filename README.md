# AI Companion CLI

AI Companion CLI 是一个以终端为主的聊天应用。当前实现聚焦在多轮对话、流式输出、工具调用可视化，以及基于文件的本地持久化。

## 当前状态

当前源码已经实现的核心能力：

- 终端内多轮聊天
- Assistant 流式输出
- LangGraph 驱动的 `agent -> tools -> agent` 循环
- 内置工具调用与执行状态内联展示
- 基于文件的会话、消息、run、tool execution 持久化
- 会话列表、会话切换与最近会话恢复
- memory、emotion、assistant profile 相关运行时支持

当前源码里的边界也需要明确：

- 运行时 provider 当前只接入了 `deepseek`
- 没有 `test` 脚本，也没有测试运行器配置
- 没有 `lint` 脚本
- `npm run typecheck` 是目前唯一内置的校验命令

## 常用命令

- `npm run dev` —— 通过 `tsx src/cli.ts` 以开发模式运行 CLI
- `npm run build` —— 使用 `tsup` 打包 CLI，并将 prompt 模板复制到 `dist/templates/`
- `npm run start` —— 从 `dist/cli.js` 运行已构建的 CLI
- `npm run typecheck` —— 使用 `tsc --noEmit` 运行 TypeScript 类型检查

## 技术栈

- TypeScript
- Node.js 20+
- Ink
- LangChain
- LangGraph
- cac
- Zod
- picocolors
- TOML
- tsx
- tsup

## 运行时架构

应用的主要执行链路如下：

1. `src/cli.ts`
   - 使用 `cac` 解析命令行参数
   - 检测当前终端是否为交互式 TTY
   - 渲染 Ink 应用，并在交互式终端中启用 `alternateScreen`
2. `src/app.tsx`
   - 持有顶层 UI 状态
   - 解析初始会话
   - 渲染聊天区、帮助面板、会话列表、memory 面板和状态栏
3. `src/app/create-app-services.ts`
   - 装配配置加载、文件存储、repositories、memory/emotion 服务、assistant profile、session store 和 chat controller
4. `src/app/use-submit-handler.ts`
   - 将输入分流到 slash command 处理或正常聊天回合
   - 把流式返回和工具状态回写到当前会话快照
5. `src/controller/chat-controller.ts`
   - 负责单轮聊天生命周期
   - 持久化用户消息
   - 创建 assistant 占位消息与 run 记录
   - 构建 runtime tools
   - 选择历史消息并驱动 graph 执行
   - 持久化工具执行结果
   - 更新 memory 与 emotion 状态
6. `src/graph/chat-graph.ts`
   - 构建 `agent -> tools -> agent` 状态图
   - 将持久化消息转换为 LangChain 消息对象
   - 将运行时输出转换为统一事件流
7. `src/tools/index.ts`
   - 注册内置工具
   - 为中风险工具发起确认
   - 持久化工具执行
   - 将工具结果回灌到 assistant 消息流
8. `src/controller/session-store.ts`
   - 从 session、message、run、tool execution、memory、emotion 数据重建 UI 快照

## 当前支持的 slash commands

支持的 slash commands 定义在 `src/controller/slash-commands.ts`，执行逻辑在 `src/app/handle-app-command.ts`。

当前支持：

- `/new`
- `/sessions`
- `/switch <n|id>`
- `/memory`
- `/emotion`
- `/profile`
- `/reset`
- `/help`
- `/exit`

## 当前内置工具

内置工具定义在 `src/tools/index.ts`：

- `read_file`
- `list_dir`
- `search_text`
- `http_fetch`
- `local_time`

工具执行模型：

- 低风险工具直接执行
- 中风险工具先请求用户确认
- 每次工具执行都会被持久化
- 工具状态会以内联形式显示在聊天消息流中

## Provider 实现现状

- Provider 抽象定义在 `src/providers/types.ts`
- provider 注册表在 `src/providers/registry.ts`
- 当前仅注册 `deepseek`
- `src/providers/deepseek-provider.ts` 负责具体 provider runtime
- `src/providers/langchain-runtime.ts` 负责把 LangChain 模型行为适配到仓库内部 runtime 接口
- `src/providers/capability-matrix.ts` 保存静态能力矩阵

## 配置

配置加载逻辑位于 `src/infra/config/load-config.ts`。

优先级如下：

1. 环境变量
2. TOML 配置文件：`AI_COMPANION_CONFIG_PATH` 指定路径，或 `~/.config/ai-companion/config.toml`
3. 硬编码默认值

当前涉及的关键环境变量包括：

- `AI_COMPANION_PROVIDER`
- `AI_COMPANION_MODEL`
- `AI_COMPANION_STORAGE_PATH`
- `AI_COMPANION_HISTORY_MAX_MESSAGES`
- `AI_COMPANION_MEMORY_ENABLED`
- `AI_COMPANION_MEMORY_USER_ID`
- `AI_COMPANION_MEMORY_AUTO_WRITE_LOW_RISK`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`

## 持久化模型

当前持久化通过 `src/infra/storage/file-store.ts` 实现，采用文件存储，不是 SQLite。

核心特点：

- 以存储根目录为边界做路径解析
- JSON 文件通过临时文件替换实现原子写入
- JSONL 用于追加式记录

默认存储目录为 `~/.ai-companion`，也可以通过配置覆盖。

当前主要目录结构：

- `sessions/` —— 每个 session 一个 JSON 文件
- `messages/` —— 每个 session 一个 JSONL 文件
- `runs/` —— 每个 run 一个 JSON 文件
- `tool-executions/` —— 每个 session 一个 JSONL 文件

## Prompt 与构建注意点

- Prompt 加载逻辑位于 `src/prompts/loader.ts`
- 内置 prompt 模板位于 `src/prompts/templates/`
- 构建时必须把模板复制到 `dist/templates/`
- 修改构建流程时，不能删掉 `package.json` 中的模板复制步骤，否则构建后的 CLI 无法加载 prompt

## 建议先读的文件

- `src/cli.ts`
- `src/app.tsx`
- `src/app/create-app-services.ts`
- `src/app/use-submit-handler.ts`
- `src/controller/chat-controller.ts`
- `src/controller/session-store.ts`
- `src/controller/slash-commands.ts`
- `src/app/handle-app-command.ts`
- `src/graph/chat-graph.ts`
- `src/tools/index.ts`
- `src/providers/registry.ts`
- `src/infra/config/load-config.ts`
- `src/infra/storage/file-store.ts`

## 文档使用说明

仓库中存在一些更早阶段的设计文档和偏规划态描述。查看架构、provider 范围、命令面和恢复策略时，以当前源码为准。`CLAUDE.md` 记录的是面向 Claude Code 的工作指引，`README.md` 保持面向开发者的源码现状说明，两者应当同步。