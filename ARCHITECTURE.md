# WorldEngine — 架构参考

> 目标读者：AI 助手。覆盖式更新，不追加历史。最后更新：2026-04-27
> 数据库字段权威来源见 SCHEMA.md，约束规则见 CLAUDE.md。

## §0 文档边界

本文件只描述“系统当前如何运行”，不负责：
- 数据库字段真名、配置键真名、导入导出格式
- 工程执行规范
- 历史迁移过程

使用规则：
- 字段、表、JSON 结构以 `SCHEMA.md` 为准
- 任务流程、锁定文件、文档治理以 `CLAUDE.md` 为准
- 历史兼容背景和已踩坑以 `CHANGELOG.md` 为准

更新触发：
- 修改 `backend/prompts/assembler.js`、`backend/routes/`、`backend/app/`、`backend/memory/`、`backend/services/` 的对外行为时，必须检查本文件是否需要同步
- 修改助手协议、SSE 事件、写作流程、状态系统行为时，必须同步本文件相关章节

---

## §1 项目定位

WorldEngine 是面向创意写作/角色扮演的本地 LLM 前端。核心特点：在角色之上增加"世界"层，记忆系统包含 turn record 摘要（会话时间线）、角色状态栏、世界状态栏、向量召回四部分，状态栏按会话级隔离，并支持按世界配置状态字段模板；提示词采用渐进式披露。

**架构层级**：`全局 → 世界 → 角色 → 会话`，每层有独立的提示词、配置和记忆，下层不可覆盖上层。

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite + TailwindCSS + Zustand |
| 后端 | Node.js + Express + ES Modules |
| 数据库 | SQLite（better-sqlite3） |
| 向量 | OpenAI embeddings 或 Ollama embeddings（可选，未配置时静默降级） |

---

## §2 目录结构

完整目录见仓库 `tree`；本节只列锁定文件、副作用入口、容易误改的位置和分层规则。

```
/backend/
  server.js                          入口；副作用 import cleanup-registrations.js（锁定文件）
  routes/                            HTTP 路由，只做参数校验、SSE/response 接线和调用 app/service；端点完整列表见 routes/*.js
  app/                               应用编排层：chat/writing 多步 use case；shared 下放 stream/postgen/rollback 骨架
  services/
    cleanup-registrations.js         副作用资源删除钩子的集中注册（见 §10），扩资源只改这里
  db/
    schema.js                        建表 DDL + ALTER 迁移（锁定文件）
    queries/                         所有 SQL 唯一落点，路由/服务禁止直拼查询
  memory/                            记忆相关：recall / summarizer / turn-summarizer / combined-state-updater / summary-expander
  prompts/
    assembler.js                     提示词组装器（锁定文件，见 §4）
    templates/                       平铺 .md prompt 模板，靠文件名前缀区分用途；调用映射见 prompts/README.md
  llm/
    index.js                         对外只暴露 chat()（流式）/ complete()（非流式），上层不直接处理 provider 协议
    providers/                       每个 provider 一个文件夹（anthropic/ openai-compatible/ gemini/ ollama/ mock/，含各自 index.js + constants/cache/thinking 等私有文件）；分发器 cloud-router.js；公共工具集中在 _shared/（base-urls / fetch-utils / thinking-budget / converters / cache-usage）。kimi-coding / minimax-coding 走 Anthropic-compatible；glm-coding / qwen / xiaomi 走 OpenAI-compatible
  utils/
    constants.js                     硬性数值常量（锁定文件，见 §13）
    async-queue.js                   按优先级的 per-session 串行队列（见 §5）
    regex-runner.js                  正则替换管线（见 §9）
    vector-store.js / session-summary-vector-store.js / turn-summary-vector-store.js
    cleanup-hooks.js                 registerOnDelete / runOnDelete 实现

/assistant/
  knowledge/                         7 份 markdown 知识文件：CONTRACT.md（父代理每轮自动注入）
                                     + WORLDCARD/CHARCARD/USERCARD/GLOBALPROMPT/CSSSNIPPET/REGEXRULE
                                     （子代理按 task.targetType 注入对应一份）
  server/                            助手后端：routes.js / parent-agent.js / sub-agent.js
                                     / plan-doc.js / normalize-proposal.js / task-store.js / tools/
  client/                            助手前端包源码（AssistantPanel / PlanTaskHud / MessageList / InputBox / api.js / plan-doc-utils.js）；frontend 侧通过 `frontend/src/core/features/assistant/` 单点接入

/frontend/src/
  App.jsx                            路由入口；页面 route-level lazy；写卡助手首次打开后懒加载
  core/
    api/                             每资源一个文件，组件内禁止直接 fetch（见 §12）
    router/                          AppRouter + route-constants + selectShell
    constants/                       settings mode / provider 等共享常量
    features/
      assistant/                     前端唯一 assistant 接入边界（面板挂载 + chrome 控制）
    hooks/                           跨页面 hooks
    state/                           Zustand（index.js 为锁定文件，见 §12）
    utils/                           前端纯工具、logger、regex、motion、toast 内部出口
  components/
    index.js                         barrel：只导出 ui/ 原子与分子；domain 与 page-local 不进 barrel
    ui/                              领域无关视觉原子与分子（Button/Input/Modal/FormGroup/PanelCard/SectionTabs/BackButton 等）
    chat/ writing/ state/ session/ settings/
                                     跨页面 domain 组件；通过直接路径 import
  pages/                             文件即路由；多文件页面采用 <Page>/index.jsx + <Page>/components/
    layout/                          PageLayout + EditPageShell（统一页面契约与编辑页壳）
    ChatPage/ WritingSpacePage/ CharacterEditPage/
                                     带 page-local 组件的页面目录（components/ 内组件仅本页使用）
  themes/
    tokens.css                       所有 --we-* CSS 变量唯一来源（颜色/字体/间距/阴影/圆角）
    chat.css / pages.css / ui.css / fonts.css

/themes/
  classic-parchment/                         内置默认主题；theme.json + theme.css，只读
  _template/                                 主题模板；扫描时忽略下划线开头目录
  README.md                                  主题开发指引；主题只覆盖 token，不承载组件 CSS

/data/                               见 §15 文件存储结构
  themes/                            用户导入主题；theme.json + theme.css，可由 API 导入/删除

/shared/
  chapter-constants.mjs              前后端共享章节阈值，修改须双向同步
```

---

## §3 数据流：一次对话请求

```
POST /api/sessions/:sessionId/chat
  │
  ├─ 在 `session_stream_tasks` 创建 / 覆盖当前 session 流快照（基线 messages）
  ├─ 挂接 SSE 订阅到 session 级 broadcaster（而非把生成生命周期绑定到单个 res）
  │
  ├─ 保存 user 消息到 DB（messages 表）
  ├─ route 调用 `app/chat/run-chat-stream.js`
  ├─ 推送 SSE: memory_recall_start
  │
  ├─ buildContext(sessionId, { onRecallEvent })
  │    └─ buildPrompt(sessionId, { onRecallEvent })
  │         ├─ 查询 session / world / character / config / persona
  │         ├─ 组装 [1]–[14] 段（见 §4）
  │         ├─ searchRecalledSummaries() → 向量召回（turn_summaries.json，双阈值）
  │         ├─ onRecallEvent('memory_recall_done', { hit }) → 推送 SSE
  │         ├─ [若命中且 memory_expansion_enabled] decideExpansion()
  │         │    ├─ onRecallEvent('memory_expand_start', { candidates }) → 推送 SSE
  │         │    └─ onRecallEvent('memory_expand_done', { expanded }) → 推送 SSE
  │         └─ 返回 { messages, temperature, maxTokens, recallHitCount }
  │
  ├─ llm.chat(messages, { temperature, maxTokens })  ← 流式
  │    └─ 逐 chunk 推送 SSE: delta，并把增量同步写入 `session_stream_tasks.streaming_text`
  │
  ├─ 流结束后：
  │    ├─ `processStreamOutput()` 统一后处理
  │    │    ├─ `unwrapSoloThinkBlock()`：仅整段被单个 `<think>` 包裹时解包正文
  │    │    ├─ `stripAsstContext()`：剥掉 `{{char}}：` / `AI：`
  │    │    ├─ suggestion 开启时，先剥离 think/thinking block 再检测 assistant 文本是否以 `</next_prompt>` 结尾
  │    │    ├─ 若未闭合：调用一次副模型 `llm.complete()`（chat 用 `configScope='aux'`，writing 用 `configScope='writing-aux'`），只传“本轮 user message + assistant message”，使用 `shared-suggestion-fallback.md` 补齐选项块
  │    │    ├─ `extractNextPromptOptions()`：提取 `<next_prompt>` 三选项，不把标签写入 DB
  │    │    └─ `applyRules(content, 'ai_output', worldId)`：仅对可见 assistant 正文做输出正则
  │    ├─ createMessage(sessionId, 'assistant', processedContent)  ← 写 DB
  │    ├─ 推送 SSE: done / aborted，并把 assistant / options merge 回 `session_stream_tasks`
  │    ├─ 有选项时 `messages.next_options` 单独落库（不拼回 content）
  │    └─ 推送 SSE: done
  │
  └─ 异步任务入队（见 §5）
       ├─ title 为 NULL：等 generateTitle 完成 → 推送 title_updated → res.end()
       └─ title 已存在：直接 res.end()
```

---

## §4 提示词组装（assembler.js）

### 分层策略（Prompt Cache 支持）

自 T170 起，prompt 采用 **cached/dynamic 分层** 以支持各 provider 的 Prompt Cache / Context Cache。

- **Cached + Dynamic 合并为单条 system**（2026-04-29 起）：[1-11] 段全部拼接成一条 `role:system` 消息。前缀（[1][2][3][4]）稳定可缓存，后缀（[5-11]）每轮变化。原因：xAI Grok 实测 `[system, user(dynamic), user(history-first)]` 的"双 user"结构会让 prefix cache 整体 bypass，仅命中协议头 ~158t；合并到单 system 后命中稳定前缀（实测期望 ~4608t）。Anthropic-compatible provider 仍会标记 `cache_control: { type: 'ephemeral' }`；OpenAI-compatible / Gemini 依赖稳定前缀触发厂商隐式缓存
- **Bottom**：历史消息之后，先注入独立的后置 `system`，再放当前 `user` 消息；选项指令仍贴在最后一个 `user` 上

### buildPrompt(sessionId, options?) → { messages, temperature, maxTokens, recallHitCount }

`assembler.js` 只负责拼装顺序与运行时数据；固定后端模板（如 suggestion prompt）统一存放在 `backend/prompts/templates/` 的分组目录下，通过 `prompt-loader.js` 读取。

14 段顺序（以执行顺序编号），**[1-11] 段合并为单条 `role:system`（前缀 [1][2][3][4] 稳定，后缀 [5-11] 动态）**，Historical 为多条 `role:user/assistant`，Bottom 为”[13+14] 后置提示词追加到当前用户消息末尾，合并为一条 `role:user`”：

