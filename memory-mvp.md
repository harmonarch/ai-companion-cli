# 记忆系统 MVP

## 1. 背景与目标

AI companion 的记忆系统会把少量信息提炼成可跨会话复用的长期状态，并继续影响后续回答、建议和互动方式。

首版要解决的问题只有一件事：在不制造错误画像的前提下，提供有限、可控、可纠正的长期记忆能力。

首版目标：

- 少记
- 记准
- 可见
- 可删
- 会过期
- 能追溯

---

## 2. 首版完整性的定义

任何一条长期记忆，都必须能回答：

1. 它从哪来
2. 为什么被抽出来
3. 为什么允许写入
4. 它现在是不是生效
5. 用户能不能看到和纠正
6. 用户删掉后，未来还会不会继续影响回答

### 第一版必须有

- 写入边界
- 用户画像与会话草稿分层
- 候选记忆缓冲层
- 冲突处理与状态流转
- 可见性
- 删除传播
- 审计与来源追溯
- 作用域隔离
- 时间有效性

### 第一版先不做

- 复杂图谱记忆
- 学习排序和高级 rerank
- 行为模式自动归纳
- 主动个性化建议
- 外部专用 memory service

---

## 3. 分层模型

首版采用四层结构。

### 3.1 Transcript

原始证据层，只做留档，不直接等于长期记忆。

包含：

- 用户消息
- assistant 消息
- 工具调用与结果
- run 关联信息
- 时间戳

职责：

- 作为证据源
- 支持审计和重放
- 支持重新抽取

### 3.2 Session Scratchpad

会话草稿层，只服务当前会话。

包含：

- 当前任务目标
- 当前回答策略
- 本轮约束
- 已讨论方案
- 待澄清问题
- 临时观察
- 工具结果摘要

规则：

- 生命周期短
- 可以覆盖和压缩
- 默认不跨会话
- 默认不自动升级成长期记忆

### 3.3 Memory Candidates

候选记忆层，是写入前的缓冲区。

包含：

- 候选记忆
- 抽取证据
- 风险等级
- 是否需要确认
- 与现有记忆的匹配结果

职责：

- 防止“抽到就写”
- 承接写入前判断

### 3.4 Profile / Episodic Memory

正式长期记忆层，分两类。

#### Profile Memory

存稳定、跨会话、持续影响回答的信息：

- 回复风格偏好
- 稳定时间偏好
- 长期目标
- 长期约束
- 长期互动偏好

#### Episodic Memory

存关键事件和阶段性事实：

- 搬家
- 换工作
- 短期伤病
- 阶段性项目
- 近期重复出现的状态模式

### 用户画像和会话草稿必须分开

- 用户画像描述长期成立的信息
- 会话草稿描述当前任务状态

混在一起会把临时情绪、当前任务策略、旧草稿误写成长期画像。

---

## 4. 第一版允许与禁止的记忆范围

### 允许自动写入的低风险类别

- 回复风格偏好
- 工作流偏好
- 稳定时间偏好
- 低风险长期目标
- 稳定工具使用偏好

示例：

- 简短、直接、少铺垫
- 先给结论，再展开
- 工作日晚上有空
- 备战半马、准备转岗、学英语

### 默认不自动写入的类别

- 健康诊断类信息
- 心理状态标签
- 家庭冲突细节
- 第三方隐私
- 财务情况
- 精确位置和身份信息
- 高风险关系结论
- 敏感推断性结论

### 基本原则

1. 敏感信息默认不进入自动长期写入路径
2. 推断性结论不能直接写成长期事实
3. 短期状态先停留在 session 或 episodic，不直接升级成 profile

例如“今天心情不好”“这周太累了”“最近睡得差”，只能先作为短期状态或阶段性事件处理。

---

## 5. 最小数据模型

首版字段不求多，但必须支持边界、冲突、删除和追溯。

### 5.1 当前工程基线

项目已经有结构化持久化基线：

- `session`
- `message`
- `run`
- `tool execution`

