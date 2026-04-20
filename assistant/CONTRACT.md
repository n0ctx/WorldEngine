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
  "entryOps": [],
  "stateFieldOps": [],
  "explanation": "..."
}
```

### `persona-card`

```json
{
  "type": "persona-card",
  "operation": "update",
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
  "operation": "create",
  "changes": {},
  "explanation": "..."
}
```

### `regex-rule`

```json
{
  "type": "regex-rule",
  "operation": "create",
  "changes": {},
  "explanation": "..."
}
```

## 3. Operation 约束

| Skill | 允许 operation |
|---|---|
| `world_card_skill` | create / update / delete |
| `character_card_skill` | create / update / delete |
| `persona_card_skill` | update 仅 |
| `global_prompt_skill` | update 仅 |
| `css_snippet_skill` | create 仅 |
| `regex_rule_skill` | create 仅 |

## 4. `changes` 准确格式

### `world-card.changes`

```json
{
  "name": "世界名",
  "system_prompt": "完整文本",
  "post_prompt": "完整文本",
  "temperature": 0.8,
  "max_tokens": 1200
}
```

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

```json
{ "op": "create", "title": "标题", "description": "触发条件（1-2句话）", "content": "正文", "keywords": ["a", "b"], "keyword_scope": "user,assistant" }
```

```json
{ "op": "update", "id": "现有条目ID", "title": "标题", "description": "触发条件（1-2句话）", "content": "正文", "keywords": ["a", "b"], "keyword_scope": "user,assistant" }
```

```json
{ "op": "delete", "id": "现有条目ID" }
```

全局条目在 `create` 时额外允许 `mode` 字段：

```json
{ "op": "create", "title": "标题", "description": "触发条件（1-2句话）", "content": "正文", "keywords": ["a"], "keyword_scope": "user,assistant", "mode": "chat" }
```

`description`（触发条件）：1-2 句话描述**何时**触发，为空则降级为纯关键词触发。

`keyword_scope` 取值：`"user"`（仅用户消息）/ `"assistant"`（仅 AI 消息）/ `"user,assistant"`（默认）。

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