| 段 | 层 | 来源 | 跳过条件 |
|---|---|---|---|
| **[1]** | **Cached** | `config.global_system_prompt` | 空字符串跳过 |
| **[2]** | **Cached** | 常驻 cached 条目：`world_prompt_entries` 中 `trigger_type='always'` 且 `token=0` 的条目，按 `sort_order ASC, created_at ASC` 稳定排序拼到 cached system 末尾（每条格式：`【${title}】\n${content}`）；不参与 `matchEntries` | 无此类条目时跳过 |
| **[3]** | **Cached** | persona，格式：`[{{user}}人设]\n名字：${name}\n${system_prompt}` | name 和 system_prompt 均空时整段跳过 |
| **[4]** | **Cached** | `[{{char}}人设]\n${character.system_prompt}` | 空跳过 |
| [5] | System 后缀 | `renderWorldState(world.id)` | 无字段/值时跳过 |
| [6] | System 后缀 | `renderPersonaState(world.id)` | 空跳过 |
| [7] | System 后缀 | `renderCharacterState(character.id)` | 空跳过 |
| [8] | System 后缀 | 世界 State 条目（仅 `world_prompt_entries`；`matchEntries(sessionId, worldEntries, worldId)` 支持四类分支：always 直接命中；keyword 关键词匹配（`keyword_logic` AND/OR + `keyword_scope` 限定 user/assistant 扫描面 + `active_turns` 跨轮持续生效，状态持久化在 `sessions.keyword_active_state`）；llm AI 预判+关键词兜底；state 加载 entry_conditions、读取当前 session 状态、`condition_logic` AND/OR 评估。所有命中条目统一注入此处，`position` 字段已废弃不再消费）。**`trigger_type='always'` 且 `token=0` 的条目已在 [2] 进入 cached 前缀，不再参与本段命中/排序** | 无条目时跳过 |
| [8.5] | System 后缀 | **长期记忆**：开关 `config.long_term_memory_enabled`（写作模式读 `config.writing.long_term_memory_enabled`）启用且 `data/long_term_memory/{sessionId}/memory.md` 非空时，注入 `[长期记忆]\n{content}`，经 `tv()` 渲染模板变量。开关关闭只停止注入，磁盘文件保留 | 关闭或文件为空时跳过 |
| [9] | System 后缀 | 召回摘要：`searchRecalledSummaries` → `renderRecalledSummaries`；**已排除上下文窗口内最近 `context_history_rounds` 轮** | 无命中时跳过 |
| [10] | System 后缀 | 展开原文：`decideExpansion` → `renderExpandedTurnRecords` | 无展开时跳过 |
| [11] | System 后缀 | **日记注入**：`[日记注入]\n{content}`；来源为前端请求体 `diaryInjection` 字段；仅生效一次（前端发送后清空） | `diaryInjection` 为空时跳过 |
| [12] | — | 历史消息：稳定使用原始 `messages` 窗口；仅移除当前 user，并按最近 `context_history_rounds` 个已完成 user 轮次截窗；每条 content 经 `applyRules(content, 'prompt_only', worldId)` 处理。若该 assistant 行带 `messages.next_options`，则会把选项重新拼成 `<next_prompt>...</next_prompt>` 追加到同一条 assistant history content 尾部，一起送入下一轮上下文 | — |
| **[13+14]** | **Bottom** | 当前用户消息 + 后置提示词：DB 中最新的 `role:user` 消息（经 `applyRules` 处理）追加后置提示词（`global_post_prompt` → `character.post_prompt`），合并为一条 `role:user` 消息。**`character.post_prompt` 为空时自动注入角色名兜底**（`你正在扮演{{char}}，请严格保持角色名字和设定。`），防止长对话后角色身份漂移；**`suggestion_enabled=true` 时 `SUGGESTION_PROMPT` 并入末尾**。附件消息（vision 数组格式）追加为额外 `type:text` part。`buildPrompt` / `buildWritingPrompt` 仍把已 `tv()` 渲染的 suggestion 文本作为 `suggestionText` 字段返回供前端使用；续写路径在 `buildContinuationMessages` 拼到 `CONTINUE_USER_INSTRUCTION` 末尾，使续写也能输出 `<next_prompt>` 选项块。若主模型本轮最终未以 `</next_prompt>` 结尾，后处理阶段会再走一次副模型 fallback 补齐，期间会额外推送 `suggestion_fallback_started`，成功后推 `suggestion_fallback_succeeded`，失败则推 `suggestion_fallback_failed`，避免前端静默等待 | 无当前用户消息时，若 postParts 非空仍单独发出一条 user message |

**生成参数**：`world.temperature ?? config.llm.temperature`，`world.max_tokens ?? config.llm.max_tokens`

**Cached layer 的发送方式**：Anthropic-compatible provider 会将 system 消息自动包装为 `[{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]`（见 `withCacheControl` 函数）。OpenAI-compatible 路径（含 OpenAI / OpenRouter / DeepSeek / Grok / GLM / Kimi / MiniMax / SiliconFlow / Qwen / Xiaomi）则在 `backend/llm/providers/openai-compatible/index.js#normalizeOpenAICompatibleMessages` 中**默认**按 `cacheableSystem` 把首条 `system` 拆成两条：第 1 条仅保留稳定前缀 [1-4]，第 2 条承载动态后缀 [5-11]，让前缀边界与 role 边界对齐，最大化各 provider prefix cache 命中（OpenRouter sticky routing 指纹、DeepSeek 64-token 块前缀匹配、Grok 单服务器缓存均受益）。两段都是 `role=system`，与 commit 02b50a2 修复的"双 user 让 cache pipeline bypass"是不同结构。`cacheableSystem` 为空 / 首条非 system / 不以 `cacheableSystem` 开头 / 无动态后缀任一情况都跳过拆分，保留原结构。Gemini 2.5 系列依靠 implicit caching 自动命中前缀；Gemini 3.x 系列（implicit cache 在常见 prompt size 区间存在 dead zone，flash-lite preview 实测无命中）走 explicit `cachedContents` API：`backend/llm/providers/gemini/cache.js` 维护 LRU（hash = sha256(model + cacheableSystem)，TTL 600s，最多 64 条），`backend/llm/providers/gemini/index.js` 的 `streamGemini` / `completeGemini` 在 `model` 匹配 `gemini-3.x` 且 `cacheableSystem.length ≥ 4000` 时通过 `getOrCreateCache` 获取 `cachedContents/{id}`，请求体使用 `{ contents, cachedContent }`（不带 `systemInstruction`），dynamic 段拼到首条 user message。`assembler.buildPrompt` / `buildWritingPrompt` 返回值新增 `cacheableSystem` 字段（= [1-4] 段拼接结果），由 `buildContext` / 路由透传到 `llm.chat`/`llm.complete` 的 `options.cacheableSystem`，`buildLLMConfig` 转为 provider config 同名字段；其他 provider 忽略。

**xAI / Grok cache 路由**：xAI 后端是多服务器集群，prompt cache 仅在单服务器内有效。`backend/llm/providers/openai-compatible/index.js` 的 `buildOpenAICompatibleHeaders(config)` 在 `provider === 'grok' && config.conversationId` 时附加 `x-grok-conv-id` HTTP header，把同一会话路由到同一缓存服务器。`conversationId` 由 `buildLLMConfig` 从调用方 options 透传：主对话 / 写作 / aux 任务统一用 sessionId 作为稳定值；其他 OpenAI-compat provider 不发送该 header。

**缓存 usage 标准化**：`backend/llm/providers/_shared/cache-usage.js` 将 Anthropic `cache_read_input_tokens` / `cache_creation_input_tokens`、OpenAI-compatible `prompt_tokens_details.cached_tokens`、DeepSeek `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`、Gemini `cachedContentTokenCount` 统一写入 `messages.token_usage` 的 `cache_read_tokens` / `cache_creation_tokens` / `cache_miss_tokens` 字段。

### buildWritingPrompt(sessionId, options?) → { messages, temperature, maxTokens, model, recallHitCount }

与 `buildPrompt` 的差异：

**Cached layer**：仅含 [1] 全局 + [2] 常驻 cached 条目 +（如有）[3] 玩家。

**写作模式不再注入角色身份**：[4] 角色 System Prompt 在写作 prompt 中**整体移除**——写作模式没有固定角色身份，角色出场由叙事文本自行驱动。

**[7] 角色状态段在写作模式被 nearby 替代**：写作模式下 [7] 注入 `<nearby_characters>` 段，列出 `session_nearby_characters` 中所有登场角色的 `name + persona（一句话人设）+ nearby_enabled=1 的状态字段值`，提示主模型沿用既定名字，避免下一轮正文里给同一角色起新名（导致 nearby 状态栏与正文人名脱钩）。nearby 池仍由副 LLM 在状态更新阶段维护；nearby→character 制卡时 `persona` 直接作为新角色 `description` 的基底（LLM 仅扩写 `system_prompt` 与 `first_message`）。

| 段 | 差异 |
|---|---|
| **[4]** | **不注入**（写作模式没有固定角色 system prompt） |
| [5] | `renderWorldState(world.id, sessionId)` |
| [6] | `renderPersonaState(world.id, sessionId)` |
| **[7]** | `renderNearbyCharacters(world.id, sessionId)`：替代角色状态段，输出 `<nearby_characters>` 包裹的多角色块。每个角色：`【name】` + 可选 `人设：<persona>` + 启用字段的状态行。nearby 池为空或全字段无值时跳过整段。 |
| [8] | 仅注入世界 State 条目；写作模式不再消费全局/角色 Prompt 条目；含 `角色.*` 条件的 state 条目在写作模式下不会触发 |
| [9-10] | 同 buildPrompt；[10] 受 `writing.memory_expansion_enabled` 控制 |
| [12] | 同 buildPrompt，稳定使用原始 `messages` 窗口 |
| **[13+14]** | 写作后置提示词追加到当前用户消息末尾，合并为一条 `role:user`；注入 `writing.global_post_prompt`；**`personaName` 非空时自动注入玩家名提醒**；**`writing.suggestion_enabled=true` 时 `SUGGESTION_PROMPT` 并入末尾**；`skipWritingInstructions=true` 时 postParts 为空（只保留用户消息本体） |
| 返回值 | 含 `recallHitCount` 和 `model`（若配置了 `writing.model` 则覆盖全局） |

---

## §4.5 主/副模型分工

自 T169 起，支持独立配置**副模型(aux_llm)**用于后台任务，主模型(llm)保持主对话生成。

### 配置结构

