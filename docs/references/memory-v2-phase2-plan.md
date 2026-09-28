# Memory V2 第二阶段实施计划：状态记忆（State Memory）

> 状态：已定稿，待执行（2026-09-28）
> 前置：必须在 `docs/references/memory-v2-phase1-plan.md` 全部完成并合入之后执行。本文依赖第一阶段的产物：`utils/session-rounds.js`、`turn-record` 等待点、`rollbackSession` 的 `redoLatestRound`、「只允许编辑最后一条 AI 回复」。
> 来源：`~/Downloads/PRD.md` §13–§24、§30、§33、§35。
> 本文的「现状」来自对 commit `c72135d` 的代码阅读，第一阶段会改动其中一部分（已在文中注明）。执行前如发现与代码不符，以代码为准，并在本文对应处更正。

---

## 0. 一句话目标

用一套会话级的**状态记忆**，取代四张表格记忆和写作模式的附近角色池。状态记忆由五部分组成：实体目录、结构化档案、动态状态、统一关系、未完结事项。

- **写入**：并入现有的状态更新调用，一次调用同时输出用户字段补丁和状态记忆操作。
- **读取**：每轮由规则（不调模型）选出相关实体注入主模型；角色档案强制注入。

角色卡和用户自定义状态字段保持原样，不并入新体系。

---

## 1. 已拍板的决策

### 1.1 用户已确认

| # | 决策 |
|---|---|
| U1 | 范围：新建统一存储，取代四张表和附近角色池；角色卡、玩家人设、用户自定义状态字段（PRD 所说的 Runtime Variables）保持现有两层，不并入。 |
| U2 | 主角色（对话模式的角色卡、玩家人设）的身份信息以卡片为准，AI 不写。主角色和玩家只作为关系与事项的参与方出现在实体目录里，不建 AI 档案。 |
| U3 | 常开，不设开关；并入现有状态更新调用（`all-state` 任务），不新增调用。 |
| U4 | 旧数据（四张表、附近角色）按规则自动迁移，不调模型；迁移后删除旧数据和旧实现。 |
| U5 | 档案采用完整结构化形式，按 PRD：字段分可变性等级，年龄由世界日期推算。 |
| U6 | 注入哪些实体由规则判定，不调模型；删除现有「已保存角色召回」的模型判定。 |
| U7 | 角色状态字段里勾选了「对 NPC 生效」的字段，改为对**所有**角色实体生效，对话和写作两种模式都适用。 |
| U8 | 界面：新的「状态记忆」弹窗取代表格记忆弹窗，两种模式通用；写作模式侧边的附近角色栏改为显示角色实体，保留「保存（即置顶）」和「制成角色卡」。 |
| U9 | **档案字段由代码预设，用户不能增删**，只能查看和手动修改内容。可变性等级也是预设的。用户状态字段（世界、角色、玩家三层）的增删改查照旧，仍然只区分「手动」和「AI 自动更新」。 |
| U10 | **NPC「是谁」的信息（身份、外貌、穿着、性格、年龄、经历）由档案负责。**穿着作为锚定角色形象的字段放进档案（外貌组，可变性为 dynamic）。<br>新建世界不再预设 性格 / 年龄 / 外貌 / 身份 四个角色和玩家字段；「穿着」保留，但只给主角色和玩家用（`nearby_enabled=0`），因为这两者没有 AI 档案，穿着又会随剧情变化。<br>已有世界里这五个字段（按 `field_key` 识别）取消「对 NPC 生效」，NPC 身上已有的值迁移进档案。 |
| U11 | **用户同义字段优先**：某世界里存在与档案字段同义、且勾选了「对 NPC 生效」的角色字段时，该档案字段在这个世界里停用（不写、不注入、不展示）。 |
| U12 | **「对 NPC 生效」的字段里，只有「AI 自动更新」的由 AI 写**；手动字段只能由用户在界面上改。 |
| U13 | **状态栏按「谁定义的」分两组**：<br>· 「档案」：系统预设、由状态记忆管理的内容，包括预设档案字段，以及最后一小节「现状」（AI 随手记录的动态状态，标「AI 记录」，可改可删）；<br>· 「用户字段」：用户在世界里定义的状态字段。<br>世界区块同样分组：档案组是「世界事实」，用户字段组是世界状态字段（包括时间、地点、天气这类系统预设但用户可改可删的字段）。 |
| U14 | **世界层新增「世界事实」列表**：记录剧情中确立、当前仍有效的全局事实与规则（例如「北境已被黑潮会占领」「王城内禁止使用魔法」）。<br>AI 只能附证据增删单条，最多 20 条；与世界卡条目冲突时以条目为准。<br>它承接第一阶段删掉的长期记忆里「规则 / 契约 / 禁忌」这类内容。 |
| U15 | **对话模式的状态栏也显示 NPC**（在场和置顶的），与写作模式共用同一个角色区块组件。 |
| U16 | **修复世界卡导入丢失「对 NPC 生效」设置的问题**：本阶段依赖这个设置，属于必要修正。 |
| U17 | **当前时间、当前地点改由世界档案管理，所有世界都有**，不再依赖日记开关或用户是否保留了字段。<br>NPC 档案的「现状」预设一项「位置」，指向地点实体。<br>已有世界的 `diary_time`、`location` 两个用户字段，值迁进档案后删除字段。<br>条目触发条件里的 `世界.时间`、`世界.地点` 变成系统保留名，照常可用。 |
| U18 | **天气保留为用户字段**（新建世界仍然预设，可删）。 |

### 1.2 执行方按上述决定补定的实现取舍（执行时不再讨论）

| # | 决策 | 理由 |
|---|---|---|
| D1 | **存储用 SQLite 多版本行**：每行带 `valid_from_round` / `valid_to_round`。回滚到第 K 轮时，删除 `valid_from_round > K` 的行，并把 `valid_to_round > K` 的行重新设为当前有效。**不做每轮整份快照。** | 实体和关系会随会话变多，每轮存整份快照（现在表格记忆的做法）会让数据库线性膨胀。多版本行还能自然保留 PRD 要的「旧关系被取代」的历史，而且实体 ID 在回滚后保持稳定（现在附近角色回滚后会换新 ID）。 |
| D2 | **角色实体身上的用户字段值继续走现有状态快照机制**（`captureFullSnapshot` / `restoreStateFromSnapshot`），把快照里现有的 nearby 层换成 entity 层。 | 这些字段值属于用户字段体系，回滚方式与世界、角色、玩家字段保持一致。 |
| D3 | **实体在提示词里用会话内的短编号引用**（`e1`、`e2` …），数据库主键仍用 UUID。 | 节省 token，也不容易被模型抄错。 |
| D4 | **修改「不可变」和「半稳定」档案字段必须附带证据原文**：`evidence` 必须是本轮用户消息或 AI 回复里的原文片段（去掉空白后做子串比对），比对不上就拒绝写入并记日志。「不可变」字段在已有值时，还必须用专门的 `correct_profile` 操作。 | 用代码可以核验的方式落实 PRD「必须基于明确剧情证据」的要求，而不是只靠提示词约束（AC-07、AC-08）。 |
| D5 | **世界日期 = 世界档案的「当前时间」**（U17）。当前时间为空时不推算年龄，照记录原样显示「约 N 岁（记于第 R 轮）」。 | 统一日期来源，年龄推算不再依赖日记开关。 |
| D6 | **角色实体可以关联角色卡**（`card_id`）。有关联时档案以卡片为准：注入卡片的 `description`，AI 的档案写入被拒绝，只能写动态状态、关系和事项。 | 延续 U2：凡是来自卡片的角色都由卡片负责。写作模式「从角色卡添加」的角色就是这种情况。 |
| D7 | **「所属组织」不放进档案**，改用关系 `成员`（角色 → 势力）表达；档案渲染时从关系中派生显示。**角色当前位置**放在动态状态的 `位置` 键，不建成关系。 | PRD 自己把拥有物品列为派生字段；所属组织同理，避免两处各记一份。位置经常不是实体（例如「走廊」），放在动态状态更自然。 |
| D8 | **排他谓词**：谓词为 `持有者` 或 `控制者` 时，同一主体只允许有一条当前有效的关系，写入新值时自动让旧值失效。其他谓词只要求 (主体, 谓词, 客体) 不重复。 | 满足「不得保留两个互相冲突的当前关系」（PRD §19.3），又不必给所有谓词建完整的本体。 |
| D9 | **占位值由代码拦截**：值去掉空白后如果属于 `unknown / none / null / n/a / 未知 / 不明 / 暂无 / 无 / 空 / 待定 / ？`（不区分大小写）或为空串，就丢弃该操作。 | AC-09。 |
| D10 | **字段归属由代码拦截**：动态状态的键如果与该实体类型适用的用户字段 `field_key` 或 `label` 相同，就拒绝写入，并在日志里注明「字段已由用户状态字段负责」。 | AC-10。 |
| D11 | **每轮用「在场」名单标记场景**：状态写入器每轮输出本轮结束时在场的实体。这是唯一一处按轮覆盖的写入，但只是一份 ID 名单。 | 给下一轮的规则判定提供依据，不需要额外调用模型。 |
| D12 | **迁移进来的数据记为第 0 轮**（`valid_from_round = 0`），任何回滚都不会删掉。 | 旧表格快照不做逐轮转换。代价是：回滚到迁移前的某一轮时，迁移进来的数据不会跟着回退（风险里注明）。 |

