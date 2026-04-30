# Prompt 组装机制

本文说明 WorldEngine 如何将各层配置、状态、记忆拼装成最终发送给 LLM 的提示词。面向开发者和想深入理解系统行为的用户。

---

## 核心设计思路

WorldEngine 的提示词不是一个静态的系统提示词，而是每轮根据当前上下文动态组装的 14 段结构。这个设计解决了三个问题：

1. **只注入当前场景需要的设定**：提示词条目按触发类型动态激活，避免无关内容稀释 AI 注意力
2. **分层缓存降低成本**：稳定的前缀段走 Prompt Cache，每轮只有动态段重新计费
3. **状态和记忆自动注入**：不需要用户手动维护"当前状态是什么"

---

## Cached / Dynamic 分层

14 段按稳定性分为两层：

```
┌──────────────────────────────────────────────────────────┐
│ Cached 层（[1]-[4]）                                      │
│ 内容稳定，跨轮次不变，走 Prompt Cache                     │
│                                                          │
│ [1] 全局系统提示词                                        │
│ [2] Persona 人设                                         │
│ [3] 角色系统提示词（Chat 模式）                           │
│ [4] 常驻 cached 条目（always 且 token=0）                 │
├──────────────────────────────────────────────────────────┤
│ Dynamic 层（[5]-[11]）                                    │
│ 每轮根据当前状态/召回结果动态计算                         │
│                                                          │
│ [5] 世界状态                                             │
│ [6] 玩家（Persona）状态                                  │
│ [7] 角色状态                                             │
│ [8] 触发的提示词条目（keyword / llm / state / always）   │
│ [8.5] 长期记忆                                           │
│ [9] 向量召回的历史摘要                                    │
│ [10] 展开的 turn record 原文                             │
│ [11] 日记注入                                            │
├──────────────────────────────────────────────────────────┤
│ Historical（[12]）                                       │
│ 最近 N 轮历史消息（role: user / assistant）              │
├──────────────────────────────────────────────────────────┤
│ Bottom（[13]-[14]）                                      │
│                                                          │
│ [13] 后置提示词（独立 role:system，在历史消息之后）       │
│ [14] 当前用户消息（role:user）                           │
└──────────────────────────────────────────────────────────┘
```

[1]-[11] 合并为单条 `role:system` 消息发送给 LLM。

---

## 14 段详解

### [1] 全局系统提示词
来源：`config.global_system_prompt`。对所有世界、所有角色生效。为空时跳过。

### [2] Persona 人设
格式：`[{{user}}人设]\n名字：${name}\n${system_prompt}`。name 和 system_prompt 均为空时跳过。

### [3] 角色系统提示词
格式：`[{{char}}人设]\n${character.system_prompt}`。Chat 模式走 Cached 层；Writing 模式因多角色组合变化频繁，降级到 Dynamic 层（避免每次切换角色组合都 cache miss）。为空时跳过。

### [4] 常驻 cached 条目
`always` 类型且 `token=0` 的提示词条目，按 `sort_order ASC` 稳定排序拼入 Cached 层末尾。每条格式：`【${title}】\n${content}`。这类条目不参与动态匹配，直接进入缓存前缀，跨轮次不重复计费。

### [5] 世界状态
`renderWorldState(world.id)` 渲染当前会话的世界状态字段值。无字段或无值时跳过。

### [6] 玩家（Persona）状态
`renderPersonaState(world.id)` 渲染当前 Persona 的状态字段。为空时跳过。

### [7] 角色状态
`renderCharacterState(character.id)` 渲染角色状态字段。Writing 模式循环所有激活角色。为空时跳过。

### [8] 触发的提示词条目
`matchEntries(sessionId, worldEntries, worldId)` 对世界的提示词条目做动态匹配，支持四种分支：
- `always`：直接命中（token=0 的已在 [4] 处理，不再参与此处）
- `keyword`：扫描用户最近消息是否含配置的关键词
- `llm`：AI 预判当前上下文与该条目的语义相关性（向量相似度 + 关键词兜底）
- `state`：加载 `entry_conditions`，读取当前会话状态值，AND 逻辑全部满足才命中

所有命中条目统一注入此处，无排序权重混合（llm 类按 token 权重排序）。Writing 模式只注入世界级条目，不消费角色级条目。

