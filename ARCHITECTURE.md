# WorldEngine — 架构参考

> 目标读者：AI 助手。覆盖式更新，不追加历史。最后更新：2026-04-17
> 数据库字段权威来源见 SCHEMA.md，约束规则见 CLAUDE.md。

---

## §1 项目定位

WorldEngine 是面向创意写作/角色扮演的本地 LLM 前端。核心特点：在角色之上增加"世界"层，记忆系统包含 session summary、角色状态栏、世界状态栏、世界时间线四部分，并支持按世界配置状态字段模板；提示词采用渐进式披露。

**架构层级**：`全局 → 世界 → 角色 → 会话`，每层有独立的提示词、配置和记忆，下层不可覆盖上层。

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TailwindCSS + Zustand |
| 后端 | Node.js + Express + ES Modules |
| 数据库 | SQLite（better-sqlite3） |
| 向量 | OpenAI embeddings 或 Ollama embeddings（可选，未配置时静默降级） |

---

## §2 目录结构

```
/backend/
  server.js                          入口；注册全部路由；副作用 import cleanup-registrations.js
  /routes/                           HTTP 路由，只做参数校验，不含业务逻辑
    chat.js                          对话、stop、regenerate、continue、impersonate、删除消息
    writing.js                       写作空间路由（挂在 /api/worlds）
    [其余见 §14 路由映射]
  /services/                         业务逻辑层
    cleanup-registrations.js         所有副作用资源删除钩子的集中注册（见 §10）
    writing-sessions.js              写作会话业务逻辑
    [其余 service 与 route 同名]
  /db/
    schema.js                        建表 DDL + ALTER TABLE 迁移（锁定文件）
    /queries/                        所有 SQL 操作，路由层禁止直接查询
  /memory/
    recall.js                        渲染状态/时间线/摘要为可读文本，向量召回（见 §6）
    summarizer.js                    summary + title 生成
    context-compressor.js            generateTimelineEntry（手动 /summary 触发，生成世界时间线）
    turn-summarizer.js               createTurnRecord（每轮结束后创建 turn record，含状态快照）
    character-state-updater.js       对话后异步更新角色状态
    world-state-updater.js           对话后异步更新世界状态
    persona-state-updater.js         对话后异步更新玩家状态
    summary-expander.js              decideExpansion + renderExpandedTurnRecords（展开 turn record 原文）
  /prompt/
    assembler.js                     提示词组装器（锁定文件，见 §4）
    entry-matcher.js                 Prompt 条目命中判断（向量相似度 + 最近消息窗口）
  /llm/
    index.js                         对外暴露 chat()（流式）/ complete()（非流式）
    embedding.js                     embed()
    /providers/                      openai.js / ollama.js
  /utils/
    constants.js                     所有硬性数值常量（锁定文件，见 §13）
    async-queue.js                   按优先级的 per-session 串行队列（见 §5）
    regex-runner.js                  正则替换管线（见 §9）
    vector-store.js                  prompt_entries 内存向量索引
    session-summary-vector-store.js  session summary 内存向量索引（T49 起不再写入，存档旧数据）
    turn-summary-vector-store.js     turn record 摘要内存向量索引（T49，双阈值搜索）
    cleanup-hooks.js                 registerOnDelete / runOnDelete 实现
    token-counter.js                 近似 token 计数

/frontend/src/
  /store/index.js                    Zustand（锁定文件，见 §12）
  /api/                              每资源一个文件，组件内禁止直接 fetch（见 §12）
  /components/
    /ui/                             Button / Input / Textarea / Card / Badge / ModalShell / MarkdownEditor
    /chat/                           InputBox / MessageItem / MessageList / SessionItem / Sidebar
    /characters/                     角色列表、编辑相关组件
    /worlds/                         世界相关组件
    /memory/                         MemoryPanel.jsx
    /prompt/                         EntryEditor / EntryList
    /settings/                       CustomCssManager / RegexRulesManager / RegexRuleEditor
    /state/                          StateFieldEditor / StateFieldList
    /writing/                        ActiveCharactersPicker / MultiCharacterMemoryPanel / WritingMessageItem / WritingMessageList / WritingSidebar
  /pages/
    WorldsPage.jsx                   世界列表
    WorldCreatePage.jsx / WorldEditPage.jsx
    CharacterCreatePage.jsx / CharacterEditPage.jsx
    ChatPage.jsx                     对话主页
    PersonaEditPage.jsx              玩家编辑
    SettingsPage.jsx
    WritingSpacePage.jsx             写作空间主页
  /utils/
    avatar.js                        getAvatarColor(id)：头像 fallback（纯色圆形+名字首字）
    regex-runner.js                  前端侧正则（display_only / user_input scope）

/data/
  worldengine.db                     SQLite 主库
  config.json                        全局配置（含 API Key，不导出）
  /uploads/avatars/                  角色/玩家头像
  /uploads/attachments/              消息附件
  /vectors/
    prompt_entries.json              Prompt 条目 embedding 索引（内存加载）
    session_summaries.json           Session summary embedding 索引（T49 起不再写入，存档）
    turn_summaries.json              Turn record 摘要 embedding 索引（内存加载，T49）
```

