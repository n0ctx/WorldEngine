# 写卡助手重做 设计文档

> 创建日期：2026-05-07
> 范围：`/assistant/` 整个目录的协议、运行机制和 UI 重做
> 不在范围：`/api/assistant/extract-characters` 路由（保留现状）；主对话写作流；后端世界/角色/persona 数据库结构

---

## 1. 目标与动机

当前写卡助手是**双轨架构**：旧的 `/api/assistant/chat`（主代理 + proposal 卡）和新的 `/api/assistant/tasks*`（researcher / planner / executor / 计划卡 / step 审批），两套并存维护成本高，UI 也分裂。同时执行子代理按"资源域"硬切（`world_card_agent` / `character_card_agent` …），每个都有自己的 prompt 和归一化器，prompt 和知识混在一起。

**重做目标**：

1. **单一交互模型**：仿 Claude Code CLI —— 用户说意图 → 助手写"临时计划文档" → 用户对文档提意见 → 用户确认 → 助手按文档逐步派发子代理执行 → 全部完成后删文档并发总结消息。**取消** proposal 卡 / 计划卡 / step 审批等所有结构化 UI。
2. **通用子代理**：子代理不再按资源域分文件，统一为"干净上下文 + 父代理派发的 task 描述 + 对应资源知识库 + apply 工具集"的通用执行器。
3. **知识库重整**：拆出 7 份独立 markdown，`CONTRACT.md` 每轮自动注入父代理（产品契约 + 指路引用），其余 6 份按 task 类型按需注入。
4. **保留落库安全边界**：现有 `normalizeProposal()` 不动，包装为 `apply_*` 工具集供子代理调用。

**非目标**：

- 不动数据库 schema
- 不动主对话 / 写作流 / 记忆召回
- 不动 `extract-characters` 一次性抽取功能
- 不实现"已落库回滚"

---

## 2. 总体架构

```
用户消息
   ↓
POST /api/assistant/agent (SSE)
   ↓
父代理 (parent-agent.js)
  ├─ 持续上下文（每轮注入 CONTRACT.md + 历史对话 + 当前 plan doc）
  ├─ 工具:
  │    read_file / preview_card
  │    write_plan_doc / edit_plan_doc / delete_plan_doc
  │    dispatch_subagent
  │    finalize_task
  └─ 行为：
       ① 理解需求（必要时 clarifying 追问）
       ② 调 preview_card / read_file 收集事实
       ③ write_plan_doc 落计划文档到 /.temp/assistant/<taskId>.md
       ④ 等用户"确认"或"修改意见" → 反复 edit_plan_doc
       ⑤ 用户确认 → 按 plan doc 中的 step 顺序 dispatch_subagent
       ⑥ 子代理报告完成 → edit_plan_doc 把 [ ] 改成 [x] + 追加日志
       ⑦ 全部 step 完成 → delete_plan_doc + finalize_task 发总结消息
        ↓
      子代理 (sub-agent.js, 通用执行器)
        ├─ 干净上下文（不继承父代理对话历史）
        ├─ 注入：父代理派发的 task 描述 + 对应 *CARD.md / *.md 知识
        ├─ 工具:
        │    preview_card / read_file
        │    apply_world_card / apply_character_card / apply_persona_card
        │    apply_global_config / apply_css_snippet / apply_regex_rule
        └─ 每个 apply_* 工具内部：
             构造 proposal → normalizeProposal() → 落库 → 返回结果摘要
```

**关键点**：

- 父代理是**长上下文 + 多工具**（包含 6 个 `apply_*`，用于 simple mode 自执行），子代理是**短上下文 + 单一资源 apply**（plan mode 派发）
- 落库安全边界（`normalizeProposal`）完全不动，只是从"路由层归一化执行子代理输出"变成"apply 工具内部归一化"
- 所有 SSE 事件统一由父代理这一层发出，子代理的执行细节不直接暴露给前端

---

## 3. 任务状态机

**双路径**：父代理在 planning 阶段判定任务规模——预计 **≥3 步** 走 plan mode（写计划文档 + 等审批 + 派发子代理）；预计 **<3 步**（即 1 或 2 步）走 simple mode（父代理自己调 `apply_*` 工具直接落库，跳过 plan doc 与 awaiting_approval）。simple mode 完成后直接发总结消息进入 completed。

