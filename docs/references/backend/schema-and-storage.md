# Backend Schema And Storage

数据库表、字段、配置键、导入导出格式与存储结构的权威来源。

---

## 任务分流

- 先不知道去哪一节：先读 [`schema-reading-guide.md`](schema-reading-guide.md)
- 查表结构、字段、级联删除：看 `## 表结构`
- 查 `data/` 目录、上传、向量、日志、主题目录：看 `## 总览`
- 查 `data/config.json`：看 `## 全局配置文件结构`
- 查 `.wechar.json` / `.weworld.json` / `.weglobal.json`：看 `## 导入导出 JSON 格式`

## 总览

### 权威范围与更新触发

本文件只负责：
- SQLite 表、字段、索引、删除策略
- `data/config.json` 配置格式
- 导入导出 JSON 格式
- 与存储结构直接相关的硬约束

本文件不负责：
- prompt 组装顺序（见 `prompts-and-llm.md`）
- SSE 事件与异步任务链（见 `routes-and-sse.md`、`async-jobs-and-hooks.md`）
- 前端渲染与页面行为
- 历史迁移叙事（见 `../history/changelog.md`）

出现以下改动时，必须同步更新本文件：
- 新增、删除、重命名表/字段/索引
- 配置文件键名或结构变化
- 导入导出格式变化
- 字段默认值、可空性、约束语义变化

### 存储分工

| 数据类型 | 存储位置 |
|---|---|
| 结构化数据（世界、角色、会话、消息等） | SQLite（`worldengine.db`）|
| Prompt 条目 embedding 向量 | JSON 文件（`/data/vectors/`）|
| 头像、附件图片、上传文件 | 本地文件（`/data/uploads/`）|
| 全局配置（API Key、字号等） | JSON 文件（`/data/config.json`）|
| 用户导入主题 | 文件目录（`/data/themes/{theme_id}/theme.json + theme.css`）|
| 写卡助手任务态 | SQLite（`assistant_tasks` 表）|

### 文件目录结构

```
/data
  worldengine.db         # SQLite 数据库
  config.json            # 全局配置
  /uploads
    /avatars             # 角色头像，文件名：{character_id}.{ext}
    /attachments         # 消息附件，文件名：{message_id}_{index}.{ext}
  /vectors
    prompt_entries.json      # Prompt 条目 embedding 索引（内存加载）
    session_summaries.json   # 会话摘要的 embedding 向量索引（T27，T35 起不再写入，旧数据存档）
    turn_summaries.json      # 每轮 turn record 摘要的 embedding 向量索引（T35）
  /daily
    {sessionId}/             # 日记正文文件目录（T155），随 session 删除时由 cleanup-registrations.js 清理
      {date_str}.md
  /logs
    worldengine-YYYY-MM-DD.log  # 运行时日志，按日轮换（T99）；data/.gitignore 的 * 规则已覆盖
  /themes
    {theme_id}/
      theme.json             # 用户导入主题元信息
      theme.css              # 用户导入主题 CSS
```

### 删除策略

- 删除世界 → 级联删除其下所有角色、会话（含写作会话）、消息、Prompt 条目、persona、所有会话状态值
- 删除角色 → 级联删除其下所有聊天会话、消息、Prompt 条目，清空对应头像文件
- 删除会话 → 级联删除其下所有消息、`session_summaries`、`session_nearby_characters` 关联行，清空对应附件文件
- 删除消息 → 清空对应附件文件
- 删除 world_prompt_entries 条目 → 级联删除其下所有 `entry_conditions`（ON DELETE CASCADE）
- 所有删除均为硬删除，无软删除
- 磁盘文件（头像、附件、向量）的清理通过 `cleanup-registrations.js` 注册的钩子执行，在 DB DELETE 之前调用；钩子失败只 warn，不阻塞删除

级联删除由 SQLite 外键约束（`ON DELETE CASCADE`）自动处理，不在业务代码中手动实现。

---

## 表结构

> DDL 实际定义见 `backend/db/schema.js`；本文件以中文字段语义和业务约束为权威说明。索引、外键和 ALTER 迁移以 schema.js 为准。

### worlds — 世界

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | — |
| description | TEXT | 世界简介，纯展示，不注入提示词（默认 `''`） |
| temperature | REAL NULLABLE | 生成参数覆盖，NULL 时使用全局配置 |
| max_tokens | INTEGER NULLABLE | 生成参数覆盖，NULL 时使用全局配置 |
| cover_path | TEXT NULLABLE | 封面图相对路径，如 avatars/world_{id}.png，无封面则 NULL |
| sort_order | INTEGER | 世界选择页拖拽排序权重，升序展示；旧库由迁移按 created_at 回填（默认 0） |
| created_at | INTEGER | Unix 时间戳（毫秒） |
| updated_at | INTEGER | — |

> 玩家（Persona）已从 worlds 表移出到独立的 `personas` 表（见下），每个世界可持有多条 persona 记录。
> 世界级提示词的权威运行时来源为 `world_prompt_entries`；旧 `worlds.system_prompt/post_prompt` 列已彻底删除。

---

### personas — 玩家（用户代入身份）

每个世界可持有多条 persona 记录（一对多）。创建世界时由业务层自动初始化一条空记录。
激活的 persona 通过 `worlds.active_persona_id` 标记；NULL 时回退到最早创建的 persona。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| world_id | TEXT FK→worlds.id CASCADE | — |
| name | TEXT | 玩家在该世界的称呼（默认 `''`） |
| description | TEXT | 玩家简介，纯展示，不注入提示词（默认 `''`） |
| system_prompt | TEXT | 玩家人设描述（默认 `''`） |
| avatar_path | TEXT NULLABLE | 头像相对路径 |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |

> world_id 不再有 UNIQUE 约束（支持多玩家卡）。

`worlds.active_persona_id TEXT` — 引用当前激活的 persona id（可 NULL，NULL 时取最早创建的）。

---

### persona_state_fields — 玩家状态字段定义

字段模板属于 world（类似 character_state_fields 的归属方式），所有字段复制自 character_state_fields 的结构。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| world_id | TEXT FK→worlds.id CASCADE | — |
| field_key | TEXT | — |
| label | TEXT | — |
| type | TEXT | `'text'` \| `'number'` \| `'boolean'` \| `'enum'` \| `'list'` \| `'datetime'` \| `'table'` |
| description | TEXT | 默认 `''` |
| default_value | TEXT NULLABLE | — |
| update_mode | TEXT | `'manual'` \| `'llm_auto'`（默认 `'manual'`） |
| enum_options | TEXT NULLABLE | — |
| min_value | REAL NULLABLE | — |
| max_value | REAL NULLABLE | — |
| allow_empty | INTEGER | 默认 1 |
| update_instruction | TEXT | 默认 `''` |
| prefix | TEXT | datetime 字段展示前缀（如"第三纪元 "），仅前端渲染用，不参与 LLM/条件比较（默认 `''`） |
| unit | TEXT | 仅 `type='number'` 用，展示用单位（如 `元` / `万元` / `%`），最长 16 字符，不参与 LLM 写入与条件比较（默认 `''`） |
| table_columns | TEXT NULLABLE | 仅 `type='table'` 时填写：JSON 字符串，形如 `[{"key":"atk","label":"攻","min":0,"max":99}]`，`key` 须满足 `[a-zA-Z0-9_]+` 且列内唯一；其他类型必须为 NULL |
| sort_order | INTEGER | 默认 0 |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |
| UNIQUE | — | (world_id, field_key) |

---

### persona_state_values — 玩家状态值

