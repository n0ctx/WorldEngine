# Memory V2 第一阶段实施计划：对话历史链路

> 状态：已定稿，待执行（2026-09-28）
> 来源：`~/Downloads/PRD.md`（Memory System V2 PRD）经代码对照评估后的第一阶段。
> 第二阶段（State Memory：实体目录 / Profile / 统一关系 / Threads）另写 PRD，本阶段不碰。
> 本文所有「现状」均来自对 commit `c72135d` 的代码阅读；执行前如发现与代码不符，以代码为准并在本文对应处更正。

---

## 0. 一句话目标

把「固定 N 轮历史 + 每轮摘要向量召回 + 长期记忆文件」替换成：

- **短期**：按 token 预算滑动的最近完整轮次原文；
- **中期**：轮次滑出短期窗口时才滚动合并的剧情摘要（≤1000 token）；
- **长期**：每轮一条轻量索引 → 辅助模型按索引挑轮次 → 注入原文。

并补上「下一轮开始前记忆必须写完」的等待点。向量召回整体删除。

---

## 1. 已拍板的决策（执行时不再讨论）

| # | 决策 | 说明 |
|---|---|---|
| D1 | **彻底删除 embedding / 向量召回** | 包括 embedding 配置、设置页 Embedding 区块、测试连接接口、向量文件存储、`searchRecalledSummaries`、`<recalled_memories>` 摘要注入。不保留兼容或降级路径。 |
| D2 | **长期召回采用「索引预算 + 降级」方案（原评估方案 B）** | 新增配置 `long_term_index_budget`。索引总量超预算时只把最近放得下的索引交给召回模型，更早的轮次这一轮不可召回，日志与 SSE 载荷标明被跳过的范围。不做分级索引。 |
| D3 | **索引生成异步，不挡下一轮生成** | 当前轮的索引一定还在短期窗口内，下一轮不会召回它，所以索引任务不进等待点。 |
| D4 | **召回的两条附加规则** | ① 没有任何轮次滑出短期窗口（没有候选）时，不发召回调用；② 召回调用失败或超时，本轮跳过召回照常生成，只记日志。 |
| D5 | **不加分支模型** | 会话保持线性；重新生成 / 编辑用户消息 / 删除消息继续走「截断 + 按轮次快照恢复」。PRD 中 `branch_id`、`parent_turn_id`、`status/version`、Active Branch 相关内容全部不做。 |
| D6 | **只允许原地编辑最后一条 AI 回复** | 后端拒绝编辑非最后一条；前端只给最后一条 AI 回复显示编辑入口。编辑后按「重做最后一轮」处理（见 §5.6）。 |
| D7 | **中期摘要常开，不设开关** | 取代现有「长期记忆」开关（`long_term_memory_enabled`，默认关）。中期摘要是新架构的必需层。 |
| D8 | **中期摘要存在 `turn_records` 行上** | 每轮记录一份「截至本轮的中期摘要 + 覆盖到第几轮」。当前值 = 最新一行。回滚删行即自动回到旧版本，不再需要单独文件和恢复步骤。 |
| D9 | **短期窗口边界由中期覆盖范围决定** | 主模型历史 = 所有 `round_index > 最新记录.middle_covered_to` 的轮次原文。滑出计算在轮后任务里做，组装 prompt 时不重算。压缩失败时覆盖范围不推进，窗口只是暂时变长，不丢内容。 |
| D10 | **token 计数沿用现有 `backend/utils/token-counter.js` 的 `countTokens`** | 不引入 tokenizer 依赖。所有预算都是估算值（中文 0.5/字，其他 0.25/字符，对多数模型偏低估）。 |
| D11 | **召回用轮次号而不是 UUID 作为索引 ID** | 省 token；返回后映射回 `turn_records.id`。 |
| D12 | **保留的配置键沿用旧名，只改文案** | `memory_expansion_enabled` 改为「长期召回」总开关。不做键名迁移。 |
| D13 | **`context_history_rounds` 删除，改为 `short_term_token_budget`** | 单位不同，无法换算，不做迁移；旧键留在用户配置文件里也无害，代码不再读取。 |
| D14 | **轮后任务里的「提交」与「索引」拆成两个任务** | `turn-record`（p2，无 LLM 或只有中期压缩 LLM，进等待点）负责中期摘要 + 快照 + 建行；`turn-index`（p3，LLM，不进等待点）负责写索引文本。 |

---

## 2. 现状（已探索，执行时无需重复）

### 2.1 数据与轮次

- 消息表 `messages`（`backend/db/schema.js:110`）：原文永不压缩或清理。`is_compressed` 字段存在但从未被置 1；`sessions.compressed_context`、`session_summaries` 表均为死代码——**本阶段不处理**。
- 轮次表 `turn_records`（`schema.js:235`）：`UNIQUE(session_id, round_index)`；`summary TEXT NOT NULL`；后续迁移加了 `user_message_id / asst_message_id / state_snapshot / long_term_memory_snapshot / table_memory_snapshot / scene / cast_json`（`schema.js:520-533`）。
- 「第 N 轮」= 第 N 条用户消息 + 到下一条用户消息之前的最后一条 AI 回复（`backend/memory/turn-summarizer.js:70` `getRoundMessagePair`）。
- 现在 `round_index = countTurnRecords + 1`（`turn-summarizer.js:167`）。摘要为空时不建行（`:129`），会导致后续轮号错位——本阶段一并修正（§5.4）。

