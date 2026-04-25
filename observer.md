# Observer

## 目标

为这个项目建立一套适合本地 CLI 应用的可观测性方案，重点解决以下问题：

- 一轮用户输入到 assistant 最终回复之间发生了什么
- 哪个阶段慢，慢在模型、工具还是本地存储
- 某次失败发生在哪个步骤
- 一次运行是否可以完整回放
- 后续是否能方便地做统计、调试和导出

这个项目当前的形态是：

- 本地 CLI + Ink UI
- LangGraph 编排消息流
- SQLite 持久化会话、消息和工具执行
- 单进程、本地优先、调试诉求强于平台化监控

基于这些前提，最合适的方向是：

**本地优先、SQLite 持久化、以 run 为核心的事件型可观测性。**

---

## 为什么选这个方案

当前代码已经有这些基础能力：

- `messages` 已持久化
- `tool_executions` 已持久化
- `graph.streamEvents(...)` 已经能拿到流式事件
- UI 已经能展示工具执行状态

但现在的数据还是散的，缺一个真正描述“一次运行”的核心单元。

如果只有 session、message、tool_execution，而没有 run，就很难直接回答：

- 某次用户输入对应的是哪次完整运行
- 这次运行总共花了多久
- 首 token 延迟是多少
- 一个 assistant 回复关联了哪些工具调用
- 失败发生在模型阶段还是工具阶段

所以，可观测性的第一步不是接外部平台，而是把 `run` 建出来。

---

## 核心设计

### 1. 以 run 作为核心观测单元

定义：

> 用户提交一次输入，到 assistant 最终完成一次回复，这整个过程就是一次 run。

结构示意：

```text
session
  └── run
      ├── user message
      ├── model streaming
      ├── tool execution 1
      ├── tool execution 2
      ├── assistant final message
      └── outcome / latency / token / error
```

建议新增 `runs` 表。

#### `runs` 表建议字段

- `id`
- `session_id`
- `user_message_id`
- `assistant_message_id`
- `provider`
- `model`
- `status`：`running | completed | failed | cancelled`
- `started_at`
- `first_token_at`
- `ended_at`
- `duration_ms`
- `time_to_first_token_ms`
- `tool_count`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `error_code`
- `error_message`
- `metadata_json`

这张表负责回答：

- 最近哪些 run 失败了
- 平均耗时是多少
- 哪个 model 的首 token 更慢
- 哪些 run 工具调用特别多

---

### 2. 记录事件时间线，而不是只记录最终状态

只存最终结果，不足以支撑调试。

建议增加 `run_events` 表，用来存一次运行中的关键事件。

#### `run_events` 表建议字段

- `id`
- `run_id`
- `seq`
- `event_type`
- `timestamp`
- `payload_json`

#### 事件类型建议

- `run_started`
- `user_message_created`
- `assistant_message_created`
- `stream_first_chunk`
- `stream_chunk`
- `stream_completed`
- `tool_pending_confirmation`
- `tool_approved`
- `tool_denied`
- `tool_started`
- `tool_completed`
- `tool_failed`
- `model_completed`
- `run_failed`
- `run_completed`

示意：

```text
22:10:05 run_started
22:10:05 user_message_created
22:10:05 assistant_message_created
22:10:06 stream_first_chunk
22:10:07 tool_started(read_file)
22:10:07 tool_completed(read_file)
22:10:08 tool_started(search_text)
22:10:08 tool_completed(search_text)
22:10:10 model_completed
22:10:10 run_completed
```

这张表负责：

- 运行回放
- 问题排查
- 卡顿定位
- 后续统计分析

---

## 观测分层

### 一、运行层

直接对应用户体验，是第一优先级。

建议记录：

- run 是否成功
- run 总耗时
- 首 token 延迟
- streaming 总时长
- 工具调用个数
- 每个工具耗时
- 用户确认等待时长
- 最终错误类型

建议埋点位置：

- `src/controller/chat-controller.ts`
- `src/tools/index.ts`

---

### 二、模型 / provider 层

建议记录：

- provider
- model
- API 请求耗时
- token usage
- finish reason
- timeout / rate limit / auth error
- 重试次数

建议入口：

- `src/providers/deepseek-provider.ts`

这一层现在基本还没有落地。

---

### 三、存储与应用健康层

建议记录：

- 启动耗时
- migration 耗时
- DB 写入耗时
- session load 耗时
- 数据库异常次数
- UI 状态切换的卡顿情况

建议入口：

- `src/app.tsx`
- `src/controller/session-store.ts`
- `src/infra/storage/migrate.ts`

---

## 日志与持久化建议

最适合这个项目的是两套数据同时保留：

### 1. SQLite

用于：

- 历史查询
- UI 展示
- 本地分析
- 回放
- 聚合统计

### 2. JSONL

用于：

- 原始事件流追加写入
- grep / tail 调试
- 外部系统导出
- postmortem 分析

建议日志结构：

