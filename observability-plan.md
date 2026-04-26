# 可观测性方案

## 当前状态

这个项目已经具备了一部分可观测性所需的数据基础，但整体上还更接近本地诊断能力，还没有形成完整的可观测性体系。

### 已有能力

#### 1. Run 级别时间戳
每次 run 已经会持久化这些字段：

- `startedAt`
- `firstTokenAt`
- `completedAt`
- `failedAt`
- `errorMessage`

相关代码：

- `src/types/run.ts:1`
- `src/infra/repositories/run-repository.ts:10`
- `src/controller/chat-controller.ts:68`
- `src/controller/chat-controller.ts:115`
- `src/controller/chat-controller.ts:148`
- `src/controller/chat-controller.ts:156`

这已经能支持一些基础诊断，例如：

- 一次 run 是否成功
- 是否产出了首个 token
- 失败发生在什么时候
- 失败时的错误信息是什么

#### 2. 工具执行记录
工具调用已经会持久化这些字段：

- `toolName`
- `riskLevel`
- `status`
- `summary`
- `input`
- `output`
- `createdAt`
- `updatedAt`
- `runId`
- `messageId`

相关代码：

- `src/types/tool.ts:10`
- `src/tools/index.ts:51`
- `src/tools/index.ts:94`
- `src/tools/index.ts:103`
- `src/infra/repositories/tool-execution-repository.ts:14`

当前工具状态流转已经覆盖：

- `pending`
- `running`
- `completed`
- `failed`
- `denied`

#### 3. UI 层状态可见性
终端 UI 已经会展示工具执行状态和运行时错误。

相关代码：

- `src/components/InlineToolState.tsx:7`
- `src/components/InlineToolState.tsx:46`
- `src/app/use-submit-handler.ts:131`
- `src/app.tsx:62`

用户当前已经能看到：

- 工具是否正在运行
- 工具是否失败
- 简短的失败原因
- 启动错误和发送错误

#### 4. 文件存储已经可以承载诊断数据
应用现在使用文件存储。`FileStore` 已经支持：

- 原子化 JSON 写入
- JSONL 追加写入
- JSONL 读取

相关代码：

- `src/infra/storage/file-store.ts:24`
- `src/infra/storage/file-store.ts:44`
- `src/infra/storage/file-store.ts:66`

应用启动时也已经把这些 repository 接起来了：

- `src/app/create-app-services.ts:18`

#### 5. 已经有天然的埋点位置
模型流式输出会经过一个统一的事件循环。

相关代码：

- `src/controller/chat-controller.ts:110`

这里很适合后续接 tracing 和 metrics 上报。

## 缺口

### 1. 缺少统一日志系统
当前实现里还没有真正的日志模块。

缺失项包括：

- 结构化日志
- 日志级别
- 每条记录上的关联字段
- 按模块输出日志
- 日志路由和保留策略

相关说明：

README.md 早期设计中曾包含 logging 模块规划，但已从文档中移除。代码层面目前还没有真正实现。

### 2. 缺少指标系统
目前有原始时间戳，但没有聚合指标。

缺失项包括：

- run 总量
- 成功率和失败率
- TTFT 分布
- 端到端时延分布
- 每个工具的耗时指标
- provider 和 model 维度指标
- token 和成本指标

### 3. 缺少 tracing
当前 runtime 里没有接 tracing backend，也没有 span 模型。

缺失项包括：

- run span
- 模型流式输出 span
- 工具调用 span
- 用于回放的事件时间线
- run 与工具执行之间的 trace 关联

一个看起来可以作为后续接入点的相关类型：

- `src/types/events.ts:3`

### 4. 缺少外部错误上报
当前错误只会在本地展示，并写入本地记录。

缺失项包括：

- 集中式错误收集
- 按错误类型聚类
- 按版本、provider 或 model 做分析
- 自动告警钩子

### 5. 缺少事件时间线
系统现在保存的是结束态记录，还不是完整的 append-only 事件流。

目前缺少的时间线事件包括：

- `run.started`
- `history.selected`
- `prompt.resolved`
- `model.stream.started`
- `model.chunk.received`
- `tool.pending`
- `tool.approved`
- `tool.denied`
- `tool.completed`
- `tool.failed`
- `run.completed`
- `run.failed`

### 6. 缺少告警
当前没有针对这些场景的告警或健康报告能力：

- 失败率升高
- TTFT 退化
- provider 不稳定
- 工具重复失败
- 启动配置异常

## 判断

当前实现更适合描述为：

- 本地诊断持久化
- 执行审计轨迹
- 基础运行态可见性

它还不是一套完整的可观测性系统。

## 现有的扎实基础

### 1. 已经存在关联标识
系统已经有：

- `runId`
- `sessionId`
- `messageId`

相关代码：

- `src/types/run.ts:3`
- `src/types/tool.ts:10`

这些字段应该成为日志、事件和指标里的标准关联字段。

### 2. `ChatController` 已经是运行时聚合点
相关代码：

- `src/controller/chat-controller.ts:27`

这里适合统一发出：

- 领域事件
- 指标事件
- run 生命周期变更

### 3. `FileStore` 已经支持 JSONL
相关代码：

- `src/infra/storage/file-store.ts:44`