---

## §3 数据流：一次对话请求

```
POST /api/sessions/:sessionId/chat
  │
  ├─ 保存 user 消息到 DB（messages 表）
  ├─ 推送 SSE: memory_recall_start
  │
  ├─ buildContext(sessionId, { onRecallEvent })
  │    └─ buildPrompt(sessionId, { onRecallEvent })
  │         ├─ 查询 session / world / character / config / persona
  │         ├─ 组装 [1]–[16] 段（见 §4）
  │         ├─ searchRecalledSummaries() → 向量召回（turn_summaries.json，双阈值）
  │         ├─ onRecallEvent('memory_recall_done', { hit }) → 推送 SSE
  │         ├─ [若命中且 memory_expansion_enabled] decideExpansion()
  │         │    ├─ onRecallEvent('memory_expand_start', { candidates }) → 推送 SSE
  │         │    └─ onRecallEvent('memory_expand_done', { expanded }) → 推送 SSE
  │         └─ 返回 { messages, temperature, maxTokens, recallHitCount }
  │
  ├─ llm.chat(messages, { temperature, maxTokens })  ← 流式
  │    └─ 逐 chunk 推送 SSE: delta
  │
  ├─ 流结束后：
  │    ├─ applyRules(content, 'ai_output', worldId)  ← 正则处理
  │    ├─ createMessage(sessionId, 'assistant', processedContent)  ← 写 DB
  │    └─ 推送 SSE: done
  │
  └─ 异步任务入队（见 §5）
       ├─ title 为 NULL：等 generateTitle 完成 → 推送 title_updated → res.end()
       └─ title 已存在：直接 res.end()
```

---

## §4 提示词组装（assembler.js）

### buildPrompt(sessionId, options?) → { messages, temperature, maxTokens, recallHitCount }

16 段顺序，[1]–[13] 合并为单条 `role:system`，[14] 为多条 `role:user/assistant`，[15]–[16] 为尾部 `role:user`：

| 段 | 来源 | 跳过条件 |
|---|---|---|
| [1] | `config.global_system_prompt` | 空字符串跳过 |
| [2] | `world.system_prompt` | 空跳过 |
| [3] | `renderWorldState(world.id)` | 无字段/值时跳过 |
| [4] | persona，格式：`[用户人设]\n名字：${name}\n${system_prompt}` | name 和 system_prompt 均空时整段跳过 |
| [5] | `renderPersonaState(world.id)` | 空跳过 |
| [6] | `character.system_prompt` | 空跳过 |
| [7] | `renderCharacterState(character.id)` | 空跳过 |
| [8] | 全局 Prompt 条目（命中→`entry.content`，未命中→`entry.summary`） | 无条目时跳过 |
| [9] | 世界 Prompt 条目（同上） | — |
| [10] | 角色 Prompt 条目（同上） | — |
| [11] | `renderTimeline(world.id)` | 无时间线条目时跳过 |
| [12] | 召回摘要：`searchRecalledSummaries` → `renderRecalledSummaries` | 无命中时跳过 |
| [13] | 展开原文：`decideExpansion` → `renderExpandedTurnRecords` | 无展开时跳过 |
| [14] | 历史消息：**有 turn records** → 取最近 `context_history_rounds` 条，每条渲染为 user/assistant 对；**无 turn records（旧 session）** → 降级用 `getUncompressedMessagesBySessionId` 去除最后一条 user 消息；每条 content 经 `applyRules(content, 'prompt_only', worldId)` 处理 | — |
| [15] | 后置提示词（`global_post_prompt` → `world.post_prompt` → `character.post_prompt`），合并为单条 `role:user` | 均空跳过 |
| [16] | 当前用户消息：DB 中最新的 `role:user` 消息（刚存入的那条），经 `applyRules` 处理 | — |

