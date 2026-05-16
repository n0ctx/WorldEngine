# 全局配置知识库（GLOBALPROMPT.md）

> 写卡助手处理 `global-config` 类任务时加载本文件。
> 行为框架（怎么生成 JSON、怎么报告父代理）见 `assistant/prompts/sub-agent.md`，不在本文件。

## 全局配置架构

全局配置（`global-config`）承载**跨所有世界都成立**的通用 prompt 与运行参数。真源：`backend/services/config.js` 的 `DEFAULT_CONFIG`。changes 接受**深合并 patch**——只输出需要改的键，不要为了"完整"重发全部字段。

涵盖范围：

- 对话流：顶层 `global_system_prompt` / `global_post_prompt` / 历史窗口 / 记忆 / 建议 / `llm.*`
- 写作流：`writing.*`（独立的 system/post/历史轮数/记忆/llm/aux_llm，子键留 `null` 表示沿用顶层）
- 日记：`diary.chat.*` / `diary.writing.*`
- 嵌入向量：`embedding.*`
- 副模型（用于自动状态更新等轻任务）：顶层 `aux_llm.*` 与 `writing.aux_llm.*`
- UI：`ui.*`（主题、字体、思考链显示、token 用量等）
- 日志：`logging.*`
- 写卡助手自身：`assistant.*`
- 共享 API Key 池：`provider_keys`

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

只输出**需要修改**的字段。下表按分组列出全部允许键；类型、默认值以 `backend/services/config.js` 的 `DEFAULT_CONFIG` 为准。

### 顶层（对话流默认）

| 字段 | 类型 | 说明 |
|---|---|---|
| `global_system_prompt` | string | 全局对话 system prompt（受术语约束）|
| `global_post_prompt` | string | 全局对话 post prompt（受术语约束）|
| `context_history_rounds` | number | 对话上下文历史窗口（默认 10）|
| `chapter_turn_size` | number | 对话每章轮数（默认 20）|
| `page_turn_size` | number | 对话翻页阈值（默认 50）|
| `memory_expansion_enabled` | boolean | 记忆扩展（[9] 段位短期记忆复用）|
| `long_term_memory_enabled` | boolean | 长期记忆/历史会话召回开关（对话流）|
| `memory_recall_max_sessions` | number | 长期记忆召回 topK 上限（默认 5）|
| `suggestion_enabled` | boolean | 回复建议开关 |
| `proxy_url` | string | LLM/Embedding 出网代理（如 `http://127.0.0.1:7890`）|

### `llm`（对话主模型）

```json
"llm": {
  "provider": "openai",      // 'openai' | 'anthropic' | 'google' | ...
  "provider_models": {},      // 每个 provider 上次选过的模型缓存
  "base_url": "",             // 自定义 endpoint；留空走默认
  "model": "",                // 当前激活模型名
  "temperature": 0.8,
  "max_tokens": 4096,
  "thinking_level": null      // null / 'minimal' / 'low' / 'medium' / 'high'（仅支持 reasoning 模型）
}
```

> API Key **不在 llm 块里**，统一存 `provider_keys`。

### `embedding`（嵌入向量模型）

```json
"embedding": {
  "provider": "openai",
  "provider_models": {},
  "base_url": "",
  "model": "text-embedding-3-small"
}
```

### `aux_llm`（对话副模型，自动状态更新等轻任务）

```json
"aux_llm": {
  "provider": null,           // null 表示回退到主 llm
  "provider_models": {},
  "base_url": null,
  "model": null,
  "thinking_level": null
}
```

`provider=null` 时所有副模型调用回退到 `llm.*`。

### `writing`（写作流独立配置块）

子键留 `null` 表示**沿用顶层对话流**对应字段；显式赋值则覆盖。

```json
"writing": {
  "global_system_prompt": "",
  "global_post_prompt": "",
  "context_history_rounds": null,        // null → 沿用顶层
  "chapter_turn_size": null,             // null → 沿用顶层
  "page_turn_size": null,                // null → 沿用顶层
  "suggestion_enabled": false,
  "memory_expansion_enabled": true,
  "long_term_memory_enabled": false,
  "saved_nearby_recall_enabled": true,    // 写作流"附近角色"记忆召回开关
  "llm":     { "provider": null, "provider_models": {}, "base_url": null, "model": "", "temperature": null, "max_tokens": null, "thinking_level": null },
  "aux_llm": { "provider": null, "provider_models": {}, "base_url": null, "model": null, "thinking_level": null }
}
```