这让追加式事件日志很容易落地。

建议的后续路径：

```txt
<storagePath>/events/runs/<runId>.jsonl
<storagePath>/events/sessions/<sessionId>.jsonl
<storagePath>/metrics/daily/YYYY-MM-DD.json
```

### 4. 工具生命周期已经很明确
相关代码：

- `src/tools/index.ts:51`
- `src/tools/index.ts:65`
- `src/tools/index.ts:92`
- `src/tools/index.ts:101`

当前工具执行已经有很清楚的生命周期状态，下一步就是把这些状态变化变成标准化的可观测事件和指标。

## 推荐方向

这个项目最适合先做一套基于文件存储的可观测性设计，并与现有存储架构保持一致。

更重的平台集成可以后面再接。

## 方案设计

### 第一层：结构化事件日志
增加 append-only 的 JSONL 事件流。

建议存储结构：

```txt
<storagePath>/events/
  runs/<runId>.jsonl
  sessions/<sessionId>.jsonl
```

建议事件结构：

```ts
type ObservabilityEvent = {
  id: string;
  ts: string;
  runId?: string;
  sessionId: string;
  messageId?: string;
  type: string;
  level: "info" | "warn" | "error";
  provider?: string;
  model?: string;
  toolName?: string;
  data: Record<string, unknown>;
};
```

建议第一批事件类型：

- `run.started`
- `run.first_token`
- `run.completed`
- `run.failed`
- `tool.pending`
- `tool.approved`
- `tool.denied`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `model.stream.chunk`
- `config.load_failed`
- `app.startup_failed`

这一层加上之后，调试和事后分析能力会立刻提升。

### 第二层：派生指标快照
先做本地聚合指标，不急着上完整 metrics backend。

建议存储结构：

```txt
<storagePath>/metrics/daily/YYYY-MM-DD.json
```

建议字段：

- run 总数
- 完成的 run 数
- 失败的 run 数
- 成功率
- provider 维度成功率
- model 维度成功率
- 平均 TTFT
- P50 和 P95 TTFT
- 平均 run 耗时
- 工具调用次数
- 工具失败率

这些指标可以从持久化的 run 记录、工具执行记录和事件日志里推导出来。

### 第三层：轻量 logger
增加一个小型日志模块，例如：

- `src/infra/logging/logger.ts`

建议 API：

```ts
logger.info("run.started", context)
logger.warn("tool.denied", context)
logger.error("run.failed", context)
```

建议输出方式：

- 本地开发时打印到 stderr
- 同时把相同记录追加到 JSONL 事件日志

这样可以让项目有一个统一的发射入口，也不需要引入太重的依赖。

### 第四层：诊断 CLI 命令
增加只读诊断命令。

建议命令：

- `ai-companion doctor`
- `ai-companion stats`
- `ai-companion runs --recent`
- `ai-companion trace <runId>`

建议用途：

- `doctor`：检查配置健康度和最近失败
- `stats`：查看聚合指标
- `runs --recent`：查看最近 run 结果
- `trace <runId>`：回放单次 run 的时间线

对于 CLI 产品来说，这些命令在短期内大概率比外部 dashboard 更实用。

## 最小落地版本

建议顺序：

1. 为所有关键 run 和 tool 生命周期变化写入 JSONL 事件。
2. 增加 `ttftMs`、`durationMs`、`toolDurationMs` 这类派生字段。
3. 增加统一 logger，输出结构化记录。
4. 增加 `stats` 和 `trace <runId>` 命令。
5. 后续再考虑 OTel 或外部错误上报。

## 当前代码里的接入点

### 1. `src/controller/chat-controller.ts`
适合发出：

- run 开始
- 首 token 到达
- run 完成
- run 失败
- provider 和 model 元数据

### 2. `src/tools/index.ts`
适合发出：

- tool pending
- tool approved 或 denied
- tool started
- tool completed
- tool failed

### 3. `src/app.tsx`
适合发出：

- 应用启动成功
- 应用启动失败

### 4. `src/infra/storage/file-store.ts`
这里不需要设计层面的变化，它已经是合适的底层持久化层。

## 需要优先补齐的内容

### 高优先级
1. 带有关联字段的结构化日志。
2. TTFT、run duration 这类派生时序指标。
3. 标准化的 run 和 tool 生命周期事件流。
4. 超出自由文本 `errorMessage` 之外的错误分类。

建议错误字段：

- `errorCode`
- `errorType`
- `source`

例子：

- provider error
- tool error
- user denial
- config error
- storage error

### 中优先级
5. provider 和 model 维度可靠性报告。
6. 启动诊断持久化。
7. run 时间线回放。

### 低优先级
8. 外部错误上报。
9. 自动告警。

## 最终判断

这个项目已经有一套可用的可观测性基础，主要体现在：

- run 记录
- 工具执行记录
- 终端状态展示
- 基于文件的持久化

真正缺少的是把这些记录变成完整可观测层的系统能力：

- 结构化日志
- 聚合指标
- tracing 和事件时间线
- 集中式错误上报
- 告警或健康报告

最适合的下一步，是继续沿着文件存储方向演进，补上：

- JSONL 事件流
- 派生指标快照
- 轻量 logger
- 诊断 CLI 命令
