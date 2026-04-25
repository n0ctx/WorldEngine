# WorldEngine — 架构参考

> 目标读者：AI 助手。覆盖式更新，不追加历史。最后更新：2026-04-22
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
- 修改助手协议、SSE 事件、写作流程、状态系统行为时，必须同步本文件相关章节

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
    writing.js                       写作路由（挂在 /api/worlds）
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

/assistant/
  CONTRACT.md                        写卡助手接口契约（proposal schema / SSE 事件 / operation 约束）
  /server/routes.js                  助手路由，挂载在 /api/assistant（单代理 + Agent Skill 架构）
  /server/agents/                    主代理 + 各 Agent Skill 实现
  /server/tools/                     辅助工具（preview_card / read_file 等）
  /client/                           前端助手面板（AssistantPanel / ChangeProposalCard / InputBox / MessageList / api.js / useAssistantStore.js）

/frontend/src/
  App.jsx                            路由入口；页面组件 route-level lazy loading；写卡助手首次打开后懒加载
  /store/index.js                    Zustand（锁定文件，见 §12）
  /api/                              每资源一个文件，组件内禁止直接 fetch（见 §12）
  /components/
    index.js                         可复用组件统一出口；新增组件需在此注册
    /ui/                             Button / Input / Textarea / Select / Card / Badge / ToggleSwitch / Icon / ModalShell / MarkdownEditor（懒加载包装层）/ MarkdownEditorInner（Tiptap 实现）/ ModelCombobox / FieldLabel / FormGroup / EditPageShell / ConfirmModal / AvatarUpload / AvatarCircle
    /blocks/                         WorldTabNav / BackButton / world-tabs.js（世界标签页辅助，提取自 WorldBuildPage / WorldStatePage）
    /book/                           书卷风 UI：BookSpread / TopBar / PageLeft / PageRight / SectionTabs / StatePanel / StatusSection / CastPanel / SessionListPanel / ChapterDivider / WritingPageLeft / WritingSessionList / SealStampAnimation / CharacterSeal / ParchmentTexture / FleuronLine / MarginaliaList / Bookmark / PageFooter / PageTransition
    /chat/                           InputBox / MessageItem / MessageList / OptionCard / SessionItem / Sidebar
    /characters/                     角色列表、编辑相关组件
    /worlds/                         世界相关组件
    /prompt/                         EntryEditor / EntryList
    /settings/                       CustomCssManager / RegexRulesManager / RegexRuleEditor
    /state/                          StateFieldEditor / StateFieldList / StateValueField / EntrySection / EntryEditor / TriggerEditor / PersonaCard
    /writing/                        ActiveCharactersPicker / MultiCharacterMemoryPanel / WritingMessageItem / WritingMessageList / WritingSidebar
  /pages/
    WorldsPage.jsx                   世界列表
    WorldCreatePage.jsx / WorldEditPage.jsx
    CharacterCreatePage.jsx / CharacterEditPage.jsx
    ChatPage.jsx                     对话主页
    PersonaEditPage.jsx              玩家编辑
    SettingsPage.jsx
    WritingSpacePage.jsx             写作主页
    WorldStatePage.jsx               世界状态页（State 条目管理）
  /styles/
    tokens.css                       所有 --we-* CSS 变量定义（颜色、字体、间距、阴影、圆角等）；是前端样式的唯一变量来源
    chat.css                         对话全局样式（消息气泡、滚动区等）
    pages.css                        页面级通用样式
    ui.css                           通用 UI 组件样式
    fonts.css                        字体引入
  /utils/
    avatar.js                        getAvatarColor(id)：头像 fallback（纯色圆形+名字首字）；getAvatarUrl(path)
    regex-runner.js                  前端侧正则（display_only / user_input scope）
    time.js                          relativeTime()

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
  │         ├─ 组装 [1]–[14] 段（见 §4）
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

14 段顺序（[11] 世界时间线已移除后重排），[1]–[12] 合并为单条 `role:system`，[13] 为多条 `role:user/assistant`，[14] 为尾部 `role:user`：