```
        idle
         │ 用户首次消息
         ↓
    ┌─ planning ─┐
    │            │
    │  父代理判断步骤数：
    │   <3 → 走 simple path（自己调 apply_*）
    │   ≥3 → 走 plan path（写文档 + 派发子代理）
    │            │
    │            ├──── simple ────→ completed (直接 apply 落库 + 发总结)
    │            │
    ↓            ↓ plan
clarifying    awaiting_approval
    │            │ 用户确认
    │ 用户回答    ↓
    └─ planning  executing
                  │
                  ├─ paused (用户在执行中发消息)
                  │   ↓ 跑完当前 step
                  │   planning  ← 父代理把消息当作修改意见 edit_plan_doc
                  │
                  ├─→ completed   delete_plan_doc + finalize_task
                  ├─→ failed      delete_plan_doc + 错误总结
                  └─→ cancelled   delete_plan_doc
```

约束：

- **单任务串行**：同一个 assistant 会话同时只允许一个活跃任务。新用户消息在 `completed/failed/cancelled` 后才能开启新任务；活跃任务期间用户消息按 §6.4 暂停规则处理。
- **paused 不立即 abort**：等当前正在跑的子代理 finish 才切，避免 step 跑到一半导致部分落库。
- **失败 / 取消 → 删文档**（确认过的设计取舍）。
- **不支持回滚**：已勾选 `[x]` 的步骤永久落库，用户要撤销请走世界卡/角色卡正常编辑界面。

---

## 4. API 契约

### 4.1 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/assistant/agent` | SSE，发送消息（开任务 / 追问回答 / 修改意见 / 暂停指令均走这一个端点） |
| `POST` | `/api/assistant/agent/:taskId/approve` | 用户确认计划文档，进入 executing |
| `POST` | `/api/assistant/agent/:taskId/cancel` | 取消任务，删文档 |
| `GET` | `/api/assistant/agent/:taskId/plan-doc` | 拉取当前计划文档（markdown 文本） |
| `GET` | `/api/assistant/agent/:taskId` | 任务元信息查询（状态、当前 step） |

**移除**（来自旧双轨）：`/api/assistant/chat`、`/api/assistant/execute`、`/api/assistant/tasks*` 全部。`/api/assistant/extract-characters` 保留不动。

### 4.2 `POST /api/assistant/agent` 请求体

```json
{
  "taskId": "可选；带上则继续既有任务（追问回答 / 修改意见 / 暂停指令）；不带则开新任务",
  "message": "用户输入",
  "context": {
    "worldId": "可选",
    "characterId": "可选",
    "world": {},
    "character": {},
    "config": {}
  }
}
```

历史对话由 task-store 在服务端持续维护，不再由前端逐条上送。

### 4.3 SSE 事件

主路径时序：`task_created → plan_doc_updated* → awaiting_approval → plan_approved → step_started → plan_doc_updated → step_completed* → task_completed`

| 事件 | 时机 | payload |
|---|---|---|
| `task_created` | 新任务建立 | `{ type, taskId, task }` |
| `clarification_requested` | 父代理需要追问 | `{ type, taskId, summary, questions, task }` |
| `plan_doc_updated` | 父代理每次 write/edit 文档 | `{ type, taskId, content, version }`（content 为 markdown 全文） |
| `awaiting_approval` | 计划文档写完，等用户确认 | `{ type, taskId, task }` |
| `plan_approved` | 用户调 `/approve`，进入 executing | `{ type, taskId, task }` |
| `step_started` | 子代理派发开始 | `{ type, taskId, stepId, title }` |
| `step_completed` | 子代理报告完成（apply 已落库） | `{ type, taskId, stepId, result }` |
| `step_failed` | 子代理报错（任务进入 failed） | `{ type, taskId, stepId, error }` |
| `paused` | 用户在执行中发消息，已等当前 step finish | `{ type, taskId, task }` |
| `task_completed` | 全部 step done，文档已删除 | `{ type, taskId, summary }` |
| `task_failed` | 任务失败，文档已删除 | `{ type, taskId, error }` |
| `task_cancelled` | 用户 cancel，文档已删除 | `{ type, taskId }` |
| `delta` / `done` | 父代理纯文字回复（追问 / 修改回声 / 总结消息） | `{ delta }` / `{ done: true }` |