其中工具执行记录已具备字段和状态流转，可作为记忆系统设计参考：

- `src/types/tool.ts:10`
- `src/tools/index.ts:51`
- `src/tools/index.ts:94`
- `src/tools/index.ts:103`

### 5.2 Session Scratchpad

```ts
interface SessionScratchpad {
  sessionId: string;
  currentTask?: string;
  answerStrategy?: string;
  temporaryConstraints: string[];
  openQuestions: string[];
  discussedOptions: string[];
  recentObservations: string[];
  toolFindings: string[];
  updatedAt: string;
}
```

### 5.3 Memory Candidate

```ts
interface MemoryCandidate {
  id: string;
  userId: string;
  sessionId: string;
  type: "preference" | "goal" | "constraint" | "relationship" | "event" | "pattern";
  subject: string;
  value: string;
  confidence: number;
  sensitivity: "low" | "medium" | "high";
  explicit: boolean;
  evidenceRefs: string[];
  status: "pending" | "rejected" | "promoted" | "needs_confirmation";
  reason?: string;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### 5.4 Long-term Memory

```ts
interface MemoryRecord {
  id: string;
  userId: string;
  kind: "profile" | "episodic";
  type: "preference" | "goal" | "constraint" | "relationship" | "event" | "pattern";
  subject: string;
  value: string;
  confidence: number;
  sensitivity: "low" | "medium" | "high";
  sourceRefs: string[];
  status: "active" | "pending" | "superseded" | "archived" | "deleted";
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt?: string;
  expiresAt?: string;
  deletedAt?: string;
  supersededBy?: string;
}
```

补充规则：

- `profile` 侧重稳定偏好和长期目标
- `episodic` 侧重事件性、阶段性、可过期内容

---

## 6. 写入流程

首版必须走这条路径：

```text
Transcript -> Extract -> Candidate -> Consolidate -> Store
```

### 6.1 Extract

只抽少量高价值候选：

- 稳定偏好
- 长期目标
- 长期约束
- 关键关系
- 关键事件
- 可验证的近期模式

抽取结果必须归一化，不直接保留原句。

### 6.2 Candidate

候选先进入候选层，再做：

- 类型合法性判断
- 风险判断
- 敏感性判断
- 是否明确表达判断
- 是否需要用户确认

### 6.3 Consolidate

候选与现有正式记忆比较，判断属于：

- duplicate
- reinforce
- update
- conflict
- reject

### 6.4 Store

只有通过合并判断的候选，才进入正式长期记忆。

首版默认使用 upsert，不采用 append everything。

### 需要确认的场景

- 中等敏感度但可能长期有用
- 会明显改变交互方式
- 与现有记忆冲突

---

## 7. Consolidate 与冲突处理

### 五类结果

#### duplicate

- 不新增记录
- 更新 `lastConfirmedAt`
- 可小幅提高 `confidence`

#### reinforce

- 更新 `sourceRefs`
- 更新 `lastConfirmedAt`
- 提高 `confidence`

#### update

- 新记录设为 `active`
- 旧记录设为 `superseded`
- 旧记录写入 `supersededBy`

#### conflict

- 候选保持 `pending` 或 `needs_confirmation`
- 不直接覆盖现有 `active`

#### reject

- 候选记为 `rejected`
- 记录拒绝原因
- 不进入长期记忆层

### 判断顺序

1. 作用域是否匹配
2. 是否已有 `active` 记录
3. 是否用户显式表达
4. 是否更新近、证据更强
5. 是否属于高变化 subject
6. 是否需要用户确认

### 最小状态机

```text
pending -> active
pending -> rejected
active -> superseded
active -> archived
active -> deleted
superseded -> archived
```

### TTL 规则

- 短期状态写成 `episodic` 或 `pattern`，带 `expiresAt`
- 长期偏好写成 `profile`，不设固定 TTL，由新证据触发替换

---

## 8. 检索与使用边界

第一版即使不做复杂排序，也不能只靠向量相似度。

至少要预留这些过滤信号：

- user scope
- workspace scope
- memory status
- 是否过期
- 记忆类型
- 时间新鲜度
- 置信度
- 敏感度

使用边界：

- 已入库不等于每次都用
- 检索层至少区分：可检索、可注入、可显式提及

---

## 9. 可见性

用户至少应该能看到：

- 当前有哪些正式长期记忆
- 类型
- 时间
- 状态
- 来源

系统至少应该能解释：

- 为什么记住了这条
- 为什么这次用了它
- 为什么这次没用它
- 它是用户明确说的，还是系统基于重复证据抽取的

### 第一版最小 UI 要求

至少支持查看当前长期记忆列表，显示：

- `subject`
- `value`
- `type`
- `status`
- `createdAt` 或 `lastConfirmedAt`

---

## 10. 可删除性与删除传播

删除的目标是：未来不再继续影响行为。

### 删除至少要覆盖

- 正式记忆主存储
- 检索入口
- 派生摘要
- 缓存
- 后续自动合并输入
- 同 subject 的默认 active 视图

### 第一版至少做到 Functional Delete

- 运行时彻底失效
- 不再参与检索与生成

### 必须防止删除后再次写回

所以删除后还需要：

- tombstone 或 invalidation 标记
- 对同类候选提高再次写入门槛
- consolidate 时优先检查历史否定状态

---

## 11. 可审计性与追溯

每条长期记忆都必须支持反查。

### 最小审计事件

```ts
interface MemoryAuditEvent {
  eventId: string;
  action: "create" | "update" | "delete" | "reject" | "confirm" | "supersede";
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  sourceRef?: string;
  timestamp: string;
  actor: "system" | "user";
}
```

### 至少能反查到

- 来源 transcript 或 message
- 相关 session
- 相关 run
- 候选生成时间
- 是否经过用户确认
- 是否被后续更新、删除或 supersede

---

## 12. 第一版最小运行闭环

```text
Transcript -> Extract -> Candidate -> Consolidate -> Store -> Retrieve -> Render -> Inspect/Delete
```

含义如下：

1. Transcript 保存原始证据
2. Extract 抽取少量候选并归一化
3. Candidate 承接写入前判断
4. Consolidate 处理去重、补强、更新和冲突
5. Store 只写入通过门槛的候选
6. Retrieve 只取 active 且合法的正式记忆
7. Render 把过滤后的记忆拼入上下文
8. Inspect/Delete 允许用户查看、删除、纠错

### 第一版默认策略

- 能不自动写的，先不自动写
- 能留在 session 的，先不升为长期记忆
- 高敏类默认不进自动长期通道
- 优先确保删除后未来真的不再受影响

---

## 13. 验收标准

| 维度 | 必须满足 |
| --- | --- |
| 功能 | 能从 transcript 抽取候选；候选不会跳过候选层直接入长期记忆；正式记忆支持查看、删除、状态流转；任意一条正式记忆都能看到来源信息 |
| 安全 | 敏感信息和第三方隐私默认不自动长期写入；推断性结论不会直接当长期事实入库；会话草稿不会直接混入用户画像 |
| 一致性 | 新值替换旧值后，旧值不再作为 active 生效；删除后的记忆不再参与后续回答；短期状态到期后会降级、归档或失效；同一 subject 不会长期并存多个未处理的冲突 active 值 |
| 可追溯 | 任意一条正式记忆都能反查到 transcript 或证据来源；任意一条记忆的创建、更新、删除都有审计事件；系统能解释这条记忆为什么被写入或拒绝写入 |
| 产品体验 | 用户能理解系统记住了什么；用户能改错和删除；系统不会因为一次性状态形成长期画像；系统不会在不合适场景反复提及高敏旧信息 |

---

## 14. 第一版必须一次做对的部分

- 分层模型
- 写入边界
- 候选缓冲层
- 冲突处理
- 可见性
- 删除传播
- 审计链路
- 作用域隔离

先把这些做对，后续再增强自动写入、混合排序、模式识别和个性化能力。