| 段 | 来源 | 跳过条件 |
|---|---|---|
| [1] | `config.global_system_prompt` | 空字符串跳过 |
| [2] | `renderWorldState(world.id)` | 无字段/值时跳过 |
| [3] | persona，格式：`[{{user}}人设]\n名字：${name}\n${system_prompt}` | name 和 system_prompt 均空时整段跳过 |
| [4] | `renderPersonaState(world.id)` | 空跳过 |
| [5] | `[\{\{char\}\}人设]\n${character.system_prompt}` | 空跳过 |
| [6] | `renderCharacterState(character.id)` | 空跳过 |
| [7] | 世界 State 条目（仅 `world_prompt_entries`；`matchEntries(sessionId, worldEntries, worldId)` 支持四类分支：always 直接命中；keyword 关键词匹配；llm AI 预判+关键词兜底；state 加载 entry_conditions、读取当前 session 状态、AND 逻辑全部满足才命中；所有命中条目统一注入此处，`position` 字段已废弃不再消费） | 无条目时跳过 |
| [8] | 召回摘要：`searchRecalledSummaries` → `renderRecalledSummaries`；**已排除上下文窗口内最近 `context_history_rounds` 轮** | 无命中时跳过 |
| [9] | 展开原文：`decideExpansion` → `renderExpandedTurnRecords` | 无展开时跳过 |
| [10] | **日记注入（T155）**：`[日记注入]\n{content}`；来源为前端请求体 `diaryInjection` 字段；仅生效一次（前端发送后清空） | `diaryInjection` 为空时跳过 |
| [11] | 后置提示词（`global_post_prompt` → `character.post_prompt`），**注入 system 末尾** | 均空跳过 |
| [13] | 历史消息：稳定使用原始 `messages` 窗口；仅移除 [14] 当前 user，并按最近 `context_history_rounds` 个已完成 user 轮次截窗；每条 content 经 `applyRules(content, 'prompt_only', worldId)` 处理 | — |
| [14] | 当前用户消息：DB 中最新的 `role:user` 消息（刚存入的那条），经 `applyRules` 处理；`suggestion_enabled=true` 时在末尾追加 `SUGGESTION_PROMPT`（选项指令紧贴生成前最后位置，提升模型遵从率） | — |

**生成参数**：`world.temperature ?? config.llm.temperature`，`world.max_tokens ?? config.llm.max_tokens`

### buildWritingPrompt(sessionId, options?) → { messages, temperature, maxTokens }

与 `buildPrompt` 的差异：

| 段 | 差异 |
|---|---|
| [5] | 无单一角色；从 `writing_session_characters` 获取激活角色列表；每个角色格式：`[{{char}}人设]\n${system_prompt}`，并用该角色名字替换 `{{char}}` |
| [6] | 循环所有激活角色调用 `renderCharacterState`，并以各自角色名替换 `{{char}}` |
| [7] | 仅注入世界 State 条目；写作模式不再消费全局/角色 Prompt 条目 |
| [8-9] | 同 buildPrompt；[9] 受 `writing.memory_expansion_enabled` 控制 |
| [13] | 同 buildPrompt，稳定使用原始 `messages` 窗口 |
| [11] | 无角色后置提示词（只有 `writing.global_post_prompt`）；同 buildPrompt，**注入 system 末尾** |
| [14] | `writing.suggestion_enabled=true` 时同 buildPrompt，在末尾追加 `SUGGESTION_PROMPT` |
| 返回值 | 含 `recallHitCount` |

---

## §5 对话后异步任务链

**触发条件**：流正常完成（非 aborted）且该 session 存在 user 消息。

**优先级**（数字越小越高，2/3 不可丢弃；4 可在 regenerate 时清除；1 预留未用；5 已废弃不再入队）：