**前端拉文档策略**：收到 `plan_doc_updated` 后，前端可以直接用 payload 里的 content 渲染（推荐），或调 `GET /plan-doc` 兜底拉取。

---

## 5. 计划文档格式

路径：`/.temp/assistant/<taskId>.md`

模板：

```markdown
# 任务：<父代理生成的标题>

> 状态：<planning|awaiting_approval|executing|paused> · 创建时间：<ISO>

## 用户意图
<父代理对用户需求的复述，1-3 句>

## 假设与约束
- <来自 preview_card / read_file 的事实>
- ...

## 步骤

- [ ] **step-1** <标题>（<targetType>.<operation>）
  - 依赖：<step-x | context.worldId | 无>
  - 任务：<给子代理的自然语言任务说明>
- [x] **step-2** ...（已完成会带"完成于 <时间>"）

## 执行日志
<每个 step 完成或失败后父代理 Edit 追加一行>
```

### 5.1 机器可读约束

父代理通过正则解析步骤行决定派发顺序与状态：

- 步骤行格式固定：`- \[(x| )\] \*\*(step-\d+)\*\* (.+)（(.+)\.(create|update|delete)）`
- 依赖行（缩进 2 空格）：`  - 依赖：(.+)`
- `[x]` 解析为已完成；`[ ]` 解析为未完成
- 派发规则：从上到下找第一个 `[ ]` 且依赖均已 `[x]` 的步骤

### 5.2 用户编辑约束

- 用户**不直接编辑** markdown，前端面板对 plan-doc 是只读的（带语法高亮 + checkbox 可视化）
- 用户的修改意见通过聊天框发给父代理，父代理用自然语言理解后调 `edit_plan_doc` 重写文档

---

## 6. 父代理行为规范

### 6.0 任务规模判定（plan mode vs simple mode）

父代理在 planning 阶段第一步必须输出对任务的拆解评估：列出预计步骤数。判定规则：

- **<3 步**（1 或 2 步）→ **simple mode**：父代理直接调用对应的 `apply_*` 工具完成落库（必要时先 `preview_card`），完成后调 `finalize_task` 发总结消息，状态直接 `planning → completed`。**不写 plan doc，不发 `awaiting_approval` / `plan_approved` / `step_*` 事件**，但仍发 `delta` 文本回复 + `task_completed`。
- **≥3 步** → **plan mode**：走原 §6.2–§6.5 流程（写计划文档、等审批、派发子代理、勾选、删文档）。

边界场景：
- 删除类操作（高风险）即使 1 步也建议走 plan mode 以提供审批机会；具体由父代理 prompt 描述（CONTRACT.md / parent-agent.md 给指引）。
- simple mode 中途如果父代理发现任务比想象复杂（preview_card 后发现要拆 3+ 步），允许切到 plan mode：调 `write_plan_doc` 即视为升级。
- simple mode 中 apply 失败 → 直接 `finalize_task({terminalStatus:'failed'})`，不重试任务级（apply 工具内部仍可 retry）。

### 6.1 每轮注入

- System prompt：`/assistant/prompts/parent-agent.md` + `/assistant/knowledge/CONTRACT.md` 全文
- 历史对话：本任务的全部消息（user + assistant text）
- 当前 plan doc 全文（任务进入 planning 后）
- 任务上下文：worldId / characterId / world / character / config

### 6.2 任务分类与按需补充知识

父代理在 planning 第一步（写文档前）根据用户意图判断 targetType，然后 `read_file('/assistant/knowledge/<对应>.md')` 补充上下文。targetType → 知识文件映射：

| targetType | 知识文件 |
|---|---|
| `world-card` | `WORLDCARD.md` |
| `character-card` | `CHARCARD.md` |
| `persona-card` | `USERCARD.md` |
| `global-config` | `GLOBALPROMPT.md` |
| `css-snippet` | `CSSSNIPPET.md` |
| `regex-rule` | `REGEXRULE.md` |

复合任务（同时操作世界卡 + 角色卡）按所有命中类型并行 read。

### 6.3 派发子代理