```json
{
  "ts": "2026-04-24T22:10:05.123Z",
  "level": "info",
  "event": "tool_completed",
  "sessionId": "s_123",
  "runId": "r_456",
  "messageId": "m_789",
  "toolName": "read_file",
  "durationMs": 42,
  "status": "completed"
}
```

推荐的组合方式：

- SQLite 存结构化记录
- JSONL 存原始过程事件

---

## 当前代码里的可复用基础

### 1. 工具执行状态流已经存在

`src/tools/index.ts` 里已经有：

- create
- pending
- running
- completed
- denied
- failed

建议补充：

- `runId`
- `startedAt`
- `endedAt`
- `durationMs`
- `confirmationWaitMs`

---

### 2. `graph.streamEvents(...)` 是最佳埋点入口

`src/controller/chat-controller.ts` 中已经在消费：

```ts
for await (const event of graph.streamEvents(...)) {
  // ...
}
```

这里适合记录：

- `run_started`
- `stream_first_chunk`
- `stream_chunk`
- `model_completed`
- `run_failed`
- `run_completed`

---

### 3. runtime event 类型已经有雏形

`src/types/events.ts` 已经定义了：

- `message_started`
- `message_chunk`
- `message_completed`
- `tool_started`
- `tool_completed`
- `tool_failed`
- `run_failed`

这说明代码结构本身就适合做事件型可观测性。

下一步适合把这套事件从 UI 内部状态，扩展为可持久化事件流。

---

## 不建议当前优先投入的方向

在这个阶段，不建议优先做：

- Prometheus + Grafana
- OpenTelemetry 全链路平台化接入
- 分布式 tracing 后端
- LangSmith 作为主观测层
- 复杂 metrics pipeline

原因：

这个项目目前是本地单进程 CLI，主要问题集中在：

- 某次运行失败
- 工具失败
- 模型响应慢
- streaming 中断
- 配置错误
- 本地数据库写失败

这些问题用 `runs + run_events + SQLite + JSONL` 就已经能覆盖得很好。

---

## 外部平台的定位

### Langfuse

适合在后期作为导出目标，用来做：

- prompt / tool trace 可视化
- latency / token / error 统计
- 模型效果比较

### LangSmith

现阶段不是优先项。当前编排复杂度还不高，本地数据已经足够支撑主要分析。

### 推荐顺序

- 主存储：SQLite + JSONL
- 后续扩展：Langfuse
- 再往后：必要时接 OTel export

---

## 实施顺序

### Phase 1：建立 run 级观测

做这些：

1. 新增 `runs` 表
2. 每次 `sendMessage` 创建一个 run
3. 给 `tool_executions` 加 `run_id`
4. 记录：
   - `started_at`
   - `first_token_at`
   - `ended_at`
   - `duration_ms`
   - `time_to_first_token_ms`
   - `error_message`

这是最先应该完成的一步。

---

### Phase 2：建立事件时间线

做这些：

1. 新增 `run_events` 表
2. 在 `chat-controller` 中记录核心运行事件
3. 在 `tools/index.ts` 中记录工具事件
4. 同步写入 JSONL

完成后，运行回放和问题排查能力会明显提升。

---

### Phase 3：提供查询与统计能力

可以先做成 CLI 命令：

- `/runs`
- `/trace <runId>`
- `/errors`
- `/stats`

优先支持：

- 最近 N 次 run 列表
- 某次 run 的完整时间线
- 失败排行
- 平均耗时
- 平均首 token 延迟
- tool failure 排行

---

## 建议优先关注的指标

- `run_duration_ms`
- `time_to_first_token_ms`
- `tool_duration_ms`
- `tool_count_per_run`
- `confirmation_wait_ms`
- `run_failure_count`
- `tool_failure_count`
- `provider_request_failure_count`
- `empty_assistant_response_count`

建议保留这些维度：

- provider
- model
- tool_name
- session_id
- error_code

---

## 推荐的最终结构

```text
SQLite
├── sessions
├── messages
├── tool_executions
├── runs
└── run_events

JSONL
└── events-YYYY-MM-DD.jsonl
```

运行链路：

```text
User input
  -> ChatController 创建 run
  -> 写入 run_started
  -> 创建 user / assistant message
  -> 执行 graph.streamEvents(...)
      -> 记录首 token
      -> 记录 tool 事件
      -> 聚合 latency / token / error
  -> 更新 assistant message
  -> 标记 run completed / failed
  -> 写入最终事件
```

---

## 结论

这个项目当前最适合的可观测性方案是：

- 用 `run` 作为一次完整交互的核心单元
- 用 `run_events` 记录全过程时间线
- 用 SQLite 保存结构化可查询数据
- 用 JSONL 保留原始事件流
- 先把本地调试、回放、统计能力做好，再考虑导出到外部平台

优先级最高的动作是：

1. 增加 `runs`
2. 增加 `run_events`
3. 给 `tool_executions` 关联 `run_id`
4. 在 `chat-controller` 和 `tools/index.ts` 两个关键入口加埋点