| 优先级 | 任务 | 触发条件 |
|---|---|---|
| 2 | `generateTitle(sessionId)` | `session.title` 为 NULL 时 |
| 2 | `updateAllStates(worldId, characterIds, sessionId)` | 每次（角色/世界/玩家状态合并一次调用）；真实日期模式下额外直接写入 `diary_time=N年N月N日N时`（上海时区） |
| 3 | `createTurnRecord(sessionId)` | 每次（在 updateAllStates 之后入队，捕获本轮结果状态） |
| 4 | `checkAndGenerateDiary(sessionId, roundIndex)` | 非 isUpdate（createTurnRecord 后入队）；`session.diary_date_mode` 为 NULL 时自动跳过 |

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

原文展开（[10]）时，通过 `user_message_id`/`asst_message_id` 查 `messages` 表取实时内容；
旧记录（ID 为 NULL）回退到 `user_context`/`asst_context` 字段（兼容存量数据）。

写作模式差异：
- world 从 `session.world_id` 直接取（无 character_id）
- `{{char}}` 仅作为最后一条旁白/角色输出前缀占位符，不额外拼接状态快照

**SSE 连接关闭时机**（由 `backend/utils/post-gen-runner.js` 的 `runPostGenTasks` 统一协调）：
- 每个任务以 TaskSpec 描述，声明 `keepSseAlive`（是否保活连接）和 `sseEvent`（完成后推送的事件）
- `keepSseAlive=true` 的任务 Promise 收集后统一 `Promise.allSettled(...).finally(() => res.end())`
- 无 keepSseAlive 任务时直接 `res.end()`

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

**continue**：续写前必须先找到当前 session 的最后一条 assistant，并确认它之前至少已有一条 user；只有在存在完整 user→assistant 轮次时才允许继续。通过校验后不再手工 pop/push 历史轮次；保留 assembler 已组装好的 system/history/post prompt，统一改写为 `assistant(originalContent)` 后再补一条 user 指令（模板文件：`backend/prompts/templates/continue-user-instruction.md`），避免模型把尾 assistant 误判为已完成回复。完成后入队 `updateAllStates` → `createTurnRecord(sessionId, { isUpdate: true })` → `checkAndGenerateDiary`，UPSERT 覆盖最后一轮 turn record（不新增轮次）；状态和日记后台任务完成时分别推送 `state_updated` / `diary_updated`，连接保持到对应 Promise settle 后再关闭。前端对 `continue` 的再次触发必须等到 SSE `onStreamEnd`，不能在 `done` 事件时提前解锁，否则旧续写请求的收尾会和下一次续写共享同一组局部状态，导致互相覆盖。

**checkAndGenerateDiary 内部流程**（Priority 4，每轮正常完成后执行）：

```
checkAndGenerateDiary(sessionId, roundIndex)
  ├─ roundIndex ≤ 1 → 跳过（首轮不做判断）
  ├─ 取 session.diary_date_mode → NULL 时退出
  ├─ 取全部 turn_records 快照，比较本轮与上轮日期
  │    virtual：解析 state_snapshot.world.diary_time → /^(\d+)年(\d+)月(\d+)日(\d+)时/（严格要求含时）
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
| `renderPersonaState(worldId)` → string | `[玩家状态]` | LEFT JOIN persona_state_fields + values；按 sort_order ASC |
| `renderCharacterState(characterId)` → string | `[角色状态]` | LEFT JOIN character_state_fields + values；按 sort_order ASC |
| `renderWorldState(worldId)` → string | `[世界状态]` | LEFT JOIN world_state_fields + values；按 sort_order ASC |
| `renderTimeline(sessionId, limit=5)` → string | `[会话摘要]` | 取当前会话最近 limit 轮 turn_records 摘要；**不再注入 prompt（[11] 已删）；T155 后前端 Timeline 面板改用 daily_entries，此函数已无调用方，保留供兼容** |
| `searchRecalledSummaries(worldId, sessionId)` → Promise<{recalled, recentMessagesText}> | — | 向量搜索；recalled 数组含 `{ref, turn_record_id, session_id, session_title, round_index, created_at, content, score, is_same_session}` |
| `renderRecalledSummaries(recalled)` → string | `[历史记忆召回]` | 格式：`#ref（turn_record_id）【date · title · 第N轮】content` |

