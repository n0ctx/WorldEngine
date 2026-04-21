# WorldEngine — 架构参考

> 目标读者：AI 助手。覆盖式更新，不追加历史。最后更新：2026-04-20
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
- 修改 `backend/prompts/assembler.js`、`backend/routes/`、`backend/memory/`、`backend/services/` 的对外行为时，必须检查本文件是否需要同步
- 修改助手协议、SSE 事件、写作空间流程、状态系统行为时，必须同步本文件相关章节

---

## §1 项目定位

WorldEngine 是面向创意写作/角色扮演的本地 LLM 前端。核心特点：在角色之上增加"世界"层，记忆系统包含 turn record 摘要（会话时间线）、角色状态栏、世界状态栏、向量召回四部分，状态栏按会话级隔离，并支持按世界配置状态字段模板；提示词采用渐进式披露。

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
    turn-summarizer.js               createTurnRecord（每轮结束后创建 turn record，保存纯对话轮次摘要）
    combined-state-updater.js        对话后异步更新角色/世界/玩家状态（导出 updateAllStates）
    summary-expander.js              decideExpansion + renderExpandedTurnRecords（展开 turn record 原文）
  /prompts/                          后端内置 LLM prompt 模板（仓库模板，不存用户可配置 prompt）
    assembler.js                     提示词组装器（锁定文件，见 §4）
    entry-matcher.js                 Prompt 条目命中判断（向量相似度 + 最近消息窗口）
    prompt-loader.js                 读取 `backend/prompts/templates/*.md` 的内置 prompt 模板加载器
    README.md                        模板分组说明与调用映射
    /templates/                      平铺 `.md` 模板，靠文件名前缀区分用途
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
  App.jsx                            路由入口；页面组件 route-level lazy loading；写卡助手首次打开后懒加载
  /store/index.js                    Zustand（锁定文件，见 §12）
  /api/                              每资源一个文件，组件内禁止直接 fetch（见 §12）
  /components/
    /ui/                             Button / Input / Textarea / Card / Badge / ModalShell / MarkdownEditor（懒加载包装层）/ MarkdownEditorInner（Tiptap 实现）
    /chat/                           InputBox / MessageItem / MessageList / SessionItem / Sidebar
    /characters/                     角色列表、编辑相关组件
    /worlds/                         世界相关组件
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
  config.json                        全局配置（含 API Key，不导出；`logging` 块控制日志模式）
  /uploads/avatars/                  角色/玩家头像
  /uploads/attachments/              消息附件
  /vectors/
    prompt_entries.json              Prompt 条目 embedding 索引（内存加载）
    session_summaries.json           Session summary embedding 索引（T49 起不再写入，存档）
    turn_summaries.json              Turn record 摘要 embedding 索引（内存加载，T49）
  /logs/
    worldengine-YYYY-MM-DD.log       运行时日志，按日轮换（T99/T101）；data/.gitignore 已覆盖，不提交 git
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

`assembler.js` 只负责拼装顺序与运行时数据；固定后端模板（如 suggestion prompt）统一存放在 `backend/prompts/templates/` 的分组目录下，通过 `prompt-loader.js` 读取。

15 段顺序（[11] 世界时间线已移除），[1]–[13] 合并为单条 `role:system`，[14] 为多条 `role:user/assistant`，[15]–[16] 为尾部 `role:user`：

| 段 | 来源 | 跳过条件 |
|---|---|---|
| [1] | `config.global_system_prompt` | 空字符串跳过 |
| [2] | `world.system_prompt` | 空跳过 |
| [3] | `renderWorldState(world.id)` | 无字段/值时跳过 |
| [4] | persona，格式：`[{{user}}人设]\n名字：${name}\n${system_prompt}` | name 和 system_prompt 均空时整段跳过 |
| [5] | `renderPersonaState(world.id)` | 空跳过 |
| [6] | `[\{\{char\}\}人设]\n${character.system_prompt}` | 空跳过 |
| [7] | `renderCharacterState(character.id)` | 空跳过 |
| [8] | 全局 Prompt 条目（`description` 仅供 preflight；命中后注入 `entry.content`） | 无条目时跳过 |
| [9] | 世界 Prompt 条目（同上） | — |
| [10] | 角色 Prompt 条目（同上） | — |
| [12] | 召回摘要：`searchRecalledSummaries` → `renderRecalledSummaries`；**已排除上下文窗口内最近 `context_history_rounds` 轮** | 无命中时跳过 |
| [13] | 展开原文：`decideExpansion` → `renderExpandedTurnRecords` | 无展开时跳过 |
| [14] | 历史消息：稳定使用原始 `messages` 窗口；仅移除 [16] 当前 user，并按最近 `context_history_rounds` 个已完成 user 轮次截窗；每条 content 经 `applyRules(content, 'prompt_only', worldId)` 处理 | — |
| [15] | 后置提示词（`global_post_prompt` → `world.post_prompt` → `character.post_prompt`），合并为单条 `role:user` | 均空跳过 |
| [16] | 当前用户消息：DB 中最新的 `role:user` 消息（刚存入的那条），经 `applyRules` 处理 | — |