### 2.2 主模型 prompt 组装（`backend/prompts/assembler.js`，段渲染在 `segments.js`）

单条 system message = 缓存前缀 [1]~[4] + 动态后缀 [5]~[11]，然后是历史，最后是当前用户消息 + 后置提示词。

- 动态后缀：[5] 世界状态 → [6] 玩家状态 → [7] 角色状态（写作模式为附近角色）→ [8] 触发的世界条目 → [8.5] `<long_term_memory>` → [8.6] `<table_memory>` → [9] `<recalled_memories>` → [10] `<expanded_dialogues>` → [10.5]（写作）`<recalled_characters>` → [11] `<diary>`。
- 历史：`sliceCompletedHistoryByRounds`（`assembler.js:141`），取最近 `context_history_rounds` 轮（chat 默认 `?? 12`；写作读 `writing.context_history_rounds ?? config.context_history_rounds ?? 12`；配置默认值 10）。
- 召回链：`pushRecalledSummaries`（`:217`）→ `searchRecalledSummaries`（`backend/memory/recall.js:219`，embed 最后一问一答 → JSON 向量文件暴力余弦 → 排除窗口内轮次（**这里固定读 chat 的 `context_history_rounds`，写作模式有 bug**）→ 2048 token 软上限）→ 有命中且开关开时 `decideExpansion`（`backend/memory/summary-expander.js:34`，辅助模型挑 `turn_record_id`）→ `renderExpandedTurnRecords`（`:93`，读原文，预算 `MEMORY_EXPAND_MAX_TOKENS=4096`，**第一条超预算就 break，后面全丢**）。
- 写作模式里展开判定和已保存 NPC 召回判定用 `Promise.all` 并发（`assembler.js:482`）。
- SSE：`run-turn-stream.js:64` 发 `memory_recall_start`；assembler 经 `onRecallEvent` 发 `memory_recall_done {hit}`、`memory_expand_start {candidates}`、`memory_expand_done {expanded}`。
- 修改任何段落输出字节都要同步 `backend/tests/prompts/__snapshots__/assembler-golden.snap`。

### 2.3 轮后任务（`backend/app/shared/postgen/build-turn-postgen-tasks.js`）

- 同一会话严格串行、按优先级、同优先级先进先出（`backend/utils/async-queue.js`）。
- 当前顺序：`title`(p2) → `chapter-title`(p2，写作) → `all-state`(p2，`tracksState`) → `table-memory`(p2) → `danmaku`(p2) → `turn-record`(p3) → `diary`(p4，`isUpdate` 时跳过)。
- `turn-record` 现在做：LLM 生成 `{summary, scene, cast, memory[]}` → 取状态快照 → upsert 行 → 追加长期记忆行（超 20 行触发 LLM 压缩）→ 回填 LTM 与表格快照 → 不入队地异步做 embedding。
- **等待点**：下一轮 `runStreamLifecycle`（`backend/app/shared/stream/create-stream-runner.js:29`）只 `awaitPendingStateUpdate`（`backend/utils/state-update-tracker.js`），即只等 `all-state`。表格、轮次记录、长期记忆可能还没写完。
- `tracksState` 在 `backend/utils/post-gen-runner.js:71,90` 有两个作用：登记等待点；失败时发 `state_update_failed`（其他任务发 `postprocess_failed`）。
- `keepSseAlive` 任务全部结束才关 SSE；前端在 `done` 事件就结束生成状态（`frontend/src/core/hooks/sessionStreamCallbacks.js:55`），续写模式在流结束时（`:96`）。
- 任务 label 是对外契约，列在 `hooks/README.md:54`。

### 2.4 回滚（`backend/app/shared/rollback/rollback-session.js`）

重新生成（`app/turn/run-turn-regenerate.js`）、编辑用户消息（`routes/sessions.js:114`）、删除消息（`routes/sessions.js:132`）都走 `rollbackSession(mode, sid, truncate)`：等队列空闲 → 截断消息 → 按剩余消息算保留轮数 → 删多余 `turn_records` → 从最新记录恢复长期记忆文件与表格 → 删日记 → 清 p≥4 待办 → 从最新带快照记录（或会话基线）恢复状态。

### 2.5 两个「原地更新最后一轮」的入口（现有缺陷）

- **编辑 AI 回复** `editAssistant`（`app/shared/http/create-turn-handlers.js:120`）：任意 AI 消息都能改；只有改最后一条时才重跑 `all-state`；总是以 `isUpdate:true` 重跑 `turn-record`。
- **续写** `run-turn-continue.js:145`：用 `isUpdate:true` 重跑整套轮后任务。
- 两者都在「已经包含本轮结果」的状态 / 表格之上再跑一遍增量更新，会重复应用；长期记忆也会重复追加。本阶段用「先回退到上一轮快照再重跑」修正（§5.6）。

### 2.6 其他相关事实