**组装位置**：[2] 世界状态、[4] 玩家状态、[6] 角色状态各自独立注入；[9] 召回摘要；[10] 展开原文（见 §4）。

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
| `done` | 流式正常完成 | `{ done: true, assistant: {…}, options: [], usage?: { prompt_tokens, completion_tokens, cache_read_tokens?, cache_creation_tokens? } }` |
| `aborted` | 用户主动中断 | `{ aborted: true }` |
| `error` | LLM 调用异常 | `{ type: "error", error: "..." }` |
| `title_updated` | 会话标题异步生成完成（chat + writing） | `{ type: "title_updated", title: "..." }` |
| `chapter_title_updated` | 章节标题 LLM 生成完成（writing 专有） | `{ type: "chapter_title_updated", chapterIndex: 1, title: "初入茫茫" }` |
| `state_updated` | writing 模式后台状态刷新完成 | `{ type: "state_updated" }` |
| `diary_updated` | writing 模式后台日记刷新完成 | `{ type: "diary_updated" }` |
| `memory_recall_start` | 进入 buildContext 前 | `{ type: "memory_recall_start" }` |
| `memory_recall_done` | buildContext 返回后 | `{ type: "memory_recall_done", hit: 2 }` |
| `memory_expand_start` | 展开决策前 | `{ type: "memory_expand_start", candidates: [{ref:1,title:"..."}] }` |
| `memory_expand_done` | 展开完成 | `{ type: "memory_expand_done", expanded: ["session_id_1"] }` |

**注**：
- `memory_recall_*` 和 `memory_expand_*` 仅 `/chat` 路径发出；`/continue`（续写）路径不含
- `state_updated` / `diary_updated` 仅 writing 路径发出；chat 模式对应后台任务不保活 SSE

---

## §8 状态系统

三套状态模板，均挂在世界下配置：

| 状态套 | 字段定义表 | 全局默认值表 | 会话运行时值表 | 粒度 |
|---|---|---|---|---|
| 世界状态 | `world_state_fields` | `world_state_values`（`default_value_json`） | `session_world_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |
| 角色状态 | `character_state_fields` | `character_state_values`（`default_value_json`） | `session_character_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |
| 玩家状态 | `persona_state_fields` | `persona_state_values`（`default_value_json`） | `session_persona_state_values`（`runtime_value_json`） | 字段定义全局共享；运行时值按会话独立 |

**会话级隔离**（T103）：状态运行时值现在存储在 `session_*_state_values` 三张表，由 `session_id ON DELETE CASCADE` 控制生命周期，各会话彼此完全独立。

**state 条目字段语义**：TriggerEditor（现为 EntryEditor state 模式）的条件选项按 `世界.xxx` / `玩家.xxx` / `角色.xxx` 三类生成；`character_state_fields` 不按具体角色名展开。chat 会话中的 `角色.xxx` 映射当前角色；writing 会话中若条件包含 `角色.xxx`，`entry-matcher.js` state 分支（`buildSharedStateMap` + `buildCharacterStateMap`）会对当前会话激活角色逐个评估，同一角色需满足该条目的全部 entry_conditions，只要任一角色满足即触发（OR over characters，AND within conditions）。

**state 条目评估时机**：提示词组装时（[7] 段），`matchEntries()` state 分支实时读取 `entry_conditions` 表和当前 session 状态值，同步评估后决定该条目是否命中；评估结果不持久化到数据库。条件为空的 state 条目不触发。

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

**应用范围**：[1]–[12] 所有 systemParts 注入点。**不替换** [13] 历史消息和 [14] 当前用户消息（对话内容非配置模板）。

**写作模式多角色**：共享段（[1]-[4][7][8][9][10][11][12]）以首个激活角色名作为 `{{char}}` fallback；[5-6] 各自使用所属角色名。

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

## §11 写作（writing mode）

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

**全局配置继承（T86）**：写作使用 `config.writing.*` 命名空间；`writing.llm.model = ''` 时继承 chat model，`writing.context_history_rounds = null` 时继承 chat 值。

**资源与模式绑定**：`regex_rules`（`world_id IS NULL`）、`custom_css_snippets` 各带 `mode TEXT NOT NULL DEFAULT 'chat'` 列，严格二分（`'chat'` 或 `'writing'`），互不干扰。