`dispatch_subagent` 工具入参：

```json
{
  "stepId": "step-3",
  "targetType": "character-card",
  "operation": "create",
  "entityRef": "context.worldId | step:step-1 | context.characterId | null",
  "task": "自然语言任务说明（来自 plan doc 的步骤行）",
  "knowledgeFile": "CHARCARD.md"
}
```

工具内部：

1. 构造干净 LLM 上下文
2. 注入 `/assistant/prompts/sub-agent.md` + `/assistant/knowledge/<knowledgeFile>` + task 描述 + 必要的 entityRef 解析结果
3. 让子代理调用 `apply_*` 工具完成落库
4. 返回 `{ success, summary, entityId? }` 给父代理

### 6.4 暂停语义

执行中（`executing` 状态）父代理收到用户新消息时：

1. 后端立刻把消息排队，不打断当前正在跑的子代理
2. 当前 step 结束（success / failed）后切到 `paused`
3. 把用户消息当作"修改意见"送父代理 → 父代理可能调 `edit_plan_doc` 改未完成的步骤
4. 父代理在聊天发回声消息（如"已根据你的意见把 step-3 改成 X，请确认是否继续"）
5. 用户调 `/approve` → 重新进入 executing；调 `/cancel` → cancelled

### 6.5 终态行为

- `completed`：调 `delete_plan_doc` 删文件 → 调 `finalize_task` 在聊天发总结消息（"已完成：创建世界卡《X》、新增 N 个状态字段、M 条常驻条目"）
- `failed`：删文件 → 发简短错误说明（含失败的 stepId 和子代理返回的错误摘要）
- `cancelled`：删文件 → 发"已取消"

---

## 7. 子代理行为规范

### 7.1 上下文

干净 LLM 调用，每次 dispatch 独立。注入：

- System prompt：`/assistant/prompts/sub-agent.md`（讲工作方式、工具用法、与父代理的报告规则）
- 知识：父代理指定的 `*.md` 全文
- 任务：父代理 dispatch 入参里的 `task` + entityRef 解析结果 + worldId/characterId 等上下文

### 7.2 工具集

| 工具 | 用途 |
|---|---|
| `preview_card` | 查询现有实体（与父代理同源） |
| `read_file` | 兜底；通常子代理用不到，知识已在 prompt |
| `apply_world_card` | 入参 `{ operation, entityId, changes, entryOps, stateFieldOps }`，内部 normalizeProposal + 落库 |
| `apply_character_card` | 入参 `{ operation, entityId, changes, stateValueOps }` |
| `apply_persona_card` | 入参 `{ operation, entityId, changes, stateValueOps }`（仅 create/update） |
| `apply_global_config` | 入参 `{ operation:"update", changes }`（禁止 api_key 字段） |
| `apply_css_snippet` | 入参 `{ operation, entityId, changes }` |
| `apply_regex_rule` | 入参 `{ operation, entityId, changes }` |

### 7.3 报告

子代理执行后必须调用一次 apply 工具（每个 task 一次落库）；apply 返回后子代理用一段简短文本作为最终输出（≤200 字），父代理把这段文本写进 plan doc 的"执行日志"。

### 7.4 失败处理

- apply 工具内部 normalizeProposal 失败 → 工具返回错误对象，子代理可重试 1 次（带错误反馈）
- 重试仍失败 → 子代理返回 `{ success: false, error }` → 父代理把这一步标记 `step_failed`，触发任务 `failed` 终态

---

## 8. 知识库内容规划

### 8.1 `CONTRACT.md`（每轮加载，控制大小，目标 ≤200 行）

- 助手定位：单代理 + 通用子代理 + 文档驱动
- 指令解读：用户意图分类（创建 / 修改 / 删除 / 修复 / 多资源）
- `{{user}}` / `{{char}}` 术语约束
- proposal 顶层 schema 总览（type + operation 矩阵）
- 7 份独立知识文件的指路引用（"操作世界卡看 WORLDCARD.md，操作角色卡看 CHARCARD.md"…）
- 任务流程契约（计划文档格式、step 派发规则、apply 工具约束）
- API key 等敏感字段禁止输出清单

### 8.2 `WORLDCARD.md`