- 辅助模型：`resolveAuxScope(sessionId)`（`backend/utils/aux-scope.js`），写作 `writing-aux → aux → llm` 回退。
- `llm.complete(messages, { cacheableSystem })`：该字段目前只被 gemini 用于显式缓存，其余 provider 忽略（`backend/llm/index.js:127`）；Anthropic 的 system 缓存断点由 adapter 处理。召回调用把固定说明 + 索引放在 system 中，以便自动前缀缓存命中。
- 摘要文本的其他读者：会话时间线 `routes/session-timeline.js:22`（`getRecentTurnSummaries`）；日记生成只用 `turn_records` 的轮号、时间和 `state_snapshot`，不读 `summary`。
- embedding 的所有使用点：`backend/llm/embedding.js`、`memory/turn-summarizer.js`、`memory/recall.js`、`utils/turn-summary-vector-store.js`、`utils/session-summary-vector-store.js`、`utils/json-vector-store.js`、`routes/config.js`（`embedding-models`、`test-embedding`、safe config 的 `has_key`）、`services/config.js`（默认值、`normalizeLlmSection`、`:287` provider 循环）、`services/cleanup-registrations.js:13-14,90-114`、`assistant/server/apply-proposal.js:237` 与 `normalize-proposal.js:84`（`embedding.api_key` 脱敏）、前端 `LlmConfigPanel.jsx`、`useSettingsPrimaryModelConfig.js`、`settingsConfigState.js`、`core/api/config.js:34,42`、`core/constants/settings.js`（`EMBEDDING_PROVIDERS`）。
- 长期记忆的所有使用点：`services/long-term-memory.js`、`routes/long-term-memory.js`、`memory/turn-summarizer.js`、`prompts/segments.js:79`、`rollback-session.js:37`、`cleanup-registrations.js`、`services/config.js`、前端 `LongTermMemoryModal.jsx`、`core/api/long-term-memory.js`、`usePageConfig.js`、`useConversationPageState.js`、`useSettingsPromptConfig.js`、`settingsConfigState.js`、`FeaturesConfigPanel.jsx`、`InputBox.jsx`、`InputBoxToolbar.jsx`、`ChatPage/index.jsx`、`ChatConversationPane.jsx`、`WritingSpaceConversationPane.jsx`、`SettingsPage.jsx`。
- 模板目录 `backend/prompts/templates/`，有 `README.md` 列表需同步。

---

## 3. 目标设计

### 3.1 轮次切分（统一定义）

新增 `backend/utils/session-rounds.js`：

```js
// 第 k 轮 = 第 k 条 user 消息起，到第 k+1 条 user 消息前的全部消息；
// 第 1 条 user 之前的消息（开场白）并入第 1 轮。
export function splitRounds(messages) → [{ roundIndex, messages: [...] }]
export function roundTokens(round) → number   // countTokens 累加 content
```

`turn-summarizer.js` 的 `getRoundMessagePair`、assembler 的历史切片、中期摘要的滑出计算都改用它。轮次的 user / assistant 消息 ID 仍取「该轮第一条 user + 该轮最后一条 assistant」。

### 3.2 `turn_records` 字段变化（`backend/db/schema.js` 迁移段）

- 新增 `middle_summary TEXT`：截至本轮的中期摘要全文，可为空串。
- 新增 `middle_covered_to INTEGER`：中期摘要覆盖到第几轮（0 表示没有）。`NULL` 表示旧数据，读取时按 0 处理。
- `summary`（`NOT NULL`，SQLite 无法放宽）语义改为**轮次索引文本**；空串 `''` 表示索引尚未生成或生成失败。
- 删除 `long_term_memory_snapshot` 列（沿用现有 `ALTER TABLE ... DROP COLUMN` 写法）。
- `scene`、`cast_json` 保留，作为索引的一部分。

### 3.3 短期窗口与中期摘要（新模块 `backend/memory/middle-summary.js`）

在第 N 轮的 `turn-record` 任务中计算（N = 会话中 user 消息数，且最后一条是 assistant）：

1. **基线**：`base = 第 N-1 轮的记录`（N=1 或记录不存在时：`text=''`，`coveredTo=0`；`middle_covered_to IS NULL` 的旧记录同样按 `''`/0）。
2. **窗口**：`rounds = splitRounds(全部消息)` 中 `roundIndex ∈ (coveredTo, N]` 的轮次。
3. **滑出**：从最老开始，当窗口总 token > `short_term_token_budget` 且该轮不是第 N 轮时，把它滑出。第 N 轮永不滑出。
4. **无滑出**：结果 = 基线（`text` 与 `coveredTo` 原样继承）。
5. **有滑出**（轮次 `coveredTo+1 … E`）：调用辅助模型滚动合并：
   - 输入 = 旧摘要 + 被滑出轮次的材料，按时间顺序。
   - 材料：默认用原文。若被滑出的轮数 > `MIDDLE_RAW_ROUNDS_MAX`（20，出现在旧会话首次运行或用户调低预算时），只有最后 20 轮用原文，更早的轮次用其索引行（`summary` 为空的轮次跳过）。
   - 分批：单次输入（旧摘要 + 材料）超过 `MIDDLE_COMPRESS_INPUT_MAX_TOKENS`（12000）就分批，按顺序逐批调用，前一批的输出作为下一批的旧摘要。
   - 输出校验：`countTokens(输出) ≤ MIDDLE_SUMMARY_MAX_TOKENS`（1000）。超出时再做一次「只压缩摘要本身」的调用；仍超出或输出为空视为失败。
   - 成功：结果 = `{ text: 新摘要, coveredTo: E }`。
   - 失败：结果 = 基线（覆盖范围**不推进**），并在建行之后抛出错误，让轮后任务机制发 `postprocess_failed`（前端已有 toast）。下一轮以本轮记录为基线，被滑出的轮次仍在范围内，自然重试。