**生成参数**：`world.temperature ?? config.llm.temperature`，`world.max_tokens ?? config.llm.max_tokens`

### buildWritingPrompt(sessionId, options?) → { messages, temperature, maxTokens }

与 `buildPrompt` 的差异：

| 段 | 差异 |
|---|---|
| [6] | 无单一角色；从 `writing_session_characters` 获取激活角色列表；每个角色格式：`[角色：${name}]\n${system_prompt}` |
| [7] | 循环所有激活角色调用 `renderCharacterState` |
| [8-10] | 合并全局 + 世界 + 所有激活角色的 entries |
| [12-13] | 无向量召回，无记忆展开 |
| [14] | 始终使用降级路径（uncompressed messages），写作模式无 turn records |
| [15] | 无角色后置提示词（只有 `global_post_prompt` + `world.post_prompt`） |
| 返回值 | 无 `recallHitCount` |

---

## §5 对话后异步任务链

**触发条件**：流正常完成（非 aborted）且该 session 存在 user 消息。

**优先级**（数字越小越高，1/2/3 不可丢弃，4/5 已废弃，不再入队）：

| 优先级 | 任务 | 触发条件 |
|---|---|---|
| 2 | `generateTitle(sessionId)` | `session.title` 为 NULL 时 |
| 2 | `updateCharacterState(characterId, sessionId)` | `characterId` 存在 |
| 2 | `updatePersonaState(worldId, sessionId)` | `worldId` 存在 |
| 3 | `updateWorldState(worldId, sessionId)` | `worldId` 存在 |
| 3 | `createTurnRecord(sessionId)` | 每次（在 world-state 之后入队，捕获本轮结果状态） |

**createTurnRecord 内部流程**（每轮正常完成后执行）：

```
createTurnRecord(sessionId, { isUpdate? })
  ├─ 取最后一条 user 消息 + 最后一条 assistant 消息
  ├─ 渲染状态快照（renderWorldState + renderPersonaState + renderCharacterState）
  ├─ 组装：
  │    user_context  = [worldState, personaState, "用户：{input}"].join("\n\n")
  │    asst_context  = ["AI：{output}", charState].join("\n\n")
  ├─ LLM.complete() 生成摘要（100-200 字，temp=0.3）
  ├─ round_index = isUpdate ? latestRecord.round_index : count + 1
  ├─ UPSERT turn_records（by session_id + round_index）
  └─ 异步 embed summary → upsertEntry 到 turn_summaries.json
```

**SSE 连接关闭时机**：
- `session.title` 为 NULL：等 `generateTitle` 完成 → `.then` 推送 `title_updated` → `.finally` 调用 `res.end()`
- `session.title` 已存在：入队后直接 `res.end()`

**regenerate**：先 `deleteLastTurnRecord(sessionId)` 删除最后一轮 turn record，再 `clearPending(sessionId, 4)` 清空优先级 ≥4 的待处理任务，然后正常入队（新生成完成后 `createTurnRecord`）。

**continue**：续写完成后入队 `createTurnRecord(sessionId, { isUpdate: true })`，UPSERT 覆盖最后一轮 turn record（不新增轮次）。

---

## §6 记忆系统（recall.js）

6 个导出函数（均在 `backend/memory/recall.js`）：

| 函数签名 | 渲染标签 | 说明 |
|---|---|---|
| `renderPersonaState(worldId)` → string | `[玩家状态]` | LEFT JOIN persona_state_fields + values；按 sort_order ASC |
| `renderCharacterState(characterId)` → string | `[角色状态]` | LEFT JOIN character_state_fields + values；按 sort_order ASC |
| `renderWorldState(worldId)` → string | `[世界状态]` | LEFT JOIN world_state_fields + values；按 sort_order ASC |
| `renderTimeline(worldId, limit=5)` → string | `[历史会话摘要]` | 按 updated_at DESC 取最近 limit 条 |
| `searchRecalledSummaries(worldId, sessionId)` → Promise<{recalled, recentMessagesText}> | — | 向量搜索；recalled 数组含 `{ref, turn_record_id, session_id, session_title, round_index, created_at, content, score, is_same_session}` |
| `renderRecalledSummaries(recalled)` → string | `[历史记忆召回]` | 格式：`#ref（turn_record_id）【date · title · 第N轮】content` |