合并旧 `/assistant/prompts/world-card.md`（448 行）的 schema/字段说明，去掉旧的"主代理调用约定"部分（搬到父/子代理 prompt）。

- 世界卡架构（`changes` 字段集 + 不允许 system_prompt/post_prompt）
- `entryOps` 四种 trigger_type（always/keyword/llm/state）
- `stateFieldOps`（七种 type、`update_mode`、`prefix`）
- 状态字段 target 约束（world-card 允许 world/persona/character）
- 操作手册：复杂世界卡的拆步骤建议、状态机世界卡建议

### 8.3 `CHARCARD.md` / `USERCARD.md`

合并旧 `character-card.md`（190 行）/ `persona-card.md`（187 行）。重点：

- `changes` 字段集
- `stateValueOps` 写值规则（target 约束、value_json 格式、datetime 编码）
- 角色卡依赖世界来源约束
- persona 无 Prompt 条目特殊性（USERCARD.md 专项）

### 8.4 `GLOBALPROMPT.md` / `CSSSNIPPET.md` / `REGEXRULE.md`

合并旧对应 prompts。各自只放本资源 schema、字段、操作手册。

---

## 9. 文件改动清单

### 9.1 新增

```
/assistant/knowledge/
  CONTRACT.md
  WORLDCARD.md
  CHARCARD.md
  USERCARD.md
  GLOBALPROMPT.md
  CSSSNIPPET.md
  REGEXRULE.md

/assistant/server/
  parent-agent.js          # 替代 main-agent.js + task-planner.js + task-researcher.js
  sub-agent.js             # 替代 task-executor.js + agents/* + agent-factory.js
  plan-doc.js              # 文档读写、checkbox 解析、step 派发顺序计算
  tools/
    apply-world-card.js
    apply-character-card.js
    apply-persona-card.js
    apply-global-config.js
    apply-css-snippet.js
    apply-regex-rule.js

/assistant/prompts/
  parent-agent.md          # 父代理工作方式
  sub-agent.md             # 子代理工作方式

/frontend/src/components/assistant/
  PlanDocViewer.jsx        # markdown 渲染 + checkbox 高亮（只读）
```

### 9.2 删除

```
/assistant/server/
  main-agent.js
  task-planner.js
  task-researcher.js
  task-executor.js
  agent-factory.js
  agents/                  # 整个目录，6 个文件

/assistant/prompts/
  main.md
  world-card.md
  character-card.md
  persona-card.md
  global-prompt.md
  css-snippet.md
  regex-rule.md

/assistant/client/
  ChangeProposalCard.jsx   # 1015 行 proposal/计划/step 审批 UI

/assistant/CONTRACT.md     # 内容迁入新 knowledge/CONTRACT.md
```

旧 routes.js 中 `/chat` / `/execute` / `/tasks*` 端点删除（对应实现代码全部移除，文件本体保留并精简）。

### 9.3 改造

| 文件 | 改造 |
|---|---|
| `/assistant/server/routes.js` | 精简到只剩 `/agent*` 系列端点 + 保留 `/extract-characters` |
| `/assistant/server/task-store.js` | state 简化（去除 awaitingStepId / step graph）；新增 plan-doc 路径字段 |
| `/assistant/server/tools/card-preview.js` | 不动 |
| `/assistant/server/tools/extract-json.js` | 不动 |
| `/assistant/server/tools/project-reader.js` | 不动；继续作为 read_file 实现 |
| `/assistant/client/AssistantPanel.jsx` | 移除 plan/proposal/step 审批 UI；加 PlanDocViewer 区块 |
| `/assistant/client/useAssistantStore.js` | state 简化为 `{ taskId, status, planDoc, planDocVersion, messages }` |
| `/assistant/client/MessageList.jsx` | 去除 proposal 卡渲染分支 |
| `/assistant/client/api.js` | 替换为新 `/agent*` 接口调用 |
| `/assistant/client/InputBox.jsx` | 执行中允许输入（视为暂停信号） |
| `/assistant/tests/` | 删除旧 proposal/plan 测试；新增 plan-doc 解析、agent 派发、暂停/恢复集成测试 |
| 根目录 `CLAUDE.md` | 更新引用：`/assistant/CONTRACT.md` → `/assistant/knowledge/CONTRACT.md` |

