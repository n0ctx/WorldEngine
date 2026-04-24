# WorldEngine 写卡助手契约

本文件是写卡助手的唯一接口契约说明。主代理 prompt、skill prompt、后端归一化器、前端提案卡都应以此为准。

## 架构概述

主代理 + 执行子代理架构：
- **主代理**（`main-agent.js`）：接收用户消息，先研究现状（调用 `preview_card` / `read_file`），再通过工具调用循环（`resolveToolContext`）分发任务给执行子代理，最后流式生成回复
- **执行子代理**：`world_card_agent` / `character_card_agent` / `persona_card_agent` / `global_prompt_agent` / `css_snippet_agent` / `regex_rule_agent`，每个子代理是一个 LLM tool，执行时以 SSE 事件向前端推送提案
- **辅助工具**：`preview_card`（查询实体数据）、`read_file`（读取项目文件）

## 1. `/api/assistant/chat`

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

## 2. Proposal 顶层 schema

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
  "stateFieldOps": [],
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
  "stateFieldOps": [],
  "explanation": "..."
}
```

### `global-config`

```json
{
  "type": "global-config",
  "operation": "update",
  "changes": {},
  "entryOps": [],
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

## 3. Operation 约束

| Skill | 允许 operation |
|---|---|
| `world_card_skill` | create / update / delete |
| `character_card_skill` | create / update / delete |
| `persona_card_skill` | create / update |
| `global_prompt_skill` | update 仅 |
| `css_snippet_skill` | create / update / delete |
| `regex_rule_skill` | create / update / delete |

**entryOps 支持说明**：`world_card_skill` 和 `global_prompt_skill` 支持 `entryOps`；`character_card_skill` 不支持（字段将被忽略）。全局 entryOps（global-config）为纯关键词类型，无 trigger_type，有 mode 字段。

## 4. `changes` 准确格式

### `world-card.changes`

```json
{
  "name": "世界名",
  "temperature": 0.8,
  "max_tokens": 1200
}
```

世界内容（背景、后置提醒）通过 `entryOps` 的常驻条目（`trigger_type:"always"`）管理，`changes` 中禁止出现 `system_prompt` / `post_prompt`。

### `character-card.changes`

```json
{
  "name": "角色名",
  "system_prompt": "完整文本",
  "post_prompt": "完整文本",
  "first_message": "完整开场白"
}
```

### `persona-card.changes`

```json
{
  "name": "玩家名",
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
  "llm": {
    "model": "gpt-4o",
    "temperature": 0.8,
    "max_tokens": 1200
  },
  "writing": {
    "global_system_prompt": "完整文本",
    "global_post_prompt": "完整文本",
    "context_history_rounds": 12,
    "llm": {
      "model": "claude-sonnet",
      "temperature": 0.9,
      "max_tokens": 2000
    }
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

基础格式（适用于 world-card 和 global-config）：

```json
{ "op": "create", "title": "标题", "description": "触发条件（1-2句话）", "content": "正文", "keywords": ["a", "b"], "keyword_scope": "user,assistant", "token": 1 }
```

```json
{ "op": "update", "id": "现有条目ID", "title": "标题", "content": "正文", "keywords": ["a", "b"], "token": 1 }
```

```json
{ "op": "delete", "id": "现有条目ID" }
```

`description`（触发条件）：1-2 句话描述**何时**触发，为空则降级为纯关键词触发。

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
  { "target_field": "hp", "operator": "lt", "value": "30" },
  { "target_field": "weather", "operator": "eq", "value": "storm" }
]
```

支持的 `operator`：`eq` / `ne` / `gt` / `lt` / `gte` / `lte` / `contains` / `not_contains`

**global-config entryOps 额外字段**（全局条目无 trigger_type，仅关键词触发）：

```json
{
  "op": "create",
  "title": "条目标题",
  "description": "触发条件",
  "content": "注入内容",
  "keywords": ["关键词"],
  "keyword_scope": "user,assistant",
  "mode": "chat",
  "token": 1
}
```

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
  "trigger_mode": "manual_only|every_turn|keyword_based",
  "trigger_keywords": ["受伤", "治疗"],
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
- `character-card`：允许 `persona|character`
- `persona-card`：只允许 `persona`

## 7. `/api/assistant/execute`

### 请求体

```json
{
  "token": "服务器签发的一次性 token",
  "worldRefId": "可选，依赖世界 create 时使用",
  "editedProposal": {
    "changes": {},
    "entryOps": [],
    "stateFieldOps": []
  }
}
```

约束：
- `editedProposal` 只能覆盖 `changes` / `entryOps` / `stateFieldOps`
- `type` / `operation` / `entityId` / `taskId` 以 token 锚定的原提案为准