6. 结果写入第 N 轮记录的 `middle_summary / middle_covered_to`。

**编辑中期摘要**：用户可在界面上直接改最新记录的 `middle_summary`（见 §5.8）。下一轮以它为基线继续合并。如果之后又对该轮做了「重做」（§5.6），这次手改会丢失。这属于已知限制，不处理。

### 3.4 主模型 prompt 变化

- [8.5] `<long_term_memory>` 改为 `<story_summary>`（中期摘要），内容来自最新记录的 `middle_summary`，为空时不注入。建议段首说明：「以下是更早剧情的连续摘要，用于理解前因；细节以下方原文为准。」
- [9] `<recalled_memories>` **删除**，索引不进入主模型。
- [10] `<expanded_dialogues>` 保留，内容为长期召回选中轮次的原文。
- 历史：`sliceHistoryAfterRound(messages, coveredTo, { keepLatestUser })`，取代 `sliceCompletedHistoryByRounds`。`coveredTo` 取最新记录的 `middle_covered_to ?? 0`。`keepLatestUser` 的续写语义不变。
- chat 与写作两条组装路径都改；写作模式的召回与已保存 NPC 判定继续并发。

### 3.5 长期召回（`summary-expander.js` 改名重写为 `backend/memory/long-term-recall.js`）

组装 prompt 时（取代 [9]+[10] 的旧链路）：

1. **开关**：`memory_expansion_enabled`（写作读 `writing.memory_expansion_enabled`）为 `false` 时跳过。
2. **候选**：`round_index ≤ coveredTo` 且 `summary != ''` 的记录。没有候选时直接跳过，不调用模型（D4①）。
3. **预算截取**：候选按轮号从新到旧累加索引行 token，放满 `long_term_index_budget` 为止；再按轮号升序渲染（升序有利于前缀缓存）。记录被跳过的最早范围 `skippedBeforeRound`。
4. **索引行格式**：`#<round>｜<scene>｜<cast 用、连接>｜<summary>`，空字段省略该段。
5. **调用**：
   - 消息结构：system = 固定说明 + 【历史轮次目录】索引行，同时作为 `cacheableSystem` 传入；user = 近期对话（上一条 AI 回复 + 当前用户消息）+ 输出要求。
   - 参数：`temperature: 0`，`configScope: resolveAuxScope(sessionId)`，`callType: 'long_term_recall'`，`timeoutMs: LONG_TERM_RECALL_TIMEOUT_MS`（30000）。
6. **输出**：`{"turns":[12,57]}`。解析时只保留候选里存在的整数，去重，保持顺序。解析失败、调用异常或超时都返回 `[]`（D4②）。
7. **展开**：把轮号映射回记录 ID，按轮号升序读取原文，在 `MEMORY_EXPAND_MAX_TOKENS`（4096）预算内注入。**单条超预算时跳过该条继续尝试后面的**（修正现有「break 丢掉后面全部」）。
8. **短期去重**：候选只来自 `≤ coveredTo`，天然不与短期窗口重叠（满足 PRD AC-14），不需要额外过滤；旧的 `getRecentTurnRecordIds` 过滤删除，写作模式读错配置的 bug 随之消失。
9. **SSE**：保留 `memory_recall_start`（`run-turn-stream.js` 现有）与 `memory_recall_done`，载荷改为 `{ hit, candidates, skippedBeforeRound }`，其中 `hit` 为最终注入原文的轮数。删除 `memory_expand_start` 与 `memory_expand_done`。

### 3.6 轮次索引（`turn-index` 任务）

- 模板 `memory-turn-summary.md` 按 PRD §11 重写：
  - 输出 `{"scene","cast","summary"}`；
  - `summary` 目标 40~80 字，写清主要人物、地点、核心事件、结果，以及有辨识度的物品 / 组织 / 称呼 / 秘密；不写情绪修辞、不复述对白、不推测。
- 删除 `memory-turn-summary-with-ltm.md`。
- 硬上限：整条索引行的 `countTokens ≤ LONG_TERM_INDEX_MAX_TOKENS`（100），超出时截断 `summary` 字符。
- 写入方式：按记录 ID `UPDATE turn_records SET summary, scene, cast_json`（新增查询函数）。记录已被回滚删掉时更新 0 行，静默结束。
- 失败时 `summary` 保持 `''`，只记 warn 日志，不写占位文本（删除现有「问答前 100 字」回退）。
- **补生成**：每次 `turn-index` 任务在处理本轮之后，再为最多 `TURN_INDEX_BACKFILL_MAX`（3）条 `summary = ''` 的更早记录补生成索引（从最老的开始）。这就是 PRD §37.2 要的重试，不另建队列。
- 旧会话已有的摘要（30~60 字）直接当索引用，**不做数据迁移**。