---

## 2. 现状（已探索，执行时无需重复）

### 2.1 状态更新调用（`backend/memory/combined-state-updater.js`）

- 在 `all-state` 任务（p2，`tracksState`）里调用 `updateAllStates(worldId, characterIds, sessionId)`；对话模式 `characterIds = [角色卡 id]`，写作模式为 `[]`。
- **提示词**：
  - system 是 `state-update.md`，内含字段定义，作为可缓存前缀传给 `cacheableSystem`；
  - user 是 `state-update-runtime.md`，内含当前值和最近 4 条消息（分「上一轮」「本轮」）；
  - 写作模式另追加附近角色段（`nearby-state-apply.js` `appendNearbyPromptSection` → `prompts/nearby-prompt.js`）。
- **输出**：JSON，顶层键为 `world`、`char_0..n`、`persona`，写作模式另有 `nearby_characters`（数组）。
- **写入**：
  - 普通字段：`validateValue` 校验后写入 session_* 表（`applyStatePatch`，`:73`）；`table` 类型字段按列合并；
  - 超长字段：先经 `state-update-compress.js` 调模型压缩；
  - 附近角色：由 `applyNearbyResult`（`nearby-state-apply.js:144`）写入，先按 `ref_id` 匹配，再按名字匹配，都不中就新建临时角色。**本轮没提到的临时角色会被删除**（`:181-187`）。
- **首次运行**：写入基线 `sessions.state_baseline_json`（`:247-251`）。
- **真实日期模式**：写入 `diary_time`（`:254`）。本阶段改为写入世界档案的当前时间。
- **JSON 解析**：`state-update-json.js` 的 `extractJsonPatch` 负责剥掉思考块，并修复截断、尾逗号和注释。

### 2.2 四张表（`backend/services/table-memory*.js`）

- **存储**：`data/table_memory/{sessionId}/tables.json`，结构为 `{version, tables:{k:{rows,nextId}}, archive}`。
- **表与列**（写死在 `table-memory-schema.js:11-24`）：
  - `relations`：主体A、主体B、关系类型、信任/敌意、债务/承诺
  - `items`：物品、持有人/位置、类型、效果/用途、限制条件、状态
  - `places`：地点、所属势力、当前状态、危险/资源、历史标记
  - `factions`：势力、类型/性质、控制范围、核心人物、当前实力、立场
  - 每行另有 `id`、`别名`、`归档原因`。
- **写入**：独立任务 `table-memory`（p2），模型输出 `add/update/close` 操作数组，由 `applyOps` 执行（去重、按行数上限自动归档）。
- **注入**：主模型 [8.6] `<table_memory>`（`segments.js:90`）。
- **回滚**：每轮把 `tables.json` 全文存进 `turn_records.table_memory_snapshot`，回滚时整份恢复（`restoreTablesFromTurnRecord`）。
- **接口与界面**：路由 `routes/table-memory.js`（GET/PUT），前端 `TableMemoryModal.jsx`、`core/api/table-memory.js`。
- **配置**：`table_memory_enabled`、`writing.table_memory_enabled`、`table_memory_row_limits`。

### 2.3 附近角色（仅写作模式）

- **表结构**（`schema.js:89-108`）：
  - `session_nearby_characters(id, session_id, name, persona, is_saved)`，`UNIQUE(session_id, name)`；
  - `session_nearby_character_state_values(nearby_id, field_key, runtime_value_json)`。
- **适用字段**：`character_state_fields.nearby_enabled`（默认 1，`schema.js:623`）标记哪些角色字段对附近角色生效；字段编辑器里有这个开关（`frontend/src/components/state/stateFieldEditor.logic.js:33,97`）。
- **注入**（`assembler.js:429-450`，[7] `<nearby_characters>`）：
  - 临时角色：名字 + 人设 + 状态；
  - 已保存角色：只有名字 + 人设；
  - 已保存角色 ≥4 个时，先由 `saved-nearby-recall.js` 调模型挑出相关的，再注入其完整状态（[10.5] `<recalled_characters>`）；少于 4 个时全部注入。
- **服务**：`services/writing-sessions.js`，包括 `listNearby`、`addSavedFromCharacter`（从角色卡建已保存角色，人设取卡片 `description`，并复制卡片的字段默认值）、`removeNearby`、`setNearbyIsSaved`、`patchNearbyPersona`、`renameNearby`、`patchNearbyState`。
- **制成角色卡**：`services/nearby-card-maker.js`（`analyzeNearbyForCard` 调模型扩写成卡片草稿；`createCharacterFromNearby` 写入卡片）。
- **路由**：
  - `routes/writing.js:106-196`：`GET/POST /nearby`、`PATCH /nearby/:id`、`PATCH /nearby/:id/state`、`POST /nearby/:id/analyze`、`DELETE /nearby/:id`；
  - `routes/characters.js:32`：`POST /worlds/:worldId/characters/from-nearby`。
- **前端**：`WritingSpacePage/components/NearbyPanel.jsx`（446 行）、`NearbyCharacterBlock.jsx`、`AddSavedNearbyModal.jsx`、`MakeCardModal.jsx`，`core/api/session-nearby.js`，`useWritingStream.js:28`（已保存角色召回结果驱动面板自动展开）。
- **SSE**：`saved_recall_done`（`stream-parser.js`，`sessionStreamCallbacks.js` 里的 `handleSavedRecallDone`）。
- **回滚**：写作模式的状态快照带 nearby 层；恢复时整体删掉再重建，**ID 会变**（`state-rollback.js:130-144`）。
- **配置**：`writing.saved_nearby_recall_enabled`。

### 2.4 用户状态字段与角色卡

- **字段定义**：`world_state_fields`、`character_state_fields`、`persona_state_fields`，列为 `field_key, label, type, update_mode, …`；只有 `update_mode='llm_auto'` 的字段参与自动更新（`state-update-context.js:26`）。
- **会话值表**：`session_world_state_values`、`session_character_state_values`、`session_persona_state_values`。
- **角色卡**：`characters(id, world_id, name, description, system_prompt, post_prompt, first_message)`，归世界所有，会话之间共享。对话模式每轮把 `system_prompt` 注入缓存段 [4]；写作模式不注入卡片。

### 2.4a 默认字段、导入导出、状态栏、写卡助手

- **新建世界的默认字段**：`backend/utils/default-state-fields.js`，在 `services/worlds.js:93` 的 `createWorld` 中落库。
  - 世界层：`location`（地点）、`weather`（天气）；
  - 角色与玩家层（`DEFAULT_ACTOR_STATE_FIELDS`）：`personality` 性格、`age` 年龄、`appearance` 外貌、`identity` 身份（都是手动更新），以及 `outfit` 穿着（AI 自动更新）。
  - 角色字段的 `nearby_enabled` 默认都是 1。
  - 相关测试：`tests/services/worlds.test.js`、`tests/routes/state-fields-and-values.test.js`、`tests/services/state-extract.test.js`。
- **世界卡导入**：`services/import-export.js:244` 的 `insertImportedStateFields` 和 `db/queries/import-export.js:150` 的 `STATE_FIELD_COLUMNS` 都不含 `nearby_enabled`，导入后全部落为默认值 1。导出是否带上这一列，执行时确认 `parseStateFieldRow`。
- **状态栏**：`frontend/src/components/state/SessionStatePanel.jsx` 是两种模式共用的外壳，结构为：
  - 世界区块（`StateChangeCard`，内联编辑经 `patchSessionStateValue`）；
  - 下方页签：玩家 →（`extraSections` 注入的）角色 → 日记。
  - 对话模式的 `extraSections` 由 `StatePanel.jsx` 提供，只有主角色；
  - 写作模式由 `WritingSpacePage/components/NearbyPanel.jsx` 提供，每个附近角色一个区块（`NearbyCharacterBlock.jsx`），另有已保存角色列表和「从角色卡添加」。
  - 状态变化高亮来自 `useStateDiff`。