回退链（写作副模型）：`writing.aux_llm` → `aux_llm` → `llm`。

### `diary`（日记开关与日期模式）

```json
"diary": {
  "chat":    { "enabled": false, "date_mode": "virtual" },
  "writing": { "enabled": false, "date_mode": "virtual" }
}
```

- `enabled`：是否开启该空间的日记
- `date_mode`：`"virtual"`（使用世界内虚拟日期）/ `"real"`（使用真实日期）

### `ui`

```json
"ui": {
  "theme": "classic-parchment",
  "font_size": 16,
  "custom_css": "",
  "show_thinking": true,
  "auto_collapse_thinking": true,
  "show_token_usage": false
}
```

> **`ui.theme` 注意**：这是"当前激活主题"的开关，**只应由用户在设置面板手动切换**。`apply_theme` 创建/修改主题后**不要**通过 global-config 顺手改 `ui.theme`，否则就是越权替用户换主题。

### `logging`

```json
"logging": {
  "mode": "metadata",          // 'metadata' | 'raw'
  "max_preview_chars": 600,     // ≥120
  "modules": {},                // { "<moduleName>": true/false } 细粒度模块开关
  "prompt":  { "enabled": false },
  "llm_raw": { "enabled": false }
}
```

### `assistant`（写卡助手自身）

```json
"assistant": { "model_source": "main" }  // 'main' = 用主模型；'aux' = 用副模型
```

### `provider_keys`（共享 API Key 池）

```json
"provider_keys": { "openai": "sk-...", "anthropic": "sk-ant-..." }
```

> **不要通过 `apply_global_config` 改 API Key**。后端禁止 `api_key` / `llm.api_key` / `embedding.api_key`；如果用户要求"帮我把 key 设成 X"，应在 explanation 里说明"key 必须用户在设置面板手动填，助手不写 key"，并跳过该步。
> 即便写 `provider_keys`，工具层不会主动剥离它，但出于安全，**助手默认不要触碰 `provider_keys`**，让用户自己在设置里填。

## 禁止字段

任何 changes 都**不得输出**以下字段（写卡助手层与后端会自动剥离）：

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

- "把默认 temperature 从 0.7 调到 0.9" → `changes.llm.temperature: 0.9`
- "把写作模型换成 claude-sonnet-4-6" → `changes.writing.llm.model: "claude-sonnet-4-6"`（provider 不变可不写；要换 provider 同时写 `provider`）
- "开 thinking 中等档" → `changes.llm.thinking_level: "medium"`
- "写作流恢复跟随对话流的轮数" → `changes.writing.context_history_rounds: null`

### 切开关

- "开启建议选项" → `changes.suggestion_enabled: true`
- "开启聊天空间日记" → `changes.diary.chat.enabled: true`
- "日记使用真实日期" → `changes.diary.chat.date_mode: "real"`
- "把长期记忆召回 topK 改成 8" → `changes.memory_recall_max_sessions: 8`
- "写作里关掉附近角色召回" → `changes.writing.saved_nearby_recall_enabled: false`
- "助手用副模型跑" → `changes.assistant.model_source: "aux"`

### 改 UI（谨慎）

- "把字号调到 18" → `changes.ui.font_size: 18`
- "默认折叠思考链" → `changes.ui.auto_collapse_thinking: true`
- **不要**通过 `changes.ui.theme` 替用户切主题，应该让用户自己在设置面板切

### 修改前的研究

修改全局配置前**必须**先 `preview_card(target="global-prompt")` 拉现有数据，再决定改什么；不要在不知现状的情况下覆盖已有 prompt。

## 反例

- 把"末日废土资源稀缺"写进全局
- 把"这个 `{{char}}` 性格阴郁"写进全局
- 试图通过全局新增 lore 条目（全局没有 entryOps）
- 在 changes 输出 `api_key` / `llm.api_key` / `embedding.api_key`
- 在 changes 输出 `entryOps` / `stateFieldOps` / `stateValueOps`（global-config 不支持任何条目/字段操作）
- 输出 `entityId`（全局不需要）
- 用 `changes.ui.theme` 替用户切主题（越权；激活主题只由用户在设置面板切）
- 不必要地动 `provider_keys`（API Key 应由用户自填）