- **主模型**：`config.llm` — 对话流式生成、斜杠命令（/impersonate /retitle）
- **写作主模型**：`config.writing.llm` — 写作流式/续写生成、写作 /impersonate；`provider=null` 时回退对话主模型；结构镜像主模型并额外保留 `temperature / max_tokens` 覆盖（null 时回退对话主模型）
- **API Key 共享**：`config.provider_keys` — 顶层 `{ providerName: api_key }` 池，所有 LLM/Embedding section 按当前 `provider` 字段查表；同一 provider 不在多处独立存储
- **副模型**：`config.aux_llm` — null 时回退主模型；结构镜像主模型但仅含 provider / provider_models / base_url / model，不暴露 temperature / max_tokens / thinking_level
- **写作副模型**：`config.writing.aux_llm` — 写作模式下的后台任务（摘要/状态/记忆展开/日记/标题）专用副模型；`provider=null` 时按 `aux_llm → llm` 顺序回退；结构与对话副模型一致
- **写作助手模型选择**：`config.assistant.model_source` — 'main'（主模型）或 'aux'（副模型），决定写卡助手调用的模型源

### 副模型调用点（总共 8 处）

所有副模型调用点统一通过 `backend/utils/aux-scope.js#resolveAuxScope(sessionId)` 决定 configScope：写作模式 session 解析为 `'writing-aux'`（回退链 `writing.aux_llm → aux_llm → llm`），其余解析为 `'aux'`（回退链 `aux_llm → llm`）。`generateChapterTitle` 始终为写作专属，固定使用 `'writing-aux'`。

1. `backend/memory/turn-summarizer.js` — 轮次摘要生成
2. `backend/memory/combined-state-updater.js` — 状态压缩（列表字段裁剪）
3. `backend/memory/combined-state-updater.js` — 状态更新推理
4. `backend/memory/summary-expander.js` — 记忆展开判定（决策二值化 JSON）
5. `backend/memory/summarizer.js` — 会话标题生成（通过 `title-generation.js#generateTitleWithRetry`）
6. `backend/memory/chapter-title-generator.js` — 写作章节标题生成（固定 writing-aux）
7. `backend/memory/diary-generator.js` — 日记正文生成
8. `backend/prompts/entry-matcher.js` — Prompt 条目 LLM 命中判定

**命令/重标题保持主模型**（不切副模型）：
- `backend/routes/chat.js` 的 `/impersonate`、`/retitle`
- `backend/routes/writing.js` 的 `/impersonate`

### LLM 调用接口支持

`llm.complete(messages, options)` 的 options 新增 `configScope` 参数：
- `'main'`（默认）— 使用主模型配置
- `'aux'` — 调用 `getAuxLlmConfig()` 获取副模型有效配置（若副模型 provider=null 则回退主模型）
- `'writing'` — 调用 `getWritingLlmConfig()` 获取写作主模型有效配置（若 writing.llm.provider=null 则回退对话主模型）；temperature/max_tokens 取 `config.writing.llm.*`，缺省回退对话主模型；thinking_level 跟随对话主模型
- `'writing-aux'` — 调用 `getWritingAuxLlmConfig()` 获取写作副模型有效配置；按 `writing.aux_llm → aux_llm → llm` 顺序回退；temperature / max_tokens / thinking_level 跟随对话主模型

`llm.chat()` 和 `llm.completeWithTools()` 亦支持 `configScope` 参数。

写作生成链路（`backend/routes/writing.js` → `backend/app/writing/*.js`）所有主模型入口（流式 generate、continue、/impersonate complete）均传 `configScope: 'writing'`。

### 写作助手模型切换

`assistant/server/parent-agent.js`、`assistant/server/sub-agent.js` 在每次 LLM 调用前读取 `getConfig().assistant.model_source`，决定 `configScope` 取 `'main'` 还是 `'aux'`。

---

## §5 对话后异步任务链

**触发条件**：流正常完成（非 aborted）且该 session 存在 user 消息。

**重新生成/编辑/删除屏障**：聊天和写作的重新生成、编辑用户消息后重新生成、以及 DELETE 消息接口，都会先调用 `waitForQueueIdle(sessionId)` 等待同 session 已入队任务全部结束，再截断消息、删除后续 turn record/日记、恢复状态快照、还原长期记忆文件，并（regenerate 路径）启动新流。这样可避免上一轮状态整理、标题、turn record 或日记任务在新生成期间写回旧轮次结果。屏障完成后仅清理优先级 4+ 的可丢弃待处理任务。

**长期记忆回滚**：编辑用户消息、删除消息、regenerate（聊天/写作）四条路径在 `deleteTurnRecordsAfterRound` 之后调用 `restoreLtmFromTurnRecord(sessionId, lastRecord)`，按截断后剩余的最末 turn record 中 `long_term_memory_snapshot` 字段覆盖 `data/long_term_memory/{sessionId}/memory.md`；`R=0` 时清空目录；旧记录字段为 NULL 时保持文件不动以兼容升级。该快照在 `createTurnRecord` 末尾、`appendMemoryLines`（含可能的 LLM 压缩）完成后回填。

**优先级**（数字越小越高，2/3 不可丢弃；4 可在 regenerate 时清除；1 预留未用；5 已废弃不再入队）：

| 优先级 | 任务 | 触发条件 |
|---|---|---|
| 2 | `generateTitle(sessionId)` | `session.title` 为 NULL 时 |
| 2 | `updateAllStates(worldId, characterIds, sessionId)` | 每次（角色/世界/玩家状态合并一次调用）；真实日期模式下额外直接写入 `diary_time=YYYY-MM-DDTHH:mm`（上海时区，ISO 局部时间） |
| 3 | `createTurnRecord(sessionId)` | 每次（在 updateAllStates 之后入队，捕获本轮结果状态） |
| 4 | `checkAndGenerateDiary(sessionId, roundIndex)` | 非 isUpdate（createTurnRecord 后入队）；`session.diary_date_mode` 为 NULL 时自动跳过 |

**createTurnRecord 内部流程**（每轮正常完成后执行）：

```
createTurnRecord(sessionId, { isUpdate? })
  ├─ 按 round_index 取”第 N 条 user”及其后、下一条 user 之前的最后一条 assistant
  ├─ 读取模板（启用 LTM → `memory-turn-summary-with-ltm.md`，否则 `memory-turn-summary.md`）
  ├─ LLM.complete() 生成摘要（temp=0.3）；启用 LTM 时输出 JSON `{summary, memory[]}`，由 `splitSummaryAndMemory` 解析；解析失败降级为整段当摘要、memory 空
  ├─ round_index = isUpdate ? latestRecord.round_index : count + 1
  ├─ UPSERT turn_records（by session_id + round_index）
  │    存 user_message_id / asst_message_id（指针），user_context / asst_context 置空
  └─ 异步 embed summary → upsertEntry 到 turn_summaries.json
```

原文展开（[10]）时，通过 `user_message_id`/`asst_message_id` 查 `messages` 表取实时内容；
旧记录（ID 为 NULL）回退到 `user_context`/`asst_context` 字段（兼容存量数据）。

写作模式差异：
- world 从 `session.world_id` 直接取（无 character_id）
- `{{char}}` 仅作为最后一条旁白/角色输出前缀占位符，不额外拼接状态快照

**Provider 接入补充**：
- `kimi-coding`：默认使用 `https://api.kimi.com/coding`，走 Anthropic-compatible；模型名为 `kimi-for-coding`
- `minimax-coding`：默认使用 `https://api.minimax.io/anthropic`，直接走 Anthropic-compatible（按 MiniMax 官方推荐）
- `glm-coding`：默认使用 `https://api.z.ai/api/coding/paas/v4`（OpenAI-compatible，已从旧 `open.bigmodel.cn` 迁移）
- `qwen`：默认使用 `https://dashscope.aliyuncs.com/compatible-mode/v1`（OpenAI-compatible）
- `xiaomi`：按 OpenAI-compatible 接入，Base URL 由用户按小米官方控制台提供值填写
- `GET /api/config/models` 对上述 Coding Plan provider 使用静态模型兜底，避免第三方 `/models` 实现不完整导致设置页无法选模
- OpenAI-compatible provider 若返回 `HTTP 200 + error JSON`（Kimi / GLM 常见），后端会显式识别为鉴权失败，不再误判为“空模型列表”

**SSE 连接关闭时机**（由 `backend/utils/post-gen-runner.js` 的 `runPostGenTasks` 统一协调）：
- 每个任务以 TaskSpec 描述，声明 `keepSseAlive`（是否保活连接）和 `sseEvent`（完成后推送的事件）
- `keepSseAlive=true` 的任务 Promise 收集后统一 `Promise.allSettled(...).finally(() => res.end())`
- 无 keepSseAlive 任务时直接 `res.end()`

**chat / writing 断点续传**：
- `backend/services/session-stream-task-store.js` 维护 session 级内存 Map + SQLite `session_stream_tasks` 真相源；SSE 客户端仅存在内存中。
- 页面刷新或网络抖动后，前端先走 `recover-stream` 读取当前 session 快照，再通过 `GET .../stream` 补订阅后续事件。
- 普通生成恢复使用 `messages_json + streaming_text`；continue 恢复使用 `messages_json + continuing_message_id + continuing_text`，避免把未落库半成品直接写入 `messages` 表。
- 后端重启时，活跃态 `streaming / postprocessing` 统一转 `failed + error='interrupted by restart'`；页面展示中断前内容并 toast 提示，但不再自动重连旧流。

**chat 模式与 writing 模式的差异**（通过不同 TaskSpec 列表表达，不是代码分支）：

| 任务 | chat | writing generate | writing continue |
|---|---|---|---|
| title（p2） | keepSseAlive，推 title_updated | keepSseAlive，推 title_updated | 无（续写不触发） |
| chapter-title（p2） | 无 | keepSseAlive，推 chapter_title_updated（新章节时） | 无 |
| all-state（p2） | 不保活，不推 SSE（前端由 triggerMemoryRefresh 驱动） | keepSseAlive，推 state_updated | keepSseAlive，推 state_updated |
| turn-record（p3） | 不保活 | 不保活 | 不保活，isUpdate=true |
| diary（p4） | 不保活，不推 SSE | keepSseAlive，推 diary_updated | keepSseAlive，推 diary_updated |

- `session.title` 为 NULL：`generateTitle` 完成 → 推送 `title_updated`；若 LLM 空返回会自动切换到更强约束的 retry prompt 再试一次，仍为空则放弃写入并记录 `GIVEUP`
- 检测到新章节首轮 AI 回复：`generateChapterTitle` 完成 → 推送 `chapter_title_updated`；空返回时同样按”更强 prompt 重试一次，失败则放弃写入并记日志”处理

**regenerate**：先校验 `afterMessageId` 存在、归属当前 session，且 `role='user'`；校验通过后删除最后一轮 turn record，再 `clearPending(sessionId, 4)` 清空优先级 ≥4 的待处理任务，然后正常入队（新生成完成后 `createTurnRecord`）。regenerate 还需清除可能被新轮次覆盖的日记：`getDailyEntriesAfterRound(sessionId, R)` 取受影响条目 → 删除对应磁盘文件 → `deleteDailyEntriesAfterRound(sessionId, R)`。