### 3.7 轮后任务新顺序

```
title(p2) → chapter-title(p2) → all-state(p2, tracksState)
→ table-memory(p2) → turn-record(p2, blocksNextTurn, keepSseAlive)
→ danmaku(p2) → turn-index(p3) → diary(p4)
```

- `turn-record` 改为 p2，放在 `table-memory` 之后、`danmaku` 之前。依靠同优先级先进先出，保证在状态与表格写完之后取快照。
- `turn-record` 内容：
  1. 算中期摘要（§3.3）；
  2. 取状态快照与表格快照；
  3. upsert 记录：`round_index = user 消息数`、消息 ID、快照、`middle_*`，`summary = ''`，清空 `scene / cast_json`；
  4. 中期摘要失败时，在建行之后抛错。
  - 不再调 LLM 生成摘要，不再做 embedding，不再写长期记忆。
- 新任务 `turn-index`（p3）：§3.6。
- `diary` 去掉 `!isUpdate` 条件（§5.6 的重做会先删掉本轮日记，需要重新生成）。

### 3.8 等待点（Memory Commit Barrier）

- `state-update-tracker.js` 改名为 `memory-commit-tracker.js`，函数改为 `trackMemoryCommit / awaitMemoryCommit`。
- `post-gen-runner.js` 新增任务字段 `blocksNextTurn`：对这个任务登记等待点。`tracksState` 只保留「失败时发 `state_update_failed`」的含义。
- 只有 `turn-record` 设 `blocksNextTurn: true`。因为队列串行，且同为 p2 的 `title / chapter-title / all-state / table-memory` 都排在它前面，等它完成就等于这些任务都已完成或已明确失败。任务失败时等待点照样放行（沿用现有 `.catch(() => {})`）。
- `create-stream-runner.js:29` 改为 `awaitMemoryCommit`。
- `danmaku`、`turn-index`、`diary` 不进等待点。

---

## 4. 配置项

| 键 | 默认 | 范围 | 作用域 | 说明 |
|---|---|---|---|---|
| `short_term_token_budget` | 8000 | 1000~200000 | chat | 新增，取代 `context_history_rounds` |
| `writing.short_term_token_budget` | `null` | 同上或 null | 写作 | null = 继承 chat |
| `long_term_index_budget` | 20000 | 2000~500000 | 全局 | 新增，召回模型可见索引的总预算（D2） |
| `memory_expansion_enabled` / `writing.memory_expansion_enabled` | true | — | 两者 | 保留键名，文案改为「长期召回」 |
| 删除 | — | — | — | `context_history_rounds`、`writing.context_history_rounds`、`long_term_memory_enabled`、`writing.long_term_memory_enabled`、`embedding` 整段 |

常量（`backend/utils/constants.js`）：

- 新增：`MIDDLE_SUMMARY_MAX_TOKENS=1000`、`MIDDLE_COMPRESS_INPUT_MAX_TOKENS=12000`、`MIDDLE_RAW_ROUNDS_MAX=20`、`LONG_TERM_INDEX_MAX_TOKENS=100`、`TURN_INDEX_BACKFILL_MAX=3`、`LONG_TERM_RECALL_TIMEOUT_MS=30000`。
- 删除：`MEMORY_RECALL_MAX_TOKENS`、`MEMORY_RECALL_SIMILARITY_THRESHOLD`、`MEMORY_RECALL_SAME_SESSION_THRESHOLD`、`LONG_TERM_MEMORY_*`、`LLM_LONG_TERM_MEMORY_COMPRESS_MAX_TOKENS`。
- 保留：`MEMORY_EXPAND_MAX_TOKENS`、`MEMORY_EXPAND_DECISION_MAX_TOKENS`（`saved-nearby-recall.js` 也在用）。

导入导出（`backend/services/import-export.js:530,549,595,602`）：把 `context_history_rounds` 换成 `short_term_token_budget`。旧导出文件里的 `context_history_rounds` 忽略即可。

---

## 5. 实施步骤

按顺序执行。每步结束时对应测试应为绿色；步骤之间不留半成品路径。

### 5.1 轮次切分与 schema

- 新增 `utils/session-rounds.js`，并写单元测试：开场白并入第 1 轮、多条 assistant、空会话、末尾是 user 的情况。
- `schema.js`：加 `middle_summary`、`middle_covered_to`，删 `long_term_memory_snapshot`。
- `db/queries/turn-records.js`：
  - 删 `updateTurnRecordLtmSnapshot` 与 `getRecentTurnRecordIds`（确认无其他调用方）；
  - `upsertTurnRecord` 增加 `middle_summary / middle_covered_to`；
  - 新增 `updateTurnRecordIndex(id, { summary, scene, cast_json })`；
  - 新增 `getRecallIndexCandidates(sessionId, coveredTo)`，返回 `round_index, id, summary, scene, cast_json`，条件 `summary != ''`，按 round 升序；
  - 新增 `getUnindexedTurnRecords(sessionId, limit)`，按 round 升序；
  - `getRecentTurnSummaries` 加 `summary != ''` 过滤。

### 5.2 中期摘要模块