**appMode 状态**：`store/appMode.js`（独立 Zustand store），写作页面挂载时设置为 `'writing'`，其他页面设置为 `'chat'`；`refreshCustomCss(mode)` 按当前 appMode 加载对应 CSS 片段注入 `<style id="we-custom-css">`。

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
| entry-conditions.js | state 类型条目的 entry_conditions CRUD |
| sessionTimeline.js | 会话时间线（当前会话近5轮 turn_records 摘要） |
| sessionStateValues.js | 会话级状态值（读写 session_*_state_values） |
| personas.js / personaStateFields.js / personaStateValues.js | 玩家 |
| prompt-entries.js | 世界 State 条目 CRUD + 排序 |
| regexRules.js / customCssSnippets.js | 正则与 CSS |
| importExport.js / config.js | 导入导出与配置 |
| writingSessions.js | 写作 |

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
| `/api` | routes/custom-css-snippets.js | 自定义 CSS 片段 CRUD + 排序 |
| `/api` | routes/regex-rules.js | 正则规则 CRUD + 排序 |
| `/api` | routes/personas.js | 玩家（persona）读写、头像上传 |
| `/api` | routes/persona-state-fields.js | 玩家状态字段 CRUD + 排序 |
| `/api` | routes/persona-state-values.js | 玩家状态值（全局默认层）读写 + 重置 |
| `/api/worlds` | routes/writing.js | 写作会话 CRUD、激活角色管理、流式生成、章节标题管理 |
| `/api/assistant` | assistant/server/routes.js | 写卡助手对话（SSE）、提案执行 |

**中间件顺序**：CORS（仅 localhost/127.0.0.1 origin）→ JSON 解析（limit: 20MB）→ HTTP 请求日志（info 级，仅 `/api/`，跳过 `/api/uploads/`）→ `/api` 本机访问限制（`localOnly`）→ 受保护的 `/api/uploads/*path` 文件访问 → 路由。

写卡助手采用**单代理 + Agent Skill 架构**：主代理通过工具调用循环决定调用哪些 skill，skill 执行时向前端推送 SSE 提案。辅助工具 `preview_card`（查询实体数据）和 `read_file` 对主代理和 skill LLM 均可用。proposal schema、SSE 事件白名单、operation 约束见 `assistant/CONTRACT.md`。

---

## §14.1 完整端点列表

### 配置（/api/config）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/config | 返回当前配置（去除 API Key，保留 has_key 布尔值） |
| PUT | /api/config | 部分更新配置（禁止更新 api_key/provider_keys） |
| PUT | /api/config/apikey | 写入当前 LLM provider 的 API Key |
| PUT | /api/config/embedding-apikey | 写入当前 Embedding provider 的 API Key |
| GET | /api/config/models | 拉取 LLM 模型列表（含 thinkingOptions） |
| GET | /api/config/embedding-models | 拉取 Embedding 模型列表 |
| GET | /api/config/test-connection | 验证 LLM 连通性 |
| GET | /api/config/test-embedding | 验证 Embedding 连通性 |

### 世界（/api/worlds）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/worlds | 获取所有世界 |
| POST | /api/worlds | 创建世界（name 必填） |
| GET | /api/worlds/:id | 获取单个世界 |
| PUT | /api/worlds/:id | 更新世界 |
| DELETE | /api/worlds/:id | 删除世界（触发 cleanup 钩子） |
| POST | /api/worlds/clear-all-diaries | 清除所有会话日记数据（关闭日记功能时调用） |
| POST | /api/worlds/:id/sync-diary | 根据当前日记配置同步 diary_time 字段 |

### 角色（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/worlds/:worldId/characters | 获取某世界下所有角色 |
| POST | /api/worlds/:worldId/characters | 创建角色（name 必填） |
| PUT | /api/characters/reorder | 批量更新角色排序（body: `items: [{id, sort_order}]`） |
| GET | /api/characters/:id | 获取单个角色 |
| PUT | /api/characters/:id | 更新角色 |
| DELETE | /api/characters/:id | 删除角色（触发 cleanup 钩子） |
| POST | /api/characters/:id/avatar | 上传角色头像（multipart/form-data, 字段 `avatar`） |