- **写卡助手**（`assistant/`）：服务端直接调用后端服务函数。
  - 字段工具：`assistant/server/workspace/fields.js:22,70,119` 暴露 `nearby` 参数，映射到 `nearby_enabled`；校验在 `server/proposal-state-ops.js:110`。
  - 参考文档：`assistant/docs/world.md` 的「状态字段放什么」一节写着「新世界自带……性格、年龄、外貌、穿着、身份」。
  - 写卡助手不接触四张表、附近角色等会话运行时数据。

### 2.4b 时间与地点的现状（U17 相关）

- **`diary_time`**：
  - 日记开启时，由 `ensureDiaryTimeField`（`backend/services/worlds.js:44`）自动创建为世界状态字段：datetime 类型，默认值 `1000-01-01T00:00`；虚拟模式下为 `llm_auto`，更新说明取 `utils/constants.js:62` 的 `DIARY_TIME_UPDATE_INSTRUCTION`；真实模式下为 `system_rule`。
  - 日记关闭时，这个字段会被删除。
  - 调用方：`createWorld`（`worlds.js:97`）、`createSession`（`services/sessions.js:49`）、路由 `POST /api/worlds/:id/sync-diary`（`routes/worlds.js:99`）；前端 `core/api/world-state-fields.js:14` 的 `syncDiaryTimeField`，在 `WorldEditPage/useWorldEditPage.js:35`、`ChatPage/hooks/useChatPageSession.js:32`、`WritingSpacePage/hooks/useWritingSpaceLifecycle.js:43` 进入页面时调用。
  - 前端专用处理：`StateFieldList.jsx:12,71`（置顶、不可排序）、`StateFieldEditor.jsx:15,37`（专用编辑界面）、`panel-utils.js:6-13`（`pinDiaryTimeFirst`，状态栏里排在第一）。
  - 数据库迁移 `schema.js:588,727-790`（旧格式转 ISO）保留不动。
- **日记读时间**：`memory/diary-generator.js:94-102` 从每轮 `turn_records.state_snapshot.world.diary_time` 取值，按相邻两轮的日期差判断是否跨日。真实模式用 `created_at`。
- **世界「地点」**：`location` 是新建世界时预设的用户字段（`default-state-fields.js:21`，text 类型，`llm_auto`），用户可以删；导入的世界卡以卡里的字段为准。
- **条目触发条件**：`prompts/entry-matcher.js:248` 的 `buildSharedStateMap` 用 `世界.<label>` / `玩家.<label>` 作键（`setStateMapRow`，`:232`）；条件的 `target_field` 存的是这个标签路径。datetime 类型支持比较和取部分（`:127-158`）。
  - 条件字段的候选来源：前端 `components/state/useEntryEditorData.js:43-58`（由三层字段标签拼成）；写卡助手 `assistant/server/proposal-entry-ops.js:34-54`（`buildWorldConditionContext`）。

### 2.5 第一阶段完成后的相关形态

- 轮后任务顺序：`all-state`(p2) → `table-memory`(p2) → `turn-record`(p2，下一轮等待点) → … 。本阶段删除 `table-memory` 任务。
- `rollbackSession(mode, sid, truncate, { redoLatestRound })`：续写和编辑最后一条 AI 回复时先回退到上一轮，再重跑轮后任务。
- `splitRounds(messages)` 给出轮号。本轮轮号 = 最后一个 round 的 `roundIndex`（`all-state` 在 `turn-record` 建行之前运行，不能用 `turn_records` 的行数来算）。

---

## 3. 目标设计

### 3.1 数据表（`backend/db/schema.js`；查询函数只能放在 `backend/db/queries/`）

所有表都带 `session_id … REFERENCES sessions(id) ON DELETE CASCADE`。凡标注「多版本」的表，都有 `valid_from_round INTEGER NOT NULL` 和 `valid_to_round INTEGER`（NULL 表示当前有效）。

```sql
-- 实体目录（多版本：改名、别名、置顶、类型、状态变化时关闭旧行、插入新行）
state_entities(
  row_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, session_id, seq INTEGER NOT NULL,
  type TEXT NOT NULL,           -- character | location | item | faction | other | player
  name TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]',
  card_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',   -- active | retired
  valid_from_round, valid_to_round)
-- 同一 entity_id 同时只有一行 valid_to_round IS NULL；seq 为会话内编号，用于提示词里的 e<seq>

-- 档案字段（多版本；一个字段一行）
state_profile_fields(row_id PK, session_id, entity_id, field_key TEXT, value_json TEXT,
  evidence TEXT, valid_from_round, valid_to_round)

-- 动态状态（多版本；一个键一行）
state_dynamic(row_id PK, session_id, entity_id, key TEXT, value TEXT, valid_from_round, valid_to_round)

-- 关系（多版本）
state_relations(row_id PK, relation_id TEXT, session_id, subject_id TEXT, predicate TEXT,
  object_id TEXT, object_value TEXT, note TEXT, valid_from_round, valid_to_round)

-- 未完结事项（多版本；resolve/fail 时关闭 active 行，插入一条 status=resolved|failed 的行）
state_threads(row_id PK, thread_id TEXT, session_id, seq INTEGER, kind TEXT,
  participants_json TEXT, content TEXT, status TEXT, opened_round INTEGER,
  valid_from_round, valid_to_round)

-- 世界档案（多版本；一个键一行，key ∈ {time, location}）
state_world_profile(row_id PK, session_id, key TEXT, value TEXT, location_entity_id TEXT,
  valid_from_round, valid_to_round)
-- time 的 value 为 ISO 局部时间 "YYYY-MM-DDTHH:mm"（年份位数不限，与现有 datetime 字段同一格式）；
-- location：能对应到地点实体时写 location_entity_id，value 同步存名字；否则只存 value 文本

-- 世界事实（多版本；remove 时关闭该行）
state_world_facts(row_id PK, fact_id TEXT, session_id, seq INTEGER, text TEXT, evidence TEXT,
  valid_from_round, valid_to_round)

-- 在场名单（每轮一行，回滚时删除 round > K 的行）
state_presence(session_id, round_index INTEGER, entity_ids_json TEXT, PRIMARY KEY(session_id, round_index))

-- 角色实体的用户字段值（走 D2 的快照机制，不做多版本）
session_entity_state_values(id PK, session_id, entity_id TEXT, field_key TEXT,
  runtime_value_json TEXT, updated_at, UNIQUE(entity_id, field_key))
```

- 索引：各表按 `(session_id, valid_to_round)` 建索引；`state_entities` 另建 `(session_id, entity_id)`。
- 查询约定：「当前」= `valid_to_round IS NULL`。
- 写入函数统一为 `closeAndInsert(table, key, newRow, round)`：
  - 旧行的 `valid_from_round` 等于本轮时，直接原地更新（同一轮内多次修改不产生多个版本）；
  - 否则把旧行的 `valid_to_round` 设为本轮，再插入新行。
- 所有写入放在一个事务里（沿用 `db/queries/session-state-batch.js` 的 `withSessionStateTransaction`）。

**回滚** `rollbackStateMemory(sessionId, keptRounds)`：

- 对每张多版本表，先 `DELETE WHERE valid_from_round > K`，再 `UPDATE SET valid_to_round = NULL WHERE valid_to_round > K`。
- `state_presence` 删除 `round_index > K` 的行。
- 被删掉的实体如果在 `session_entity_state_values` 里还有值，一并删除。

### 3.2 实体类型与档案字段

角色（`character`）的档案字段见下表。字段键是英文，渲染时显示中文标签。

