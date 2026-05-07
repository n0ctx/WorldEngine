# 全局配置知识库（GLOBALPROMPT.md）

> 写卡助手处理 `global-config` 类任务时加载本文件。
> 行为框架（怎么生成 JSON、怎么报告父代理）见 `assistant/prompts/sub-agent.md`，不在本文件。

## 全局配置架构

全局配置（`global-config`）承载**跨所有世界都成立**的通用 prompt 与运行参数：

- 对话流：`global_system_prompt` / `global_post_prompt` / `context_history_rounds` / `memory_expansion_enabled` / `suggestion_enabled` / `llm.*`
- 写作流：`writing.*`（独立的 system / post / 历史轮数 / 记忆扩展 / llm 配置）
- 日记：`diary.chat.*` / `diary.writing.*`

不属于全局配置：

- 单个世界 / 题材的设定（属于 world-card）
- 单个角色或 `{{user}}` 的人设（属于 character-card / persona-card）
- 世界条目 / 状态字段（属于 world-card）
- CSS / 正则（属于 css-snippet / regex-rule）

## operation 限制

global-config **仅允许 `update`**。不存在 create / delete。

```json
{ "type": "global-config", "operation": "update", "changes": {}, "explanation": "简体中文，50字以内" }
```

> 不输出 `entityId`。不输出 `entryOps` / `stateFieldOps` / `stateValueOps`。

## changes 完整字段集

只输出需要修改的字段；未涉及的字段不要写入 changes。

### 顶层字段（对话流默认配置）

| 字段 | 类型 | 说明 |
|---|---|---|
| `global_system_prompt` | string | 全局对话 system prompt（受术语约束）|
| `global_post_prompt` | string | 全局对话 post prompt（受术语约束）|
| `context_history_rounds` | number | 历史消息携带轮数 |
| `memory_expansion_enabled` | boolean | 是否开启记忆展开（[9] 段位）|
| `suggestion_enabled` | boolean | 是否开启回复建议 |

### `llm`（对话流 LLM 配置）

```json
"llm": { "model": "gpt-4o", "temperature": 0.8, "max_tokens": 1200 }
```

允许 `model` / `temperature` / `max_tokens` 等非敏感字段。

### `writing`（写作流独立配置块）

```json
"writing": {
  "global_system_prompt": "完整文本",
  "global_post_prompt": "完整文本",
  "context_history_rounds": 12,
  "suggestion_enabled": false,
  "memory_expansion_enabled": true,
  "llm": { "model": "claude-sonnet", "temperature": 0.9, "max_tokens": 2000 }
}
```

writing 块是写作流的独立配置，与对话流并列、互不覆盖。

### `diary`（日记开关与日期模式）

```json
"diary": {
  "chat":    { "enabled": false, "date_mode": "virtual" },
  "writing": { "enabled": false, "date_mode": "virtual" }
}
```

- `enabled`：是否开启该空间的日记
- `date_mode`：`"virtual"`（使用世界内虚拟日期）/ `"real"`（使用真实日期）

## 禁止字段

任何 changes 都**不得输出**以下字段（防 API Key 泄露）：

- `api_key`
- `llm.api_key`
- `embedding.api_key`

## 最高原则：必须跨世界通用

写任何一句之前先问自己：

> 这句话放进古代武侠、赛博朋克、恋爱校园、克苏鲁探案里都成立吗？

- 成立 → 可以进全局
- 不成立 → 留给世界卡

### 典型正确内容（跨世界通用）

- 始终使用简体中文
- 不打破第四面墙
- 统一对话 / Markdown / 段落格式
- 写作的视角、节奏、段落组织原则
- 通用回复风格约束

### 典型错误内容（不应进全局）

- "末日世界资源稀缺"
- "帝国审判庭至高无上"
- "角色应保持黑帮口吻"
- "遇到地下黑市时补充这段 lore"

这些都是世界 / 角色 / lore 内容，应分别放进 world-card / character-card。

## 对话 vs 写作 分工

- **对话**（顶层 `global_system_prompt` / `global_post_prompt`）：用于 `{{char}}` 与 `{{user}}` 互动；写身份框架、交互原则、通用格式约束
- **写作**（`writing.global_system_prompt` / `writing.global_post_prompt`）：用于协作写作；写叙事视角、段落结构、推进节奏等通用写作规范

不要试图用全局承载具体 lore / 词条 / 百科 / 关键词触发内容——那是世界卡的工作。

## 操作手册

### 改对话全局规范

"把全局回复统一成简体中文 + 不打破第四面墙" → `changes.global_system_prompt`

### 改写作全局规范

"给写作加第三人称有限视角规范" → `changes.writing.global_system_prompt`

### 调 LLM 参数

"把默认 temperature 从 0.7 调到 0.9" → `changes.llm.temperature: 0.9`
"把写作模型换成 claude-sonnet" → `changes.writing.llm.model: "claude-sonnet"`

### 切开关

- "开启建议选项" → `changes.suggestion_enabled: true`
- "开启聊天空间日记" → `changes.diary.chat.enabled: true`
- "日记使用真实日期" → `changes.diary.chat.date_mode: "real"`

### 修改前的研究

修改全局配置前**必须**先 `preview_card(target="global-prompt")` 拉现有数据，再决定改什么；不要在不知现状的情况下覆盖已有 prompt。

## 反例

- 把"末日废土资源稀缺"写进全局
- 把"这个 `{{char}}` 性格阴郁"写进全局
- 试图通过全局新增 lore 条目（全局没有 entryOps）
- 在 changes 输出 `api_key` / `llm.api_key` / `embedding.api_key`
- 在 changes 输出 `entryOps` / `stateFieldOps` / `stateValueOps`（global-config 不支持任何条目/字段操作）
- 输出 `entityId`（全局不需要）