### 9.4 保留不动

- `/api/assistant/extract-characters` 路由及 `/assistant/prompts/extract-characters.md`
- 现有 normalizeProposal 实际实现（apply 工具内部调用）
- 后端世界/角色/persona 数据库 schema 与 queries
- `/.temp/` 已有的 .gitignore 规则（覆盖新增 `/.temp/assistant/`）

---

## 10. 测试与验证计划

### 10.1 单元测试

- `plan-doc.js`：步骤行解析、依赖图计算、checkbox 标记、文档生成幂等性
- 7 个 `apply_*` 工具：参数透传到 normalizeProposal、错误冒泡、taskId/stepId 元信息标注

### 10.2 集成测试

- 主路径：开任务 → planning → awaiting_approval → approve → executing → completed → 文档已删除 → 总结消息正确
- clarifying：父代理追问 → 用户回答 → 重新 planning
- 暂停：executing 中发消息 → 跑完当前 step → paused → edit_plan_doc → approve → 继续
- 失败：模拟某 apply 工具报错 → step_failed → task_failed → 文档已删除
- 取消：awaiting_approval / executing 阶段 cancel → 文档已删除
- 复合任务：world-card create + character-card create（依赖前者）→ entityRef 解析正确

### 10.3 人工验证

- 前端 UI：进入助手面板，发"创建一个赛博朋克世界卡，包含玩家 HP/能量字段，3 条常驻条目"
- 观察：plan-doc 实时刷新、checkbox 渐次勾选、完成后文档消失、总结消息出现
- 暂停验证：执行到 step-2 时输入"算了第 4 步不要了" → 验证 step-3 跑完才暂停 → plan doc 中 step-4 被删 → approve 后继续

---

## 11. 风险与开放点

### 11.1 已识别风险

- **plan doc 解析鲁棒性**：父代理可能写出格式偏离的步骤行，导致解析失败。应对：parent-agent.md 给严格示例 + plan-doc.js 解析失败时把错误反馈给父代理 retry 一次。
- **暂停语义边界**：用户在 `awaiting_approval` 阶段发消息算"修改意见"还是"新任务"？规则：activeTask 未终态前，所有消息都视为对当前任务的输入。
- **clarifying 与 planning 切换**：父代理需明确什么时候追问、什么时候直接写文档。CONTRACT.md 给判断准则（信息完整度评估）。
- **knowledge 文件膨胀**：CONTRACT.md 设硬上限 200 行；WORLDCARD.md 等可大但需在末尾保留"快速速查"小节给模型快速命中。

### 11.2 开放点（实现期再决策，不阻塞 spec 落地）

- 父代理是否走 thinking？沿用现行约定 `thinking_level: null`（CONTRACT 已写）。
- plan doc 历史版本是否归档？当前设计是不归档；若日志需要审计可在 `/.temp/assistant/archive/` 留 1 份只读副本。**默认不归档**。
- 子代理 LLM 模型是否独立配置？沿用全局 LLM 配置，未来再考虑分级。

---

## 12. 落地顺序建议（给后续 plan 用）

1. 知识库迁移：建 `/assistant/knowledge/`，从旧 `prompts/*.md` + `CONTRACT.md` 切分内容，得到 7 份新文件
2. 后端核心：`plan-doc.js` + `apply_*` 工具集 + `sub-agent.js`
3. 后端编排：`parent-agent.js` + 新 `routes.js` + task-store 简化
4. 前端核心：`PlanDocViewer.jsx` + AssistantPanel 改造
5. 前端清理：删 ChangeProposalCard、useAssistantStore 重构
6. 删除旧轨：旧 server 文件、旧 prompts、旧 routes 端点
7. 测试：新增单元 + 集成 + 人工验证
8. 文档同步：根 `CLAUDE.md`、`ARCHITECTURE.md`、`SCHEMA.md`（不变但确认）、`CHANGELOG.md`

---

**入口规范同步**：本设计落地后需更新根 `CLAUDE.md` 中关于 `/assistant/CONTRACT.md` 的引用（指向新 `/assistant/knowledge/CONTRACT.md`），同步 `ARCHITECTURE.md` 中助手运行机制章节，并在 `CHANGELOG.md` 留一条迁移记录。