| 分组 | field_key | 中文 | 类型 | 可变性 |
|---|---|---|---|---|
| 身份 | `gender` | 性别 | text | immutable |
| | `birth_date` | 出生日期 | text（世界日期 `YYYY-MM-DD`，年份位数不限） | immutable |
| | `age_recorded` | 记录年龄 | `{age:number, as_of_date?:string, as_of_round:number}` | semi_stable |
| | `species` | 种族 | text | immutable |
| | `origin` | 出身 | text | immutable |
| | `occupation` | 职业 | text | semi_stable |
| | `social_identity` | 社会身份 | list | semi_stable |
| 外貌 | `height` `build` `hair` `eyes` | 身高 / 体型 / 发型 / 眼睛 | text | semi_stable |
| | `distinguishing_features` | 显著特征 | list | semi_stable |
| | `outfit` | 穿着 | list | dynamic（档案里唯一的 dynamic 字段：换装即改，不需要证据） |
| 人格 | `core_traits` | 核心性格 | list | semi_stable（高门槛，见 §3.4） |
| | `behavioral_patterns` | 行为习惯 | list | semi_stable |
| | `values` | 价值观 | list | semi_stable（高门槛） |
| | `speech_style` | 说话方式 | list | semi_stable |
| 背景 | `background` | 经历 | list（只能追加） | semi_stable |
| 派生 | `age` | 年龄 | 不存储 | derived（§3.5） |
| 派生 | 所属组织 / 持有物品 | — | 不存储 | derived，由关系 `成员`、`持有者` 聚合得出 |

其他实体类型只有少量字段，全部为 semi_stable：

- `location`：`category`（类别）、`description`（概述）、`features`（特征，list）
- `item`：`category`、`description`、`effects`（效果，list）、`limits`（限制，list）
- `faction`（涵盖组织、门派、公司、群组等一切「一群人组成的集体」）：`category`、`description`、`scope`（范围）
- `other`：`description`
- `player`：不建档案。

文本字段不超过 60 字，list 每项不超过 30 字、最多 10 项。

**同义字段停用（U11）**

- 每个档案字段的定义带一组 `synonyms`（中英文标签），例如：
  - `occupation`：职业、工作、身份、identity
  - `core_traits`：性格、个性、personality
  - `age_recorded`：年龄、age
  - `distinguishing_features` / `height` / `build` / `hair` / `eyes`：外貌、appearance（任一匹配时，外貌组全部停用）
  - `outfit`：穿着、服装、衣着、outfit
  - `gender`：性别、gender
  - `species`：种族、species
- 函数 `resolveActiveProfileFields(worldId, entityType)`：
  - 读取该世界 `nearby_enabled=1` 的角色字段，用 `label` 和 `field_key`（去掉 `_char` 后缀）与同义词做完全匹配；
  - 命中的档案字段在该世界停用。
  - 写入、注入、状态栏展示和状态记忆弹窗都用这个函数的结果。
- 已有世界迁移后，四个默认字段已取消「对 NPC 生效」（§5.8 第零步），不会触发停用。

**世界档案（U17）**

- `time` 当前时间：dynamic，每轮随剧情推进，不需要证据。提示词里的推进规则沿用 `DIARY_TIME_UPDATE_INSTRUCTION`，把「每轮必须更新」改为「有时间流逝时推进，不得回退」。真实日期模式下由系统写入，AI 的写入被丢弃。
- `location` 当前地点：dynamic，场景切换时更新，值为地点实体引用或文字。写入时如果解析到地点实体，就存它的 ID；没有对应实体又是一个明确的地名时，自动建一个 location 实体。
- 两者初始值都为空，不预设 `1000-01-01T00:00` 这类占位值。用户可以在状态栏手动设定。

**NPC 位置（U17）**

- 角色实体「现状」里预设键 `位置`，值为地点实体引用或文字，写入方式和世界当前地点相同。
- 它是预设键，不是 AI 随手起的键名：AI 写 `set_state key=位置` 时，走地点解析逻辑。
- 状态栏的「现状」小节里，它总是排在第一。

**世界事实（U14）**

- 每条不超过 60 字，当前有效的最多 20 条（`STATE_WORLD_FACTS_MAX`）。
- 只记剧情中新确立或改变的全局事实、规则、禁忌、契约，不复述世界卡已有设定。
- 关于某个具体地点或组织的事实，优先写进该实体的档案或动态状态，不放在这里。所有定义放在新文件 `backend/memory/state-memory-schema.js`，作为单一来源供提示词、校验、渲染、界面使用；前端经接口 `GET /api/state-memory/schema` 获取，不在前端重复定义。

`player` 实体与主角色实体：会话第一次运行状态写入时，自动为玩家（名字取人设名）和对话模式的主角色（`card_id` 指向卡片）建好实体，模型可以直接用它们作为关系和事项的参与方。

### 3.3 写入：并入状态更新调用

在 `state-update.md`（system，可缓存）里增加一节**状态记忆规则**。规则静态不变，所以不破坏缓存前缀。内容按 PRD §4.5、§4.7、§4.8、§21、§23 改写：

- 只记录「现在仍然成立」的事，只发生过一次的事件不写；
- 本轮无变化就返回空操作列表；
- 归属判断顺序：用户字段 → 档案 → 动态状态 → 关系 → 未完结事项 → 不写；
- 修改档案要附证据原文，不得推测，不得写占位值。

在 `state-update-runtime.md`（user）里追加两节：

1. **实体目录**：`e<seq>｜类型｜名字｜别名`，全部当前有效实体，在 `STATE_DIRECTORY_BUDGET`（3000 token，从新到旧截取）以内。用于防止重复建实体。
2. **世界事实**：当前全部条目，格式为 `f<seq>｜内容`。
3. **相关实体详情**：按 §3.6 相同规则选出的实体，给出档案、动态状态、用户字段当前值、以及涉及它们的关系和进行中事项（带 `r<n>` / `t<seq>` 编号）。

输出 JSON 增加两个顶层键，写作模式的 `nearby_characters` 删除：

```json
{
  "world": {}, "char_0": {}, "persona": {},
  "entity_fields": { "e3": { "favor": 60 } },
  "memory": [
    {"op":"create_entity","type":"character","name":"沈彦","aliases":["沈先生"],
     "profile":{"gender":"男","occupation":"前海军军官"},"evidence":"……原文……"},
    {"op":"update_profile","entity":"e3","field":"occupation","value":"海关顾问","evidence":"……"},
    {"op":"list_add","entity":"e3","field":"distinguishing_features","items":["左眉旧伤疤"],"evidence":"……"},
    {"op":"list_remove","entity":"e3","field":"social_identity","items":["通缉犯"],"evidence":"……"},
    {"op":"correct_profile","entity":"e3","field":"gender","value":"女","evidence":"……"},
    {"op":"rename","entity":"e3","name":"沈砚","evidence":"……"},
    {"op":"add_alias","entity":"e3","alias":"老沈"},
    {"op":"set_state","entity":"e3","key":"伤势","value":"右臂受伤"},
    {"op":"clear_state","entity":"e3","key":"伤势"},
    {"op":"upsert_relation","subject":"e7","predicate":"持有者","object":"e3","note":""},
    {"op":"retire_relation","relation":"r12"},
    {"op":"open_thread","kind":"承诺","participants":["e1","e3"],"content":"林乔承诺三日内归还账本"},
    {"op":"update_thread","thread":"t4","content":"……"},
    {"op":"resolve_thread","thread":"t4","outcome":"resolved"},
    {"op":"retire_entity","entity":"e9","reason":"已死亡"},
    {"op":"set_world","key":"time","value":"1000-03-16T08:00"},
    {"op":"set_world","key":"location","value":"e5"},
    {"op":"add_fact","text":"王城内禁止使用魔法","evidence":"……"},
    {"op":"remove_fact","fact":"f2","evidence":"……"},
    {"op":"set_present","entities":["e1","e3","e7"]}
  ]
}
```

操作的执行规则（新文件 `backend/memory/state-memory-apply.js`，写成纯函数加一次事务提交，便于测试）：

- **引用解析**：`entity` / `subject` / `object` 可以是 `e<seq>`、完全匹配的名字或别名、或本批 `create_entity` 里的名字。解析不到就丢弃该操作并记日志。
- **`create_entity`**：名字或别名和已有实体重名时，转成对已有实体的档案更新，不新建。`profile` 里每个字段都按 §3.4 校验。
- **`card_id` 不为空的实体**：拒绝一切档案类操作（D6），唯一例外是 `outfit`。
- **`upsert_relation`**：`object` 解析不到实体时存为 `object_value` 文本；排他谓词按 D8 处理。
- **`kind` 取值**：承诺 / 任务 / 债务 / 冲突 / 谜团 / 威胁 / 计划 / 目标，其他值丢弃。
- **`retire_entity`**：把实体标为 `retired`，同时关闭它参与的关系；它参与的事项不自动关闭。
- **占位值和字段归属**：按 D9、D10 拦截。D10 里「该实体适用的用户字段」的范围是：
  - NPC：`nearby_enabled=1` 的角色字段；
  - 对话模式主角色：全部角色字段；
  - 地点、物品、组织：无。