- 新增 `memory/middle-summary.js`：
  - `computeMiddleSummary(sessionId, roundIndex) → { text, coveredTo, evicted, failed, error }`；
  - 滑出计算抽成纯函数 `planEviction(rounds, coveredTo, budget, latestRound)`，单独测试。
- 新增模板 `memory-middle-summary.md`。
  - 变量：`USER_NAME`、`CHARACTER_NAME`、`PREVIOUS_SUMMARY`、`NEW_ROUNDS`、`MAX_CHARS`（取 1000 字，留出估算误差）。
  - 要点：
    - 只写「故事为什么走到现在」：时间顺序、关键决策与后果、因果、场景迁移、关系变化过程、身份揭示与冲突的起落（PRD §8.4）；
    - 不写成当前数值、库存、完整外貌人格、任务清单（PRD §8.5）；
    - 旧摘要与新内容融合成一段连续叙述，不按轮分条。
- 新增模板 `memory-middle-summary-shrink.md`，用于超长时单独压缩摘要。
- 删除 `services/long-term-memory.js` 及其测试、模板 `memory-long-term-compress.md`。

### 5.3 轮后任务与等待点

- `build-turn-postgen-tasks.js`：
  - 按 §3.7 调整顺序与优先级；
  - 新增 `turn-index` 任务；
  - `diary` 去掉 `isUpdate` 条件，但 `turnRecordOpts` 仍传给 `chapterTasks`。
- `post-gen-runner.js`：新增 `blocksNextTurn`。
- tracker 改名（§3.8），更新 `create-stream-runner.js` 与相关测试。
- `hooks/README.md:54` 的 label 列表加上 `turn-index`。

### 5.4 `turn-summarizer.js` 拆分

- `createTurnRecord(sessionId)`：
  - 删 `isUpdate` 参数；`round_index = splitRounds 得到的最后一轮轮号`；
  - 缺少 user/assistant 配对时跳过。
  - 流程：中期摘要 → 快照 → upsert → 失败时抛错。
- `generateTurnIndex(sessionId)`：处理最新一轮与补生成（§3.6）。
- 删除 LTM 追加、LTM 快照、embedding、`memory[]` 解析，以及问答前 100 字的回退文本。

### 5.5 长期召回与 prompt 组装

- 新建 `memory/long-term-recall.js`，把 `summary-expander.js` 改写后移入并删除原文件：
  - `recallTurns({ sessionId, coveredTo, mode })` 返回 `{ roundIds, candidates, skippedBeforeRound }`；
  - `renderRecalledTurns(recordIds, budget)`：沿用 `renderExpandedTurnRecords` 的格式，改为「超预算跳过」。
- 模板 `memory-expand-system.md` / `memory-expand-user.md` 改名为 `memory-recall-system.md` / `memory-recall-user.md`，并按 §3.5 重写。
- `memory/recall.js`：删除 `searchRecalledSummaries`、`renderRecalledSummaries`、`parseCastJson`，以及 embedding 与向量存储的 import。状态渲染函数保留。
- `prompts/segments.js`：
  - 删 `renderRecalledSummariesSection`、`buildExpandCandidates`、`renderLongTermMemorySection`；
  - 新增 `renderStorySummarySection(text, tv)`；
  - `renderExpandedSection` 改为接收记录 ID 列表。
- `prompts/assembler.js`：
  - 在函数开头读一次最新记录（`coveredTo`、`middle_summary`）；
  - 历史改用 `sliceHistoryAfterRound`；
  - 替换 [8.5] 与 [9]/[10] 的调用；
  - 更新文件头部的锁定顺序注释（[8.5] 改名，[9] 删除）。
- 更新 golden snapshot 与 shape 测试。

### 5.6 「重做最后一轮」：续写与编辑最后一条 AI 回复

- `rollbackSession(mode, sessionId, truncate, { redoLatestRound = false } = {})`：
  - `redoLatestRound` 为 true 时，末尾即使是 assistant，也令 `keptRounds = roundCount - 1`；
  - 删除 LTM 恢复这一行，表格与状态恢复逻辑不变。
- 续写（`run-turn-continue.js`）：流成功结束、在 `runPostGenFlow` 之前，调用 `await rollbackSession(mode, sessionId, async () => {}, { redoLatestRound: true })`，然后照常跑轮后任务（仍传 `turnRecordOpts: { isUpdate: true }`，只用于章节任务的判断）。
- `editAssistant`（`create-turn-handlers.js:120`）：
  - 目标不是最后一条 assistant 时返回 409；
  - 会话里还没有 user 消息（开场白）时只改内容；
  - 否则：改内容 → `rollbackSession(..., { redoLatestRound: true })` → 用 `buildTurnPostgenTasks({ includeSessionTitle: false, includeChapterTitle: false, turnRecordOpts: { isUpdate: true } })` 经 `runPostGenTasks` 入队（`emitSse` 传空函数）→ 立即返回。
- 前端：只对最后一条 assistant 传 `onEditAssistant`：
  - 对话：`frontend/src/components/chat/MessageBubbles.jsx`（已有 `lastAssistantId`）；
  - 写作：`ProseChapters.jsx`。
  - 后端 409 时走现有错误提示。

### 5.7 删除 embedding（D1）