**组装位置**：[3] 世界状态、[5] 玩家状态、[7] 角色状态各自独立注入；[11] 时间线；[12] 召回摘要；[13] 展开原文（见 §4）。

**向量搜索行为（T49 新）**：
- 查询向量 = 最后一条 user 消息 + 最后一条 assistant 消息拼接嵌入
- topK = `MEMORY_RECALL_MAX_SESSIONS`（3）
- **双阈值**：同 session（`is_same_session = true`）使用 `MEMORY_RECALL_SAME_SESSION_THRESHOLD`（0.45）；跨 session 使用 `MEMORY_RECALL_SIMILARITY_THRESHOLD`（0.68）
- token 预算软截断（`MEMORY_RECALL_MAX_TOKENS` = 2048），超额时 break
- embedding 未配置时静默降级，返回 `{ recalled: [], recentMessagesText }`

**list 类型字段渲染**：JSON 数组解析后以顿号（`、`）分隔；空数组跳过该行。

---

## §7 SSE 事件完整清单

所有事件通过同一 SSE 连接（`text/event-stream`）推送，格式为 `data: ${JSON.stringify(payload)}\n\n`。

| type 字段 | 触发时机 | payload 示例 |
|---|---|---|
| `delta` | LLM 流式增量 | `{ delta: "文字" }` |
| `done` | 流式正常完成 | `{ done: true }` |
| `aborted` | 用户主动中断 | `{ aborted: true }` |
| `error` | LLM 调用异常 | `{ type: "error", error: "..." }` |
| `title_updated` | 标题异步生成完成 | `{ type: "title_updated", title: "..." }` |
| `memory_recall_start` | 进入 buildContext 前 | `{ type: "memory_recall_start" }` |
| `memory_recall_done` | buildContext 返回后 | `{ type: "memory_recall_done", hit: 2 }` |
| `memory_expand_start` | 展开决策前 | `{ type: "memory_expand_start", candidates: [{ref:1,title:"..."}] }` |
| `memory_expand_done` | 展开完成 | `{ type: "memory_expand_done", expanded: ["session_id_1"] }` |

**注**：`memory_recall_*` 和 `memory_expand_*` 仅 `/chat` 路径发出；`/continue`（续写）路径不含。

---

## §8 状态系统

三套状态模板，均挂在世界下配置：

| 状态套 | 字段定义表 | 字段值表 | 粒度 |
|---|---|---|---|
| 世界状态 | `world_state_fields` | `world_state_values` | 每世界唯一一份 |
| 角色状态 | `character_state_fields` | `character_state_values` | 每角色独立一份 |
| 玩家状态 | `persona_state_fields` | `persona_state_values` | 每世界唯一一份（跟随 persona） |

**字段类型**：`text / number / boolean / enum / list`
- `list`：值存储为 JSON 数组字符串，渲染时解析为顿号分隔的字符串

**update_mode**：
- `manual`：不参与 LLM 自动更新
- `llm_auto`：参与异步更新（由 character-state-updater / world-state-updater / persona-state-updater 驱动）

**trigger_mode**（仅 `llm_auto` 字段有效）：
- `manual_only`：跳过自动触发
- `every_turn`：每轮对话后更新
- `keyword_based`：关键词命中时更新

**初始化时机**：
- 创建世界时：`services/worlds.createWorld` 自动 upsert persona 行 + persona_state_values 初值
- 创建角色时：按世界的 character_state_fields 模板初始化 character_state_values

**persona 与世界的关系**：每个世界对应唯一 persona（`personas.world_id UNIQUE`）；persona 的 name / system_prompt 注入 assembler.js [3] 位置。

---

## §9 正则替换管线

4 种 scope，按作用时机分工：

