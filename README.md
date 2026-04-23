# AI Companion CLI

## 项目概述

AI Companion CLI 是一款以终端为主要使用场景的 AI 聊天应用，产品核心聚焦在 **聊天体验**。

当前版本的设计目标：

- 在终端中提供自然的多轮对话体验
- 支持 AI 流式输出
- 采用 LangChain + LangGraph 完成智能体编排
- 支持工具调用，并清晰展示执行状态
- 支持多会话管理、会话恢复与运行状态恢复
- 支持国内主流模型提供商接入
- 预留宠物形象模块，但不进入首版交付范围

本 README 作为当前阶段的统一定稿文档，`arch-tobedetermined.md` 中的待定项已全部收口到这里。

---

## 产品定位

这是一个 **聊天优先** 的终端 AI 应用。

设计原则：

- 聊天是核心交互模型
- UI 决策优先服务于对话效率、可读性和流畅度
- 智能体编排服务于聊天质量、工具协作和任务完成
- 工具执行状态需要可见，但不能压过聊天主线
- 宠物动画作为辅助能力，后续再接入

---

## 已确认的最终方案

### 核心产品与架构决策

1. 持久化采用 **SQLite**
2. 首版 **不上宠物模块**，但预留 `PetWidget` 接口与布局位置
3. 首版 **不引入 `xstate`**
4. 终端样式库采用 **`picocolors`**
5. 首版纳入 **最小工具执行可视化**
6. SQLite 驱动采用 **`better-sqlite3`**
7. 首版支持多个国内模型提供商，保留统一 provider 抽象
8. 首版 provider 覆盖：**DeepSeek / MiniMax / Kimi / GLM**
9. 多模型接入采用 **统一兼容层 + provider 专属补充 adapter**
10. 工具调用采用 **按 provider 能力开关** 的策略
11. 首版将 **LangGraph checkpoint 持久化到 SQLite**
12. 共用一套核心 LangGraph，provider 差异通过 strategy / adapter 层注入
13. 一个会话固定绑定一个 `provider + model`
14. 配置采用 **本地配置文件 + 系统 Keychain + 环境变量覆盖**
15. 默认执行 `ai-companion` 直接进入聊天界面
16. 首版采用 **最小高频 slash commands 集合**
17. 启动时恢复会话列表与 checkpoint 元信息，恢复执行必须由用户显式触发
18. 首版工具执行状态 **内联到聊天消息流中展示**
19. 采用 **LangChain / LangGraph 负责编排，自建 adapter 层统一 provider 差异**
20. 首版工具范围采用 **最小受控工具集**
21. 工具执行权限采用 **按风险分级确认**
22. 本地配置文件格式采用 **TOML**
23. CLI 命令解析框架采用 **`cac`**
24. 开发使用 **`tsx`**，发布构建使用 **`tsup`**
25. 数据库访问层采用 **原生 SQL + Repository 封装**
26. SQLite 采用 5 张核心表，复杂运行态放 JSON 字段
27. 首版支持 **基础 Markdown 渲染**
28. 首版采用 **自适应布局：宽终端双栏，窄终端单栏**
29. checkpoint 恢复入口放在 **`/sessions` 和会话切换流程** 中，不单独引入 `/resume`
30. provider / model 能力矩阵采用 **本地静态能力矩阵为主，允许配置覆盖**
31. 配置优先级采用：**运行时显式参数 / 会话上下文 > 环境变量 > 本地 TOML > 内置默认值**

### 数据库相关补充规则

后续涉及数据库的具体问题，统一沿用推荐方向：

- SQLite
- `better-sqlite3`
- 原生 SQL + Repository
- 核心表结构化字段 + 复杂运行态 JSON

不再为数据库方案单独展开新一轮选型。

---

## 最终技术栈

### 基础技术栈

- **语言**：TypeScript
- **运行时**：Node.js 20+
- **终端 UI**：Ink
- **编排层**：LangChain + LangGraph
- **CLI 命令解析**：cac
- **数据校验**：Zod
- **终端颜色**：picocolors
- **本地数据库**：SQLite
- **SQLite 驱动**：better-sqlite3
- **数据库访问方式**：原生 SQL + Repository
- **本地配置格式**：TOML
- **密钥存储**：系统 Keychain
- **开发运行**：tsx
- **构建发布**：tsup

### Provider 范围

首版支持以下 provider：

- DeepSeek
- MiniMax
- Kimi
- GLM

### Provider 集成原则

- provider 层对上暴露统一接口
- 兼容接口优先通过统一兼容层接入
- provider 特有能力通过专属 adapter 补充
- LangGraph 不直接耦合某一家 provider SDK
- tool calling、streaming、structured output 等能力由 capability matrix 决定是否开放

---

## 系统架构

### 总体分层