每个 persona 持有独立的状态值行，按 `(persona_id, field_key)` 唯一索引。`world_id` 保留用于级联删除查询。新建玩家卡后立即设为 active，后续写入均落到该 persona 的独立行，与其他玩家卡互不影响。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| persona_id | TEXT FK→personas.id CASCADE | — |
| world_id | TEXT FK→worlds.id CASCADE | 保留用于级联 / 批量删除 |
| field_key | TEXT | — |
| default_value_json | TEXT NULLABLE | 用户在编辑页保存的默认值，允许为 NULL |
| runtime_value_json | TEXT NULLABLE | LLM 自动更新的运行时值，允许为 NULL |
| updated_at | INTEGER | — |
| UNIQUE | — | (persona_id, field_key) |

---

### characters — 角色

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| world_id | TEXT FK→worlds.id CASCADE | — |
| name | TEXT | — |
| description | TEXT | 角色简介，纯展示，不注入提示词（默认 `''`） |
| system_prompt | TEXT | 角色层 system prompt（默认 `''`） |
| post_prompt | TEXT | 角色层后置提示词（默认 `''`） |
| first_message | TEXT | 会话创建时自动插入的开场白，为空则不插入（默认 `''`） |
| avatar_path | TEXT NULLABLE | 相对路径，如 avatars/abc123.png，无头像则 NULL |
| sort_order | INTEGER | 同世界下角色的显示排序，支持拖拽修改（默认 0） |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |

---

### sessions — 会话

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| character_id | TEXT FK→characters.id CASCADE NULLABLE | chat 会话绑定单角色；writing 会话为 NULL |
| world_id | TEXT FK→worlds.id CASCADE NULLABLE | writing 会话直接挂在世界下；chat 会话通常为 NULL |
| persona_id | TEXT FK→personas.id CASCADE NULLABLE | writing 会话强绑定到玩家卡（创建时快照 `worlds.active_persona_id`，回退到最早创建的 persona）；chat 会话保持 NULL（persona 由 `worlds.active_persona_id` 全局解析） |
| mode | TEXT | T34：`'chat'` \| `'writing'`（默认 `'chat'`） |
| title | TEXT NULLABLE | 会话标题，NULL 时前端显示 created_at 对应的日期（如 2024-01-15） |
| compressed_context | TEXT NULLABLE | 历史遗留压缩摘要字段；当前保留但默认不参与 prompt 组装，清空聊天时置 NULL |
| keyword_active_state | TEXT | 关键词条目的跨轮激活状态（JSON 字符串，默认 `'{}'`），结构 `{ "<entry_id>": { "round": <激活时 user 消息计数>, "ttl": <active_turns 快照> } }`；`ttl=0` 永久，`ttl>=1` 时 `currentRound - round < ttl` 期间有效。关键词匹配只扫描"本轮"最新一条 user / assistant 消息（fresh hit），跨轮持续完全由 TTL 控制，旧消息不再因留存于上下文而被反复当作新命中。entry-matcher 每次组装时读取 / 刷新 / 清理 |
| diary_date_mode | TEXT NULLABLE | T155：`'virtual'` \| `'real'` \| NULL（NULL=日记未开启）；创建时从 config 快照，不可变 |
| state_baseline_json | TEXT NULLABLE | 首轮前状态基线快照（JSON：`{world,persona,character,nearby?}`，口径同 turn_records.state_snapshot）。`updateAllStates` 在首次状态写入前、仅当本列为 NULL 时不可变写入（`setSessionStateBaselineIfAbsent`）。作用：重生成第一轮会删光所有 turn record，回滚时无轮次快照，改用本基线还原——既保住用户首轮前手动预设，又丢弃被重生成轮次的状态污染。NULL=老会话/从未生成 → 回滚退回"保留现状"（向下兼容） |
| created_at | INTEGER | — |
| updated_at | INTEGER | 最后一条消息的时间，用于排序 |

**索引**: `(world_id, mode, created_at)` — 会话列表查询；`(world_id, persona_id, mode, updated_at)` — 按 active persona 过滤的写作会话列表

**级联**：删除 persona 触发 `ON DELETE CASCADE` 清空所有 `persona_id = ?` 的写作 session。由于该级联由 SQLite 直接执行不会触发 JS 钩子，service 层 `deletePersonaService` 会预先逐条调用 `deleteWritingSession` 以让 cleanup-hooks（长期记忆、日记目录、附件等）正常执行。

---

### session_nearby_characters — 写作会话附近 / 登场角色

写作模式下当前 session 内"出场"的角色集合，含两类：

- transient（`is_saved=0`）：仅本 session 临时存在，不落到全局角色库；每轮 `name+persona+state` 全量进 prompt（`<nearby_characters>` [7] "当前登场"段）
- saved（`is_saved=1`）：会话级持久身份，每轮仅 `name+persona` 作为线索清单进入 `<nearby_characters>` 索引段；其 `state` 默认不进 prompt，只有被 `backend/memory/saved-nearby-recall.js` 的 `decideSavedNearbyRecall` 在 [10.5] preflight 命中时，才以完整块注入 `<recalled_characters>`。saved 与"制卡到正式 `characters` 表"是两条独立链路，互不依赖

`name` 在同一 session 内唯一（transient 与 saved 共享同一命名空间）。

`backend/services/writing-sessions.js` 的 `listNearby` 返回每行额外带 `state_updated_at` 字段（=该角色所有 `session_nearby_character_state_values.updated_at` 的最大值，无 state 行时为 `0`），该字段不入库，仅由 listNearby 派生。

saved 角色在前端 `NearbyPanel` 的自动展开/收起由 **后端 `saved_recall_done` SSE 事件**驱动（与 [10.5] 注入 `<recalled_characters>` 的判定结果严格一致）：事件 `ids` 中的角色展示完整 state，未命中的降级到底部紧凑列表；与 `state_updated_at` 解耦——不再要求 LLM "改写过 state" 才算"登场"，避免叙事中出现但 state 未变的角色被错误折叠。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID（前端不暴露） |
| session_id | TEXT FK→sessions.id CASCADE | — |
| name | TEXT | session 内唯一（含 transient + saved） |
| persona | TEXT | **底层人物设定**（性格 / 说话风格 / 长期身份 / 关键标签）—— 稳定属性。`backend/prompts/nearby-prompt.js` 明确禁止 LLM 在 persona 中写入当前剧情片段、与玩家的临时关系、当下情绪/场景/位置等动态内容（这些走叙事正文与 state 字段）。新登场必填；已有角色仅在身份/性格需要修正时输出，否则省略以避免覆盖稳定人设。制卡时直接作为新角色 `characters.description` 的基底 |
| is_saved | INTEGER | 0=transient / 1=saved，默认 0 |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |
| UNIQUE | — | (session_id, name) |

**索引**: `(session_id)` — `idx_session_nearby_characters_session_id`

---

### session_nearby_character_state_values — 附近角色会话级状态值

每条记录对应一个 nearby 角色在当前 session 上某个 `character_state_fields` 字段的运行时值。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| session_id | TEXT FK→sessions.id CASCADE | — |
| nearby_id | TEXT FK→session_nearby_characters.id CASCADE | — |
| field_key | TEXT | 必须存在于该世界的 `character_state_fields` 且 `nearby_enabled=1` |
| runtime_value_json | TEXT NULLABLE | LLM 维护的运行时值，JSON 字符串 |
| updated_at | INTEGER | — |
| UNIQUE | — | (nearby_id, field_key) |

**索引**: `(nearby_id, field_key)` — `idx_session_nearby_character_state_values_nearby_id`

---