| scope | 执行位置 | 影响存库 | 影响显示 | 影响 LLM |
|---|---|---|---|---|
| `user_input` | 前端发送前 | 是 | 是 | 是 |
| `ai_output` | 后端流结束后、写 messages 前 | 是 | 是 | 是 |
| `display_only` | 前端渲染时 | 否 | 是 | 否 |
| `prompt_only` | assembler.js [14] 历史消息处理时 | 否 | 否 | 是 |

**执行顺序**：同 scope 内按 `sort_order ASC` 链式套用，前一条输出作为后一条输入。

**作用范围**：`world_id IS NULL` 的规则对所有世界生效；非 NULL 仅对该世界的会话生效。

**失败处理**：规则编译或执行失败时跳过该条并记 warn 日志，不中断管线。

---

## §10 副作用资源删除钩子

**挂载方式**：`server.js` 启动时通过副作用 `import './services/cleanup-registrations.js'` 触发一次全局注册；钩子通过 `registerOnDelete(entity, asyncFn)` 注册，`entity` 为 `'world' | 'character' | 'session' | 'message'`。

**已注册钩子**（`backend/services/cleanup-registrations.js`）：

| entity | 清理内容 |
|---|---|
| `message` | 删除该消息的附件文件（`/data/uploads/attachments/`） |
| `session` | 删除该会话所有消息的附件文件 + session summary embedding + **turn summaries embedding** |
| `character` | 删除相关消息附件 + 角色头像文件（`avatar_path`）+ prompt entries embedding + 该角色所有会话的 summary embedding + **turn summaries embedding** |
| `world` | 删除相关消息附件 + 所有角色头像 + persona 头像 + 所有角色 prompt entries embedding + 所有会话 summary embedding + **turn summaries embedding** |

**执行规则**：`runOnDelete(entity, id)` 在 DB DELETE 之前调用；钩子失败只 warn，不阻塞删除。

**扩展规则**：新增带磁盘文件或向量的子资源时，**只在此文件注册钩子**，不修改 deleteWorld / deleteCharacter 等核心 delete 函数。

---

## §11 写作空间（writing mode）

**入口**：`/worlds/:worldId/writing`，路由文件 `routes/writing.js`，挂载在 `app.use('/api/worlds', writingRoutes)`。

**数据模型与普通会话的差异**：

| 字段 | 普通会话 | 写作会话 |
|---|---|---|
| `sessions.character_id` | 非空，绑定单个角色 | 可空 |
| `sessions.world_id` | 非空 | 非空 |
| `sessions.mode` | `'chat'` | `'writing'` |
| 激活角色 | 无 | `writing_session_characters` 联结表（支持动态增删） |

**提示词**：调用 `buildWritingPrompt(sessionId)` 而非 `buildPrompt()`；差异见 §4。

**服务层**：`services/writing-sessions.js`。

---

## §12 前端架构

**Zustand store**（`/frontend/src/store/index.js`，锁定文件）：

| 状态 | 类型 | 说明 |
|---|---|---|
| `currentWorldId` | string\|null | 当前选中的 world |
| `currentCharacterId` | string\|null | 当前选中的 character |
| `currentSessionId` | string\|null | 当前会话 |
| `memoryRefreshTick` | number | 记忆面板刷新触发器 |

Actions：`setCurrentWorldId / setCurrentCharacterId / setCurrentSessionId / triggerMemoryRefresh`

**API 层**（`/frontend/src/api/`）：每资源一个文件，组件内禁止直接 fetch。

| 文件 | 资源 |
|---|---|
| characters.js / characterStateFields.js / characterStateValues.js | 角色及状态 |
| worlds.js / worldStateFields.js / worldStateValues.js / worldTimeline.js | 世界及状态 |
| sessions.js / chat.js | 会话与对话 |
| personas.js / personaStateFields.js / personaStateValues.js | 玩家 |
| prompt-entries.js | Prompt 条目 |
| regexRules.js / customCssSnippets.js | 正则与 CSS |
| importExport.js / config.js | 导入导出与配置 |
| writingSessions.js | 写作空间 |

**工具函数**：
- `utils/avatar.js`：`getAvatarColor(id)` 基于 id hash 生成头像颜色；`avatar_path` 为 NULL 时显示纯色圆形 + 名字首字
- `utils/regex-runner.js`：前端侧执行 `display_only` / `user_input` scope 的正则规则

---

