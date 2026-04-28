# WorldEngine 写卡助手契约

本文件是写卡助手的唯一接口契约说明。主代理 prompt、planner、执行子代理、后端归一化器、前端任务面板都应以此为准。

## 架构概述

当前为“双轨架构”：
- **兼容轨**：`/api/assistant/chat` 仍保留旧版“主代理 + 执行子代理 + proposal 卡”对话流
- **通用 Agent 轨**：`/api/assistant/tasks*` 采用 `Task -> Plan -> Step Graph -> Proposal -> Apply` 模型

通用 Agent 组件：
- **Planner**（`task-planner.js`）：根据用户目标输出 `answer / clarify / plan`，并对 plan 结构做语义校验；校验失败时会带错误反馈做 semantic retry，而不是直接降级
- **Executor**（`task-executor.js`）：按步骤图逐步调用执行子代理；低风险步骤生成 proposal 后直接落库，高风险步骤先返回完整 proposal 供前端审阅/编辑，再统一走同一条落库边界
- **执行子代理**：`world_card_agent` / `character_card_agent` / `persona_card_agent` / `global_prompt_agent` / `css_snippet_agent` / `regex_rule_agent`
- **辅助工具**：`preview_card`（查询实体数据）、`read_file`（读取项目文件）

Planner 会先按任务形态内部分类（单资源小改、复杂世界卡、状态机世界卡、多资源创建、修复已有卡）再拆步骤；复杂/状态机世界卡应拆出基础结构、状态字段、触发条目和后续状态值填写步骤。执行子代理除 JSON 解析失败重试外，若 `normalizeProposal()` 返回明确契约错误，也会带错误反馈重试一次并要求定向修复。

### 术语约束

世界卡、角色卡、玩家卡和全局 prompt 的 CUD proposal 中，凡是会写入卡片正文、条目内容、状态字段说明、开场白或 step task 的自然语言，代入者统一写 `{{user}}`，模型扮演或回应的角色统一写 `{{char}}`。接口字段名、枚举值和既有状态条件标签保持 schema 原样，例如 `target:"persona"`、`keyword_scope:"user"`、`target_field:"玩家.HP"` 不改名。

## 1. `/api/assistant/tasks`

### 请求体

```json
{
  "message": "用户输入",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "context": {
    "worldId": "可选",
    "characterId": "可选",
    "world": {},
    "character": {},
    "config": {}
  }
}
```

### 任务状态

`researching | clarifying | planning | awaiting_plan_approval | executing | awaiting_step_approval | completed | failed | cancelled`

### SSE 事件

#### `task_created`

```json
{ "type": "task_created", "taskId": "task-xxxx", "task": {} }
```

#### `clarification_requested`

```json
{ "type": "clarification_requested", "taskId": "task-xxxx", "summary": "...", "questions": ["...", "..."], "task": {} }
```

#### `plan_ready`

```json
{ "type": "plan_ready", "taskId": "task-xxxx", "plan": { "summary": "...", "assumptions": [], "steps": [] }, "riskFlags": [], "task": {} }
```

#### `plan_approved`

```json
{ "type": "plan_approved", "taskId": "task-xxxx", "task": {} }
```

#### `step_started`

```json
{ "type": "step_started", "taskId": "task-xxxx", "stepId": "step-1", "step": {} }
```

#### `step_proposal_ready`

```json
{
  "type": "step_proposal_ready",
  "taskId": "task-xxxx",
  "stepId": "step-1",
  "proposal": {},
  "proposalSummary": {},
  "step": {}
}
```

#### `step_approval_requested`

```json
{ "type": "step_approval_requested", "taskId": "task-xxxx", "stepId": "step-1", "step": {} }
```

说明：
- 高风险步骤现在总是先经历 `step_started -> step_proposal_ready -> step_approval_requested`
- 前端可以直接基于 `proposal` 展示完整变更、允许用户编辑 `changes / entryOps / stateFieldOps / stateValueOps`
- 审批后的编辑内容仍会在服务端重新走 `normalizeProposal()`，与旧 `/api/assistant/execute` 共享同级安全边界