### messages — 消息

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK→sessions.id CASCADE | — |
| role | TEXT | `'user'` \| `'assistant'` \| `'system'` |
| content | TEXT | 消息正文 |
| attachments | TEXT NULLABLE | JSON 数组，相对路径列表，无附件则 NULL；例：`["attachments/msg1_0.png", "attachments/msg1_1.pdf"]` |
| is_compressed | INTEGER | T32：0=未压缩（送入 LLM），1=已压缩（仅存档）（默认 0） |
| created_at | INTEGER | 消息发送时间，用于排序 |
| token_usage | TEXT NULLABLE | JSON：`{ prompt_tokens, completion_tokens, cache_read_tokens?, cache_creation_tokens?, cache_miss_tokens? }`，仅 assistant 消息填写，旧数据为 NULL。**`prompt_tokens` 已统一归一化为「未命中输入 token」**（按 input 单价计费的部分）：Anthropic 原生即如此；OpenAI/Gemini/DeepSeek/Kimi/GLM/MiniMax/Grok/Qwen/SiliconFlow 的 provider 原值含 cache_read，写入 DB 前由 `backend/llm/providers/_shared/cache-usage.js` 的 `recordTokenUsage` 减去 `cache_read_tokens`。前端 `calcCost` 直接 `prompt_tokens*input + cache_read*cacheRead + cache_creation*cacheWrite + completion*output` 即正确。归一化只影响新写入,旧数据沿用 provider 原始口径 |
| next_options | TEXT NULLABLE | JSON 字符串数组：本轮 `<next_prompt>` 解析出的选项；仅 assistant 消息填写，无选项时为 NULL |
| activated_entries | TEXT NULLABLE | JSON 数组：本轮激活的非常驻 lorebook 条目 `[{id,title,trigger_type}]`；仅 assistant 消息填写，无激活条目时为 NULL |

**索引**: `(session_id, is_compressed, created_at)` — 用于按会话取未压缩消息窗口

content 字段更新规则（/continue 操作场景）：更新时在 Service 层读出完整 content，在内存中拼接新内容，将完整字符串写回，不使用 SQL 字符串拼接，避免并发问题。

---

### session_summaries — 会话摘要（存档，T35 起不再写入）

每个 session 至多一条 summary。T35 起由 per-turn 摘要系统（turn_records）取代，此表保留旧数据，不再写入新记录。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK→sessions.id CASCADE | UNIQUE |
| content | TEXT | LLM 生成的摘要文本 |
| created_at | INTEGER | — |
| updated_at | INTEGER | 每次重新生成时更新 |

---

### turn_records — 轮次记录（T35）

每轮对话结束后（状态更新完毕后）创建一条记录，存摘要文本和指向原始消息的 ID 指针。
用于向量召回（[12]）和原文展开（[13]）；**不参与 [14] 历史消息**（[14] 稳定使用原始 messages 窗口）。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK→sessions.id CASCADE | — |
| round_index | INTEGER | 1-based，该 session 内的轮次序号 |
| summary | TEXT | LLM 生成的摘要（用于向量检索，10-50 字） |
| user_message_id | TEXT NULLABLE | 指向 messages.id（user 消息） |
| asst_message_id | TEXT NULLABLE | 指向 messages.id（assistant 消息） |
| state_snapshot | TEXT NULLABLE | JSON：该轮结束后三层状态快照，用于 regenerate/删除/编辑回滚 |
| long_term_memory_snapshot | TEXT NULLABLE | 该轮结束后 memory.md 全文快照，用于回滚同步还原长期记忆；NULL=旧记录无快照（保持文件不动） |
| created_at | INTEGER | — |
| UNIQUE | — | (session_id, round_index) |

`state_snapshot` 结构（JSON 字符串）：
```json
{
  "world":     { "field_key": "runtime_value_json", ... },
  "persona":   { "field_key": "runtime_value_json", ... },
  "character": { "cid": { "field_key": "runtime_value_json", ... }, ... },
  "nearby":    [
    { "id": "...", "name": "...", "persona": "...", "is_saved": 0|1,
      "state": { "field_key": "runtime_value_json", ... } },
    ...
  ]
}
```
- 仅记录有 `runtime_value_json` 的字段（非 NULL），默认值层不存入快照
- 状态更新（优先级 2）完成后，由 `createTurnRecord`（优先级 3）捕获；时序上保证本轮最终状态
- 恢复时通过 `backend/memory/state-rollback.js` 的 `restoreStateFromSnapshot()` 写回 `session_*_state_values` 与 `session_nearby_character*` 两张表
- 无快照（全新会话、或首轮 regenerate）时降级：清空三张 session_*_state_values 表 + nearby 两张表回 default
- `nearby` 层仅写作模式写入（含空数组 `[]`，区分"启用 nearby 但本轮空" vs "旧记录无字段"）；chat 模式不写
- 还原时 nearby id 不复用，`createNearbyCharacter` 重新分配 UUID；缺失/非数组（旧记录）→ 清空 nearby 两张表（向下兼容）

`long_term_memory_snapshot` 行为：
- 在 `createTurnRecord` 末尾（`appendMemoryLines` 完成、可能含 LLM 压缩）回填，写入当时 `data/long_term_memory/{sessionId}/memory.md` 全文
- 无论本轮是否启用 LTM、是否抽取到记忆，都会回填，便于回滚到"启用前"的轮次精确还原空文件
- 回滚（`restoreLtmFromTurnRecord`）：保留 `R-1` 轮后取最后一条记录的快照覆盖 memory.md；`R=0` 时清空整个目录；快照为 NULL（旧记录）时保持文件不动

其他说明：
- 原文展开（[13]）：通过 `user_message_id`/`asst_message_id` 查 `messages` 表取实时内容
- 用户编辑消息后，`createTurnRecord({ isUpdate: true })` 重新生成摘要，指针不变（message id 不变）
- regenerate 后，旧 assistant 消息被删除，`createTurnRecord` 产出新记录指向新 message
- `turn_records` 由 SQLite `ON DELETE CASCADE` 随 session 自动级联删除
- 向量文件 `turn_summaries.json` 的清理通过 `cleanup-registrations.js` 钩子执行

---

### daily_entries — 日记条目（T155）

每次日期跨越后生成一篇日记，该表存储元数据（摘要、日期）。日记正文存为磁盘文件 `data/daily/{sessionId}/{date_str}.md`。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK→sessions.id CASCADE | — |
| date_str | TEXT | YYYY-MM-DD 格式，虚拟日期/真实日期统一 |
| date_display | TEXT | 显示用字符串（如"1000年3月15日"或"2024年3月15日"） |
| summary | TEXT | 日记开头一两句话摘要（LLM 生成） |
| triggered_by_round_index | INTEGER NULLABLE | 触发本条日记生成的轮次（用于 regenerate 时精准删除） |
| created_at | INTEGER | — |
| UNIQUE | — | (session_id, date_str) |

说明：
- `date_str` 精度到日（YYYY-MM-DD），同一 session 同一天只有一条（UPSERT）
- 日记正文通过 `GET /api/sessions/:id/daily-entries/:dateStr` 读取磁盘文件
- 磁盘文件路径：`data/daily/{sessionId}/{date_str}.md`；正文 Markdown 格式：`# date\n\nsummary\n\n---\n\nbody`
- regenerate 时：`triggered_by_round_index >= R` 的条目 + 对应磁盘文件被删除
- session/character/world 删除时：磁盘目录 `data/daily/{sessionId}/` 通过 `cleanup-registrations.js` 钩子删除；DB 记录由 `ON DELETE CASCADE` 自动清理

---

### session_world_state_values — 会话级世界状态值（T103）

记录每个会话运行时的世界状态值，与全局默认值分离，实现各会话独立。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK→sessions.id CASCADE | — |
| world_id | TEXT FK→worlds.id CASCADE | — |
| field_key | TEXT | — |
| runtime_value_json | TEXT NULLABLE | LLM 自动更新的运行时值，允许为 NULL |
| updated_at | INTEGER | — |
| UNIQUE | — | (session_id, field_key) |

**值优先级**：`session runtime_value_json` > `world_state_values.default_value_json` > `world_state_fields.default_value`（用 COALESCE 实现）。

---

### session_persona_state_values — 会话级玩家状态值（T103）