### 会话与消息（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/characters/:characterId/sessions | 获取角色下会话列表（query: limit/offset，默认 20/0） |
| POST | /api/characters/:characterId/sessions | 创建会话（自动插入 first_message） |
| GET | /api/worlds/:worldId/latest-chat-session | 获取世界最近活跃 chat 会话 |
| GET | /api/sessions/:id | 获取单个会话 |
| DELETE | /api/sessions/:id | 删除会话（触发 cleanup 钩子） |
| PUT | /api/sessions/:id/title | 修改会话标题（body: `title`，可传 null 清空） |
| GET | /api/sessions/:id/messages | 获取会话消息（query: limit/offset，默认 50/0） |
| POST | /api/sessions/:id/messages | 创建消息（body: role/content/attachments） |
| PUT | /api/messages/:id | 编辑消息并删除之后所有消息，回滚状态至最近快照 |
| DELETE | /api/sessions/:sessionId/messages/:messageId | 删除单条消息及之后所有内容，回滚状态 |

### 对话（/api/sessions，SSE 路由）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/sessions/:sessionId/chat | 流式对话（SSE；body: content/attachments/diaryInjection） |
| POST | /api/sessions/:sessionId/stop | 终止当前流式生成 |
| POST | /api/sessions/:sessionId/regenerate | 重新生成最后一条 AI 回复（SSE；body: afterMessageId） |
| POST | /api/sessions/:sessionId/continue | 续写最后一条 AI 回复（SSE） |
| POST | /api/sessions/:sessionId/impersonate | 模拟用户发言（非流式；返回 `{content}`) |
| DELETE | /api/sessions/:sessionId/messages | 清空会话消息（保留角色 first_message） |
| POST | /api/sessions/:sessionId/edit-assistant | 编辑 AI 消息（body: messageId/content；若为最后一条则重跑状态更新） |
| POST | /api/sessions/:sessionId/retitle | 用最近上下文重新生成会话标题（非流式；返回 `{title}`） |

### Prompt 条目（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/worlds/:worldId/entries | 列出世界条目 |
| POST | /api/worlds/:worldId/entries | 创建世界条目 |
| PUT | /api/world-entries/reorder | 批量排序（body: orderedIds + worldId） |
| GET | /api/world-entries/:id | 获取单条 |
| PUT | /api/world-entries/:id | 更新 |
| DELETE | /api/world-entries/:id | 删除 |

### 状态条目条件（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/world-entries/:entryId/conditions | 获取某条目的全部 entry_conditions |
| POST | /api/world-entries/:entryId/conditions | 创建 entry_condition（body: target_field/operator/value） |
| PUT | /api/entry-conditions/:id | 更新 entry_condition |
| DELETE | /api/entry-conditions/:id | 删除 entry_condition |

### 状态字段（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/worlds/:worldId/world-state-fields | 列出世界状态字段 |
| POST | /api/worlds/:worldId/world-state-fields | 创建世界状态字段（field_key/label/type 必填） |
| PUT | /api/worlds/:worldId/world-state-fields/reorder | 排序（body: orderedIds） |
| PUT | /api/world-state-fields/:id | 更新世界状态字段 |
| DELETE | /api/world-state-fields/:id | 删除 |
| GET | /api/worlds/:worldId/character-state-fields | 列出角色状态字段 |
| POST | /api/worlds/:worldId/character-state-fields | 创建角色状态字段 |
| PUT | /api/worlds/:worldId/character-state-fields/reorder | 排序 |
| PUT | /api/character-state-fields/:id | 更新 |
| DELETE | /api/character-state-fields/:id | 删除 |