按 §2.6 的清单逐个删除。设置页删掉 Embedding 区块和测试按钮，`EMBEDDING_PROVIDERS` 常量随之删除。确认 `settings.js` 里 `openai_compatible` 只被 embedding 使用后一并删除。

- `cleanup-registrations.js` 删除向量相关注册。
- 磁盘上已有的旧数据文件在 §5.10 统一清理。

### 5.8 前端：设置与中期摘要查看

- 设置页（`FeaturesConfigPanel.jsx`、`useSettingsPromptConfig.js`、`settingsConfigState.js`、`SettingsPage.jsx`）：
  - 「上下文保留轮次」改为「短期记忆 token 预算」（写作可留空继承）；
  - 删除「长期记忆」开关；
  - 「记忆原文展开」改为「长期召回」，提示「每轮生成前由辅助模型按历史目录挑选相关轮次原文，会增加首字等待」；
  - 新增「召回目录预算」数字框，提示「本地小上下文模型请调低；超出部分的早期轮次不参与召回」。
- 中期摘要查看与编辑：
  - `routes/long-term-memory.js` 改为 `routes/middle-summary.js`：
    - `GET /api/sessions/:id/middle-summary` 返回 `{ content, coveredTo }`；
    - `PUT` 更新最新记录的 `middle_summary`，没有记录时返回 409。
  - 前端 `core/api/long-term-memory.js` 改为 `middle-summary.js`；
  - `LongTermMemoryModal.jsx` 改为 `MiddleSummaryModal.jsx`，标题「剧情摘要」，显示「已覆盖到第 N 轮」；
  - 入口按钮不再依赖开关，始终显示（`InputBox.jsx` / `InputBoxToolbar.jsx` / `usePageConfig.js` / `useConversationPageState.js` / 两个 ConversationPane / `ChatPage`）。
- 召回指示器：
  - 删除 `onMemoryExpandStart/Done`、`memoryExpanding` 状态和「正在翻阅」文案（`stream-parser.js`、`sessionStreamCallbacks.js`、`useMemoryIndicators.js`、`MemoryRecallOverlay.jsx` 以及页面消费处）；
  - `memory_recall_done.hit` 显示为「召回 N 轮」。
- 视觉有变化的页面按项目规则更新 `docs/images/` 下的截图（设置页；含召回指示器的对话页 / 写作页）。

### 5.9 可观测性（日志，不新增持久化指标）

每轮用现有 `createLogger` + `formatMeta` 输出：

- `turn-record`：`round`、短期 token 与轮数、`evicted` 范围、中期 token、`coveredTo`、`failed`；
- 召回：候选数、索引总 token、`skippedBeforeRound`、选中轮号、展开 token、耗时；
- `turn-index`：成功或失败，补生成了多少条，当前未索引的记录数。

### 5.10 清理旧数据文件与旧记忆实现（最后一步）

前面各步已删掉新架构直接替换掉的代码。这一步清掉剩下的旧数据和死代码，保证仓库和用户数据目录里不再残留旧记忆系统。

**1. 启动时清理旧数据文件**

- 新增 `backend/services/legacy-memory-cleanup.js`，导出 `removeLegacyMemoryData()`：
  - 对 `path.join(DATA_ROOT, 'vectors')` 与 `path.join(DATA_ROOT, 'long_term_memory')` 执行 `fs.rmSync(dir, { recursive: true, force: true })`；
  - 目录存在并被删除时打一条 info 日志；
  - 目录不存在时什么都不做，可以重复执行。
- `server.js` 在 `initSchema()` 之后调用一次。
- `DATA_ROOT` 来自 `backend/utils/data-dir.js`：桌面端和测试沙箱通过 `WE_DATA_DIR` 指向各自目录，所以不会误删仓库外的数据。

**2. 清理用户配置文件里的旧键**

- `services/config.js`：删除现有的 `context_compress_rounds → context_history_rounds` 迁移（`:275-278`）。
- 在同一位置，删除用户配置里已废弃的键：
  - `context_compress_rounds`
  - `context_history_rounds`
  - `long_term_memory_enabled`
  - `embedding`
  - `writing.context_history_rounds`
  - `writing.long_term_memory_enabled`
- 下次保存配置时，这些键就会从 `config.json` 里消失。
- `provider_keys` 里 embedding 专用的 `openai_compatible` 键也一并删除。

**3. 删除数据库里的旧记忆死结构**

以下结构是更早一代「上下文压缩」记忆的残留，没有任何写入方。在 `db/schema.js` 迁移段按顺序删除：

1. 索引 `idx_messages_session_compressed`；
2. `messages.is_compressed` 列；
3. `sessions.compressed_context` 列；
4. `session_summaries` 表。

同步修改的代码：

- 建表语句里去掉上述字段和表（`schema.js:83,116,120`）。
- `schema.js:452-455` 当初加这两列和索引的迁移语句一并删除。
- `schema.js:460-480` 的旧 sessions 重建迁移保持原样：它只在极旧的数据库上触发，运行后会被上面的删除语句清掉。
- `db/queries/messages.js:279-305` 的 `getUncompressedMessagesBySessionId` 删除，assembler 两处改用现有的 `getMessagesBySessionId`。换之前先确认两者在「不限条数」时的排序和返回字段一致。
- `db/queries/writing-sessions.js:12` 的 INSERT 去掉 `compressed_context`。
- 测试 fixtures（`tests/helpers/fixtures.js:70-99`）去掉这两个字段；`tests/db/queries/messages.test.js:75` 的用例删除。