记录每个会话运行时的玩家状态值，各会话独立。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK→sessions.id CASCADE | — |
| world_id | TEXT FK→worlds.id CASCADE | — |
| field_key | TEXT | — |
| runtime_value_json | TEXT NULLABLE | LLM 自动更新的运行时值，允许为 NULL |
| updated_at | INTEGER | — |
| UNIQUE | — | (session_id, field_key) |

**值优先级**：`session runtime_value_json` > `persona_state_values.default_value_json` > `persona_state_fields.default_value`（用 COALESCE 实现）。

---

### session_character_state_values — 会话级角色状态值（T103）

记录每个会话中各角色的运行时状态值，各会话独立。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK→sessions.id CASCADE | — |
| character_id | TEXT FK→characters.id CASCADE | — |
| field_key | TEXT | — |
| runtime_value_json | TEXT NULLABLE | LLM 自动更新的运行时值，允许为 NULL |
| updated_at | INTEGER | — |
| UNIQUE | — | (session_id, character_id, field_key) |

**值优先级**：`session runtime_value_json` > `character_state_values.default_value_json` > `character_state_fields.default_value`（用 COALESCE 实现）。

**消息回滚**：删除会话消息时，同步清空该会话三张 session_*_state_values 表的数据，并删除超出轮次的 turn_records。

---

### chapter_titles — 写作章节标题

写作会话的章节标题持久化。随 session 自动 CASCADE 删除，无需注册额外 cleanup 钩子。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| session_id | TEXT FK→sessions.id CASCADE | — |
| chapter_index | INTEGER | 1-based，与前端 groupMessagesIntoChapters 保持一致 |
| title | TEXT | — |
| is_default | INTEGER | 1=占位默认（序章/续章），0=LLM/用户真实标题（默认 1） |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |
| UNIQUE | — | (session_id, chapter_index) |

- `is_default=1`：章节首次出现时的占位标题（第一章='序章'，后续='续章'），等待 LLM 生成后替换
- `is_default=0`：LLM 生成或用户手动编辑后的真实标题
- 章节边界仅由消息数决定（默认 40 条 = `CHAPTER_TURN_SIZE * 2` = 20 轮一章），单一真源 `shared/chapter-constants.mjs` 中的 `CHAPTER_TURN_SIZE`；时间间隔不再触发新章节。运行时可由 `config.chapter_turn_size` / `config.writing.chapter_turn_size` 覆盖（writing 留空继承顶层）。**注意：翻页轮数 `page_turn_size` 与分章彻底解耦，调整翻页不会重切章节**

---

### world_state_fields — 世界状态字段定义

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| world_id | TEXT FK→worlds.id CASCADE | — |
| field_key | TEXT | — |
| label | TEXT | — |
| type | TEXT | `'text'` \| `'number'` \| `'boolean'` \| `'enum'` \| `'list'` \| `'datetime'` \| `'table'` |
| description | TEXT | 给 LLM 的字段说明（默认 `''`） |
| default_value | TEXT NULLABLE | 统一以 JSON 字符串存储，读取时解析 |
| update_mode | TEXT | `'manual'` \| `'llm_auto'` \| `'system_rule'`（默认 `'manual'`） |
| enum_options | TEXT NULLABLE | JSON 字符串数组或 NULL |
| min_value | REAL NULLABLE | — |
| max_value | REAL NULLABLE | — |
| allow_empty | INTEGER | 默认 1 |
| update_instruction | TEXT | 默认 `''` |
| prefix | TEXT | datetime 字段展示前缀（如"第三纪元 "），仅前端渲染用，不参与 LLM/条件比较（默认 `''`） |
| unit | TEXT | 仅 `type='number'` 用，展示用单位（如 `元` / `万元` / `%`），最长 16 字符，不参与 LLM 写入与条件比较（默认 `''`） |
| table_columns | TEXT NULLABLE | 仅 `type='table'` 时填写：JSON 字符串，形如 `[{"key":"atk","label":"攻","min":0,"max":99}]`，`key` 须满足 `[a-zA-Z0-9_]+` 且列内唯一；其他类型必须为 NULL |
| sort_order | INTEGER | 默认 0 |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |
| UNIQUE | — | (world_id, field_key) |

---

### world_state_values — 世界状态值

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| world_id | TEXT FK→worlds.id CASCADE | — |
| field_key | TEXT | — |
| default_value_json | TEXT NULLABLE | 编辑世界页保存的默认值，允许为 NULL |
| runtime_value_json | TEXT NULLABLE | LLM 自动更新的运行时值，允许为 NULL |
| updated_at | INTEGER | — |
| UNIQUE | — | (world_id, field_key) |

---

### character_state_fields — 角色状态字段定义

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| world_id | TEXT FK→worlds.id CASCADE | — |
| field_key | TEXT | — |
| label | TEXT | — |
| type | TEXT | `'text'` \| `'number'` \| `'boolean'` \| `'enum'` \| `'list'` \| `'datetime'` \| `'table'` |
| description | TEXT | 默认 `''` |
| default_value | TEXT NULLABLE | — |
| update_mode | TEXT | `'manual'` \| `'llm_auto'` \| `'system_rule'`（默认 `'manual'`） |
| enum_options | TEXT NULLABLE | — |
| min_value | REAL NULLABLE | — |
| max_value | REAL NULLABLE | — |
| allow_empty | INTEGER | 默认 1 |
| update_instruction | TEXT | 默认 `''` |
| prefix | TEXT | datetime 字段展示前缀（如"第三纪元 "），仅前端渲染用，不参与 LLM/条件比较（默认 `''`） |
| unit | TEXT | 仅 `type='number'` 用，展示用单位（如 `元` / `万元` / `%`），最长 16 字符，不参与 LLM 写入与条件比较（默认 `''`） |
| table_columns | TEXT NULLABLE | 仅 `type='table'` 时填写：JSON 字符串，形如 `[{"key":"atk","label":"攻","min":0,"max":99}]`，`key` 须满足 `[a-zA-Z0-9_]+` 且列内唯一；其他类型必须为 NULL |
| nearby_enabled | INTEGER | 默认 1；是否允许该字段被 `session_nearby_characters`（附近 / 登场角色）引用并写入 `session_nearby_character_state_values`。0=该字段仅作用于正式角色，nearby 角色不持有；1=nearby 角色也可拥有此字段 |
| sort_order | INTEGER | 默认 0 |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |
| UNIQUE | — | (world_id, field_key) |

---

### character_state_values — 角色状态值

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| character_id | TEXT FK→characters.id CASCADE | — |
| field_key | TEXT | — |
| default_value_json | TEXT NULLABLE | 编辑角色页保存的默认值，允许为 NULL |
| runtime_value_json | TEXT NULLABLE | LLM 自动更新的运行时值，允许为 NULL |
| updated_at | INTEGER | — |
| UNIQUE | — | (character_id, field_key) |

---