#### `step_completed`

```json
{ "type": "step_completed", "taskId": "task-xxxx", "stepId": "step-1", "result": {}, "step": {} }
```

#### `task_completed` / `task_failed`

```json
{ "type": "task_completed", "taskId": "task-xxxx" }
{ "type": "task_failed", "taskId": "task-xxxx", "error": "..." }
```

#### `delta` / `done`

说明性问答场景仍可直接流式输出文本：

```json
{ "delta": "流式文本片段" }
{ "done": true }
```

### 计划 Step Schema

```json
{
  "id": "step-create-world",
  "title": "创建世界卡",
  "kind": "proposal",
  "targetType": "world-card",
  "operation": "create|update|delete",
  "entityRef": null,
  "dependsOn": [],
  "task": "给对应子代理的自然语言任务说明",
  "riskLevel": "low|medium|high",
  "approvalPolicy": "plan_only|requires_step_approval"
}
```

`entityRef` 允许取值：
- `null`
- `context.worldId`
- `context.characterId`
- `step:<stepId>`（引用前序步骤创建出的实体 ID）

Planner plan 校验最少包含：
- `targetType` 必须属于资源域代理白名单，且 `operation` 与之匹配
- `dependsOn` 只能引用已存在的前序 step，不能自依赖
- `entityRef` 只能使用允许格式；若写 `step:<stepId>`，`dependsOn` 必须同时包含该 step
- `character-card create` / `persona-card create` 必须显式依赖世界来源（`context.worldId` 或前置 `world-card create`）
- `update/delete` 步骤必须带可解析 `entityRef`
- 删除/清空/覆盖/重置类步骤必须显式标记 `riskLevel: "high"`

### 相关接口

- `POST /api/assistant/tasks/:taskId/answer`
- `POST /api/assistant/tasks/:taskId/approve-plan`
- `POST /api/assistant/tasks/:taskId/approve-step`
- `POST /api/assistant/tasks/:taskId/cancel`
- `GET /api/assistant/tasks/:taskId`

### `POST /api/assistant/tasks/:taskId/approve-step`

请求体：

```json
{
  "stepId": "可选，默认使用 task.awaitingStepId",
  "editedProposal": {
    "changes": {},
    "entryOps": [],
    "stateFieldOps": [],
    "stateValueOps": []
  }
}
```

约束：
- `editedProposal` 只允许覆盖 proposal 内容，不允许越权改写 `type / operation / entityId`
- 服务端会以原 proposal 的锁定元信息为准重新 `normalizeProposal()`

## 2. `/api/assistant/chat`

### 请求体

```json
{
  "message": "用户输入",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "context": {
    "worldId": "可选",
    "characterId": "可选",
    "world": {},
    "character": {},
    "config": {}
  }
}
```

### SSE 事件

#### `routing`

skill 开始执行时发送。

```json
{ "type": "routing", "taskId": "sk-xxxxxxxx", "target": "world-card", "task": "..." }
```

#### `proposal`

skill 成功生成提案时发送。

```json
{ "type": "proposal", "taskId": "sk-xxxxxxxx", "token": "uuid", "proposal": {} }
```

#### `tool_call`

主代理调用读取类工具（`preview_card` / `read_file`）时发送，用于前端显示进度提示。子代理调用不发此事件（由 `routing` 覆盖）。

```json
{ "type": "tool_call", "name": "preview_card" }
```

#### `thinking`

skill 执行中的心跳（每 5 秒一次）。

```json
{ "type": "thinking", "taskId": "sk-xxxxxxxx" }
```

#### `error`

skill 执行失败时发送。

```json
{ "type": "error", "error": "错误信息", "taskId": "sk-xxxxxxxx" }
```

#### `delta`

主代理流式回复文本片段。

```json
{ "delta": "流式文本片段" }
```

#### `done`

主代理流式回复结束。

```json
{ "done": true }
```

## 3. Proposal 顶层 schema

所有 proposal 顶层都必须是 JSON object。

### `world-card`