**生成参数**：`world.temperature ?? config.llm.temperature`，`world.max_tokens ?? config.llm.max_tokens`

### buildWritingPrompt(sessionId, options?) → { messages, temperature, maxTokens }

与 `buildPrompt` 的差异：

| 段 | 差异 |
|---|---|
| [6] | 无单一角色；从 `writing_session_characters` 获取激活角色列表；每个角色格式：`[{{char}}人设]\n${system_prompt}`，并用该角色名字替换 `{{char}}` |
| [7] | 循环所有激活角色调用 `renderCharacterState`，并以各自角色名替换 `{{char}}` |
| [8-10] | 合并全局 + 世界 + 所有激活角色的 entries；全局/世界 entries 用首个激活角色名作为 `{{char}}` fallback，角色 entries 用各自所属角色名替换 |
| [12-13] | 同 buildPrompt；[13] 受 `writing.memory_expansion_enabled` 控制 |
| [14] | 同 buildPrompt，稳定使用原始 `messages` 窗口 |
| [15] | 无角色后置提示词（只有 `global_post_prompt` + `world.post_prompt`） |
| 返回值 | 含 `recallHitCount` |

---

## §5 对话后异步任务链

**触发条件**：流正常完成（非 aborted）且该 session 存在 user 消息。

**优先级**（数字越小越高，1/2/3 不可丢弃，4/5 已废弃，不再入队）：

| 优先级 | 任务 | 触发条件 |
|---|---|---|
| 2 | `generateTitle(sessionId)` | `session.title` 为 NULL 时 |
| 2 | `updateAllStates(worldId, characterIds, sessionId)` | 每次（角色/世界/玩家状态合并一次调用） |
| 3 | `createTurnRecord(sessionId)` | 每次（在 updateAllStates 之后入队，捕获本轮结果状态） |

**createTurnRecord 内部流程**（每轮正常完成后执行）：

```
createTurnRecord(sessionId, { isUpdate? })
  ├─ 按 round_index 取”第 N 条 user”及其后、下一条 user 之前的最后一条 assistant
  ├─ 读取 `backend/prompts/templates/memory-turn-summary.md`
  ├─ LLM.complete() 生成摘要（10-50 字，temp=0.3）
  ├─ round_index = isUpdate ? latestRecord.round_index : count + 1
  ├─ UPSERT turn_records（by session_id + round_index）
  │    存 user_message_id / asst_message_id（指针），user_context / asst_context 置空
  └─ 异步 embed summary → upsertEntry 到 turn_summaries.json
```

原文展开（[13]）时，通过 `user_message_id`/`asst_message_id` 查 `messages` 表取实时内容；
旧记录（ID 为 NULL）回退到 `user_context`/`asst_context` 字段（兼容存量数据）。

写作模式差异：
- world 从 `session.world_id` 直接取（无 character_id）
- `{{char}}` 仅作为最后一条旁白/角色输出前缀占位符，不额外拼接状态快照

**SSE 连接关闭时机**：
- `session.title` 为 NULL：等 `generateTitle` 完成 → `.then` 推送 `title_updated` → `.finally` 调用 `res.end()`
- `session.title` 已存在：入队后直接 `res.end()`

**regenerate**：先 `deleteLastTurnRecord(sessionId)` 删除最后一轮 turn record，再 `clearPending(sessionId, 4)` 清空优先级 ≥4 的待处理任务，然后正常入队（新生成完成后 `createTurnRecord`）。