### world_prompt_entries — 世界 State 条目

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| world_id | TEXT FK→worlds.id CASCADE | — |
| title | TEXT | — |
| description | TEXT | 触发条件描述（默认 `''`） |
| content | TEXT | 默认 `''` |
| keywords | TEXT NULLABLE | JSON 字符串数组或 NULL |
| keyword_scope | TEXT | 默认 `'user,assistant'`；仅对 `trigger_type='keyword'` 生效，至少一项；保存时由后端校验，空值会返回 400 |
| position | TEXT | 历史遗留列；运行时不再消费（所有命中条目统一注入 system 块）（默认 `'post'`） |
| trigger_type | TEXT | 激活方式：`'always'`（常驻）/ `'keyword'` / `'llm'`（AI召回）/ `'state'`（状态条件评估）（默认 `'always'`） |
| condition_logic | TEXT | 状态条件逻辑模式：`'AND'`（全部满足）/ `'OR'`（任一满足），默认 `'AND'`；仅对 `trigger_type='state'` 生效 |
| keyword_logic | TEXT | 关键词命中逻辑：`'AND'`（所有关键词都出现才命中）/ `'OR'`（任一关键词出现即命中），默认 `'OR'`；仅对 `trigger_type='keyword'` 生效 |
| active_turns | INTEGER | 关键词命中后持续生效的轮数：`0`=永久；`1`=仅命中当轮；`N`=命中当轮后再续 N-1 轮 carry-over（共 N 轮），默认 `1`；仅对 `trigger_type='keyword'` 生效。fresh hit 只扫"本轮"最新一条 user / assistant 消息，跨轮持续完全由该字段控制；状态持久化在 `sessions.keyword_active_state` |
| sort_order | INTEGER | 默认 0 |
| token | INTEGER | 注入顺序权重，token 越大越靠后（ASC 排序），默认 1；同 token 时按 sort_order ASC；当 trigger_type=`'always'` 时可设 0，表示进入 CACHED LAYER（system 角色，prompt cache 友好），其余 trigger_type 强制 ≥1 |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |

`trigger_type` 可选值说明：
- `always`：常驻，无条件注入
- `keyword`：关键词匹配
- `llm`：AI 预判 + 关键词兜底
- `state`：状态条件评估（依托 `entry_conditions` 关联表存储评估条件，提示词组装时同步评估）

`token=0` 仅对 `trigger_type='always'` 开放：该条目不参与 `[7]` 的命中/排序，转而拼到 cached system 消息末尾（`[3]` 之后），按 `sort_order ASC, created_at ASC` 稳定排序，是 prompt cache 的一部分。trigger_type 切换为非 always 时，token=0 会被自动归一为 1。

> 这是当前世界级提示词的唯一运行时来源。`trigger_type='always'` 的条目对应 State 页"常驻条目"。

---

### entry_conditions — 状态条目评估条件

`trigger_type='state'` 的 world_prompt_entries 条目的评估条件列表。逻辑模式由条目的 `condition_logic` 字段控制：`'AND'` 全部满足时触发，`'OR'` 任一满足时触发。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| entry_id | TEXT NOT NULL | → world_prompt_entries.id，ON DELETE CASCADE |
| target_field | TEXT NOT NULL | 形如 “世界.体力” / “玩家.精力” / “角色.心情”；当目标字段是 `type='table'` 时，使用三段格式 “世界.属性.atk”（`scope.field_key.column_key`）定位到具体一列 |
| operator | TEXT NOT NULL | `>` \| `<` \| `=` \| `>=` \| `<=` \| `!=` \| `包含` \| `等于` \| `不包含` |
| value | TEXT NOT NULL | 比较目标值 |

说明：
- 数值操作符（`>` `<` `=` `>=` `<=` `!=`）：优先以 `Number()` 转换两侧值，`Number.isFinite` 保护；若转换失败但两侧均匹配 ISO 局部时间 `YYYY-MM-DDTHH:mm`（年份为正整数、可任意位数；月/日/时/分各 2 位），则把每段（年/月/日/时/分）解析为整数后逐段数值比较（datetime 类型字段的有序比较，年份不要求等宽零填充）；其余情况跳过该条件
- 三段格式 target_field（`scope.field_key.column_key`）：要求字段 `type='table'`，从 `runtime_value_json`（对象）中按 column_key 取数，仅参与数值比较；列缺失或值非有限数 → 跳过该条件
- 文本操作符（`包含` `等于` `不包含`）：对 JSON 解析后的字符串值做字符串匹配
- 条件为空的 `state` 条目不触发（必须至少有一条 entry_conditions）
- chat 模式：`角色.xxx` 映射当前会话角色；writing 模式：写作 prompt 不再注入固定角色身份（[4]/[7] 段移除），含 `角色.xxx` 条件的条目在写作模式下不会触发（仅按 world+persona shared map 评估），nearby 角色池由副 LLM 单独维护，不参与世界 prompt 条目触发
- 级联删除：world_prompt_entries 删除时自动级联删除 entry_conditions

---

### custom_css_snippets — 自定义 CSS 片段

用于前端外观自定义。多条片段独立启用/禁用，启用项按 `sort_order` 拼接后注入 DOM 的 `<style id="we-custom-css">`。全部为全局作用，不与世界/角色绑定。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | 片段显示名 |
| enabled | INTEGER | 0: 禁用 / 1: 启用（默认 1） |
| content | TEXT | CSS 源文本，原样注入（默认 `''`） |
| sort_order | INTEGER | 默认 0 |
| mode | TEXT | T86：`'chat'` \| `'writing'`，决定片段归属的空间（默认 `'chat'`） |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |

> 前端按当前 appMode 拉取对应 `mode` 且 `enabled=1` 的条目，按 `sort_order ASC, created_at ASC` 拼接为一段 CSS 文本注入。禁用条目保留数据库中记录，不参与注入。

---

### regex_rules — 正则替换规则

对标 SillyTavern Regex 扩展的能力。每条规则按 `scope` 指定作用时机，按 `world_id` 决定作用范围（全局或仅某世界）。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | 规则显示名 |
| enabled | INTEGER | 0: 禁用 / 1: 启用（默认 1） |
| pattern | TEXT | JavaScript 正则 source（不含 / 分隔符和 flags） |
| replacement | TEXT | 替换文本，支持 $1 $2 等回引（默认 `''`） |
| flags | TEXT | 正则 flags，如 `'g'` / `'gi'` / `'gm'` / `'gim'`（默认 `'g'`） |
| scope | TEXT | 作用时机，见下文四类 |
| world_id | TEXT FK→worlds.id CASCADE NULLABLE | NULL: 全局生效；非 NULL: 仅此世界 |
| mode | TEXT | T86：全局规则（world_id IS NULL）专用，`'chat'` \| `'writing'`；世界规则忽略此字段（默认 `'chat'`） |
| sort_order | INTEGER | 默认 0 |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |

**scope 取值与作用位置**：

| scope | 作用时机 | 影响存库 | 影响显示 | 影响 LLM prompt |
|---|---|---|---|---|
| `user_input` | 前端发送前处理用户消息文本 | 是 | 是 | 是 |
| `ai_output` | 后端流式完结后、写入 `messages` 前处理 assistant 文本 | 是 | 是 | 是 |
| `display_only` | 前端渲染消息时即时处理，仅影响视觉 | 否 | 是 | 否 |
| `prompt_only` | 后端 `assembler.js` 组装 [14] 历史消息和 [16] 当前用户消息时处理，仅影响送入 LLM 的副本 | 否 | 否 | 是 |

> 当前实现会在 [14] 历史消息与 [16] 当前用户消息送入 LLM 前调用 `regex-runner.applyRules(..., 'prompt_only', worldId)`；数据库原文与前端显示不受影响。

**执行规则**：

- 同 scope 内按 `sort_order ASC` 顺序依次套用（链式），前一条结果作为后一条输入
- `world_id IS NULL` 的规则对所有世界生效；`world_id` 非空的规则仅在该世界的会话中生效，两类规则混合时仍按 `sort_order` 统一排序
- 规则无效（pattern 编译失败、flags 非法）时跳过该条并在后端日志记录，不中断整条管线
- `enabled=0` 的规则不执行，保留数据库记录

---

### internal_meta — 内部迁移元数据

仅供数据库迁移使用，记录一次性迁移是否已执行，避免重复运行破坏旧数据。

| 字段 | 类型 | 说明 |
|---|---|---|
| key | TEXT PK | 迁移键，如 migration:t59_split_state_default_and_runtime |
| value | TEXT | 当前通常为 `'1'` |
| updated_at | INTEGER | — |

- 当前用于记录如 `t56_clear_legacy_auto_filled_null_state_values`、`t59_split_state_default_and_runtime` 等迁移状态
- 不是业务层资源；不参与导出/导入，不应由前端直接读写