```json
{
  "type": "world-card",
  "operation": "create|update|delete",
  "entityId": "worldId 或 null",
  "changes": {},
  "entryOps": [],
  "stateFieldOps": [],
  "explanation": "..."
}
```

### `character-card`

```json
{
  "type": "character-card",
  "operation": "create|update|delete",
  "entityId": "characterId 或 worldId 或 null",
  "changes": {},
  "stateValueOps": [],
  "explanation": "..."
}
```

### `persona-card`

```json
{
  "type": "persona-card",
  "operation": "create|update",
  "entityId": "worldId",
  "changes": {},
  "stateValueOps": [],
  "explanation": "..."
}
```

### `global-config`

```json
{
  "type": "global-config",
  "operation": "update",
  "changes": {},
  "explanation": "..."
}
```

### `css-snippet`

```json
{
  "type": "css-snippet",
  "operation": "create|update|delete",
  "entityId": "snippetId（update/delete 时必填）",
  "changes": {},
  "explanation": "..."
}
```

### `regex-rule`

```json
{
  "type": "regex-rule",
  "operation": "create|update|delete",
  "entityId": "ruleId（update/delete 时必填）",
  "changes": {},
  "explanation": "..."
}
```

## 4. Operation 约束

| Skill | 允许 operation |
|---|---|
| `world_card_skill` | create / update / delete |
| `character_card_skill` | create / update / delete |
| `persona_card_skill` | create / update |
| `global_prompt_skill` | update 仅 |
| `css_snippet_skill` | create / update / delete |
| `regex_rule_skill` | create / update / delete |

**entryOps 支持说明**：只有 `world_card_skill` 支持 `entryOps`；`character_card_skill` / `persona_card_skill` / `global_prompt_skill` 均不支持。

## 5. `changes` 准确格式

### `world-card.changes`

```json
{
  "name": "世界名",
  "description": "一句话简介",
  "temperature": 0.8,
  "max_tokens": 1200
}
```

世界内容（背景、后置提醒）通过 `entryOps` 的常驻条目（`trigger_type:"always"`）管理，`changes` 中禁止出现 `system_prompt` / `post_prompt`。

### `character-card.changes`

```json
{
  "name": "角色名",
  "description": "一句话简介",
  "system_prompt": "完整文本",
  "post_prompt": "完整文本",
  "first_message": "完整开场白"
}
```

### `persona-card.changes`

```json
{
  "name": "玩家名",
  "description": "一句话简介",
  "system_prompt": "完整文本"
}
```

### `global-config.changes`

```json
{
  "global_system_prompt": "完整文本",
  "global_post_prompt": "完整文本",
  "context_history_rounds": 10,
  "memory_expansion_enabled": true,
  "suggestion_enabled": false,
  "llm": {
    "model": "gpt-4o",
    "temperature": 0.8,
    "max_tokens": 1200
  },
  "writing": {
    "global_system_prompt": "完整文本",
    "global_post_prompt": "完整文本",
    "context_history_rounds": 12,
    "suggestion_enabled": false,
    "memory_expansion_enabled": true,
    "llm": {
      "model": "claude-sonnet",
      "temperature": 0.9,
      "max_tokens": 2000
    }
  },
  "diary": {
    "chat": { "enabled": false, "date_mode": "virtual" },
    "writing": { "enabled": false, "date_mode": "virtual" }
  }
}
```

禁止输出：
- `api_key`
- `llm.api_key`
- `embedding.api_key`

### `css-snippet.changes`

```json
{
  "name": "片段名称",
  "content": ":root {\n  --we-paper-base: #111827;\n}",
  "mode": "chat",
  "enabled": 1
}
```

### `regex-rule.changes`

```json
{
  "name": "规则名称",
  "pattern": "<think>([\\s\\S]*?)</think>",
  "replacement": "<div class=\"thinking-block\">$1</div>",
  "flags": "gs",
  "scope": "display_only",
  "world_id": null,
  "mode": "chat",
  "enabled": 1
}
```

## 5. `entryOps`

基础格式（仅适用于 world-card）：

```json
{ "op": "create", "title": "标题", "description": "触发条件（1-2句话）", "content": "正文", "keywords": ["a", "b"], "keyword_scope": "user,assistant", "token": 1 }
```