### 状态值（全局默认层）（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/worlds/:worldId/state-values | 世界状态值列表（COALESCE 合并 default_value） |
| PATCH | /api/worlds/:worldId/state-values/:fieldKey | 更新世界状态某字段默认值（body: value_json） |
| POST | /api/worlds/:worldId/state-values/reset | 重置世界状态值 |
| GET | /api/characters/:characterId/state-values | 角色状态值列表 |
| PATCH | /api/characters/:characterId/state-values/:fieldKey | 更新角色状态某字段默认值 |
| POST | /api/characters/:characterId/state-values/reset | 重置角色状态值 |

### 会话级状态值（/api/sessions）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/sessions/:sessionId/state-values | 获取会话级所有状态值（`{world:[],persona:[],character:[]}`，写作模式含所有激活角色） |
| DELETE | /api/sessions/:sessionId/world-state-values | 清空该会话世界运行时状态（回退到全局默认） |
| DELETE | /api/sessions/:sessionId/persona-state-values | 清空该会话玩家运行时状态 |
| DELETE | /api/sessions/:sessionId/character-state-values | 清空该会话所有角色运行时状态 |
| GET | /api/sessions/:sessionId/characters/:characterId/state-values | 获取单角色会话状态值 |
| DELETE | /api/sessions/:sessionId/characters/:characterId/state-values | 重置单角色会话状态值 |

### 会话时间线与日记（/api/sessions）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/sessions/:sessionId/timeline | 近 5 轮 turn_records 摘要（`{items: [{round_index, summary, created_at}]}`） |
| GET | /api/sessions/:sessionId/daily-entries | 日记列表（`{items:[{date_str,date_display,summary,...}]}`，按 date_str ASC） |
| GET | /api/sessions/:sessionId/daily-entries/:dateStr | 日记正文（读 data/daily/{sessionId}/{dateStr}.md，返回 `{content}`） |

### 玩家（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/worlds/:worldId/persona | 获取玩家（不存在则自动创建） |
| PATCH | /api/worlds/:worldId/persona | 更新 name/system_prompt |
| POST | /api/worlds/:worldId/persona/avatar | 上传玩家头像（multipart/form-data, 字段 `avatar`） |
| GET | /api/worlds/:worldId/persona-state-fields | 列出玩家状态字段 |
| POST | /api/worlds/:worldId/persona-state-fields | 创建玩家状态字段 |
| PUT | /api/worlds/:worldId/persona-state-fields/reorder | 排序 |
| PUT | /api/persona-state-fields/:id | 更新 |
| DELETE | /api/persona-state-fields/:id | 删除 |
| GET | /api/worlds/:worldId/persona-state-values | 玩家状态值列表 |
| PATCH | /api/worlds/:worldId/persona-state-values/:fieldKey | 更新玩家状态某字段默认值 |
| POST | /api/worlds/:worldId/persona-state-values/reset | 重置玩家状态值 |

### 导入导出（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/characters/:id/export | 导出角色卡（.wechar.json） |
| POST | /api/worlds/:worldId/import-character | 导入角色卡到指定世界 |
| GET | /api/worlds/:worldId/persona/export | 导出玩家为角色卡 |
| GET | /api/worlds/:id/export | 导出世界卡（.weworld.json） |
| POST | /api/worlds/import | 导入世界卡 |
| GET | /api/global-settings/export | 导出全局设置（query: `?mode=chat\|writing`） |
| POST | /api/global-settings/import | 导入全局设置（覆盖模式） |

### 自定义 CSS 与正则（/api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/custom-css-snippets | 列出（query: `?mode=chat\|writing`） |
| POST | /api/custom-css-snippets | 创建（name 必填） |
| PUT | /api/custom-css-snippets/reorder | 排序（body: `items: [{id, sort_order}]`） |
| GET | /api/custom-css-snippets/:id | 详情 |
| PUT | /api/custom-css-snippets/:id | 更新 |
| DELETE | /api/custom-css-snippets/:id | 删除 |
| GET | /api/regex-rules | 列出（query: `?scope=&worldId=&mode=`） |
| POST | /api/regex-rules | 创建（name/pattern/scope 必填；scope 枚举见 §9） |
| PUT | /api/regex-rules/reorder | 排序 |
| GET | /api/regex-rules/:id | 详情 |
| PUT | /api/regex-rules/:id | 更新 |
| DELETE | /api/regex-rules/:id | 删除 |