---

### assistant_tasks — 写卡助手任务态

写卡助手父代理的持久化任务快照。SSE 订阅者不落库；任务恢复、计划文档正文与 UI 回放均以此表为权威来源。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 任务 id，格式 `task-<uuid8>` |
| status | TEXT | `idle` \| `running` \| `awaiting_approval` \| `paused` \| `completed` \| `failed` \| `cancelled` |
| context_json | TEXT | 任务上下文 JSON（如 worldId / characterId / snapshot / extra） |
| messages_json | TEXT | 消息流数组 JSON：持久化 user / assistant 文本，以及 `tool_call` / `step` / `plan_doc` UI 记录；模型上下文只消费 user / assistant |
| pending_user_messages_json | TEXT | `running` 期间排队的用户消息数组 JSON |
| plan_doc_content | TEXT | 当前计划文档 markdown 正文；恢复后直接回填助手面板，不再依赖 `/.temp/assistant/*.md` |
| model_context_json | TEXT NULLABLE | 历史摘要上下文 JSON：`{ summary, summarizedUntilMessageId, sourceMessageCount, sourceChars }` |
| created_at | INTEGER | 创建时间（毫秒） |
| current_step_id | TEXT NULLABLE | 当前执行中的计划步骤 id |
| last_tool_failure_json | TEXT NULLABLE | 最近一次工具失败摘要：`{ toolName, error, at }` |
| last_subagent_result_json | TEXT NULLABLE | 最近一次子代理结果摘要：`{ stepId, title, ok, summary?, error?, at }` |
| approval_checkpoint_json | TEXT NULLABLE | 最近一次计划审批挂起点：`{ at, title, stepCount }` |
| loop_iteration | INTEGER | 当前/最近一次父代理 loop 的迭代计数 |
| error | TEXT NULLABLE | 失败原因、重启中断原因，或用户主动暂停原因（如拒绝计划写入 `'plan rejected by user'`，前端据此避免静默续跑） |
| updated_at | INTEGER | 最近一次持久化时间（毫秒） |

**索引**: `(status, updated_at)` — 启动恢复与诊断查询

**恢复语义**:
- 前端断线/刷新后，面板通过 `GET /api/assistant/agent/recover` 或 `GET /api/assistant/agent/:taskId` 拉本表快照，再接 `GET /api/assistant/agent/:taskId/stream` 的增量事件。
- 后端重启后，`running` / `awaiting_approval` / `paused` / 已终态任务保持原样；任务可在原 `taskId` 上继续对话，计划文档与 UI 轨迹不丢。

---

### session_stream_tasks — chat / writing 断点续传任务态

`chat` / `writing` 流式生成的 session 级快照。权威来源在后端；前端刷新、重连后先读取本表快照，再补订阅 SSE。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 任务 id，格式 `stream-<uuid8>` |
| session_id | TEXT FK→sessions.id CASCADE, UNIQUE | 一次只保留当前 session 最近的一条流任务快照 |
| mode | TEXT | `chat` \| `writing` |
| status | TEXT | `streaming` \| `postprocessing` \| `completed` \| `failed` \| `cancelled` |
| messages_json | TEXT | 本轮流开始前的消息基线 JSON；普通流恢复时与 `streaming_text` 组合，continue 恢复时与 `continuing_*` 组合 |
| streaming_text | TEXT | 普通生成 / regenerate 尚未落库的 assistant 流式正文 |
| continuing_message_id | TEXT NULLABLE | continue 场景下正在被续写的 assistant 消息 id |
| continuing_text | TEXT | continue 场景下尚未 merge 回 DB 的增量正文 |
| options_json | TEXT | 当前轮 `<next_prompt>` 解析出的选项数组 JSON |
| activated_entries_json | TEXT | 当前轮激活的非常驻 lorebook 条目数组 JSON |
| error | TEXT NULLABLE | 失败原因；后端重启中断统一写 `interrupted by restart` |
| created_at | INTEGER | 创建时间（毫秒） |
| updated_at | INTEGER | 最近一次持久化时间（毫秒） |

**索引**: `(status, updated_at)` — 恢复与诊断查询

**恢复语义**:
- 页面进入 session 后，前端调用 `GET /api/sessions/:sessionId/recover-stream` 或 `GET /api/worlds/:worldId/writing-sessions/:sessionId/recover-stream` 拉本表快照；若任务仍活跃，再接 `GET .../stream` 补订阅增量事件。
- 浏览器断线 / 刷新不会中断后端 LLM 调用；同一 session 的新流开始时会替换旧活跃流的控制器与快照。
- 后端重启后，`streaming` / `postprocessing` 统一转为 `failed + error='interrupted by restart'`，保留中断前内容供页面恢复展示和 toast 提示。

---

## 向量文件结构

### turn_summaries.json（T35）

路径：`/data/vectors/turn_summaries.json`

每轮 turn record 的摘要 embedding，用于跨会话记忆召回。结构：

```json
{
  "version": 1,
  "entries": [
    {
      "turn_record_id": "uuid",
      "session_id":     "uuid",
      "world_id":       "uuid",
      "vector":         [0.123, -0.456, ...],
      "updated_at":     1710000000000
    }
  ]
}
```

- `search(queryVector, { worldId, currentSessionId, sameSessionThreshold, crossSessionThreshold, topK })`：同 session 使用 `MEMORY_RECALL_SAME_SESSION_THRESHOLD = 0.72`，跨 session 使用 `MEMORY_RECALL_SIMILARITY_THRESHOLD = 0.84`
- session 删除时，通过 `cleanup-registrations.js` 钩子调用 `deleteBySessionId` 清理对应向量条目

---

## 全局配置文件结构

路径：`/data/config.json`