**continue**：续写时不再手工 pop/push 历史轮次；保留 assembler 已组装好的 system/history/post prompt，仅把 [16] 当前 user 作为锚点，后接 `originalContent` 作为 assistant continuation。完成后入队 `createTurnRecord(sessionId, { isUpdate: true })`，UPSERT 覆盖最后一轮 turn record（不新增轮次）。

---

## §6 记忆系统（recall.js）

6 个导出函数（均在 `backend/memory/recall.js`）：

| 函数签名 | 渲染标签 | 说明 |
|---|---|---|
| `renderPersonaState(worldId)` → string | `[玩家状态]` | LEFT JOIN persona_state_fields + values；按 sort_order ASC |
| `renderCharacterState(characterId)` → string | `[角色状态]` | LEFT JOIN character_state_fields + values；按 sort_order ASC |
| `renderWorldState(worldId)` → string | `[世界状态]` | LEFT JOIN world_state_fields + values；按 sort_order ASC |
| `renderTimeline(sessionId, limit=5)` → string | `[会话摘要]` | 取当前会话最近 limit 轮 turn_records 摘要；**不再注入 prompt（[11] 已删），仅供前端 sessionTimeline API 调用** |
| `searchRecalledSummaries(worldId, sessionId)` → Promise<{recalled, recentMessagesText}> | — | 向量搜索；recalled 数组含 `{ref, turn_record_id, session_id, session_title, round_index, created_at, content, score, is_same_session}` |
| `renderRecalledSummaries(recalled)` → string | `[历史记忆召回]` | 格式：`#ref（turn_record_id）【date · title · 第N轮】content` |

**组装位置**：[3] 世界状态、[5] 玩家状态、[7] 角色状态各自独立注入；[12] 召回摘要；[13] 展开原文（见 §4）。

**向量搜索行为（T49 新，T135 改）**：
- 查询向量 = 最后一条 user 消息 + 最后一条 assistant 消息拼接嵌入
- topK = `MEMORY_RECALL_MAX_SESSIONS`（3）
- **双阈值**：同 session（`is_same_session = true`）使用 `MEMORY_RECALL_SAME_SESSION_THRESHOLD`（0.72）；跨 session 使用 `MEMORY_RECALL_SIMILARITY_THRESHOLD`（0.84）
- **上下文排除（T135）**：命中的 turn_record_id 若在当前 session 最近 `context_history_rounds` 轮内，直接跳过（避免与 [14] 三重注入导致输出锚定）
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