- **停用的档案字段**（§3.2 同义字段停用）：相关操作一律丢弃。
- **`set_world`**：
  - `time` 必须能被 `parseWorldDate` 解析，且不早于当前值（回退要走手动编辑）；
  - `location` 按上面的地点解析规则处理；
  - 两者都不需要证据。
- **`add_fact` / `remove_fact`**：
  - 两者都要证据（§3.4 的核验方法）；
  - 当前已满 20 条时，`add_fact` 只有在同一批里先有 `remove_fact` 时才接受；
  - 与已有事实去掉空白后完全相同的，丢弃。
  - 提示词里的世界事实用 `f<seq>` 引用。
- **`entity_fields`**：只接受同时满足以下条件的字段：
  - 目标是角色实体，且不是 `player`、也不是对话模式的主角色（主角色的字段仍然走 `char_0`）；
  - 字段 `update_mode='llm_auto'` 且 `nearby_enabled=1`（U12；现有附近角色不区分手动还是自动，这里是行为变化）。

  经 `validateValue` 校验后写入 `session_entity_state_values`。
- **超长处理**：文本超长时截断到上限，不再调用压缩模型；`state-update-compress.js` 的压缩只保留给用户字段使用。
- **失败处理**：`memory` 不是数组时整体忽略；单条操作失败不影响其他操作；整批在同一事务内提交。模型调用失败时，本轮状态记忆不变（沿用现有 `all-state` 的失败语义）。

### 3.4 可变性与证据

| 可变性 | 字段为空时 | 字段已有值时 |
|---|---|---|
| immutable | 可以直接写入（`create_entity` / `update_profile`），需要 `evidence` | 只能用 `correct_profile`，需要 `evidence`，并记 warn 日志 |
| semi_stable | 可以直接写入，需要 `evidence` | `update_profile` / `list_add` / `list_remove`，需要 `evidence` |
| 高门槛（`core_traits`、`values`） | 同上 | 每轮每个字段最多一个 `list_add` 或 `list_remove`，不允许 `update_profile` 整体替换 |
| `background` | 只能 `list_add` | 只能 `list_add` |
| dynamic（动态状态，以及档案字段 `outfit`） | 不需要证据 | 不需要证据；`outfit` 可用 `update_profile` 整体替换，也可用 `list_add` / `list_remove` |

`evidence` 的核验方法：去掉所有空白后，必须是本轮「用户消息 + AI 回复」拼接文本（同样去掉空白）的子串，长度 4~80 字符。证据存进档案行的 `evidence` 列，界面上可以查看。

### 3.5 年龄推算

新文件 `backend/utils/world-date.js`：