**continue**：续写前必须先找到当前 session 的最后一条 assistant，并确认它之前至少已有一条 user；只有在存在完整 user→assistant 轮次时才允许继续。通过校验后不再手工 pop/push 历史轮次；保留 assembler 已组装好的 system/history/post prompt，统一改写为 `assistant(originalContent)` 后再补一条 user 指令（模板文件：`backend/prompts/templates/continue-user-instruction.md`），避免模型把尾 assistant 误判为已完成回复。续写增量在更新原 assistant 前，同样走 `processStreamOutput()`：先剥离 think block / 上下文前缀，再在 suggestion 开启时用副模型补齐未闭合的 `</next_prompt>`，最后仅把可见正文 merge 回原 assistant，并把新选项覆写到 `messages.next_options`。`done` / `aborted` 事件携带合并后的 `assistant`；前端续写流式预览会隐藏 `<next_prompt>` 段，最终以服务端返回的 assistant 覆盖本地拼接结果，避免原始流文本和落库文本不一致。随后入队 `updateAllStates` → `createTurnRecord(sessionId, { isUpdate: true })` → `checkAndGenerateDiary`，UPSERT 覆盖最后一轮 turn record（不新增轮次）；状态和日记后台任务完成时分别推送 `state_updated` / `diary_updated`，连接保持到对应 Promise settle 后再关闭。前端对 `continue` 的再次触发必须等到 SSE `onStreamEnd`，不能在 `done` 事件时提前解锁，否则旧续写请求的收尾会和下一次续写共享同一组局部状态，导致互相覆盖。

**checkAndGenerateDiary 内部流程**（Priority 4，每轮正常完成后执行）：

```
checkAndGenerateDiary(sessionId, roundIndex)
  ├─ roundIndex ≤ 1 → 跳过（首轮不做判断）
  ├─ 取 session.diary_date_mode → NULL 时退出
  ├─ 取全部 turn_records 快照，比较本轮与上轮日期
  │    virtual：解析 state_snapshot.world.diary_time → /^(\d+)-(\d{2})-(\d{2})T\d{2}:\d{2}$/（ISO 局部时间，`datetime` 类型字段；年份为正整数、可任意位数）
  │    real：使用 turn_records.created_at 时间戳格式化为 YYYY-MM-DD
  ├─ 日期未跨越 → 退出
  ├─ 收集前一日全部 user+assistant 消息原文（via user_message_id/asst_message_id 查 messages）
  ├─ 读取 backend/prompts/templates/diary-generation.md 模板
  ├─ LLM.complete() 生成日记（含日期行 + 摘要 + 正文）
  ├─ 从响应解析 summary（正文第一个 --- 之前的第二段）
  ├─ writeDiaryFile(sessionId, dateStr, content) → data/daily/{sessionId}/{dateStr}.md
  └─ upsertDailyEntry(sessionId, { date_str, date_display, summary, triggered_by_round_index })
```

---

## §6 记忆系统（recall.js）

6 个导出函数（均在 `backend/memory/recall.js`）：

| 函数签名 | 渲染标签 | 说明 |
|---|---|---|
| `renderPersonaState(worldId, sessionId?)` → string | `[玩家状态]` | LEFT JOIN persona_state_fields + values；按 sort_order ASC。**persona 解析**：传 `sessionId` 时优先用 `sessions.persona_id`（写作 session 强绑定的玩家卡），缺失则回退 `worlds.active_persona_id`，再回退到该世界最早创建的 persona；chat session 因 `persona_id=NULL` 直接走全局 active 路径 |
| `renderCharacterState(characterId)` → string | `[角色状态]` | LEFT JOIN character_state_fields + values；按 sort_order ASC |
| `renderWorldState(worldId)` → string | `[世界状态]` | LEFT JOIN world_state_fields + values；按 sort_order ASC |
| `renderTimeline(sessionId, limit=5)` → string | `[会话摘要]` | 取当前会话最近 limit 轮 turn_records 摘要；**不再注入 prompt（[11] 已删）；T155 后前端 Timeline 面板改用 daily_entries，此函数已无调用方，保留供兼容** |
| `searchRecalledSummaries(worldId, sessionId)` → Promise<{recalled, recentMessagesText}> | — | 向量搜索；recalled 数组含 `{ref, turn_record_id, session_id, session_title, round_index, created_at, content, score, is_same_session}` |
| `renderRecalledSummaries(recalled)` → string | `[历史记忆召回]` | 格式：`#ref（turn_record_id）【date · title · 第N轮】content` |

**组装位置**：[5] 世界状态、[6] 玩家状态、[7] 角色状态各自独立注入；[9] 召回摘要；[10] 展开原文（见 §4）。

**向量搜索行为（T49 新，T135 改）**：
- 查询向量 = 最后一条 user 消息 + 最后一条 assistant 消息拼接嵌入
- topK = `MEMORY_RECALL_MAX_SESSIONS`（3）
- **双阈值**：同 session（`is_same_session = true`）使用 `MEMORY_RECALL_SAME_SESSION_THRESHOLD`（0.72）；跨 session 使用 `MEMORY_RECALL_SIMILARITY_THRESHOLD`（0.84）
- **上下文排除（T135）**：命中的 turn_record_id 若在当前 session 最近 `context_history_rounds` 轮内，直接跳过（避免与 [13] 历史消息重复注入导致输出锚定）
- token 预算软截断（`MEMORY_RECALL_MAX_TOKENS` = 2048），超额时 break
- embedding 未配置时静默降级，返回 `{ recalled: [], recentMessagesText }`

**list 类型字段渲染**：JSON 数组解析后以顿号（`、`）分隔；空数组跳过该行。

---

## §7 SSE 事件完整清单

所有事件通过同一 SSE 连接（`text/event-stream`）推送，格式为 `data: ${JSON.stringify(payload)}\n\n`。

| type 字段 | 触发时机 | payload 示例 |
|---|---|---|
| `delta` | LLM 流式增量 | `{ delta: "文字" }` |
| `done` | 流式正常完成 | `{ done: true, assistant: {…, next_options?: [...]}, options: [], usage?: { prompt_tokens, completion_tokens, cache_read_tokens?, cache_creation_tokens?, cache_miss_tokens? } }` |
| `aborted` | 用户主动中断 | `{ aborted: true, assistant?: {…} }` |
| `error` | LLM 调用异常 | `{ type: "error", error: "..." }` |
| `title_updated` | 会话标题异步生成完成（chat + writing） | `{ type: "title_updated", title: "..." }` |
| `chapter_title_updated` | 章节标题 LLM 生成完成（writing 专有） | `{ type: "chapter_title_updated", chapterIndex: 1, title: "初入茫茫" }` |
| `state_updated` | writing 模式后台状态刷新完成 | `{ type: "state_updated" }` |
| `diary_updated` | writing 模式后台日记刷新完成 | `{ type: "diary_updated" }` |
| `suggestion_fallback_started` | assistant 末尾缺少 `</next_prompt>`，后端已触发副模型补选项 | `{ type: "suggestion_fallback_started" }` |
| `state_rolled_back` | regenerate 开始前状态已回滚到快照（chat + writing） | `{ type: "state_rolled_back" }` |
| `memory_recall_start` | 进入 buildContext 前 | `{ type: "memory_recall_start" }` |
| `memory_recall_done` | buildContext 返回后 | `{ type: "memory_recall_done", hit: 2 }` |
| `memory_expand_start` | 展开决策前 | `{ type: "memory_expand_start", candidates: [{ref:1,title:"..."}] }` |
| `memory_expand_done` | 展开完成 | `{ type: "memory_expand_done", expanded: ["session_id_1"] }` |
| `entries_activated` | 本轮命中的非常驻条目（chat + writing；过滤 `trigger_type='always'`） | `{ type: "entries_activated", entries: [{ id, title, trigger_type }] }` |

**注**：
- `memory_recall_*` 和 `memory_expand_*` 仅 `/chat` 路径发出；`/continue`（续写）路径不含
- `state_updated` / `diary_updated` 仅 writing 路径发出；chat 模式对应后台任务不保活 SSE
- `state_rolled_back` 在 regenerate 路由完成回滚后、`runStream`/`runWritingStream` 启动时立即发出；触发前端状态栏立即刷新，无需等待 `state_updated`
- `entries_activated` 在 `buildContext` / `buildWritingPrompt` 返回后、LLM 流开始前发出；仅当 entries 非空才推送。前端缓存到 `pendingEntriesRef`，在 `onDone` 时挂到新建 assistant 消息的 `activated_entries` 字段（**仅运行时**，不入 DB；刷新或切换会话即丢失）。`/continue` 路径不发出
- `done.options` 同时持久化到对应 assistant 消息的 `messages.next_options` 字段（JSON 数组）；前端切页/刷新后由 `MessageList` 在初次拉取消息时把每条 assistant 的 `next_options` 还原成 `_options`，最近一条 assistant 的选项被提升回 `currentOptions` 形成"待选择展开"态，更早的回合统一以 `FrozenOptionCard` 折叠态呈现

---

## §8 状态系统

三套状态模板，均挂在世界下配置：