| 状态套 | 字段定义表 | 全局默认值表 | 会话运行时值表 | 粒度 |
|---|---|---|---|---|
| 世界状态 | `world_state_fields` | `world_state_values`（`default_value_json`） | `session_world_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |
| 角色状态 | `character_state_fields` | `character_state_values`（`default_value_json`） | `session_character_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |
| 玩家状态 | `persona_state_fields` | `persona_state_values`（`default_value_json`） | `session_persona_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |

**会话级隔离**（T103）：状态运行时值现在存储在 `session_*_state_values` 三张表，由 `session_id ON DELETE CASCADE` 控制生命周期，各会话彼此完全独立。

**值优先级**：读取时通过 COALESCE 逐级回退：`session_*_state_values.runtime_value_json` → `*_state_values.default_value_json` → `*_state_fields.default_value`。

**combined-state-updater.js**：`updateAllStates` 现在写 `session_*_state_values` 表而非全局 `*_state_values.runtime_value_json`。

**字段类型**：`text / number / boolean / enum / list`
- `list`：值存储为 JSON 数组字符串，渲染时解析为顿号分隔的字符串

**update_mode**：
- `manual`：不参与自动更新
- `llm_auto`：参与异步更新（由 `combined-state-updater.js` 统一驱动）
- `system_rule`：保留给系统规则型字段；前端可配置，是否自动写入取决于具体业务实现

**trigger_mode**（仅 `llm_auto` 字段有效）：
- `manual_only`：跳过自动触发
- `every_turn`：每轮对话后更新
- `keyword_based`：关键词命中时更新

**初始化时机**：
- 创建世界时：`services/worlds.createWorld` 自动 upsert persona 行，并按字段模板写入默认值层（`default_value_json`）到 `*_state_values` 全局表
- 创建角色时：按世界的 character_state_fields 模板初始化角色默认值层（`default_value_json`）到 `character_state_values` 全局表
- 运行时状态写入统一由 `combined-state-updater.js` 负责，写入 `session_*_state_values` 会话级表；编辑页只改全局默认值层
- 记忆面板”重置”会清空该会话 `session_*_state_values` 对应记录，显示层自动回退到全局默认值
- 消息回滚（删除消息）时，清空该会话三张 session 状态表并删除超出轮次的 turn_records

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

## §9.1 模板变量（T51）

类 SillyTavern 的内置占位符，在提示词组装时（assembler.js）自动替换，不修改数据库原始文本。

| 占位符 | 替换值 | 作用域说明 |
|---|---|---|
| `{{user}}` | `persona.name` | 世界级（每个世界对应一个 persona） |
| `{{char}}` | `character.name` | 角色级 |
| `{{world}}` | `world.name` | 全局 |

**大小写不敏感**：`{{User}}`、`{{CHAR}}` 等均有效。

**应用范围**：[1]–[13] 所有 systemParts 注入点 + [15] 后置提示词。**不替换** [14] 历史消息和 [16] 当前用户消息（对话内容非配置模板）。

**写作模式多角色**：共享段（[1]-[5][15] 及全局/世界 entries）以首个激活角色名作为 `{{char}}` fallback；[6-7] 与角色级 entries 各自使用所属角色名。

**实现**：`backend/utils/template-vars.js` → `applyTemplateVars(text, ctx)`；assembler.js 内以闭包 `const tv = t => applyTemplateVars(t, ctx)` 调用。

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
| `sessions.world_id` | 通常为 `NULL`，世界通过 character 反查 | 非空 |
| `sessions.mode` | `'chat'` | `'writing'` |
| 激活角色 | 无 | `writing_session_characters` 联结表（支持动态增删） |

**提示词**：调用 `buildWritingPrompt(sessionId)` 而非 `buildPrompt()`；差异见 §4。

**服务层**：`services/writing-sessions.js`。

**全局配置继承（T86）**：写作空间使用 `config.writing.*` 命名空间；`writing.llm.model = ''` 时继承 chat model，`writing.context_history_rounds = null` 时继承 chat 值。

**资源与模式绑定**：`global_prompt_entries`、`regex_rules`（`world_id IS NULL`）、`custom_css_snippets` 各带 `mode TEXT NOT NULL DEFAULT 'chat'` 列，严格二分（`'chat'` 或 `'writing'`），互不干扰。

**appMode 状态**：`store/appMode.js`（独立 Zustand store），写作空间页面挂载时设置为 `'writing'`，其他页面设置为 `'chat'`；`refreshCustomCss(mode)` 按当前 appMode 加载对应 CSS 片段注入 `<style id="we-custom-css">`。

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

**独立 store**（不受锁定）：`store/appMode.js` — `appMode: 'chat' | 'writing'`，Actions：`setAppMode`

**API 层**（`/frontend/src/api/`）：每资源一个文件，组件内禁止直接 fetch。

| 文件 | 资源 |
|---|---|
| characters.js / characterStateFields.js / characterStateValues.js | 角色及状态 |
| worlds.js / worldStateFields.js / worldStateValues.js | 世界及状态 |
| sessions.js / chat.js | 会话与对话 |
| sessionTimeline.js | 会话时间线（当前会话近5轮 turn_records 摘要） |
| sessionStateValues.js | 会话级状态值（读写 session_*_state_values） |
| personas.js / personaStateFields.js / personaStateValues.js | 玩家 |
| prompt-entries.js | Prompt 条目 |
| regexRules.js / customCssSnippets.js | 正则与 CSS |
| importExport.js / config.js | 导入导出与配置 |
| writingSessions.js | 写作空间 |

**工具函数**：
- `utils/avatar.js`：`getAvatarColor(id)` 基于 id hash 生成头像颜色；`avatar_path` 为 NULL 时显示纯色圆形 + 名字首字
- `utils/regex-runner.js`：前端侧执行 `display_only` / `user_input` scope 的正则规则

**前端代码落点规则**：
- 页面级数据加载、轮询、SSE 回调编排放 `pages/`
- 纯展示组件和局部交互放 `components/`
- 所有 HTTP 请求先进入 `api/` 封装，再由页面或组件调用
- 跨页面共享状态才进入 `store/`；一次性页面状态不要提升到全局
- 与视觉 token、全局 CSS 变量相关的改动优先落在 `styles/`

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
MEMORY_RECALL_CONTEXT_WINDOW = 10
MEMORY_RECALL_MAX_TOKENS = 2048
MEMORY_RECALL_SIMILARITY_THRESHOLD = 0.84       # 跨 session 阈值（严格）
MEMORY_RECALL_SAME_SESSION_THRESHOLD = 0.72     # 同 session 阈值

# 记忆展开（T28）
MEMORY_EXPAND_MAX_TOKENS = 4096
MEMORY_EXPAND_DECISION_MAX_TOKENS = 200
MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS = 30

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
| `/api` | routes/sessions.js | `/characters/:id/sessions`、`/worlds/:id/latest-chat-session`、`/sessions/:id`、`/sessions/:id/title` |
| `/api/sessions` | routes/chat.js | `/:id/chat` `/:id/stop` `/:id/regenerate` `/:id/continue` `/:id/impersonate` `/:id/edit-assistant` `DELETE /:id/messages` |
| `/api` | routes/prompt-entries.js | 全局/世界/角色 prompt 条目 CRUD |
| `/api` | routes/state-fields.js | 世界/角色/玩家状态字段定义（统一路由） |
| `/api` | routes/world-state-values.js | 世界状态值（全局默认值层） |
| `/api` | routes/character-state-values.js | 角色状态值（全局默认值层） |
| `/api/sessions` | routes/session-timeline.js | `GET /:sessionId/timeline` 当前会话近5轮 turn_records 摘要 |
| `/api/sessions` | routes/session-state-values.js | `GET /:sessionId/state-values`（world/persona/character）；`DELETE /:sessionId/world-state-values` 等重置接口；`GET /:sessionId/characters/:characterId/state-values` |
| `/api` | routes/import-export.js | 角色卡/世界卡导入导出 |
| `/api` | routes/custom-css-snippets.js | 自定义 CSS 片段 CRUD |
| `/api` | routes/regex-rules.js | 正则规则 CRUD |
| `/api` | routes/personas.js | 玩家（persona）读写 |
| `/api` | routes/persona-state-fields.js | 玩家状态字段定义 |
| `/api` | routes/persona-state-values.js | 玩家状态值 |
| `/api/worlds` | routes/writing.js | `/:worldId/writing-sessions`、`/:worldId/writing-sessions/:sessionId/generate|continue|regenerate|impersonate|edit-assistant` |
| `/api/assistant` | `assistant/server/routes.js` | `POST /chat`（SSE：routing/proposal/thinking/delta/done/error）、`POST /execute` |

**中间件顺序**：CORS（仅 localhost/127.0.0.1 origin）→ JSON 解析（limit: 20MB）→ HTTP 请求日志（info 级，仅 `/api/`，跳过 `/api/uploads/`）→ `/api` 本机访问限制（`localOnly`）→ 受保护的 `/api/uploads/*path` 文件访问 → 路由。

写卡助手采用**单代理 + Agent Skill 架构**：主代理通过工具调用循环决定调用哪些 skill，skill 执行时向前端推送 SSE 提案。辅助工具 `preview_card`（查询实体数据）和 `read_file` 对主代理和 skill LLM 均可用。proposal schema、SSE 事件白名单、operation 约束见 `assistant/CONTRACT.md`。

**后端代码落点规则**：
- `routes/` 层只做参数解析、状态码和调用 service，不直接访问数据库
- `services/` 层负责业务编排；跨 query、跨模块、副作用清理、导入导出都应落在这里
- `db/queries/` 层只返回数据访问结果，不承担上层业务语义
- 记忆召回、状态更新、摘要生成等逻辑优先进入 `memory/`
- prompt 段位、命中策略、模板变量等逻辑优先进入 `prompt/`
- 新增磁盘文件或向量资源时，删除清理逻辑统一挂到 `cleanup-registrations.js`

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
| `data/logs/worldengine-YYYY-MM-DD.log` | 运行时日志，按日轮换 | T99/T101；默认 metadata-only，覆盖 HTTP/LLM/chat/writing/assistant/config/memory 高价值链路 |