## §13 数值常量速查（constants.js）

所有硬性数值常量的唯一来源，禁止硬编码。

```
# LLM 重试
LLM_RETRY_MAX = 3
LLM_RETRY_DELAY_MS = 1000

# 异步队列
ASYNC_QUEUE_MAX_SIZE = 20

# 上下文历史
CONTEXT_MIN_HISTORY_ROUNDS = 4

# Prompt 条目向量检索
PROMPT_ENTRY_SCAN_WINDOW = 5
PROMPT_ENTRY_SIMILARITY_THRESHOLD = 0.72
PROMPT_ENTRY_TOP_K = 3

# 记忆召回
MEMORY_RECALL_MAX_SESSIONS = 3
MEMORY_RECALL_MAX_TOKENS = 2048
MEMORY_RECALL_SIMILARITY_THRESHOLD = 0.68       # 跨 session 阈值
MEMORY_RECALL_SAME_SESSION_THRESHOLD = 0.45     # 同 session 内宽松阈值（T49）

# 记忆展开（T28）
MEMORY_EXPAND_MAX_TOKENS = 4096
MEMORY_EXPAND_DECISION_MAX_TOKENS = 200
MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS = 30

# 世界时间线
WORLD_TIMELINE_RECENT_LIMIT = 5
WORLD_TIMELINE_COMPRESS_THRESHOLD = 50
WORLD_TIMELINE_MAX_ENTRIES = 200

# 附件
MAX_ATTACHMENTS_PER_MESSAGE = 3
MAX_ATTACHMENT_SIZE_MB = 5
```

---

## §14 路由映射速查

`server.js` 中全部 `app.use` 挂载：

| 挂载前缀 | 路由文件 | 主要端点 |
|---|---|---|
| `/api/config` | routes/config.js | GET/PATCH 全局配置 |
| `/api/worlds` | routes/worlds.js | CRUD 世界 |
| `/api` | routes/characters.js | `/worlds/:id/characters` CRUD |
| `/api` | routes/sessions.js | `/characters/:id/sessions` 或 `/worlds/:id/sessions` CRUD |
| `/api/sessions` | routes/chat.js | `/:id/chat` `/:id/stop` `/:id/regenerate` `/:id/continue` `/:id/impersonate` `/:id/messages/:msgId` |
| `/api` | routes/prompt-entries.js | 全局/世界/角色 prompt 条目 CRUD |
| `/api` | routes/state-fields.js | 世界/角色/玩家状态字段定义（统一路由） |
| `/api` | routes/world-state-values.js | 世界状态值 |
| `/api` | routes/character-state-values.js | 角色状态值 |
| `/api` | routes/world-timeline.js | 世界时间线读写 |
| `/api` | routes/import-export.js | 角色卡/世界卡导入导出 |
| `/api` | routes/custom-css-snippets.js | 自定义 CSS 片段 CRUD |
| `/api` | routes/regex-rules.js | 正则规则 CRUD |
| `/api` | routes/personas.js | 玩家（persona）读写 |
| `/api` | routes/persona-state-fields.js | 玩家状态字段定义 |
| `/api` | routes/persona-state-values.js | 玩家状态值 |
| `/api/worlds` | routes/writing.js | `/:worldId/writing-sessions` 写作空间 |

**中间件顺序**：CORS → JSON 解析（limit: 20MB）→ 静态文件（/uploads）→ 路由。

---

## §15 文件存储结构

| 路径 | 内容 | 备注 |
|---|---|---|
| `data/worldengine.db` | SQLite 主库 | 字段定义见 SCHEMA.md |
| `data/config.json` | 全局配置（含 API Key） | 不随导出；不提交 git |
| `data/uploads/avatars/` | 角色/玩家头像 | 角色：`{characterId}.ext`；persona：`persona-{personaId}.ext` |
| `data/uploads/attachments/` | 消息附件 | `{messageId}_{index}.ext`；base64 解码后存储 |
| `data/vectors/prompt_entries.json` | Prompt 条目 embedding 索引 | 启动时加载到内存 |
| `data/vectors/session_summaries.json` | Session summary embedding 索引 | T49 起不再写入，存档旧数据 |
| `data/vectors/turn_summaries.json` | Turn record 摘要 embedding 索引 | 启动时加载到内存（T49） |