```text
Terminal App
├── CLI Entry (cac)
├── Ink UI
│   ├── SessionList
│   ├── ChatList
│   ├── PromptInput
│   ├── StatusBar
│   ├── InlineToolState
│   └── PetWidget (reserved)
├── App Controller
│   ├── session store
│   ├── event adapter
│   ├── stream buffer
│   └── resume orchestrator
├── Graph Runtime
│   ├── core chat graph
│   ├── tool orchestration
│   ├── checkpoint manager
│   └── provider strategy hooks
├── Provider Layer
│   ├── compatibility adapter
│   ├── deepseek adapter
│   ├── minimax adapter
│   ├── kimi adapter
│   └── glm adapter
└── Infra
    ├── config
    ├── keychain
    ├── storage
    ├── repositories
    └── logging
```

### 各层职责

#### 1. CLI Entry

负责：

- 解析命令行参数
- 处理少量管理型子命令
- 默认进入聊天界面

#### 2. Ink UI

负责：

- 聊天消息渲染
- 输入框交互
- 会话列表展示
- 状态栏展示
- 工具执行状态内联展示
- 窄终端 / 宽终端布局切换
- 为后续 `PetWidget` 预留插槽

#### 3. App Controller

负责：

- 把 graph 事件转成 UI 可消费状态
- 合并和节流流式输出
- 管理当前会话上下文
- 统一工具执行事件结构
- 协调恢复逻辑与界面更新

#### 4. Graph Runtime

负责：

- 聊天流程编排
- 工具调用流程
- checkpoint 生成与恢复
- 中断、重试、继续执行
- 根据 provider 能力决定可走的节点路径

#### 5. Provider Layer

负责：

- 鉴权处理
- base URL 管理
- provider 参数映射
- streaming 事件统一
- tool calling 能力适配
- provider 特殊响应结构归一化

#### 6. Infra

负责：

- 本地配置读取
- Keychain 读写
- SQLite 存储
- Repository 封装
- 日志能力

---

## Provider 与模型策略

### 统一抽象

对上层暴露统一接口，至少覆盖以下能力：

- 发起普通聊天请求
- 发起流式聊天请求
- 读取模型能力信息
- 判断是否支持工具调用
- 标准化工具调用结果
- 输出统一的事件流给 controller / graph 使用

### 接入策略

采用：

- **统一兼容层**：承接能复用的共性能力
- **provider 专属 adapter**：承接参数映射、响应差异、异常差异、能力差异

### 能力矩阵

provider / model 能力矩阵采用：

- 本地静态 manifest 为主
- 用户可通过配置做少量覆盖
- 不依赖完整运行时动态探测

建议能力字段至少包括：

- `supportsStreaming`
- `supportsToolCalling`
- `supportsStructuredOutput`
- `supportsCheckpointResume`
- `maxContextTokens`
- `defaultTemperature`
- `allowedTools`

### 会话与模型关系

- 一个会话固定绑定一个 `provider + model`
- 切换模型通过新建会话或复制会话实现
- 不在同一个会话中途切换 provider / model

---

## LangGraph 运行时策略

### 核心原则

- 共用一套核心 chat graph
- provider 差异通过 strategy / adapter 层注入
- graph 只表达核心流程，不堆积 provider 分支逻辑

### Checkpoint 策略

首版即支持：

- LangGraph checkpoint 持久化到 SQLite
- 会话恢复与运行恢复分离处理
- 启动时恢复 checkpoint 元信息
- 是否继续执行由用户显式触发

### 恢复入口

- 恢复入口放在 `/sessions` 和会话切换流程中
- 不单独提供 `/resume`
- 不做自动恢复未完成 run

---

## 工具系统策略

### 首版工具范围

首版采用 **最小受控工具集**，建议范围：

- 读取本地文件
- 列目录
- 文本搜索
- HTTP 内容获取
- 少量受控命令执行

### 工具调用开放策略

- 按 provider / model 能力开关工具调用
- 支持稳定 tool calling 的模型开放工具能力
- 其余模型先提供聊天能力

### 权限确认策略

采用风险分级：

- **低风险只读工具**：默认直接执行
- **中高风险工具**：执行前必须确认

聊天流中需要内联展示：

- 工具名
- 动作摘要
- 风险级别
- 执行中 / 已完成 / 出错
- 结果摘要

### 工具状态展示方式

- 首版工具状态内联到聊天消息流中
- 不在首版做完整独立 ToolPanel
- `ToolPanel` 只在架构与目录结构中预留

---

## UI 与交互设计

### 默认入口

默认执行：

```bash
ai-companion
```

行为：

- 直接进入聊天界面
- 不先进入菜单页
- 配置、provider 管理、会话管理通过子命令 + slash commands 完成

### 布局策略

采用自适应布局：

- **宽终端**：双栏布局
  - 左侧：会话列表 / 状态信息
  - 右侧：主聊天区
- **窄终端**：单栏布局
  - 会话列表通过命令或临时区块打开