**4. 全仓残留检查**

以下关键词在 `backend/`、`frontend/src/`、`assistant/`、`hooks/`、`shared/`、`scripts/` 中都应搜不到结果（`node_modules` 和本文档除外）：

```
embedding  embed(  vector-store  vectors/  searchRecalledSummaries  recalled_memories
long_term_memory  long-term-memory  LongTermMemory  ltm  LONG_TERM_MEMORY
context_history_rounds  context_compress_rounds  memory_expand_start  memory_expand_done
memoryExpanding  summary-expander  decideExpansion  is_compressed  compressed_context
session_summaries  getUncompressedMessagesBySessionId  isUpdate（turn-summarizer 内）
```

搜 `ltm` 时忽略大小写，并人工排除无关命中。

写卡助手也在检查范围内：
- `assistant/server/normalize-proposal.js:84` 和 `apply-proposal.js:237` 脱敏清单里的 `embedding.api_key` 要删掉；
- `assistant/tests/normalize-proposal.test.js:25` 的相关断言也要改掉；
- 改完跑 `npm run test:assistant`。如果有搜到但必须保留的命中（例如 schema 里的 `DROP` 迁移语句），在完成报告里逐条列出原因。

**5. 守卫基线**

- 删除文件后运行 `npm run check:guards`。
- 报「基线虚挂」时，用对应脚本的 `--update-baseline` 刷新基线并一起提交。

---

## 6. 验收（对应 PRD 条目）

自动化测试（后端 `node --test`，已有 mock provider `backend/llm/providers/mock/`）：

| PRD | 测试要点 |
|---|---|
| AC-01 | `planEviction`：超预算只滑出最老的完整轮次；第 N 轮单独超预算也保留；一次滑出多轮 |
| AC-02 | 滑出后 `middle_covered_to` 推进；输出超过 1000 token 触发二次压缩；失败时不推进、仍建行、抛错；下一轮自动重试 |
| AC-04 / AC-15 | 主 prompt 不含索引文本；历史只含 `> coveredTo` 的轮次；会话增长时历史 token 保持在预算附近 |
| AC-12 / AC-13 | 重新生成 / 删除后，最新记录的中期摘要回到目标轮版本；被删轮次不再出现在召回候选里 |
| AC-14 | 召回候选不含 `> coveredTo` 的轮次 |
| D2 | 索引超预算时只取最近部分，`skippedBeforeRound` 正确 |
| D4 | 无候选时不调用模型；召回异常或超时时照常生成、`hit=0` |
| D6 | 编辑非最后一条 AI 回复返回 409；编辑最后一条后状态与表格先回退再重算（不重复应用） |
| §3.8 | 下一轮组装前等待 `turn-record` 完成；`turn-index` 未完成不阻塞 |
| §3.6 | 索引失败时 `summary=''`、不写占位；下一轮补生成；行已删除时更新 0 行不报错 |
| §5.10 | 在沙箱 `WE_DATA_DIR` 里预置 `vectors/`、`long_term_memory/`，调用 `removeLegacyMemoryData` 后两个目录都不存在，重复调用不报错；含旧键的配置经过 normalize 后旧键被删掉；旧库迁移后 `is_compressed`、`compressed_context`、`session_summaries` 都不存在 |

不做自动化、在完成报告中说明的项：AC-03（数百轮后隐式召回的效果）依赖真实模型，只能用真实会话做人工抽查。

执行时运行：

- `npm run test:backend`
- `npm run test:frontend`
- `npm run lint`
- `npm run check:guards`：删除文件后若报基线虚挂，用对应脚本 `--update-baseline` 刷新并一起提交。
- 用 `agent-browser` 手动冒烟：对话与写作各跑十几轮短回复，并把预算调到 1000，确认发生滑出、剧情摘要弹窗有内容、召回指示器正常；编辑最后一条回复；重新生成；删除消息。

---

## 7. 本阶段明确不做

- State Memory 全部内容：实体目录、Profile、Relations、Threads、字段可变性、Scene Entity Resolver。四张表格、状态更新器、附近角色、日记维持现状。
- 分支 / 多版本回复。
- 真实 tokenizer、分级索引。
- 召回调用与世界条目 AI 预判的并发优化。

## 8. 已知风险

- **首字等待变长**：有候选时每轮多一次召回调用（D4 已限制在有候选时才调用，并设了超时）；有滑出时，下一轮还要等中期压缩完成。
- **token 估算偏低**：中文按 0.5/字估算，对多数模型偏低。实际占用可能是配置值的 1.3~2 倍，本地模型用户需要把预算调低。
- **旧会话首次运行**：会一次性滑出大量轮次。按 §3.3 的规则，只有最后 20 轮用原文，更早的用旧摘要。第一次中期压缩要做多批调用，耗时较长。
- **续写时 SSE 保持更久**：续写模式要等 SSE 关闭才结束生成状态，`turn-record` 带上中期压缩后，续写后的锁定时间会变长。