### [8.5] 长期记忆
当 `config.long_term_memory_enabled` 开启且对应会话的 `memory.md` 非空时，注入 `[长期记忆]\n{content}`。关闭开关只停止注入，磁盘文件保留。写作模式读 `config.writing.long_term_memory_enabled`。

### [9] 向量召回的历史摘要
`searchRecalledSummaries` 对当前用户消息做向量搜索，从历史 turn record 摘要中召回最相关的几条，格式化为可读文本注入上下文。已排除当前历史窗口内的轮次（避免重复）。无命中时跳过。

### [10] 展开的 turn record 原文
`decideExpansion` 进一步判断召回的摘要是否需要展开成完整原文（让 AI 看到完整对话而不只是摘要）。决策本身由副模型完成。无展开时跳过。

### [11] 日记注入
前端请求体的 `diaryInjection` 字段，格式 `[日记注入]\n{content}`。仅生效一次，前端发送后清空。为空时跳过。

### [12] 历史消息
最近 `context_history_rounds` 个已完成轮次的原始消息（role: user / assistant）。每条经 `applyRules(content, 'prompt_only', worldId)` 处理（`prompt_only` 作用域的正则替换）。

### [13] 后置提示词
历史消息之后的独立 `role:system`。来源：`global_post_prompt` 和/或 `character.post_prompt`（Writing 模式只用 `writing.global_post_prompt`）。均为空时跳过。位置放在历史消息之后而非之前，是为了让最终指令对 AI 的影响更直接。

### [14] 当前用户消息
DB 中最新的 `role:user` 消息（刚存入的那条），经 `applyRules` 处理。若 `suggestion_enabled=true`，在末尾追加选项指令（`SUGGESTION_PROMPT`），紧贴生成前最后位置以提升模型遵从率。

---

## Writing 模式的差异

Writing 模式复用同一套组装逻辑，但有以下调整：

| 段 | Chat 模式 | Writing 模式 |
|---|---|---|
| [3] 角色 system prompt | Cached 层 | Dynamic 层（避免多角色 cache miss） |
| [7] 角色状态 | 单角色 | 循环所有激活角色 |
| [8] 条目匹配 | 世界 + 角色条目 | 仅世界条目 |
| [13] 后置提示词 | global_post_prompt + character.post_prompt | 仅 writing.global_post_prompt |

---

## 多 Provider 的缓存适配

同一套组装结果，各 provider 的缓存处理不同：

| Provider | 缓存方式 |
|---|---|
| Anthropic Claude | 自动在 [1-4] 末尾加 `cache_control: { type: 'ephemeral' }` |
| OpenAI-compatible（含 DeepSeek / Grok / SiliconFlow 等） | 将单条 system 拆成两条：第 1 条仅含稳定前缀 [1-4]，第 2 条含动态后缀 [5-11]，最大化前缀缓存命中 |
| Gemini 2.5 系列 | 依赖 implicit caching 自动命中前缀 |
| Gemini 3.x 系列 | 通过 explicit `cachedContents` API 缓存（`cacheableSystem.length ≥ 4000` 时生效，TTL 600s） |
| Ollama | 无 prompt cache |

Grok 额外发送 `x-grok-conv-id` HTTP header（值为 sessionId），将同一会话路由到同一缓存服务器，避免多服务器场景下 cache miss。

---

## 生成参数

`temperature` 和 `max_tokens` 按层级回退：世界级配置 → 全局配置。世界级字段为 `NULL` 时回退全局。Writing 模式支持独立的写作主模型配置（`config.writing.llm`），provider 为 `null` 时回退对话主模型。

---

## 主模型 / 副模型分工

| 任务 | 使用模型 |
|---|---|
| 对话流式生成 | 主模型（`config.llm`） |
| 写作流式生成 | 写作主模型（`config.writing.llm` → 回退主模型） |
| turn record 摘要生成 | 副模型（`config.aux_llm` → 回退主模型） |
| 状态更新推理 | 副模型 |
| 记忆展开判定 | 副模型 |
| 会话标题生成 | 副模型 |
| 写卡助手 | 可配置为主模型或副模型 |

副模型配置为 `null` 时自动回退主模型，无需手动配置副模型也可正常使用所有功能。