| 状态套 | 字段定义表 | 全局默认值表 | 会话运行时值表 | 粒度 |
|---|---|---|---|---|
| 世界状态 | `world_state_fields` | `world_state_values`（`default_value_json`） | `session_world_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |
| 角色状态 | `character_state_fields` | `character_state_values`（`default_value_json`） | `session_character_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |
| 玩家状态 | `persona_state_fields` | `persona_state_values`（`default_value_json`） | `session_persona_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |

**会话级隔离**（T103）：状态运行时值现在存储在 `session_*_state_values` 三张表，由 `session_id ON DELETE CASCADE` 控制生命周期，各会话彼此完全独立。

**state 条目字段语义**：TriggerEditor（现为 EntryEditor state 模式）的条件选项按 `世界.xxx` / `玩家.xxx` / `角色.xxx` 三类生成；`character_state_fields` 不按具体角色名展开。chat 会话中的 `角色.xxx` 映射当前角色；writing 会话没有固定角色身份（角色由 nearby 池单独管理），含 `角色.xxx` 条件的条目在写作模式下不会触发，`entry-matcher.js` state 分支仅按 world+persona shared map 评估并跳过 `角色.*` 条件项。`type='table'` 字段在条件 UI 中展开为 `scope.field_label.column_key` 三段格式（前缀仍为 `世界.` / `玩家.` / `角色.`），`entry-matcher.js` 的 `setStateMapRow()` 把表格值对象按列展平到状态 Map 中，仅参与数值比较。

**state 条目评估时机**：提示词组装时（[7] 段），`matchEntries()` state 分支实时读取 `entry_conditions` 表和当前 session 状态值，同步评估后决定该条目是否命中；评估结果不持久化到数据库。条件为空的 state 条目不触发。

**值优先级**：读取时通过 COALESCE 逐级回退：`session_*_state_values.runtime_value_json` → `*_state_values.default_value_json` → `*_state_fields.default_value`。

**combined-state-updater.js**：`updateAllStates` 现在写 `session_*_state_values` 表而非全局 `*_state_values.runtime_value_json`。

**字段类型**：`text / number / boolean / enum / list / datetime / table`
- `list`：值存储为 JSON 数组字符串，渲染时解析为顿号分隔的字符串
- `datetime`：值存储为 ISO 局部时间字符串 `"YYYY-MM-DDTHH:mm"`（年份任意正整数位数）
- `table`：固定 2 行 N 列结构。列定义存 `*_state_fields.table_columns`（JSON 数组：`[{key,label,min?,max?}]`，仅数值列）；值存为对象 JSON `{col_key: number}`。右侧状态栏由 `frontend/src/components/state/StatusTable.jsx` 渲染（表头行 + 数值行，按 min/max 渲染进度条）；`combined-state-updater.js validateValue()` 按列校验 + 上下限裁剪；`recall.js parseValueForDisplay()` 渲染为 `key=val,...`；条目条件可定位到具体列（见上文）

**update_mode**：
- `manual`：不参与自动更新
- `llm_auto`：每轮对话后由 `combined-state-updater.js` 统一驱动自动更新
- `system_rule`：保留给系统规则型字段；前端可配置，是否自动写入取决于具体业务实现

**初始化时机**：
- 创建世界时：`services/worlds.createWorld` 自动 upsert persona 行，并按字段模板写入默认值层（`default_value_json`）到 `*_state_values` 全局表
- 创建角色时：按世界的 character_state_fields 模板初始化角色默认值层（`default_value_json`）到 `character_state_values` 全局表
- 运行时状态写入统一由 `combined-state-updater.js` 负责，写入 `session_*_state_values` 会话级表；编辑页只改全局默认值层
- 记忆面板”重置”会清空该会话 `session_*_state_values` 对应记录，显示层自动回退到全局默认值
- 消息回滚（删除消息）时，清空该会话三张 session 状态表并删除超出轮次的 turn_records

**persona 与会话的绑定关系**：
- 一个世界可拥有多个 persona；`worlds.active_persona_id` 标记当前激活的玩家卡
- **chat 会话**：`sessions.persona_id = NULL`；记忆召回与状态读取统一走 `worlds.active_persona_id`（这是 chat 模式选 persona 的唯一入口，因为 chat 进入流程没有 persona 选择 UI）
- **writing 会话**：`sessions.persona_id` 在创建时快照当时世界的 active persona，**之后与 session 强绑定**；切换世界的 active persona 不会影响已有写作 session
- **前端入口约束**：`CharactersPage` 的玩家卡列表中，只有当前 active 的卡可以点击进入写作页。要写另一个 persona 的内容须先点该卡的「激活」按钮再点击进入
- **删除 persona**：service 层 `deletePersonaService` 先逐条 `deleteWritingSession` 触发 cleanup 钩子，再 `DELETE FROM personas`（DB 层 `ON DELETE CASCADE` 兜底剩余行）
- persona 的 name / system_prompt 注入 assembler.js [2] 位置（格式：`[{{user}}人设]\n名字：${name}\n${system_prompt}`）

---

## §9 正则替换管线

4 种 scope，按作用时机分工：

| scope | 执行位置 | 影响存库 | 影响显示 | 影响 LLM |
|---|---|---|---|---|
| `user_input` | 前端发送前 | 是 | 是 | 是 |
| `ai_output` | 后端流结束后、写 messages 前 | 是 | 是 | 是 |
| `display_only` | 前端渲染时 | 否 | 是 | 否 |
| `prompt_only` | assembler.js [13] 历史消息处理时 | 否 | 否 | 是 |

**执行顺序**：同 scope 内按 `sort_order ASC` 链式套用，前一条输出作为后一条输入。

**作用范围**：`world_id IS NULL` 的规则对所有世界生效；非 NULL 仅对该世界的会话生效。

**失败处理**：规则编译或执行失败时跳过该条并记 warn 日志，不中断管线。

---

## §9.1 模板变量（T51）

类 SillyTavern 的内置占位符，在提示词组装时（assembler.js）自动替换，不修改数据库原始文本。

| 占位符 | 替换值 | 作用域说明 |
|---|---|---|
| `{{user}}` | `persona.name` | 世界级（每个世界对应一个 persona） |
| `{{char}}` | `character.name` | 角色级 |
| `{{world}}` | `world.name` | 全局 |

**大小写不敏感**：`{{User}}`、`{{CHAR}}` 等均有效。

**应用范围**：[1]–[11] 所有 systemParts 注入点。**不替换** [12] 历史消息和 [13] 当前用户消息（对话内容非配置模板）。

**写作模式 `{{char}}`**：写作 prompt 没有固定角色身份（[4]/[7] 不注入），共享段 `{{char}}` 统一替换为「叙述者」字面量。

**实现**：`backend/utils/template-vars.js` → `applyTemplateVars(text, ctx)`；assembler.js 内以闭包 `const tv = t => applyTemplateVars(t, ctx)` 调用。

---

## §10 副作用资源删除钩子

**挂载方式**：`server.js` 启动时通过副作用 `import './services/cleanup-registrations.js'` 触发一次全局注册；钩子通过 `registerOnDelete(entity, asyncFn)` 注册，`entity` 为 `'world' | 'character' | 'session' | 'message'`。

**已注册钩子**（`backend/services/cleanup-registrations.js`）：

| entity | 清理内容 |
|---|---|
| `message` | 删除该消息的附件文件（`/data/uploads/attachments/`） |
| `session` | 删除该会话所有消息的附件文件 + session summary embedding + **turn summaries embedding** + **diary 目录** + **long_term_memory 目录** |
| `character` | 删除相关消息附件 + 角色头像文件（`avatar_path`）+ prompt entries embedding + 该角色所有会话的 summary embedding + **turn summaries embedding** + **diary 目录** + **long_term_memory 目录** |
| `world` | 删除相关消息附件 + 所有角色头像 + persona 头像 + 所有角色 prompt entries embedding + 所有会话 summary embedding + **turn summaries embedding** + **diary 目录** + **long_term_memory 目录** |

**执行规则**：`runOnDelete(entity, id)` 在 DB DELETE 之前调用；钩子失败只 warn，不阻塞删除。

**扩展规则**：新增带磁盘文件或向量的子资源时，**只在此文件注册钩子**，不修改 deleteWorld / deleteCharacter 等核心 delete 函数。

---

## §11 写作（writing mode）

**入口**：`/worlds/:worldId/writing`，路由文件 `routes/writing.js`，挂载在 `app.use('/api/worlds', writingRoutes)`。

**编排层**：`backend/app/writing/` 负责 `run-writing-stream / continue / regenerate`，`backend/app/shared/` 负责共享的 stream/postgen/rollback 骨架；route 本身只保留校验、SSE 接线和 nearby / chapter title 等轻控制器逻辑。

**数据模型与普通会话的差异**：

| 字段 | 普通会话 | 写作会话 |
|---|---|---|
| `sessions.character_id` | 非空，绑定单个角色 | 可空 |
| `sessions.world_id` | 通常为 `NULL`，世界通过 character 反查 | 非空 |
| `sessions.mode` | `'chat'` | `'writing'` |
| 出场角色 | 无 | `session_nearby_characters`（nearby 池：transient + saved），由副 LLM 自动维护，不进入主 prompt |

**提示词**：调用 `buildWritingPrompt(sessionId)` 而非 `buildPrompt()`；差异见 §4。

**服务层**：`services/writing-sessions.js`。

**全局配置继承（T86）**：写作使用 `config.writing.*` 命名空间；`writing.llm.model = ''` 时继承 chat model，`writing.context_history_rounds = null` 时继承 chat 值。

**资源与模式绑定**：`regex_rules`（`world_id IS NULL`）、`custom_css_snippets` 各带 `mode TEXT NOT NULL DEFAULT 'chat'` 列，严格二分（`'chat'` 或 `'writing'`），互不干扰。

**主题加载链路**：前端启动时 `App.jsx` 先 `GET /api/config` 读取 `ui.theme`（默认 `classic-parchment`），再调用 `GET /api/themes/:id/css` 写入 `<style id="we-theme-css">`，随后调用 `refreshCustomCss(appMode)` 写入 `<style id="we-custom-css">`。因此最终级联顺序固定为：Vite 静态核心 CSS（`tokens.css` / `chat.css` / `ui.css` / `pages.css` / `index.css`）→ 当前主题 CSS → 当前模式启用的自定义 CSS 片段。主题切换通过 `PUT /api/themes/active` 写入 `data/config.json` 的 `ui.theme`，前端立即刷新主题 CSS 并派发 `we:theme-updated`，再重刷自定义 CSS，保证用户 CSS 仍为最高优先级覆盖层。

**主题适配边界**：主题只覆盖 `--we-*` token，组件结构 CSS 永远放在核心样式中。新增前端组件或样式时，必须引用已有 token；需要新视觉语义时先在 `tokens.css` 提供默认值，并尽量从基础 token 派生。这样主题会继承新增界面，不需要随每次前端组件改动同步修改。

**appMode 状态**：`core/state/appMode.js`（独立 Zustand store），写作页面挂载时设置为 `'writing'`，其他页面设置为 `'chat'`；`refreshCustomCss(mode)` 按当前 appMode 加载对应 CSS 片段注入 `<style id="we-custom-css">`。

### §11.1 Nearby Characters（写作模式专属）

写作模式没有"激活角色"概念，角色出场由叙事文本驱动；本子系统由副 LLM 单独维护出场角色池，不进入主 prompt。承接旧 `writing_session_characters` 表（已整表删除）。

- **数据模型**：`session_nearby_characters` + `session_nearby_character_state_values` 两张 session 级表（CASCADE 跟随 session 删除，无需独立 cleanup hook）；`character_state_fields.nearby_enabled INTEGER NOT NULL DEFAULT 1` 控制字段是否参与 nearby 流程
- **类型**：`is_saved=0` transient（本轮未回则删）；`is_saved=1` saved（跨轮持久，UI 上有印章标记）
- **唯一性**：`(session_id, name)` 全局唯一（saved + transient 同池）；`ref_id` 仅作防御性兜底，不参与去重
- **触发链路**：写作模式 `combined-state-updater`（异步队列优先级 2）单次 LLM 调用同时完成 pre-flight、nearby 提取、字段过滤后的状态/记忆更新，零额外 LLM 调用
- **字段过滤**：仅 `character_state_fields.nearby_enabled=1` 的字段进入 prompt 与状态更新；persona / world 字段不参与 nearby
- **LLM 输出协议**：现有 JSON 顶层新增 `nearby_characters: [{ ref_id, name, state, memory }]`
- **命中规则**：`ref_id ∈ pool` → 更新该条；`ref_id=null` 且 `name` 命中池中已有 → 更新（兜底）；`ref_id=null` 且 `name` 不在池 → 新建 transient；`ref_id` 非法（不在池中）→ 整条丢弃，避免幻觉 ID 制造孤儿
- **轮末清理**：池里 transient 但本轮未 seen → 删除；saved 保留 state/memory 不动
- **回滚**：`turn_records.state_snapshot.nearby` 层快照本轮池状态；`memory/state-rollback.js` 还原；旧记录无该层 → 还原时清空两张 nearby 表（向下兼容）
- **删除回滚**：`removeNearby` = 直接 DELETE，不降级为 transient（避免与 turn 链路耦合）
- **写作主 prompt 改动**：写作模式 [4] `<char_info>` 与 [7] `<char_state>` 段彻底取消，主 prompt 不再注入"角色级"内容；chat 模式 `buildPrompt` 完全不变。详见 §4 `buildWritingPrompt` 表格
- **entry-matcher 联动**：写作模式 state 条目评估跳过含 `角色.*` 的条件项（角色由 nearby 池单独管理），仅按 world+persona shared map 评估
- **制卡链路**：写作页"附近"区块"制卡"按钮 → 候选 = 本轮登场 nearby 角色 → `writing.aux_llm` 调用补 `system_prompt` / `description` / `first_message` → 落库到 `characters` 表；仅 `nearby_enabled=1` 字段写入 `default_value_json`，不带 memory / nearbyId
- **写卡助手对接**：`character_state_fields.nearby_enabled` 通过 `apply_world_card` 工具的 `stateFieldOps` 接受；`normalize-proposal` 校验 `target='character'` 才允许该键，其余 target 出现该键直接拒绝

---

## §12 前端架构

**Zustand store**（`/frontend/src/core/state/index.js`，锁定文件）：

| 状态 | 类型 | 说明 |
|---|---|---|
| `currentWorldId` | string\|null | 当前选中的 world |
| `currentCharacterId` | string\|null | 当前选中的 character |
| `currentSessionId` | string\|null | 当前会话 |
| `memoryRefreshTick` | number | 记忆面板刷新触发器 |

Actions：`setCurrentWorldId / setCurrentCharacterId / setCurrentSessionId / triggerMemoryRefresh`

**独立 store**（不受锁定）：`core/state/appMode.js` — `appMode: 'chat' | 'writing'`，Actions：`setAppMode`

**API 层**（`/frontend/src/core/api/`）：每资源一个文件，组件内禁止直接 fetch。

| 文件 | 资源 |
|---|---|
| characters.js / characterStateFields.js / characterStateValues.js | 角色及状态 |
| worlds.js / worldStateFields.js / worldStateValues.js | 世界及状态 |
| sessions.js / chat.js | 会话与对话 |
| entry-conditions.js | state 类型条目的 entry_conditions CRUD |
| sessionTimeline.js | 会话时间线（当前会话近5轮 turn_records 摘要） |
| sessionStateValues.js | 会话级状态值（读写 session_*_state_values） |
| personas.js / personaStateFields.js / personaStateValues.js | 玩家 |
| prompt-entries.js | 世界 State 条目 CRUD + 排序 |
| regexRules.js / customCssSnippets.js | 正则与 CSS |
| importExport.js / config.js | 导入导出与配置 |
| writingSessions.js | 写作 |

**工具函数**：
- `core/utils/avatar.js`：`getAvatarColor(id)` 基于 id hash 生成头像颜色；`avatar_path` 为 NULL 时显示纯色圆形 + 名字首字
- `core/utils/regex-runner.js`：前端侧执行 `display_only` / `user_input` scope 的正则规则

**前端代码落点规则**：
- 页面级数据加载、轮询、SSE 回调编排放 `pages/`
- 纯展示组件和局部交互放 `components/`
- 所有 HTTP 请求先进入 `core/api/` 封装，再由页面或组件调用
- 跨页面共享状态才进入 `core/state/`；一次性页面状态不要提升到全局
- 与视觉 token、全局 CSS 变量相关的改动优先落在 `themes/`

**右侧状态栏布局**（chat=`StatePanel` / writing=`NearbyPanel`）：
- 顶部常驻「世界状态」`PanelCard`（不在 tab 内，切 tab 不影响其显示）
- 下方 `SectionTabs` 横向切换：chat = `{{user}} / {{char}} / 日记`（tab 标签为 persona/character 运行时姓名，缺失时回退到「玩家」/「角色」）；writing = `{{user}} / 每个 nearby 角色一个 tab / 日记`（无附近角色时显示一个空「附近」占位 tab 承载 +角色卡 / 制卡 工具栏）；日记 tab 受 `config.diary.{chat,writing}.enabled` 控制
- 每个 tab 内容由 `PanelCard`（icon + 标题 + actions，无折叠按钮、永远展开）包裹 `StatusSection`/日记列表/`NearbyCharacterBlock`
- `StatusSection` 在卡片内运行于 `headerless` + `gridLayout` 模式：短值字段（boolean/number/enum/datetime/单行 text）走 2 列网格，长值（list/table）跨满整行
- 重置按钮挪到 PanelCard `actions` 槽常驻显示
- `SectionTabs` 在 `sections` 热更新（如 nearby 列表变化）时，若 active key 不在新列表中会在渲染期回退到第一个，不写状态、不触发 effect 反馈循环

---

## §13 数值常量

完整列表见 `backend/utils/constants.js`（前后端共享章节常量见 `shared/chapter-constants.mjs`），所有硬性数值都从该文件导出，禁止硬编码。

分组语义（代码注释看不出的约束）：
- **记忆召回阈值**：跨 session 比同 session 严格（避免无关会话污染）；阈值变动会直接改变召回命中率，调整前需评估
- **MEMORY_RECALL_MAX_TOKENS**：限制召回片段总长度，超过后按相似度截断；与 `MEMORY_EXPAND_MAX_TOKENS` 共同决定 [12] 段位的预算
- **STATE_TEXT_MAX_LENGTH / STATE_LIST_MAX_ITEMS**：状态字段超过阈值后触发 LLM 压缩（state-compress），压缩目标值由 `_TARGET` / `_COMPRESS_TARGET` 控制，两者关系：阈值 > 目标。list 当前为 `MAX=10 / TRIM=8`；`combined-state-updater.js validateValue()` 还会在 list 写入前做硬截断到 `STATE_LIST_MAX_ITEMS`，作为压缩兜底失败时的最后保护；prompt（`state-update.md` 第 6 条）同时告知 LLM 上限 10、满则先删
- **LONG_TERM_MEMORY_MAX_LINES / TARGET_LINES**：长期记忆 md 文件超过阈值触发压缩，目标小于阈值
- **LLM_THINKING_BUDGET_***：Anthropic / Gemini extended thinking 三档预算，按用户在配置里选择的等级映射
- **DIARY_TIME_***：日记时间字段是保留 `field_key`，`update_instruction` / `description` 由后端写死，UI 不允许编辑

---

## §14 路由映射速查

`server.js` 中全部 `app.use` 挂载：

| 挂载前缀 | 路由文件 | 职责简述 |
|---|---|---|
| `/api/config` | routes/config.js | 全局配置读写、API Key 管理、模型列表、连通性测试 |
| `/api/worlds` | routes/worlds.js | 世界 CRUD、日记同步 |
| `/api` | routes/characters.js | 角色 CRUD、头像上传、批量排序 |
| `/api` | routes/sessions.js | 会话/消息 CRUD、消息编辑与删除回滚 |
| `/api/sessions` | routes/chat.js | 对话流（SSE）、stop/regenerate/continue/impersonate/edit-assistant/retitle |
| `/api` | routes/prompt-entries.js | 世界 State 条目 CRUD + 排序 |
| `/api` | routes/state-fields.js | 世界/角色状态字段 CRUD + 排序 |
| `/api` | routes/world-state-values.js | 世界状态值（全局默认层）读写 + 重置 |
| `/api` | routes/character-state-values.js | 角色状态值（全局默认层）读写 + 重置 |
| `/api/sessions` | routes/session-timeline.js | 会话近 5 轮 turn_records 摘要 |
| `/api/sessions` | routes/session-state-values.js | 会话级状态值（world/persona/character）读取与重置 |
| `/api/sessions` | routes/daily-entries.js | 日记列表 + 日记正文（读文件） |
| `/api` | routes/import-export.js | 角色卡/世界卡/玩家卡/全局设置导入导出 |
| `/api` | routes/themes.js | 主题列表、CSS、切换、导入、导出、删除 |
| `/api` | routes/custom-css-snippets.js | 自定义 CSS 片段 CRUD + 排序 |
| `/api` | routes/regex-rules.js | 正则规则 CRUD + 排序 |
| `/api` | routes/personas.js | 玩家（persona）读写、头像上传 |
| `/api` | routes/persona-state-fields.js | 玩家状态字段 CRUD + 排序 |
| `/api` | routes/persona-state-values.js | 玩家状态值（全局默认层）读写 + 重置 |
| `/api/worlds` | routes/writing.js | 写作会话 CRUD、nearby 角色池管理、流式生成、章节标题管理 |
| `/api/assistant` | assistant/server/routes.js | 写卡助手对话（SSE）、提案执行 |

**中间件顺序**：CORS（仅 localhost/127.0.0.1 origin）→ JSON 解析（limit: 20MB）→ HTTP 请求日志（info 级，仅 `/api/`，跳过 `/api/uploads/`）→ `/api` 本机访问限制（`localOnly`）→ 受保护的 `/api/uploads/*path` 文件访问 → 路由。

写卡助手当前为单链路 **父代理 + 通用执行子代理 + 计划文档** 架构：

- **接口**：单一主接口 `POST /api/assistant/agent`（SSE，driver 入口；body 可携带 `messageId` 让前端为该轮 user 消息预先打稳定 id，也可带 `resume:true` 以“静默恢复”当前 task，不新增可见 user 消息），辅助接口 `POST /agent/:taskId/approve`、`POST /agent/:taskId/reject`、`POST /agent/:taskId/cancel`、`POST /agent/:taskId/truncate`（按 messageId 截断到该消息含之后；`running` 中拒绝）、`POST /agent/:taskId/delete`（按 messageId 删除单条；`running` 中拒绝）、`GET /agent/:taskId/plan-doc`、`GET /agent/:taskId`（任务快照）。`/reject` 只拒绝当前计划：删除计划文档和对应 UI 记录、切 `paused`、保留同一 task 继续对话；`/cancel` 才是终止正在执行的任务，仅对非终态任务生效。`completed / failed / cancelled` 上调用 `/cancel` 为 no-op。终态任务收到新消息时不会重建 task，而是在同一 `taskId` 上重入新的 `running` loop。
- **父代理（`assistant/server/parent-agent.js`）**：长生命周期上下文，每轮在首条 system 自动注入 `assistant/knowledge/CONTRACT.md`；工具集 = 3 读（`preview_card` / `list_resources` / `read_file`）+ 4 meta（`write_plan_doc` / `edit_plan_doc` / `delete_plan_doc` / `dispatch_subagent`）+ 1 终态（`reply_to_user`）。**父代理不再持有 `apply_*` 工具**；任何资源新增 / 修改 / 删除必须通过 `dispatch_subagent` 派给子代理执行。每次 user-turn 走一次 `llm.completeWithTools` 原生 tool-calling：provider 内部完成 tool 多轮往返，父代理在外层处理 `TOOL_LOOP_SIGNAL`（`reply_to_user → terminal/paused`、`write_plan_doc → awaiting_approval`、`dispatch_subagent` 在 pending user 消息时 → paused）。若模型只输出普通文本且文本中声称“已派发/已创建/正在执行”等动作，但本轮没有真实 `dispatch_subagent` / step / 落地资源，父代理会走 softFail，避免把口头动作误记成完成。父代理还会识别高风险、跨资源、从零创建核心卡片、状态/条目体系、完整/全套/批量/补全/整体优化等需要计划的任务，在 context block 注入强制编排提示；若模型跳过计划直接 `dispatch_subagent`，meta 工具会返回错误，要求先 `write_plan_doc`。
- **通用子代理（`assistant/server/sub-agent.js`）**：每个 step 起一个干净上下文，按 `task.targetType` 注入 `assistant/knowledge/<TARGET>.md`（一次只一份，互不串味）；工具集 = 3 读 + 1 个对应 targetType 的 `apply_*` 工具。子代理直接执行 `normalizeProposal` + 资源落库，并通过 `onApplied` 回调把落地资源（`{ kind, op, stepId, name, refId }`）写入父任务的 `appliedResources` 列表。
- **本轮已落地变更（appliedResources）**：父代理每个 user-turn 维护一个内存级 `appliedResources: []`，新一轮 user 输入开头清空；`dispatch_subagent` 在 operation=`create` 且未带 `force:true` 时，若发现同 `targetType` 的 create 已存在记录，直接返回 `ok:false, error="本轮已经成功创建过 ..."`，避免模型连续重复创建同类资源。父代理 prompt 与每轮注入的 `# 本轮已落地变更` 段联手提示模型"该收尾就 `reply_to_user`"。
- **父子代理稳定 prefix 缓存**：父代理调 `llm.completeWithTools`、子代理调 `llm.completeWithTools` 时显式传 `cacheableSystem`（父代理 = `parent-agent.md + CONTRACT.md`，子代理 = `sub-agent.md + 当前 targetType 对应 knowledge.md`）。Anthropic 自动 prefix cache，Gemini 触发 explicit `cachedContents`，其他 provider 忽略。仅为 cache 提示，不影响 prompt 内容。
- **harness 可恢复暂停**：父代理内部错误（provider 抛错、空文本返回、未捕获异常），以及“文本宣称已执行动作但本轮没有真实派发/落地”的假执行场景，不再写成 `failed + agent loop error`；服务端改为追加一条说明性 assistant 消息，切 `paused`，发 `paused + task_snapshot + done` 并关闭本轮 SSE。这样既不会误报完成，也不会把输入框锁死；用户可直接在同一 task 上继续追问。模型主动用 `reply_to_user({ status:"failed" })` 收尾的"业务失败"仍按硬失败处理。
- **计划文档**：物理文件落在 `/.temp/assistant/<taskId>.md`（`assistant/server/plan-doc.js` 维护原子读写、状态字段切换），每次 `write_plan_doc` / `edit_plan_doc` 后 emit `plan_doc_updated` SSE，并同步写入 `assistant_tasks.messages_json` 的 `plan_doc` UI 记录，前端 `PlanDocViewer` 渲染。计划文档必须体现真实依赖：读/确认现状 → 定义字段或条目 → 创建/定位目标资源 → 写值/更新正文 → 核对验收；文档不再保留空的“执行日志”段。状态值填写按 3-5 个字段一组拆成多个 persona-card / character-card update step，并在 step.task 中列出每组字段的 `field_key`、label、type 与目标 `value_json`，避免单个子代理漏填。
- **计划拒绝语义**：用户在 `awaiting_approval` 点击“拒绝计划”会走 `/agent/:taskId/reject`，不触发 `/cancel`，也不把任务切到 `cancelled`。服务端清掉当前 plan doc 与 `plan_doc` 消息，清空审批 checkpoint，切到 `paused + error='plan rejected by user'` 并发 `messages_changed + paused + task_snapshot`；前端把该 paused 视为用户主动暂停，只回放快照、不自动 `resume:true`，输入框保持可用，用户可继续给修改意见或换一个目标。
- **任务状态机**：`idle → running → awaiting_approval → paused → completed | failed | cancelled`。普通问答、读取、直接 apply、直接 subagent 都在 `running` 内完成；只有 `write_plan_doc` 会把任务挂到 `awaiting_approval`。
- **静默断点续传**：`AssistantPanel` 打开后会先拉 `GET /agent/:taskId` 或 `GET /agent/recover` 快照；若任务处于 `running` / `paused`（排除 `error='plan rejected by user'` 的用户主动拒绝暂停）或 `failed + interrupted by restart`，前端随后自动走 `POST /agent { taskId, resume:true }` 重新挂回同一条 SSE，并在服务端 `executionActive=false` 时静默重进 `runParentAgent`。`awaiting_approval` 不会自动推进，只补订阅等待用户审批。`completed / cancelled` 快照只用于历史回放，不弹恢复 toast、不自动订阅；用户再次发送时在同一 task 上开启新一轮 `running`。
- **输入可继续语义**：前端输入框不因 `paused / completed / failed / cancelled` 自动禁用；这些状态都允许用户在同一 task 上继续发送新消息，由 `/agent` 重入 `running`。真正中断执行使用“停止”或“清空”，局部失败（删除/截断失败、拒绝计划）只提示或切暂停，不封锁输入。
- **暂停语义增强**：每次 `runParentAgent` 启动时，先把 `pendingUserMessages` 全部 drain 进 `task.messages`，确保用户在 idle 间隙 / `paused` 期间追加的话不会被吞。`running` 期间若已有 step 在执行，后续用户消息仍走原排队路径（`dispatch_subagent` 完成后由控制信号统一切换到 `paused`）。
- **取消语义**：父代理工具执行包装层在工具开始前/完成后都会检查 `task.status`；一旦已取消，直接抛专用 `ToolLoopCancelledError`，provider 侧 `completeWithToolsDetailed` 立即终止整个 tool-use 循环，不把“已取消”包装成普通 tool result 再返给模型继续下一轮。子代理同步父代理 cancel 状态：`dispatchSubAgent` 接收 `cancelCheck` 闭包（`() => task.status === 'cancelled'`），通过 `adapter.js wrapToolEvents` 在工具执行前/后检查，触发 `ToolLoopCancelledError`；由 provider 的 `complete*WithTools` 透传出来，经 `dispatchSubAgent` 外层 catch 转为 `{ success:false, error }`，父代理 `dispatch_subagent.execute` 映射为 `{ ok:false, error }`，确保用户点“清空”后正在落库的子代理立即中断，不会继续执行后续 apply_* 工具。
- **暂停语义**：`running` 期间若已有 step 在执行，后续用户消息只会先入 `pending_user_messages_json`，不打断当前 step；step 跑完后 `dispatch_subagent` 工具统一消费排队消息和 `pauseRequested` 标记，必要时切 `paused`。下一轮用户消息在同一 task 上恢复 loop，由父代理决定是解释、改 plan，还是继续执行。
- **runId 串联**：`runParentAgent` 入口生成 8 字符 `runId`（`crypto.randomUUID().slice(0,8)`），所有由该次 run 触发的 SSE 事件（含 `delta` / `done` / `tool_call_*` / `step_*` / `plan_doc_updated` 等）以及父/子代理日志均携带 `runId`，便于跨日志与事件流串联排查"一次用户输入触发了哪些 tool / sub-agent / LLM 调用"。
- **SSE 事件清单（19 类）**：`delta`（自批 A 起携带 `messageId`，标记该 assistant 气泡服务端落库后的稳定 id；父代理普通文本由服务端按固定窗口切片伪流式发出，并在 chunk 之间主动让出事件循环，使 `/cancel` 能中途打断后续输出）/ `thinking` / `task_snapshot`（每次订阅和每轮 `runParentAgent` 真正进入 `running` 后都会下发，供前端把完成态、软失败或重连后的本地状态回切到真实运行态）/ `user_message`（用户消息落库后回传服务端 `messageId`，前端用于补 id）/ `messages_changed`（truncate / delete 后推送全量 messages，包含持久化 UI 记录）/ `plan_doc_updated`（同步 upsert `plan_doc` UI 记录）/ `awaiting_approval` / `plan_approved` / `step_started` / `step_completed` / `step_failed`（同步 upsert `step` UI 记录）/ `paused` / `task_completed` / `task_failed` / `task_cancelled` / `done` / `error` / `tool_call_started`（工具开始执行，`{ toolName, callId }`，同步写入 `tool_call` UI 记录）/ `tool_call_completed`（工具执行完成，`{ toolName, callId, success }`，同步更新 `tool_call.status`；控制流型 meta 工具成功短路时也会先发 `success:true` 再抛控制信号）。
- **稳定 messageId**：`task-store.appendMessage` 为每条消息打 `id`（调用方传入或 `msg-<uuid8>`）；前端在 `streamAgent` 调用时即生成 user 消息 id 一并 POST，使 truncate / delete 端点能直接用同一 id 操作；assistant 终稿落库后通过 `delta` 事件回传服务端 id，前端覆盖到流式气泡上。
- **上下文压缩**：`task.messages` 保留完整 UI 消息流供回放（user / assistant / tool_call / step / plan_doc）；发给父代理 LLM 前，`parent-agent.js` 只过滤出 `user / assistant` 文本消息参与摘要和模型输入，避免工具状态、计划卡片污染模型历史。文本历史在超过 8 条或总字符数超过 `24000` 时，把更早前缀压成一条独立的 `role:system` 历史摘要，并把摘要元数据持久化到 `assistant_tasks.model_context_json`。若用户随后 truncate / delete 历史，导致上下文重新落回阈值内，则旧 `modelContext` 会被立即清空，避免已删除指令继续通过摘要残留。模型输入始终保持“摘要 + 最近最多 8 条原始文本消息 + 当前 context block”，日志记录 `contextCharsBefore` / `contextCharsAfter` / `summaryUsed` / `tailMessageCount` 供诊断 token 预算。
- **SSE 关闭时机**（`/api/assistant/agent` finally 分支判定 `task.status`）：
  - `completed` / `failed` / `cancelled` → `detachSse` + `res.end()`，客户端 `reader.read()` 收到 EOF 后 `streamAgent` 自然 resolve；
  - `awaiting_approval` / `paused` / `running` → 保留长连接，等用户 `/approve`、自动 `resume:true` 拉起的恢复请求，或同 task 上的排队消息恢复 loop；客户端起新流前会主动 abort 旧连接，避免重复订阅同一份 `emit`。
  - 前端 `consumeSseResponse()` 收到 `{ done:true }` 后会主动 `reader.cancel()` 并 resolve，本轮 UI 立即把“停止”切回“发送”；不要只依赖网络 EOF，否则代理/浏览器未及时关闭 SSE 时会出现“回复完成但按钮仍是停止”的假运行态。
- **落库安全边界**：所有子代理 apply 工具入口一律先过 `normalizeProposal()`（`assistant/server/normalize-proposal.js`），再交给 `applyProposal()` 调资源域服务；契约失败抛错后由调用方决定 retry 或上报。
- **任务态持久化**：每次 mutator（createTask / setStatus / appendMessage / updateMessageContent / deleteMessage / truncateFrom / queueUserMessage / takeUserMessages / setModelContext / setCurrentStep / setLastToolFailure / setLastSubagentResult / setApprovalCheckpoint / incrementLoopIteration）都会把整条任务快照写入 SQLite `assistant_tasks` 表；`taskStore.emit()` 仍会把 `tool_call_*` / `step_*` / `plan_doc_updated` 先写入 `messages_json` 再广播 SSE。恢复策略：
  - `running` / `paused`：原样恢复；面板重开后前端会自动静默 resume。
  - `awaiting_approval`：原样恢复，只补订阅等待审批。
  - `completed` / `failed` / `cancelled`：原样恢复，且允许在同一 task 上继续对话。
  - `failed + interrupted by restart`：视为可恢复终态；面板重开后会自动静默 resume。
  - SSE 客户端不持久化。

详细字段、proposal schema、operation 约束、知识文件分工见设计文档 `docs/superpowers/specs/2026-05-07-assistant-redesign-design.md` 与 `assistant/knowledge/CONTRACT.md`。

---

## §14.1 端点细节

完整端点（路径、方法、参数）以 `backend/routes/*.js` 为准；本节只记录代码无法直接读出的非显然约束。

**路由注册顺序坑**：
- `PUT /api/worlds/reorder` 必须注册在 `PUT /api/worlds/:id` 之前（routes/worlds.js）
- `PUT /api/characters/reorder` 同理
- `PUT /api/world-entries/reorder` 同理

**SSE 路由集合**（响应非 JSON，前端必须用 EventSource / 自定义 fetch reader）：
- `POST /api/sessions/:sessionId/chat` / `regenerate` / `continue`
- `GET /api/sessions/:sessionId/recover-stream` / `stream`
- `POST /api/worlds/:worldId/writing-sessions/:sessionId/generate` / `continue` / `regenerate`
- `GET /api/worlds/:worldId/writing-sessions/:sessionId/recover-stream` / `stream`
- `/api/assistant/agent`（POST，SSE，单接口主入口）；辅助同 `/api/assistant` 命名空间内的 `agent/:taskId/approve`、`agent/:taskId/reject`（拒绝当前计划并回到可继续输入的 `paused`）、`agent/:taskId/cancel`、`agent/:taskId/plan-doc`（GET 计划文档原文）、`GET agent/:taskId`（任务快照）
- 非流式但同样在 chat / writing 命名空间内：`stop` / `impersonate` / `edit-assistant` / `retitle` / `chapter-titles/:i/retitle`

**配置接口分组**（routes/config.js 内多组并列）：每个 LLM section（对话主 / 对话副 / 写作主 / 写作副）独立有 `models` + `test-connection` 两个 GET 端点；Embedding 单独一组。所有 API Key 写入走 `PUT /api/config/provider-key` 顶层共享池，禁止通过 `PUT /api/config` 更新 `provider_keys` / `api_key`。

**导入导出**：全局设置导出/导入按 `?mode=chat|writing` 分流；导入为覆盖模式（先按 mode 清空 `custom_css_snippets` / `regex_rules` 中 `world_id IS NULL` 的记录）。玩家卡现有独立格式 `.wepersona.json`（`worldengine-persona-v1`）；同时仍兼容把旧 `.wechar.json` 角色卡导入为 persona。

**写卡助手单链路（父代理 + 通用子代理 + 计划文档）**：详见 §14 末尾。

**计划闸门**：普通单资源小改可直接 dispatch；创建世界卡 / 玩家卡 / 角色卡、状态/Prompt 条目体系、批量填写 / 补全 / 初始化状态字段、高风险删除、复杂跨资源修改、完整/全套/从零/整体优化类请求必须先写 `/.temp/assistant/<taskId>.md` 计划文档并切 `awaiting_approval`，由用户 `/approve` 续派。需要计划的任务即便看似少于 3 个宏观步骤，也不走直接 dispatch。

**落库安全边界**：所有子代理 apply 工具入口一律先过 `normalizeProposal()`（`assistant/server/normalize-proposal.js`），再调资源服务层；契约失败时抛错由父代理决定重试或上报。

**CUD 术语约束**：父代理 / 子代理在卡片正文、条目内容、状态字段说明、开场白、计划文档 step 描述中统一用 `{{user}}` 指代代入者，`{{char}}` 指代模型扮演角色；schema 字段值与历史状态标签保持原格式（如 `target:"persona"`、`keyword_scope:"user"`、`target_field:"玩家.HP"`）。

**world-card 子代理对齐规则**：
- `preview_card(target="world-card")` 返回 `trigger_type='state'` 条目时附带 `conditions`
- proposal `entryOps[].conditions` 与 `entry_conditions` 表同构：`target_field` 用 `世界.xxx / 玩家.xxx / 角色.xxx`，`operator` 用当前评估器支持的符号/中文操作符

**character-card / persona-card / global-config 对齐规则**：
- 已支持 `description` 字段，对齐当前编辑页
- `preview_card(target="character-card" | "persona-card")` 附带世界名、简介、现有世界条目、现有状态字段、当前默认状态值
- `character-card` / `persona-card` 不允许携带 `stateFieldOps`（状态字段创建/改/删只走 `world-card`）；新增 `stateValueOps` 只能填写已存在字段的默认值，未知 `field_key` 执行时拒绝
- `global-config` 不再暴露 `entryOps`（全局关键词条目能力已移除）

**辅助工具 `preview_card` / `list_resources` / `read_file`** 对父代理和子代理均可用；proposal schema、operation 白名单、knowledge 文件分工见 `assistant/knowledge/CONTRACT.md` 与设计文档 `docs/superpowers/specs/2026-05-07-assistant-redesign-design.md`。

---

## §16 Hook 系统

**设计目标**：以会话消息队列为核心，向内部开发者和用户暴露可扩展接入点。

### §16.1 架构

| 文件 | 职责 |
|---|---|
| `backend/hooks/hook-registry.js` | 核心引擎：`registerHook(event, fn, opts)` / `runHook(event, payload)` / `listHooks()` |
| `backend/utils/hook-loader.js` | 启动时扫描 `hooks/` 根目录所有 `.js` 文件（字母序），动态 import 并调用默认导出 |
| `hooks/` | 用户 DIY 接入点，根目录 `.js` 文件自动加载，`examples/` 子目录不加载 |

**加载时序**：server.js 先 `import './services/cleanup-registrations.js'` 注册内置清理钩子，随后执行 `initSchema(db)`，最后调用 `loadUserHooks()` 扫描 `hooks/`；用户 hook 运行时可安全读取已初始化的数据库 schema。

**失败策略**：单个 hook 抛错只 warn，不中断后续 hook，不影响主流程。

### §16.2 完整事件清单

| 事件 | 触发时机 | 触发位置 | payload 关键字段 |
|---|---|---|---|
| `generation:post` | LLM 生成完毕，任务入队前 | `app/shared/postgen/run-postgen-flow.js`（由 chat/writing orchestrator 调用） | `sessionId`, `worldId`, `taskSpecs[]`, `mode` |
| `message:user:before` | 用户消息保存前 | `routes/chat.js` POST /chat | `sessionId`, `content`, `attachments` |
| `message:user:saved` | 用户消息最终持久化后（含附件路径已写回 DB） | `routes/chat.js` POST /chat；`routes/writing.js` generate | `message`, `sessionId` |
| `message:assistant:saved` | AI 消息保存后 | `services/chat.js` processStreamOutput | `message`, `sessionId`, `aborted` |
| `message:deleted` | 消息删除后 | `routes/sessions.js` DELETE /messages/:id | `id`, `sessionId` |
| `message:edited` | 消息内容更新后 | `routes/chat.js` POST /edit-assistant | `id`, `sessionId`, `content` |
| `queue:task:start` | 队列任务开始执行（非阻塞观测事件） | `utils/async-queue.js` drain | `sessionId`, `label`, `priority` |
| `queue:task:done` | 队列任务成功完成（非阻塞观测事件） | `utils/async-queue.js` drain | `sessionId`, `label`, `priority`, `ms` |
| `queue:task:fail` | 队列任务执行失败（非阻塞观测事件） | `utils/async-queue.js` drain | `sessionId`, `label`, `priority`, `error` |

### §16.3 generation:post 的 TaskSpec 接口

`generation:post` 的 `taskSpecs` 是数组引用，用户 hook 可 push 自定义 TaskSpec，复用 `post-gen-runner.js` 和 `async-queue.js` 的全部能力：

| 字段 | 类型 | 说明 |
|---|---|---|
| `label` | string | 任务标签，用于日志和队列标识 |
| `priority` | number | 优先级（数字越小越高；内置最低为 4，自定义建议 ≥5） |
| `fn` | async function | 任务主体 |
| `condition` | boolean | false 时跳过（默认 true） |
| `startSseEvent` | string? | 任务开始时推送的 SSE 事件名 |
| `sseEvent` | string? | 任务完成后推送的 SSE 事件名 |
| `ssePayload` | function? | 自定义 SSE payload 构造器 |
| `keepSseAlive` | boolean | true 时阻止 SSE 连接关闭，等待此任务推送完事件 |
| `tracksState` | boolean? | 注册为状态更新追踪（state 任务专用） |

---

## §15 文件存储结构

| 路径 | 内容 | 备注 |
|---|---|---|
| `data/worldengine.db` | SQLite 主库 | 字段定义见 SCHEMA.md |
| `data/config.json` | 全局配置（含 API Key） | 不随导出；不提交 git；`logging.mode` 默认 `metadata`，切到 `raw` 后可配合 `logging.prompt.enabled` / `logging.llm_raw.enabled` 输出截断原文预览 |
| `data/uploads/avatars/` | 角色/玩家头像 | 角色：`{characterId}.ext`；persona：`persona-{personaId}.ext` |
| `data/uploads/attachments/` | 消息附件 | `{messageId}_{index}.ext`；base64 解码后存储 |
| `data/vectors/prompt_entries.json` | Prompt 条目 embedding 索引 | 启动时加载到内存 |
| `data/vectors/session_summaries.json` | Session summary embedding 索引 | T49 起不再写入，存档旧数据 |
| `data/vectors/turn_summaries.json` | Turn record 摘要 embedding 索引 | 启动时加载到内存（T49） |
| `data/daily/{sessionId}/{date_str}.md` | 日记正文文件 | T155；随 session 删除时由 cleanup-registrations.js 钩子清理；DB 记录由 `ON DELETE CASCADE` 自动清理 |
| `data/logs/worldengine-YYYY-MM-DD.log` | 运行时日志，按日轮换 | T99/T101；默认 metadata-only，覆盖 HTTP/LLM/chat/writing/assistant/config/memory 高价值链路 |