### 写作（/api/worlds）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/worlds/:worldId/writing-sessions | 获取世界写作会话列表 |
| POST | /api/worlds/:worldId/writing-sessions | 创建写作会话 |
| DELETE | /api/worlds/:worldId/writing-sessions/:sessionId | 删除写作会话 |
| GET | /api/worlds/:worldId/writing-sessions/:sessionId/messages | 获取写作会话消息 |
| DELETE | /api/worlds/:worldId/writing-sessions/:sessionId/messages | 清空写作会话消息 |
| GET | /api/worlds/:worldId/writing-sessions/:sessionId/characters | 获取激活角色列表 |
| PUT | /api/worlds/:worldId/writing-sessions/:sessionId/characters/:characterId | 添加激活角色 |
| DELETE | /api/worlds/:worldId/writing-sessions/:sessionId/characters/:characterId | 移除激活角色 |
| GET | /api/worlds/:worldId/characters | 获取世界所有角色（角色选择器用，与 characters.js 同路径） |
| POST | /api/worlds/:worldId/writing-sessions/:sessionId/generate | 流式生成（SSE；body: content/diaryInjection） |
| POST | /api/worlds/:worldId/writing-sessions/:sessionId/stop | 停止流式生成 |
| POST | /api/worlds/:worldId/writing-sessions/:sessionId/continue | 续写（SSE） |
| POST | /api/worlds/:worldId/writing-sessions/:sessionId/impersonate | 模拟用户发言（非流式；返回 `{content}`） |
| POST | /api/worlds/:worldId/writing-sessions/:sessionId/regenerate | 重新生成（body: afterMessageId） |
| POST | /api/worlds/:worldId/writing-sessions/:sessionId/edit-assistant | 编辑 AI 消息（body: messageId/content） |
| GET | /api/worlds/:worldId/writing-sessions/:sessionId/chapter-titles | 获取章节标题列表 |
| PUT | /api/worlds/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex | 手动编辑章节标题（body: title；存 is_default=0） |
| POST | /api/worlds/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex/retitle | LLM 重新生成章节标题（非流式；返回 `{title, chapterIndex}`） |
| POST | /api/worlds/:worldId/writing-sessions/:sessionId/retitle | 重新生成写作会话标题（非流式；返回 `{title}`） |

### 写卡助手（/api/assistant）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/assistant/chat | SSE 流式对话（单代理 + Agent Skill；body: message/history/context；SSE 事件见 CONTRACT.md） |
| POST | /api/assistant/execute | 应用提案（body: token/worldRefId/editedProposal；token 一次性消费，TTL 30 分钟） |

**world-card assistant 对齐规则**：
- `preview_card(target="world-card")` 返回现有世界条目时，会为 `trigger_type='state'` 的条目附带 `conditions`
- `editedProposal.entryOps[].conditions` 与运行时 `entry_conditions` 表同构：`target_field` 使用 `世界.xxx / 玩家.xxx / 角色.xxx`，`operator` 使用当前评估器支持的符号/中文操作符
- world-card 提案卡内联编辑器按真实条目编辑模型渲染，不再使用旧版简化字段摘要

**其他 assistant 对齐规则**：
- `character-card` / `persona-card` 的 assistant proposal 已支持 `description` 字段，对齐当前编辑页
- `preview_card(target="character-card" | "persona-card")` 会附带世界名、世界简介与现有世界条目，供子代理理解上层世界语境
- `global-config` assistant 不再暴露 `entryOps`；全局关键词条目能力已移除，不再对模型宣称支持

---

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
| `data/daily/{sessionId}/{date_str}.md` | 日记正文文件 | T155；随 session 删除时由 cleanup-registrations.js 钩子清理；DB 记录由 `ON DELETE CASCADE` 自动清理 |
| `data/logs/worldengine-YYYY-MM-DD.log` | 运行时日志，按日轮换 | T99/T101；默认 metadata-only，覆盖 HTTP/LLM/chat/writing/assistant/config/memory 高价值链路 |