- `parseWorldDate(str)`：接受 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm`，年份位数不限；
- `yearsBetween(from, to)`：计算相隔的整年数。

当前世界日期取世界档案的当前时间（D5、U17）。推算规则：

- 有 `birth_date` 且有世界日期：年龄 = 两者相隔的整年数；
- 否则，有 `age_recorded.as_of_date` 且有世界日期：`age + (世界日期 − as_of_date)` 的整年数；
- 都不满足：显示「约 {age} 岁（记于第 {as_of_round} 轮）」。

写入 `age_recorded` 时，如果当时有世界日期，自动把它填为 `as_of_date`。

### 3.6 注入主模型

新文件 `backend/memory/state-memory-render.js`。

**选取规则**（`selectRelevantEntities(sessionId)`，不调用模型），按优先级排列：

1. 上一轮 `state_presence` 里的实体；
2. 当前用户消息和上一条 AI 回复里出现了名字或别名的实体（名字、别名至少 2 个字，按从长到短匹配）；
3. `pinned = 1` 的实体；
4. 与 1~3 中的角色有关的进行中事项的其他参与方，以及 1~3 中角色当前持有的物品。
5. 世界当前地点对应的地点实体，以及「位置」指向这个地点的角色实体。这些实体的优先级排在 1 和 2 之间。

`player` 实体不注入（玩家信息已在人设段里）。对话模式的主角色只注入动态状态、关系和事项（档案已由卡片注入）。

世界档案总是注入，放在 `<story_state>` 开头：先是一行「时间：……｜地点：……」，然后是【世界事实】一节。这部分不受选取规则影响，也不参与预算裁剪。

**渲染**：新段落 `<story_state>`，位置在 [7]。对话模式放在 `<char_state>` 之后；写作模式取代 `<nearby_characters>`。同时删除 [8.6] `<table_memory>` 和 [10.5] `<recalled_characters>`。示例：

```
<story_state hint="以下是当前场景相关人物与事物的既定设定和现状。人物的身份、外貌、性格、说话方式必须与此一致；列出不代表必须登场。">
【沈彦】别名：沈先生｜在场
身份：男，34 岁，人类，出身北海渔村，前海军军官；社会身份：退役军人
外貌：约 185cm，瘦高，黑色短发，深棕色眼睛；显著特征：左眉旧伤疤
穿着：黑色风衣、旧军靴
性格：克制、多疑、责任感强；习惯：危险时先观察出口；说话：用词简短，很少用感叹句
经历：曾服役北海舰队；三年前因事故退役
所属：黑潮会（成员）｜持有：银戒指
现状：位置=旧港仓库；伤势=右臂受伤
字段：好感=60
【旧港仓库】地点｜概述：……｜现状：……
关系：黑潮会 —控制者→ 旧港
进行中：［承诺］林乔承诺三日内归还账本（林乔、沈彦，第 184 轮起）
</story_state>
```

**预算**：`state_injection_token_budget`（默认 3000，用 `countTokens` 估算）。按 PRD §24.3 的优先级依次放入：

1. 在场角色的完整档案；
2. 当前地点和直接交互的对象；
3. 角色的动态状态；
4. 直接关系；
5. 进行中事项；
6. 其他实体。

超出预算时从末尾删。**角色档案的身份组（性别、年龄、种族、职业）和说话方式永远保留**，即使因此超出预算。

**写作模式的名字约束**：沿用现有提示「叙述中若涉及这些人物，必须沿用其既定名字」。

### 3.7 回滚接入

- 在 `rollbackSession`（第一阶段版本）里，删多余的 `turn_records` 之后调用 `rollbackStateMemory(sessionId, keptRounds)`。原来恢复表格的那一行删除。
- 在 `state-rollback.js` 里，`captureFullSnapshot` 的 nearby 层换成 `entityValues: {entity_id: {field_key: json}}`，对话和写作两种模式都要采集。`restoreStateFromSnapshot` 在恢复时：先清掉本会话所有 `session_entity_state_values`，再写入快照里、且实体仍然存在的那些值。
- 旧快照里的 `nearby` 层在恢复时忽略。这类快照没有 entity 层，所以不动实体字段值。
- 第 0 轮（首轮之前）的手动编辑记为第 0 轮，重新生成第 1 轮时不会被删除。首轮前的基线 `state_baseline_json` 同样要包含 entity 层。

### 3.8 手动编辑（界面与接口）

- 手动编辑记在「当前最新一轮」，轮号 = `splitRounds` 的最后一轮，还没有轮次时为 0。所以：
  - 重新生成下一轮时，编辑会保留；
  - 重做当前轮（续写、编辑最后一条回复）时，编辑会丢失。这和现有状态快照的行为一致。
- 手动编辑不做证据校验，不受可变性限制，并在 `evidence` 列写 `'手动编辑'`。

### 3.9 状态栏布局（U13、U15）

新建共用组件 `frontend/src/components/state/EntityStateBlock.jsx`，对话和写作两种模式都用它渲染角色区块。

**世界区块**
- 档案组：
  - 当前时间：可编辑，沿用现有 datetime 编辑控件 `DatetimeSplitInput`；
  - 当前地点：可编辑，可以从地点实体里选，也可以直接输入文字；
  - 世界事实：逐条列出，显示「第 N 轮」，可以手动新增或删除。
- 用户字段组：世界状态字段，现有的 `StateChangeCard` 不变，但不再有 `diary_time` 置顶的特殊处理。

**页签**
1. 玩家：只有用户字段组（玩家字段）。
2. 主角色（仅对话模式）：
   - 档案组只有一行提示「身份信息以角色卡为准」，附跳转到卡片编辑的入口；下面是「现状」小节，列主角色实体的 AI 动态状态；
   - 用户字段组：角色字段。
3. NPC 页签（两种模式都有）：「在场 + 置顶」的角色实体各一个页签。
   - 顺序：在场的在前，其余按置顶先后排列；
   - 写作模式另保留「从角色卡添加」的全局操作；
   - 页签右侧操作：置顶或取消置顶、制成角色卡、删除。
4. 日记。

**NPC 区块内容**
- **档案组**：
  - 按身份、外貌（含穿着）、人格、经历四组显示当前世界启用的档案字段，空字段不显示；
  - 「不可变」字段带锁形标记；悬停显示证据原文和写入轮次；
  - 点击可内联编辑（走 `PATCH /state-memory/entities/:id`）；
  - 年龄显示推算值，编辑时改的是 `age_recorded` 或 `birth_date`；
  - 所属组织和持有物品从关系推算，只读显示；
  - 关联了角色卡的实体，档案组改为显示卡片 `description` 的摘要，只读；「穿着」和「现状」仍照常显示，因为 D6 不拒绝 dynamic 写入，所以 `outfit` 对卡片角色也允许 AI 写；
  - 最后一小节「现状」：AI 动态状态键值，标「AI 记录」，可编辑可删除。
- **用户字段组**：`nearby_enabled=1` 的角色字段值（可编辑，走 `PATCH /entities/:id/fields/:fieldKey`）。

**变化高亮**：`useStateDiff` 扩展到实体档案和动态状态，本轮有变化的行高亮，和现有字段一致。

**分工**：状态栏只显示「在场 + 置顶」的实体。完整实体列表、离场或已退场的实体、关系、事项，在状态记忆弹窗里查看。

---

## 4. 配置项

| 键 | 默认 | 范围 | 说明 |
|---|---|---|---|
| `state_injection_token_budget` | 3000 | 500~50000 | 新增，全局，两种模式共用 |
| 删除 | — | — | `table_memory_enabled`、`writing.table_memory_enabled`、`table_memory_row_limits`、`writing.saved_nearby_recall_enabled` |

常量（`backend/utils/constants.js`）：

- 新增：`STATE_WORLD_FACTS_MAX=20`、`STATE_DIRECTORY_BUDGET=3000`、`STATE_TEXT_FIELD_MAX=60`、`STATE_LIST_ITEM_MAX=30`、`STATE_LIST_MAX_ITEMS=10`（已有同名常量时直接复用）、`STATE_EVIDENCE_MIN=4`、`STATE_EVIDENCE_MAX=80`、`STATE_NAME_MATCH_MIN=2`。
- 状态更新调用的 `LLM_STATE_UPDATE_MAX_TOKENS` 需要评估：输出多了操作列表，按实测把上限调大。

`services/config.js` 的旧键清理，沿用第一阶段 §5.10 的写法。

---

## 5. 实施步骤

### 5.1 schema 与查询

- 按 §3.1 建表，并新增 `db/queries/state-memory.js`，包含：
  - 当前视图读取：`listCurrentEntities`、`getEntityDetails(ids)`、`listCurrentRelations(entityIds)`、`listActiveThreads(entityIds)`、`getLatestPresence`；
  - 写入：`closeAndInsert` 各表版本；
  - 回滚：`rollbackStateMemory`；
  - 取号：`nextEntitySeq` / `nextThreadSeq`。
- 新增 `db/queries/session-entity-state-values.js`。
- 为多版本规则写单元测试：同一轮内多次修改只改原行；跨轮修改关闭旧行；回滚到 K 后当前视图与第 K 轮时一致。

### 5.2 档案定义、日期、校验

- 新增 `memory/state-memory-schema.js`，写入 §3.2 的字段表、可变性、同义词，以及 `resolveActiveProfileFields`。
- **默认字段（U10）**：`utils/default-state-fields.js` 的 `DEFAULT_ACTOR_STATE_FIELDS` 只保留 `outfit`，并在 `createWorld` 落库角色层时设 `nearby_enabled: 0`（玩家层没有这一列）。同步更新该文件头注释和 §2.4a 列出的三个测试。
- **导入修复（U16）**：
  - `db/queries/import-export.js` 的 `STATE_FIELD_COLUMNS` 加上 `nearby_enabled`（只对 character 表生效；如果列定义是三张表共用，就按 kind 区分）；
  - `services/import-export.js` 的 `insertImportedStateFields` 写入 `field.nearby_enabled ?? 1`；
  - 确认导出包含这一列；
  - 在 `tests/services/import-export-roundtrip.test.js` 补一条往返用例。
- 新增 `utils/world-date.js`，写入 §3.5 的推算规则并配单元测试（覆盖年份位数不限、跨年、缺少世界日期的情况）。
- 新增路由 `GET /api/state-memory/schema`。
- **时间与地点（U17）**：
  - **删除 `diary_time` 同步机制**：删 `ensureDiaryTimeField` 及其三个调用方、`POST /api/worlds/:id/sync-diary` 路由、前端 `syncDiaryTimeField` 及其三个调用方，以及 `StateFieldList` / `StateFieldEditor` / `panel-utils` 里的 `diary_time` 专用分支。`DIARY_TIME_FIELD_KEY`、`DIARY_TIME_DESCRIPTION` 常量删除；`DIARY_TIME_UPDATE_INSTRUCTION` 改名为 `WORLD_TIME_UPDATE_RULE`，挪进状态记忆规则。
  - **预设字段**：`DEFAULT_WORLD_STATE_FIELDS` 删掉 `location`，只保留 `weather`（U18）。
  - **日记**：`diary-generator.js` 按轮次读取当时的世界时间：新增查询 `getWorldProfileAtRound(sessionId, 'time', round)`，条件为 `valid_from_round <= R AND (valid_to_round IS NULL OR valid_to_round > R)`，取代 `extractDiaryTimeFromSnapshot`。日记的开关和日期模式（`sessions.diary_date_mode`）不变。
  - **真实日期模式**：`combined-state-updater.js:254` 改为写入世界档案的 `time`，记在本轮。
  - **条目触发条件**：
    - `buildSharedStateMap` 增加两个保留键 `世界.时间`、`世界.地点`，值取世界档案。时间照常支持 datetime 的比较和取部分；地点取名字。
    - 用户字段标签如果和保留名冲突（例如某个世界自己另建了「时间」字段），以世界档案为准，并记 warn 日志。
    - 前端 `useEntryEditorData.js` 和写卡助手 `proposal-entry-ops.js` 的条件候选里，固定加上这两个保留名，类型分别为 datetime 和 text。
    - 在世界状态字段里新建标签为「时间」或「地点」的字段时，后端返回 400「该名称已由系统管理」。前端字段编辑器同步提示，写卡助手的字段工具同样拒绝。

### 5.3 写入器

- 新增 `memory/state-memory-apply.js`，写入 §3.3、§3.4 的规则。纯函数部分单独测试：引用解析、重名转更新、证据核验、占位值拦截、字段归属拦截、排他谓词、卡片角色拒写。
- 改 `combined-state-updater.js`：
  - 在 `buildEntityStateSections` 之后追加实体目录和相关实体详情两节；
  - `writeStatePatch` 里把 `applyNearbyResult` 换成 `applyStateMemoryOps` 和 `applyEntityFields`；
  - 首次运行时建好玩家和主角色实体（§3.2）。
- 改 `state-update.md` 和 `state-update-runtime.md`：追加规则节、目录节和输出格式；删掉 nearby 相关内容。
- 删除 `memory/nearby-state-apply.js`、`prompts/nearby-prompt.js` 及其测试。

### 5.4 注入

- 新增 `memory/state-memory-render.js`，写入 §3.6 的选取、渲染和预算规则。
- 改 `prompts/assembler.js`：
  - 对话模式在 [7] 之后插入 `<story_state>`；
  - 写作模式用 `<story_state>` 取代 `<nearby_characters>`；
  - 删除 [8.6] 和 [10.5]；
  - 删除 `buildWritingMemorySections` 里的已保存角色召回，只保留展开召回；
  - 更新文件头的锁定顺序注释。
- 改 `segments.js`：删 `renderTableMemorySection`，新增 `renderStoryStateSection`。
- 删除 `memory/saved-nearby-recall.js`、模板 `saved-nearby-recall-system.md` / `saved-nearby-recall-user.md`，以及 `recall.js` 里的 `renderTransientNearby`、`renderSavedNearbyIndex`、`renderRecalledSavedNearby`、`renderNearbyBlock`。
- 更新 golden snapshot 和 shape 测试。

### 5.5 回滚

- 按 §3.7 改 `rollback-session.js`、`state-rollback.js`、`combined-state-updater.js`（基线采集）。
- 回归测试（对应 AC-12、AC-13）：
  - 第 N 轮建了实体、改了关系、关闭了一个事项，重新生成第 N 轮后三者都回到第 N-1 轮的样子；
  - 删除消息后，只由被删轮次产生的实体和关系消失；
  - 实体 ID 在回滚前后保持不变。

### 5.6 接口

- 新路由 `routes/state-memory.js`，前缀 `/api/sessions/:sessionId/state-memory`：
  - `GET /`：返回当前实体（含档案、动态状态、字段值、派生年龄）、关系、事项；
  - `POST /entities`：手动新建实体；
  - `PATCH /entities/:entityId`：改名字、别名、置顶、档案字段、动态状态；
  - `DELETE /entities/:entityId`：执行 `retire_entity`；
  - `PATCH /entities/:entityId/fields/:fieldKey`：改用户字段值；
  - `POST /entities/from-card`：body `{ character_id }`，建立关联卡片的已置顶角色实体，并复制卡片的字段默认值，取代 `addSavedFromCharacter`；
  - `POST /entities/:entityId/analyze`：制成角色卡的草稿，取代 nearby analyze；
  - 关系：`POST /relations`、`DELETE /relations/:relationId`；
  - 事项：`POST /threads`、`PATCH /threads/:threadId`（改内容或状态）；
  - 世界事实：`POST /facts`、`DELETE /facts/:factId`；
  - `GET /` 的返回里加上 `facts`、每个实体的 `activeProfileFields`（§3.2 停用规则的结果），以及 `presentIds`（最新在场名单），供状态栏使用。
- `routes/characters.js` 的 `from-nearby` 改为 `from-entity`：body 从 `nearby_id` 改为 `entity_id`；建卡后把实体的 `card_id` 设为新卡片。`services/nearby-card-maker.js` 改名为 `entity-card-maker.js`，人设来源从 `persona` 改为档案渲染文本。
- 删除 `routes/writing.js:106-196` 的 nearby 路由、`routes/table-memory.js`，以及 `services/writing-sessions.js` 里的 nearby 函数。
- `routes/session-state-values.js:82` 的注释和返回值随 nearby 下线同步调整。

### 5.7 前端

所有 `fetch` 只能放在 `frontend/src/core/api/`。

- **接口层**：新增 `core/api/state-memory.js`；删除 `core/api/table-memory.js`、`core/api/session-nearby.js`。
- **状态记忆弹窗**：新增 `components/session/StateMemoryModal.jsx`，取代 `TableMemoryModal.jsx`，分三个页签：
  - **实体**：按类型分组的列表，可搜索；详情里用结构化表单编辑档案（按 schema 接口渲染，显示可变性标记和证据）、动态状态键值、用户字段值；支持置顶和删除；
  - **关系**：列表，可新增或删除；
  - **事项**：进行中和已结束两组，可修改状态。
- **入口按钮**：保留在 `InputBox` / `InputBoxToolbar` 现在「表格记忆」的位置，改名为「状态记忆」，不再依赖开关。
- **状态栏**：按 §3.9 新建 `EntityStateBlock.jsx`，改造 `SessionStatePanel.jsx`（世界区块加世界事实组）、`StatePanel.jsx`（对话模式加 NPC 页签，主角色页签加 AI 动态状态）。
- **写作模式侧栏**：`NearbyPanel.jsx` 改为显示「在场 + 置顶」的角色实体。
  - 用 `EntityStateBlock` 取代 `NearbyCharacterBlock`，并删除后者；
  - 「保存」对应置顶；
  - `AddSavedNearbyModal` 改为「从角色卡添加」，调用 `from-card`；
  - `MakeCardModal` 改为调用 analyze 和 `from-entity`；
  - 自动展开的依据从 `saved_recall_done` 改为 `state_updated` 之后重新拉取的在场名单。
- **SSE 与流处理**：删除 `saved_recall_done` 相关代码（`stream-parser.js`、`sessionStreamCallbacks.js`、`useWritingStream.js`）。
- **设置页**：删除「表格记忆」开关、「行数上限」和「已保存角色召回」开关，新增「状态注入预算」。
- **字段编辑器**：「对附近角色生效」改名为「对 NPC 生效」，提示改为：
  「对话与写作中由 AI 记录的角色都会带上这个字段；只有设为 AI 自动更新时才由 AI 填写。NPC 的身份、外貌、穿着、性格、年龄已由档案自动记录，不必为此建字段。」
  - 勾选的字段与某个档案字段同义时，在字段旁提示「该字段将取代 NPC 档案中的『xx』」。
- **写卡助手同步**：
  - `assistant/docs/world.md` 的「状态字段放什么」一节：
    - 默认字段改为「世界层 天气；玩家与角色层 穿着（只对主角色和玩家生效）」，并补一句：「当前时间、当前地点由系统管理，不要建同名字段；条件里用 `世界.时间`、`世界.地点` 引用」；
    - 增加规则：「NPC 的身份、外貌、性格、年龄、经历由状态记忆自动建档，不要为 NPC 建这类字段」；
    - 增加规则：「`nearby`（对 NPC 生效）只用于好感、信任这类数值或规则变量；NPC 的身份、外貌、穿着、性格由档案负责，新建这类字段时设 `nearby: false`」。
  - `assistant/docs/world-setting.md:72`「会随剧情变化的时间、地点、天气等填进世界状态字段的 `default`」改成：「开场时间、开场地点写进开场白或条目，由系统记入世界档案；天气等其他会变的量填进世界状态字段的 `default`」。
  - `assistant/server/workspace/fields.js` 中 `nearby` 参数的说明（如有工具描述）改成「对 AI 记录的 NPC 生效，对话和写作两种模式都适用」。
  - 写卡助手不新增状态记忆相关的工具。
  - 跑 `npm run test:assistant`。
- **截图**：按项目规则更新 `docs/images/` 中的设置页、对话页（状态记忆弹窗）、写作页（侧栏）。

### 5.8 旧数据迁移（一次性，按 `internal_meta` 标记只执行一次，写法参照 `schema.js:667` 和 `:734`）

新文件 `backend/services/state-memory-migration.js`，在 `server.js` 的 `initSchema()` 之后调用。对每个会话，写入的行都记为第 0 轮（D12）。

**第零步 A：时间与地点（U17）**

- 对每个会话：
  - 取会话的 `diary_time` 值；会话里没有值时用字段默认值，但默认值 `1000-01-01T00:00` 视为空；
  - 取会话的 `location` 值（按 `field_key='location'` 识别）。
  - 两者写入 `state_world_profile`，记为第 0 轮。地点能匹配到已迁移的地点实体时，关联到该实体。
- 对每个世界：删除 `field_key` 为 `diary_time` 和 `location` 的世界状态字段，以及它们的全部取值。
  - 删除前，把引用了这两个字段标签的 `entry_conditions.target_field` 改写成保留名 `世界.时间` / `世界.地点`。
  - 用户改过标签的，按原标签匹配后改写。
- 历史轮次快照里的 `diary_time` 不回填到多版本表。日记在迁移前的轮次上取不到日期时，按现有逻辑跳过。
- 这一步要排在第二步（四张表迁移）之后执行，才能关联到地点实体。

**第零步：已有世界的默认字段（U10）**

- 所有世界的 `character_state_fields` 中，`field_key ∈ {personality, age, appearance, identity, outfit}`（含 `_char` 后缀的写法）的行设为 `nearby_enabled = 0`。
- 字段本身和主角色身上的值不动。

**第一步里的附加映射**：附近角色身上这五个字段的值转入档案，不转入 `session_entity_state_values`：
- `outfit` → `outfit`
- `personality` → `core_traits`
- `age` → `age_recorded`（`as_of_round = 0`）
- `appearance` → `distinguishing_features`
- `identity` → `social_identity`

list 截断到 10 项，每项截断到 30 字。

**第一步：附近角色 → 角色实体**

- `is_saved=1` 转成置顶实体。
- 人设 `persona` 放进档案的 `background` 第一项。它无法可靠拆进结构化字段，以后由 AI 在有证据时补全。
- 字段值转入 `session_entity_state_values`。

**第二步：四张表 → 实体、关系、事项**（只迁移当前行，归档行 `archive` 丢弃）

名字匹配时同时查名字和 `别名`；匹配不到就新建对应类型的实体。

- `relations`：
  - 主体 A、B → 角色实体；
  - `关系类型` → 关系谓词，A→B；
  - `信任/敌意` → 该关系的 `note`；
  - `债务/承诺` 不为空 → 一条 `承诺` 类事项，参与方为 A、B。
- `items`：
  - `物品` → item 实体；`类型` → `category`；`效果/用途` → `effects`；`限制条件` → `limits`；
  - `持有人/位置`：能匹配到实体时建 `持有者` 关系，否则写入动态状态 `位置`；
  - `状态` → 动态状态 `状态`。
- `places`：
  - `地点` → location 实体；
  - `所属势力`：能匹配到实体时建 `控制者` 关系（地点 → 势力）；匹配不到就新建 faction 实体再建关系；
  - `当前状态` → 动态状态 `状态`；`危险/资源` → `features`；`历史标记` → `description`。
- `factions`：
  - `势力` → faction 实体；`类型/性质` → `category`；`控制范围` → `scope`；
  - `核心人物`：按「、，,」拆分，每个名字匹配或新建角色实体，建 `成员` 关系；
  - `当前实力` → 动态状态 `实力`；`立场` → 动态状态 `立场`。
- 所有表的 `别名` 列 → 对应实体的 `aliases`。

**第三步：清理旧数据**

- 删除旧表 `session_nearby_characters`、`session_nearby_character_state_values`；
- 删除 `turn_records.table_memory_snapshot` 列；
- 删除 `data/table_memory/` 目录。
- 数据库部分在同一事务内完成，失败时整体回滚，本次启动报错退出，不留半迁移状态；删除 `data/table_memory/` 目录放在事务提交之后执行。

测试：准备一份包含四张表各类行、附近角色（已保存和临时两种）、字段值的旧库和旧文件，迁移后逐项核对。再验证迁移重复执行时不会做第二次。

### 5.9 清理旧实现（最后一步）

删除以下文件及其测试：

- 后端：`services/table-memory.js`、`table-memory-ops.js`、`table-memory-schema.js`，模板 `memory-table-update.md`，`db/queries/session-nearby-characters.js`、`session-nearby-character-state-values.js`；
- 前端：`TableMemoryModal.jsx` 及其测试。

轮后任务：删除 `build-turn-postgen-tasks.js` 里的 `table-memory` 任务和 `mode.postgen.tableMemoryEnabled`，以及 `turn-summarizer.js` 里的表格快照回填。`hooks/README.md` 的任务标签列表同步更新。

`cleanup-registrations.js`：删除 table memory 目录的清理注册。

残留检查：在 `backend/`、`frontend/src/`、`assistant/`、`hooks/`、`shared/`、`scripts/` 里搜索下列关键词，结果应为零（迁移代码除外，本文档除外）：

```
table_memory  table-memory  tableMemory  TableMemory  TABLE_SCHEMAS  applyOps
nearby（字段名 nearby_enabled 与界面文案「NPC」相关代码除外）  NearbyPanel 内部旧 API 调用
saved_nearby_recall  saved-nearby-recall  savedRecall  recalled_characters  nearby_characters
session_nearby  is_saved  addSavedFromCharacter
```

- `assistant/`（写卡助手）如有引用 `table_memory_*` 配置或 nearby 接口，同步移除，只能经 `frontend/src/core/features/assistant/` 接入。
- 运行 `npm run check:guards`，报「基线虚挂」时用 `--update-baseline` 刷新并一起提交。

---

## 6. 验收（对应 PRD 条目）

后端自动化测试使用 mock provider（`backend/llm/providers/mock/`）构造模型输出。

| PRD | 测试要点 |
|---|---|
| AC-05 / AC-08 | 角色第 1 轮建档（性别男、职业军官），之后 100 轮没有出现；第 101 轮用户消息提到其别名，`<story_state>` 里档案完整，身份组齐全 |
| AC-06 | 有 `birth_date`，世界日期推进十年后，渲染出的年龄加 10；没有世界日期时显示「记于第 R 轮」 |
| AC-07 | 模型输出 `update_profile core_traits=["温柔"]` 被拒绝；`list_add` 在证据核验通过时生效，但每轮只接受一条 |
| AC-09 | 连续 50 轮的 mock 输出都是占位值或空操作，数据库里没有新增任何行 |
| AC-10 | 世界里定义了 `favor` 字段，`set_state key=好感`（与字段 label 相同）被拒绝；`entity_fields` 路径可以正常写入 |
| AC-11 | 势力控制地点、角色持有物品、角色结盟都用同一张关系表表达；物品换手时旧的 `持有者` 关系自动失效 |
| AC-12 / AC-13 | 见 §5.5 |
| D4 | 证据不是原文子串时拒绝；`immutable` 字段有值时只有 `correct_profile` 能修改 |
| D6 | 关联卡片的实体拒绝档案写入，只接受状态、关系、事项 |
| §3.6 | 预算极小时身份组仍然保留；名字少于 2 个字的实体不参与匹配；玩家实体不注入 |
| §5.8 | 迁移结果逐项正确；重复执行不会重复迁移；迁移失败时事务回滚，不留下部分数据 |
| U10 | 新建世界的角色和玩家字段只有「穿着」，且角色层 `nearby_enabled=0`；迁移后旧世界五个默认字段 `nearby_enabled=0`，NPC 的对应值出现在档案里；关联卡片的实体可写 `outfit`、不可写其他档案字段 |
| U11 | 世界里有勾选「对 NPC 生效」的「职业」字段时，`occupation` 不出现在提示词 schema、注入内容和接口返回里，相关操作被丢弃 |
| U12 | 「对 NPC 生效」但手动更新的字段，`entity_fields` 写入被丢弃 |
| U14 | 世界事实：证据不符时拒绝；满 20 条时单独的 `add_fact` 被拒绝，先 remove 后 add 可以接受；回滚后世界事实回到目标轮；每轮都注入 |
| U16 | 世界卡导出再导入后，`nearby_enabled=0` 保持不变 |
| U17 | 没开日记的世界也有当前时间，年龄可以推算；时间回退的 `set_world` 被拒绝；`世界.时间 > X` 的条件照常触发；迁移后旧条件的 `target_field` 被改写并照常生效；日记按世界档案的时间正确判断跨日；回滚后时间和地点回到目标轮；在世界字段里新建「时间」被拒绝 |

人工冒烟（`agent-browser`）：

- 对话和写作各跑 20 轮以上，并引入 3 个以上 NPC，检查状态记忆弹窗、侧栏和注入内容；
- 在界面上编辑档案、置顶、删除，再重新生成，确认结果符合 §3.8；
- 用一个带旧表格和附近角色数据的数据目录启动，确认迁移结果。

运行：`npm run test:backend`、`npm run test:frontend`、`npm run lint`、`npm run check:guards`。

---

## 7. 本阶段明确不做

- 主角色和玩家的 AI 档案（U2）。
- 跨会话共享实体，或把实体自动回写到角色卡（只有用户手动「制成角色卡」这一条路径）。
- 用模型判定场景实体（U6）。
- 逐轮转换旧表格快照（D12）。
- 实体数量上限和自动归档：不设上限，实体只能由模型的 `retire_entity` 或用户删除来退场；注入量由预算控制，目录量由 `STATE_DIRECTORY_BUDGET` 控制。

## 8. 已知风险

- **状态更新调用的提示词变长**：新增规则节、目录节和详情节，输出也更长。弱辅助模型的 JSON 出错率可能上升，本地小上下文模型可能放不下。两个预算（目录、注入）要在真实会话里调。
- **证据核验可能误拒**：模型改写原文会导致核验失败，档案补全会偏慢。这是有意的取舍（宁缺毋滥），日志里记录拒绝次数，便于调整提示词。
- **世界时间依赖 AI 推进**：AI 推进得不准，年龄推算和日记跨日判断都会跟着偏。用户可以在状态栏手动校正。
- **迁移出的档案较粗**：附近角色的人设整段放进 `background`，表格列按规则映射，可能出现语义不够贴切的情况，需要 AI 在后续轮次里逐步补全。
- **迁移数据不跟回滚**：回滚到迁移前的某一轮时，迁移进来的数据仍然保留（D12）。
- **名字匹配会误判**：常见词作名字（例如「老板」）会被频繁匹配。缓解手段：最小匹配长度，加上注入预算封顶。