```json
{
  "version": 1,
  "provider_keys": {},                     // 顶层共享 API Key 池：{ providerName: api_key }；所有 LLM/Embedding section 共用
  "llm": {
    "provider": "openai",                  // "openai" | "anthropic" | "gemini" | "openrouter" | "glm" | "glm-coding" | "kimi" | "kimi-coding" | "minimax" | "minimax-coding" | "deepseek" | "grok" | "siliconflow" | "qwen" | "xiaomi" | "ollama" | "lmstudio"
    "base_url": "",                        // 自定义 API base URL，留空使用各 provider 默认值
    "model": "",                           // 模型名称
    "max_tokens": 4096,
    "temperature": 0.8
  },
  "embedding": {
    "provider": "openai",                  // "openai" | "ollama" | null（null 表示不启用 embedding）
    "base_url": "",
    "model": "text-embedding-3-small"
  },
  "ui": {
    "theme": "classic-parchment",          // 当前前端主题 id；默认内置主题 classic-parchment
    "font_size": 16,
    "show_thinking": true,           // 是否渲染 <think> 思维链块
    "auto_collapse_thinking": true,  // 思维链完成后是否自动折叠
    "show_token_usage": false        // 是否在每条 AI 回复底部显示 token 消耗
  },
  "context_history_rounds": 10,           // 对话历史轮次（turn records 条数）
  "chapter_turn_size": 20,                // 每章轮数（仅影响 prose 模式章节切分，不参与翻页）
  "page_turn_size": 50,                   // Pager 每页轮数（仅服务翻页条，不影响分章）
  "global_system_prompt": "",             // 对话全局 system prompt
  "global_post_prompt": "",              // 对话全局后置提示词
  "memory_expansion_enabled": true,      // 是否启用渐进展开原文（T28），false 时召回摘要仍保留
  "long_term_memory_enabled": false,     // 对话长期记忆开关：开启时摘要 LLM 抽取关键事实写入 data/long_term_memory/{sessionId}/memory.md，并在 [8.5] 段注入提示词；关闭只停止再产出与注入，已有文件保留
  "memory_recall_max_sessions": 5,       // 向量召回 topK 上限（chat / writing 共享）；前端「功能配置 -> 记忆」可调，缺省 5；非正数时回退 MEMORY_RECALL_MAX_SESSIONS 常量
  "writing": {                           // T86：写作独立配置（T86新增，缺失时由 getConfig 自动补默认值）
    "global_system_prompt": "",          // 写作全局 system prompt；覆盖对话的同名字段
    "global_post_prompt": "",            // 写作全局后置提示词
    "context_history_rounds": null,      // null = 继承对话的 context_history_rounds
    "chapter_turn_size": null,           // null = 继承对话的 chapter_turn_size
    "page_turn_size": null,              // null = 继承对话的 page_turn_size
    "memory_expansion_enabled": true,   // T144：写作是否启用记忆原文展开；独立于顶层同名字段
    "long_term_memory_enabled": false,  // 写作长期记忆开关，独立于顶层同名字段
    "llm": {                             // T170：写作主模型独立配置；provider=null 时整体回退对话主模型
      "provider": null,                  // null 时回退对话主模型；否则为 "openai" | "anthropic" | ... 等支持的 provider
      "provider_models": {},             // 各 provider 上次选择的模型记录
      "base_url": null,                  // 自定义 API base URL，留空使用各 provider 默认值
      "model": "",                       // "" = 继承对话 llm.model（仅在 provider=null 时生效）
      "temperature": null,               // null = 继承对话 llm.temperature
      "max_tokens": null                 // null = 继承对话 llm.max_tokens
    },
    "aux_llm": {                         // 写作副模型独立配置；provider=null 时按 aux_llm → llm 顺序回退
      "provider": null,                  // null 时按 aux_llm → llm 顺序回退；否则为支持的 provider
      "provider_models": {},             // 各 provider 上次选择的模型记录
      "base_url": null,                  // 自定义 API base URL，留空使用各 provider 默认值
      "model": null                      // 模型名称；与对话副模型一致，不暴露 temperature / max_tokens / thinking_level
    }
  },
  "aux_llm": {                           // T169：副模型配置，用于后台任务（摘要、状态栏、日记等），缺失时由 getConfig 自动补默认值
    "provider": null,                    // null 时回退主模型；否则为 "openai" | "anthropic" | ... 等支持的 provider
    "provider_models": {},               // 各 provider 上次选择的模型记录
    "base_url": null,                    // 自定义 API base URL，留空使用各 provider 默认值
    "model": null                        // 模型名称；副模型不暴露 temperature / max_tokens / thinking_level，使用主模型的值
  },
  "assistant": {                         // T169：写作助手模型选择
    "model_source": "main"               // "main"（主模型）| "aux"（副模型），默认 "main"
  }
}
```

> 写作主模型（writing.llm）支持独立配置 Provider / Base URL / Model + 连接测试；`provider=null` 时整体回退对话主模型 (llm)。Embedding 配置仍为对话与写作共享。

> **API Key 顶层共享池**：`provider_keys` 在配置顶层按 provider 名（如 `openai` / `anthropic`）保存一份 key，对话主/副模型、写作主/副模型、Embedding 全部按各自当前 `provider` 字段去顶层池查表。同一 provider 在不同 section 永远共用一份 key，不会重复存储。旧版本配置文件首次加载会把每段的 `provider_keys` / `api_key` 自动迁移到顶层（已存在不覆盖），随后删除原 section 内字段。

> 写作副模型（writing.aux_llm）与对话副模型（aux_llm）独立；写作模式下的后台任务（摘要、状态栏、记忆展开、日记、标题等）按 `writing.aux_llm → aux_llm → llm` 顺序回退。

> API Key 存在本地文件，不进数据库，不随 JSON 导出一起导出。导出时此字段自动清空。

## 导入导出 JSON 格式

### 主题包格式：.wetheme.json

```json
{
  "format": "worldengine-theme-v1",
  "theme": {
    "id": "classic-parchment",
    "name": "羊皮纸",
    "version": "1.0.0",
    "author": "WorldEngine",
    "description": "",
    "preview": {
      "paper": "#ede3d0",
      "accent": "#a23b2e",
      "ink": "#2a1f17"
    }
  },
  "css": ":root { --we-base-paper-100: #ede3d0; }"
}
```

约束：
- 内置主题存放在仓库根目录 `/themes/{id}/theme.json + theme.css`，只读，不允许通过 API 删除。
- 用户导入主题存放在 `/data/themes/{id}/theme.json + theme.css`，允许导入、导出、删除。
- `theme.id` 必须满足 `[a-z][a-z0-9_-]{1,63}`，主题目录名必须与 id 一致。
- 导入时必须包含 `theme.json` 等价元信息和 `css` 字符串；拒绝路径穿越、缺少必要字段、缺少 CSS、重复 id。
- CSS 按原文写入 `theme.css` 并在前端注入；推荐只覆盖 `--we-*` token，复杂样式需自行承担选择器稳定性风险。
- 仓库 `themes/_template/` 是开发模板；主题扫描会忽略 `_` 开头的目录，不会作为可选主题暴露。
- **写卡助手写入入口**：`backend/services/themes.js#applyAssistantThemeOp({ id, operation, changes })`，由 `apply_theme` 工具走 `normalizeProposal` 调用。changes 白名单：`name / version / author / description / preview / css`；`id` 不可经 changes 改名（重命名 = delete + create）。对内置主题执行 `update` 时，会先把内置整份复制到 `/data/themes/<id>/`（user 层覆盖 builtin），原 `/themes/<id>/` 不动；`delete` 仅清 user 层覆盖，对纯内置主题拒绝。激活态（`config.ui.theme`）不由助手修改。

### 角色卡格式：.wechar.json

```json
{
  "format": "worldengine-character-v1",
  "character": {
    "name": "角色名",
    "description": "",
    "system_prompt": "",
    "post_prompt": "",
    "first_message": "",
    "avatar_path": null,
    "avatar_base64": "",
    "avatar_mime": "image/png"
  },
  "prompt_entries": [
    {
      "title": "",
      "description": "",
      "content": "",
      "keywords": [],
      "keyword_scope": "user,assistant",
      "keyword_logic": "OR",
      "active_turns": 1,
      "sort_order": 0
    }
  ],
  "character_state_values": [
    {
      "field_key": "mood",
      "value_json": "\"平静\""
    }
  ]
}
```

约束：
- 不包含数据库 id、character_id、world_id、embedding_id、created_at、updated_at
- `avatar_path` 仅用于导出时指示是否有头像；若实际导出头像内容，则使用独立字段 `avatar_base64`，否则为 `null`
- `character.description` / `character.post_prompt` 为角色实体当前字段，导出导入均保留
- `character_state_values` 导出默认值层：仅导出 field_key 和 value_json，不导出运行时值，也不导出字段定义本身（定义在世界卡里）
- 导入时为角色、条目重新生成 UUID 和时间戳；state_values 的 field_key 与目标世界的字段模板对齐，key 不存在则跳过
- 不包含 API Key 等任何配置项

### 玩家卡格式：.wepersona.json

```json
{
  "format": "worldengine-persona-v1",
  "persona": {
    "name": "玩家名",
    "description": "",
    "system_prompt": "",
    "avatar_path": null,
    "avatar_base64": "",
    "avatar_mime": "image/png"
  },
  "persona_state_values": [
    {
      "field_key": "stamina",
      "value_json": "\"充沛\""
    }
  ]
}
```