### Markdown 渲染

首版支持基础 Markdown：

- 段落
- 标题
- 列表
- 引用
- 行内代码
- 代码块

### 流式输出策略

- token chunk 先进入 buffer
- 以小周期节流刷新 UI
- 避免每个 token 触发一次重渲染
- 流结束后再完成消息定稿

### 宠物模块策略

- 首版不交付宠物模块
- UI 与布局预留 `PetWidget` 插槽
- 后续接入时不改主架构

---

## Slash Commands

首版采用最小高频集合，建议包含：

- `/new`：新建会话
- `/sessions`：查看会话列表，并承接可恢复会话入口
- `/switch`：切换会话
- `/clear`：清空当前显示上下文或开启新轮次
- `/model`：查看当前 provider / model
- `/retry`：重试上一轮回答
- `/help`：查看命令说明
- `/exit`：退出聊天

原则：

- 高频、强相关操作留在聊天内
- 配置和 provider 管理继续走子命令

---

## 配置与密钥管理

### 配置来源

- 内置默认值
- 本地 TOML 配置
- 系统 Keychain
- 环境变量
- 会话上下文 / 运行时显式参数

### 优先级

最终优先级：

1. **运行时显式参数 / 会话上下文**
2. **环境变量**
3. **本地 TOML 配置**
4. **内置默认值**

额外规则：

- API Key 优先读取环境变量，其次读取 Keychain
- capability override 优先于内置能力矩阵

### 建议配置内容

本地 TOML 建议保存：

- 默认 provider
- 默认 model
- provider base URL
- UI 偏好
- 工具权限偏好
- capability override

Keychain 建议保存：

- 各 provider API Key

---

## 存储设计

### 数据库访问方式

采用：

- `better-sqlite3`
- 原生 SQL
- Repository 封装

Repository 建议最少包括：

- `sessionRepository`
- `messageRepository`
- `runRepository`
- `checkpointRepository`
- `toolExecutionRepository`

### 核心表结构

采用 5 张核心表：

- `sessions`
- `messages`
- `runs`
- `checkpoints`
- `tool_executions`

### 结构化字段与 JSON 字段

结构化存储：

- 会话 ID
- provider
- model
- run 状态
- 时间戳
- 关联主键
- 是否可恢复
- 工具执行状态

JSON 字段存储：

- checkpoint payload
- provider 原始响应
- 工具结果详情
- 扩展元数据

这套结构更适合当前阶段的：

- 多 provider 差异
- LangGraph checkpoint 恢复
- 工具执行记录
- 会话历史查询

---

## 推荐目录结构

```text
src/
  cli.ts
  app.tsx
  components/
    ChatList.tsx
    PromptInput.tsx
    SessionList.tsx
    StatusBar.tsx
    InlineToolState.tsx
    PetWidget.tsx
  controller/
    chat-controller.ts
    stream-buffer.ts
    session-store.ts
    event-adapter.ts
    resume-orchestrator.ts
  graph/
    core-chat-graph.ts
    nodes/
    tools/
    checkpoint/
    strategies/
  providers/
    types.ts
    capability-matrix.ts
    compatibility/
    deepseek/
    minimax/
    kimi/
    glm/
  infra/
    config/
    keychain/
    storage/
    repositories/
    logging/
  types/
    chat.ts
    session.ts
    events.ts
    provider.ts
    tool.ts
```

---

## 首版范围

### 首版必须交付

- 终端聊天主界面
- 多轮对话
- AI 流式输出
- 多 provider 支持：DeepSeek / MiniMax / Kimi / GLM
- provider 抽象与能力矩阵
- LangGraph 核心聊天 graph
- LangGraph checkpoint 持久化到 SQLite
- 会话列表与显式恢复入口
- 最小受控工具集
- 工具状态内联展示
- 风险分级权限确认
- SQLite 本地持久化
- 基础 Markdown 渲染
- 自适应布局
- 最小高频 slash commands

### 首版暂不交付

- 宠物模块正式功能
- 完整独立 ToolPanel
- 同会话内动态切换 provider / model
- 自动恢复未完成 run
- 全量动态图形化能力探测
- 重型动画系统

---

## 实现原则

- UI 与编排解耦
- provider 差异收敛在 adapter 层
- graph 负责流程，controller 负责状态整理，Ink 负责展示
- 工具执行可见，但聊天主线始终优先
- 会话恢复与运行恢复分层处理
- 先做稳定的聊天闭环，再逐步扩展体验层能力

---

## 当前推荐基础组合

最终基础组合：

- **TypeScript + Node.js 20+ + Ink + LangChain + LangGraph + Zod + SQLite + better-sqlite3 + cac + picocolors + TOML + Keychain + tsx + tsup**

这套组合适合当前这个以聊天为核心、支持国内多模型、多会话、工具调用和运行恢复的终端 AI 应用。