```json
{ "op": "update", "id": "现有条目ID", "title": "标题", "content": "正文", "keywords": ["a", "b"], "token": 1 }
```

```json
{ "op": "delete", "id": "现有条目ID" }
```

`description`（触发条件）：1-2 句话描述**何时**触发，为空则降级为纯关键词。

`keyword_scope` 取值：`"user"`（仅用户消息）/ `"assistant"`（仅 AI 消息）/ `"user,assistant"`（默认）。

`token`：注入顺序权重，整数 ≥ 1，越小越靠前（默认 1）。

**`trigger_type` 字段（world-card entryOps 必填）**：
- `"always"` — 常驻条目，每轮必注入
- `"keyword"` — 关键词命中时注入
- `"llm"` — 向量相似度召回时注入
- `"state"` — 当前会话所有状态条件满足时注入（需配合 `conditions` 数组）

注意：`position` 字段已废弃，不再消费，不要在提案中输出。所有世界条目统一在 [7] 位置注入。

**`conditions` 字段（trigger_type:"state" 时使用）**：

```json
[
  { "target_field": "玩家.HP", "operator": "<", "value": "30" },
  { "target_field": "世界.天气", "operator": "等于", "value": "暴雨" }
]
```

约束：

- `target_field` 必须使用真实字段标签：`世界.xxx` / `玩家.xxx` / `角色.xxx`
- 不要只写裸 `field_key`，例如 `"hp"`
- 数值操作符：`>` / `<` / `=` / `>=` / `<=` / `!=`
- 文本操作符：`包含` / `等于` / `不包含`

world-card 常驻条目 create 格式：
```json
{
  "op": "create",
  "title": "世界背景",
  "description": "",
  "content": "完整内容",
  "keywords": [],
  "keyword_scope": "user,assistant",
  "trigger_type": "always",
  "token": 1
}
```

## 6. `stateFieldOps`

### create

```json
{
  "op": "create",
  "target": "world|persona|character",
  "field_key": "hp",
  "label": "生命值",
  "type": "number|text|enum|list|boolean",
  "description": "字段描述",
  "default_value": "100",
  "update_mode": "llm_auto|manual",
  "update_instruction": "更新指令",
  "enum_options": ["正常", "受伤"],
  "min_value": 0,
  "max_value": 100,
  "allow_empty": 1
}
```

### update

只输出需要修改的字段（id 和 target 必填）：

```json
{ "op": "update", "target": "world|persona|character", "id": "现有字段ID", "label": "新标签", "default_value": "200" }
```

### delete

```json
{ "op": "delete", "target": "world|persona|character", "id": "现有字段ID" }
```

类型约束：
- `world-card`：允许 `world|persona|character`
- `character-card`：不允许 `stateFieldOps`
- `persona-card`：不允许 `stateFieldOps`

## 6.5 `stateValueOps`

用于填写**已经存在**的状态字段值，不负责创建或删除字段模板。

### 基础格式

```json
{ "target": "character|persona", "field_key": "hp", "value_json": "100" }
```

约束：
- `value_json` 必须是 JSON 字符串或 `null`
- `character-card`：只允许 `target:"character"`
- `persona-card`：只允许 `target:"persona"`
- `world-card`：不允许 `stateValueOps`
- `field_key` 必须对应当前世界里已经存在的状态字段；未知字段在执行时会报错
- `stateValueOps` 只写默认状态值，不改运行时会话状态

## 7. `/api/assistant/execute`

### 请求体

```json
{
  "token": "服务器签发的一次性 token",
  "worldRefId": "可选，依赖世界 create 时使用",
  "editedProposal": {
    "changes": {},
    "stateFieldOps": [],
    "stateValueOps": []
  }
}
```

约束：
- `editedProposal` 只能覆盖 `changes` / `entryOps` / `stateFieldOps` / `stateValueOps`
- 其中 `entryOps` 仅对 `world-card` 有效
- `type` / `operation` / `entityId` / `taskId` 以 token 锚定的原提案为准