约束：
- 不包含数据库 id、persona_id、world_id、created_at、updated_at
- `avatar_path` 仅用于导出时指示是否有头像；若实际导出头像内容，则使用独立字段 `avatar_base64`，否则为 `null`
- `persona_state_values` 仅导出默认值层（field_key + value_json），不导出运行时值，也不导出字段定义本身（定义在世界卡里）
- 导入时为玩家重新生成 UUID 和时间戳；state_values 的 field_key 与目标世界的玩家字段模板对齐，key 不存在则跳过
- 向下兼容：仍接受旧 `.wechar.json` 角色卡导入为玩家卡，系统会把 `character.*` 映射到 `persona.*`，并把 `character_state_values` 当作候选默认值导入
- 不包含 API Key 等任何配置项

### 世界卡格式：.weworld.json

```json
{
  "format": "worldengine-world-v1",
  "world": {
    "name": "世界名",
    "description": "",
    "cover_path": null,
    "cover_base64": "",
    "cover_mime": "image/png",
    "temperature": null,
    "max_tokens": null
  },
  "personas": [
    {
      "name": "",
      "description": "",
      "system_prompt": "",
      "avatar_path": null,
      "avatar_base64": "",
      "avatar_mime": "image/png",
      "is_active": true,
      "persona_state_values": [
        {
          "field_key": "stamina",
          "value_json": "\"充沛\""
        }
      ]
    }
  ],
  "persona_state_fields": [
    {
      "field_key": "stamina",
      "label": "体力",
      "type": "text",
      "description": "",
      "default_value": null,
      "update_mode": "llm_auto",
      "enum_options": null,
      "min_value": null,
      "max_value": null,
      "allow_empty": 1,
      "update_instruction": "",
      "prefix": "",
      "unit": "",
      "sort_order": 0
    }
  ],
  "prompt_entries": [
    {
      "title": "",
      "description": "",
      "content": "",
      "keywords": [],
      "keyword_scope": "user,assistant",
      "keyword_logic": "OR",
      "active_turns": 1,
      "sort_order": 0
    }
  ],
  "world_state_fields": [
    {
      "field_key": "date",
      "label": "当前日期",
      "type": "text",
      "description": "",
      "default_value": null,
      "update_mode": "manual",
      "enum_options": null,
      "min_value": null,
      "max_value": null,
      "allow_empty": 1,
      "update_instruction": "",
      "prefix": "",
      "unit": "",
      "sort_order": 0
    }
  ],
  "world_state_values": [
    {
      "field_key": "date",
      "value_json": "\"第三纪元第100年\""
    }
  ],
  "character_state_fields": [
    {
      "field_key": "mood",
      "label": "心情",
      "type": "text",
      "description": "",
      "default_value": null,
      "update_mode": "llm_auto",
      "enum_options": null,
      "min_value": null,
      "max_value": null,
      "allow_empty": 1,
      "update_instruction": "",
      "prefix": "",
      "unit": "",
      "sort_order": 0
    }
  ],
  "characters": [
    {
      "name": "角色名",
      "description": "",
      "system_prompt": "",
      "post_prompt": "",
      "first_message": "",
      "avatar_path": null,
      "sort_order": 0,
      "prompt_entries": [
        {
          "title": "",
          "description": "",
          "content": "",
          "keywords": [],
          "keyword_scope": "user,assistant",
          "sort_order": 0
        }
      ],
      "character_state_values": [
        {
          "field_key": "mood",
          "value_json": "\"平静\""
        }
      ]
    }
  ]
}
```

约束：
- 不包含数据库 id、world_id、character_id、embedding_id、created_at、updated_at
- `characters` 字段可为空数组
- `personas` 为数组，支持多个 persona；每项含 `name`、`description`、`system_prompt`、头像字段、`is_active`（布尔）和 `persona_state_values`（仅默认值层）；`is_active: true` 的项在导入后成为 `worlds.active_persona_id`；无 `is_active` 标记时默认激活第一项
- 向下兼容：旧格式（`persona` 单对象 + 顶层 `persona_state_values`）仍可导入，系统自动将其视为单 persona 且 `is_active: true`
- `world_state_fields`、`character_state_fields` 和 `persona_state_fields` 导出字段定义（不含 id、world_id、created_at、updated_at）
- `world_state_values`、`character_state_values` 和 `persona_state_values` 仅导出默认值层（field_key + value_json），不导出运行时值
- `world.cover_path` 仅用于导出时指示是否有封面图；若实际导出封面图内容，则使用独立字段 `cover_base64`，否则为 `null`
- `characters[].description` / `characters[].post_prompt` 与 `personas[].description` / 头像字段为当前实体字段，导出导入均保留
- 导入时世界、角色、玩家、字段定义、状态值、条目全部重新生成 UUID 和时间戳；世界新封面图与角色新头像一样，文件名使用新的 UUID
- 导入世界卡时，不导入 session、messages、session_summaries、turn_records 及所有 session_*_state_values

---

### 全局设置格式：.weglobal.json

通过 `GET /api/global-settings/export?mode=chat|writing` 导出，`POST /api/global-settings/import` 导入。chat 和 writing 两种 mode 结构略有差异。

**chat 模式**（`mode="chat"`）：

```json
{
  "format": "worldengine-global-settings-v1",
  "mode": "chat",
  "exported_at": "2026-04-22T00:00:00.000Z",
  "custom_css_snippets": [
    {
      "name": "",
      "content": "",
      "enabled": 1,
      "mode": "chat",
      "sort_order": 0
    }
  ],
  "regex_rules": [
    {
      "name": "",
      "pattern": "",
      "replacement": "",
      "scope": "display_only",
      "mode": "chat",
      "enabled": 1,
      "sort_order": 0
    }
  ],
  "config": {
    "global_system_prompt": "",
    "global_post_prompt": "",
    "context_history_rounds": 20,
    "memory_expansion_enabled": true
  }
}
```

**writing 模式**（`mode="writing"`）：

```json
{
  "format": "worldengine-global-settings-v1",
  "mode": "writing",
  "exported_at": "2026-04-22T00:00:00.000Z",
  "custom_css_snippets": [...],
  "regex_rules": [...],
  "writing": {
    "global_system_prompt": "",
    "global_post_prompt": "",
    "context_history_rounds": null,
    "llm": {
      "provider": null,
      "provider_models": {},
      "base_url": null,
      "model": "",
      "temperature": null,
      "max_tokens": null
    }
  }
}
```

导入约束：
- **覆盖模式**：先删除同 mode 下的所有 `custom_css_snippets`、`regex_rules`（world_id IS NULL），再写入
- 不含 API Key、不含世界/角色/会话数据
- `regex_rules` 的 `flags` 字段不在导出格式中，导入时回退为数据库默认值 `'g'`
- chat 模式导入后，`config` 字段覆盖 `data/config.json` 中对应键（global_system_prompt / global_post_prompt / context_history_rounds / memory_expansion_enabled）
- writing 模式导入后，`writing` 字段覆盖 `config.writing.*` 对应键
- 兼容旧格式（无 mode 字段的文件按 chat 处理）

---

## 关键约束汇总

| 约束 | 实现方式 |
|---|---|
| 级联删除 | SQLite `ON DELETE CASCADE` 外键约束，需在连接时开启 `PRAGMA foreign_keys = ON` |
| 主键格式 | 全部使用 UUID（`crypto.randomUUID()`），不用自增整数 |
| 时间戳格式 | Unix 毫秒整数（`Date.now()`），不用字符串 |
| JSON 字段 | `keywords`、`attachments` 存为 JSON 字符串，读取时在 Service 层解析，不在路由层解析 |
| 外键开启 | 每次获取 SQLite 连接后立即执行 `PRAGMA foreign_keys = ON` |
| 索引 | 只对高频查询字段建索引（已在上方标注），不过度索引 |
| 排序字段 | `characters.sort_order`、三层 `prompt_entries.sort_order` 均用于同层手动排序；默认取当前同父级最大值 + 1 |
| 导入导出字段裁剪 | 所有导入导出 JSON 均不包含数据库主键、外键、embedding_id、created_at、updated_at，也不包含任何 API Key |
