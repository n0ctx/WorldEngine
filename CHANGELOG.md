# Changelog

> 每次任务完成后，在最上方追加一条记录。这是项目的"记忆"，给自己和 AI 看。  
> 新开对话时让 Claude Code 先读此文件，了解项目现状。

## 2026-04-24 清理废弃条目表：彻底移除 global_prompt_entries / character_prompt_entries

- **背景**：两张表在 prompt 组装中已弃用（运行时不消费），残留代码造成误导
- **DB**：`schema.js` 删除两张表的 `CREATE TABLE IF NOT EXISTS`，添加 `migrateDropLegacyEntryTables` 迁移（启动时 DROP TABLE IF EXISTS），同步删除相关 ALTER TABLE 迁移和索引
- **DB Queries**：`db/queries/prompt-entries.js` 删除 `createGlobalEntry`/`getGlobalEntryById`/`getAllGlobalEntries`/`updateGlobalEntry`/`deleteGlobalEntry`/`reorderGlobalEntries` 及对应角色条目 CRUD
- **Import/Export**：角色卡导出 `prompt_entries: []`（不再读 character_prompt_entries）；导入忽略 `prompt_entries` 字段（不写 character_prompt_entries）；全局设置导出不含 `global_prompt_entries`；导入不清写该表
- **Assistant**：`routes.js` 移除 `global-config` entryOps 处理；`card-preview.js` 移除 `existingGlobalEntries`
- **测试**：import-export 测试、prompt-entries query 测试、fixtures 全部同步清理
- **文档**：SCHEMA.md / ARCHITECTURE.md 移除两张废表相关描述和导出格式中的 `global_prompt_entries` 字段

## 2026-04-24 状态字段更新方式简化：移除 trigger_mode/keyword_based，新增状态栏内联编辑

- **背景**：`update_mode` + `trigger_mode` 两个维度冗余，用户体验复杂；统一收敛为一维：`manual`（手动）/ `llm_auto`（每轮更新）
- **后端 DB 查询**：`world-state-fields` / `character-state-fields` / `persona-state-fields` 三张表的 `createXxx` / `updateXxx` 停止读写 `trigger_mode` / `trigger_keywords`（列保留，依靠 DB 默认值）；`session-state-values.js` 所有 SELECT 加 `update_mode`，角色查询加 `character_id`
- **combined-state-updater.js**：`filterActive(fields)` 简化为仅检查 `update_mode === 'llm_auto'`，删除 `recentText` 构建和 keyword_based 分支，删除 `PROMPT_ENTRY_SCAN_WINDOW` 引用
- **routes/session-state-values.js**：新增 3 个 PATCH 端点（`world-state-values/:fieldKey` / `persona-state-values/:fieldKey` / `character-state-values/:characterId/:fieldKey`），复用已有 upsert 函数，支持手动更新单个会话状态值
- **StateFieldEditor.jsx**：移除 TRIGGER_MODE_OPTIONS / system_rule 选项 / 触发关键词 tag 输入；update_mode 改为二选一 Select
- **StatusSection.jsx**：新增 `onSave(fieldKey, valueJson, characterId?)` prop；`update_mode='manual'` 的字段值点击进入内联编辑（InlineEditor 组件），支持 text/number/enum/list/boolean 所有类型，blur/Enter 保存，Esc 取消
- **session-state-values.js（API）**：新增 `patchSessionStateValue(sessionId, category, fieldKey, valueJson, characterId?)`
- **StatePanel / CastPanel**：接入 `onSave` 并乐观更新本地 stateData；CharacterBlock 加 `handleSave`

## 2026-04-24 写卡助手全面覆盖 CRUD 功能

- **背景**：审查发现写卡助手存在 7 处与系统实际功能的覆盖缺口，统一补全
- **A. main.md 提示词注入顺序修正**：删除过时的 [8] 触发器段落，[9]-[12] 前移为 [8]-[11]；补充 trigger_type:"state" 和 position 废弃说明
- **B. entryOps token 字段同步**：`normalizeEntryOps()` 传递 `token` 字段；world-card.md 和 CONTRACT.md entryOps schema 补充 token 说明
- **C. stateFieldOps update op**：`normalizeStateFieldOps()` 支持 `update` op；`applyStateFieldUpdate()` 函数路由到对应 service；routes.js 导入 update 函数；CONTRACT.md、world-card/character-card/persona-card 提示词补充 update 格式
- **D. CSS 片段和正则规则 update/delete**：`PROPOSAL_ALLOWED_OPERATIONS` 放开 create/update/delete；`applyProposal` 处理 update/delete 分支；card-preview.js 支持 `css-snippet`/`regex-rule` 预研目标；agent 定义补充 entityId 参数；提示词补充操作说明；CONTRACT.md 更新
- **E. 全局 Prompt 条目（entryOps for global-config）**：`normalizeProposal` 为 global-config 启用 `entryOps` 解析（includeMode=true）；`applyProposal` global-config 分支处理 entryOps create/update/delete；card-preview 全局预研加入 existingGlobalEntries；global-prompt.md 补充 entryOps 章节，删除禁止输出说明
- **F. trigger_type:"state" + entry_conditions**：`normalizeEntryOps` 允许 `allowTriggerType=true` 解析 trigger_type 和 conditions；`applyProposal` world-card 分支在创建/更新 state 类型条目后调用 `replaceEntryConditions`；world-card.md 补充 state 类型和 conditions 格式；CONTRACT.md 补充
- **G. 多 persona 支持（persona-card create）**：`PROPOSAL_ALLOWED_OPERATIONS` 加入 create；`applyProposal` persona-card 分支处理 create；persona-card agent 定义和 persona-card.md 补充 create 说明

## 2026-04-24 条目新增 token 顺序权重字段

- **需求**：给所有条目类型（global/world/character）统一增加 `token` 属性（正整数，默认 1），注入时按 token ASC 排序（token 越大越靠后）；同 token 时保持 sort_order ASC 手动顺序
- **schema.js**：追加 3 条 `ALTER TABLE ... ADD COLUMN token INTEGER NOT NULL DEFAULT 1`，覆盖三张条目表
- **queries/prompt-entries.js**：`createGlobalEntry`/`createWorldEntry`/`createCharacterEntry` INSERT 加 `token` 列；对应 `updateXxxEntry` 的 `allowed` 数组均加 `'token'`
- **assembler.js**：`buildPrompt` 和 `buildWritingPrompt` 的 [7] 段改为 filter+sort+map 链式写法，按 `token ASC` 排序已触发条目后再拼文本
- **routes/prompt-entries.js**：POST 路由解构加 `token`
- **services/import-export.js**：4 处导出 SELECT 加 `token` 字段；4 处导入 INSERT（world/character/global）加 `token` 列及参数
- **EntryEditor.jsx**：form state 加 `token: 1`；handleSave 的 data 加 `token`；新增"顺序权重"数字输入框（min=1），位于标题与内容之间
- **SCHEMA.md**：三张条目表字段定义均加 `token` 说明

## 2026-04-24 删除条目注入位置（position）配置

- **背景**：`world_prompt_entries.position` 原区分 `system`（注入 [7]）/ `post`（注入 [11]）两个位置，但二者最终都合并进同一条 system 消息，区别仅是顺序，无实际意义
- **assembler.js**：`buildPrompt` 和 `buildWritingPrompt` 均移除 `systemEntryTexts`/`postEntryTexts` 拆分逻辑，所有命中条目统一收入 `entryTexts`，注入 [7]（system 块）；`postParts` 只保留 `global_post_prompt` + `character.post_prompt`
- **queries/prompt-entries.js**：`createWorldEntry` INSERT 语句移除 `position` 列；`updateWorldEntry` allowed 列表移除 `position`
- **前端 EntryEditor.jsx**：删除 `POSITION_OPTIONS`、`form.position` 状态、注入位置 select UI
- **前端 EntrySection.jsx**：删除显示位置 badge（`'系统提示词' / '后置提示词'`）
- **DB 列保留**：`world_prompt_entries.position` 列不做 DROP，存量数据保留但运行时不再读取；SCHEMA.md 注释标注为"历史遗留列"

## 2026-04-24 触发器动作瘦身：删除 inject_prompt 注入和 notify 前端通知

- **背景**：触发器原有三种动作类型 `activate_entry`、`inject_prompt`、`notify`，其中 inject_prompt 在提示词组装 [8] 段注入文本，notify 通过 SSE `trigger_fired` 事件向前端发 toast
- **删除 inject_prompt**：`assembler.js` 移除 [8] inject_prompt 段（含 consumed 模式倒计时逻辑），`triggers.js` 移除 `getActiveInjectPromptActions` 和 `updateActionParams` 函数；提示词段号从 14 段缩为 13 段，后续段号 [9]-[12] 均前移一位
- **删除 notify**：`trigger-evaluator.js` 移除 `notify` case 和 `notifications` 返回值；`chat.js`/`writing.js` trigger-eval task 去掉 `sseEvent`/`ssePayload`/`keepSseAlive=true`；前端 `stream-parser.js` 移除 `trigger_fired` 处理；`ChatPage`/`WritingSpacePage` 移除 `showTriggerNotifications` 函数和 `onTriggerFired` 回调
- **TriggerEditor**：`ACTION_TYPES` 只保留 `activate_entry`；移除 `inject_prompt`/`notify` UI 和 `INJECT_MODES` 常量；`emptyAction()` 默认改为 `activate_entry`
- **文档同步**：`ARCHITECTURE.md` §4 提示词段号表更新（删 [8]，后续段号前移）；§7 SSE 表删除 `trigger_fired` 行；`SCHEMA.md` `trigger_actions.action_type` 注释只保留 `activate_entry`
- **注意**：数据库表结构不变，存量 `inject_prompt`/`notify` 动作记录保留但不再被执行（trigger-evaluator 遇到未知 action_type 仅 warn）

## 2026-04-24 WorldConfigPage — 三栏配置页重组

- 将 WorldBuildPage（构建页）和 WorldStatePage（状态页）合并为 WorldConfigPage（配置页），路由 `/worlds/:worldId/config`
- 新增 VisualizationPanel 中间可视化总览：条目概况卡 + 触发器→条目折叠关系列表（点击展开，显示关联条目名称和类型）
- TopBar 世界标签精简为「故事·配置」两个，删除「构建」入口
- 旧路由 `/build` 和 `/state` 均重定向到 `/config`（使用 RedirectToConfig 辅助组件）
- 不改任何后端接口；EntrySection、TriggerCard、TriggerEditor 组件零改动
- 删除死代码：WorldBuildPage.jsx、WorldStatePage.jsx、world-tabs.js

## T231 — feat: 角色卡和玩家卡新增简介字段 ✅

- **背景**：世界卡已有 `description` 简介字段（纯展示，不注入提示词），角色卡和玩家卡缺少同等字段
- **DB**：`characters` 表和 `personas` 表各新增 `description TEXT NOT NULL DEFAULT ''`；schema.js 补充 ALTER TABLE 迁移（try-catch 幂等）
- **后端**：characters queries INSERT/allowedFields 补充 description；personas queries INSERT/updatePersonaById 补充 description；personas 路由三处解构补充 description 透传
- **前端**：CharacterEditPage / PersonaEditPage 各新增 `description` state + "简介"表单字段（`we-textarea`，hint="纯展示用途，不注入提示词"）；CharacterEditPage 草稿缓存同步加入 description
- **卡片展示**：CharactersPage 角色卡和玩家卡改为展示 `description`（原来是 `system_prompt`），空值显示"暂无简介"
- **SCHEMA.md**：同步更新 characters / personas 表字段定义

## T230 — feat(ui): CharactersPage 玩家/角色双栏重构 + 多玩家卡支持 ✅

- **背景**：原页面只支持单个 persona，且 persona 与角色卡在同一个线性布局中，操作入口分散
- **Schema 变更**：`personas.world_id` 移除 UNIQUE 约束（迁移：`migration:personas_multi_per_world`）；`worlds` 表新增 `active_persona_id TEXT`（NULL 时回退到最早 persona）
- **后端新路由**：`GET/POST /api/worlds/:worldId/personas`、`DELETE /api/personas/:id`、`PATCH /api/worlds/:worldId/personas/:id/activate`、`GET/PATCH /api/personas/:id`、`POST /api/personas/:personaId/avatar`；原 `GET/PATCH /api/worlds/:worldId/persona` 保留兼容
- **前端布局**：CharactersPage 改为左 1/3 玩家卡列表 + 右 2/3 角色卡列表；新建/导入按钮移至各自栏底部；原 header actions 移除
- **PersonaCard**：废弃 `components/state/PersonaCard.jsx`，在 CharactersPage 内联实现；激活卡有左边框 + 徽标 + `personaActivate` 动效
- **PersonaEditPage**：支持 `/worlds/:worldId/personas/new` 和 `/worlds/:worldId/personas/:personaId/edit` 路由，new 模式走创建流程
- **WritingSpacePage**：优先读 `store.currentPersonaId`（从玩家卡点击传入），fallback 到 active persona
- **Store**：新增 `currentPersonaId` + `setCurrentPersonaId`
- **SCHEMA.md**：同步更新 personas 表描述

## T229 — refactor(assistant): 写卡助手全面对齐当前运行时架构 ✅
- **背景**：T206（条目系统收口）、T222（后置提示词改注入 system）、T223（段号重排）之后，写卡助手的 prompts、executor 和接口契约与运行时实现产生严重偏差，部分功能静默失效。
- **变更1（代码）**：`routes.js` — `normalizeWorldChanges` 移除 system_prompt/post_prompt；`normalizeProposal` character-card/global-config 分支删除 entryOps 处理；`applyProposal` world-card create/update 移除对死字段的写入
- **变更2（代码）**：`card-preview.js` — 删除 `getAllCharacterEntries`/`getAllGlobalEntries` 导入及调用；character-card/global-prompt 预览不再返回 existingEntries
- **变更3（agent desc）**：`world-card.js` description 说明世界内容通过 entryOps 常驻条目管理；`character-card.js` description 移除 entryOps 提及
- **变更4（prompts）**：`main.md` 注入顺序表更新为正确的 14 段；`world-card.md` 世界内容改走 entryOps always 常驻条目；`character-card.md` 完整删除 entryOps；`global-prompt.md` 完整删除 entryOps
- **变更5（契约）**：`CONTRACT.md` character-card/global-config 移除 entryOps，world-card.changes 移除 system_prompt/post_prompt，§5 补充 trigger_type/position 字段文档
- **涉及文件**：`assistant/server/routes.js`、`assistant/server/tools/card-preview.js`、`assistant/server/agents/world-card.js`、`assistant/server/agents/character-card.js`、`assistant/prompts/main.md`、`assistant/prompts/world-card.md`、`assistant/prompts/character-card.md`、`assistant/prompts/global-prompt.md`、`assistant/CONTRACT.md`、`assistant/tests/routes.test.js`、`assistant/tests/routes-integration.test.js`、`assistant/tests/tools/card-preview.test.js`
- **验证**：`node --test assistant/tests/routes.test.js assistant/tests/routes-integration.test.js assistant/tests/tools/card-preview.test.js`，全部 20/20 通过。

## T228 — feat: diary_time 格式新增必填"分"字段 ✅
- **变更**：`DIARY_TIME_UPDATE_INSTRUCTION` 格式改为 `N年N月N日N时N分`；`default_value` 改为 `1000年1月1日0时0分`；`formatRealTimeDiaryStr` 补入 `getMinutes()`；前端 `parseDiaryTimeDefault` 解析新增第 5 捕获组（分），兼容旧格式（无分则 minute=0）；日记时间编辑器 grid 改为 5 列，新增分输入框。
- **涉及文件**：`backend/utils/constants.js`、`backend/services/worlds.js`、`backend/memory/combined-state-updater.js`、`frontend/src/components/state/StateFieldEditor.jsx`、`backend/tests/memory/diary-generator.test.js`
- **向前兼容**：`VIRTUAL_DATE_RE` 不含 `分` 捕获，日记跨日检测（年月日）不受影响；旧格式值仍能被正确解析。
- **验证**：`node --test tests/memory/diary-generator.test.js tests/services/worlds.test.js` 通过（19/19）。

## T227 — fix: 状态更新 LLM 无法读取会话级运行时值，导致状态永不更新 ✅
- **根本原因**：`combined-state-updater.js` 写入用 `upsertSessionXxxStateValue`（写 `session_*_state_values` 会话隔离表），但读取时用 `getAllXxxStateValues`（读全局 `xxx_state_values` 表）。LLM 每轮看到的 `runtime_value` 永远是全局表的值（通常为 null/"未设置"），看不到自己上一轮写入的会话值，导致所有状态字段（包括 `diary_time`）永远无法累积更新。
- **修复1**：新增 `mergeSessionValues(globalMap, sessionMap)` 辅助函数，将全局默认值 Map 与会话级运行时值合并：`defaultValueJson` 来自全局，`runtimeValueJson` 优先取会话值。
- **修复2**：三处 `buildFieldsDesc(activeFields, buildValueMap(getAll...))` 全部改为先读会话值、合并后再传入：世界/角色/玩家状态均修复。
- **修复3**：`DIARY_TIME_UPDATE_INSTRUCTION` 补充"每轮必须更新，在当前运行时值基础上推进，不得重复上一轮的值"语义，防止 LLM 因通用规则跳过时间推进。
- **涉及文件**：`backend/memory/combined-state-updater.js`、`backend/utils/constants.js`
- **验证**：重启后端，触发多轮对话，`all-state` 日志应显示 `diary_time` 每轮写入不同时间值；状态面板中角色/世界状态应随剧情累积变化。

## T226 — fix: 状态更新 LLM 输入改为上轮/本轮标注 + diary_time 内置描述 ✅
- **问题1**：状态更新 LLM 只收到平铺的最近 10 条消息，无法区分"已处理的历史"和"本轮新发生的事"，导致重复触发旧内容对应的状态更新。
- **修复1**：`combined-state-updater.js` 对话构造逻辑改为取最近 4 条（2 轮），以`【上一轮（仅供背景参考）】`和`【本轮（请据此判断状态变化）】`两段分别打标签，明确时序边界。
- **问题2**：`state-update.md` prompt 只说"根据对话内容更新状态"，未引导 LLM 聚焦增量变化。
- **修复2**：prompt 首条要求改为"只根据【本轮】判断变化；【上一轮】仅供背景参考，不要因上一轮内容重新触发"。
- **问题3**：`diary_time` 字段创建时没有内置 `description`，LLM 只能看到 label='时间' 和 update_instruction，缺乏字段用途说明。
- **修复3**：`constants.js` 新增 `DIARY_TIME_DESCRIPTION`；`ensureDiaryTimeField` 创建时写入 description，更新分支也检查并补齐 description。
- **涉及文件**：`backend/utils/constants.js`、`backend/services/worlds.js`、`backend/memory/combined-state-updater.js`、`backend/prompts/templates/state-update.md`
- **验证**：重启后端，触发对话，观察 `all-state` 日志中 prompt 内容包含`【本轮】`标签；状态更新应只反映本轮新内容。

## T225 — fix: 状态栏更新被 thinking tokens 截断导致 JSON 残缺或为空 ✅
- **根本原因**：Gemini flash 系列模型中，`thinkingBudget`（1024 tokens）与 `maxOutputTokens` 共用同一个 token 配额。state updater 的 `maxTokens=1000` 比 thinking budget 还小，thinking 直接吃掉全部配额，导致 JSON 输出被截断（`chars=68`、`chars=263`）甚至为空（`len=0`）。state updater 是纯结构化 JSON 输出任务，完全不需要 thinking。
- **修复1（根因）**：`llm/index.js` 的 `buildLLMConfig` 改用 `hasOwnProperty` 检测，使调用方可以传 `thinking_level: null` 显式禁用 thinking（原来 `??` 运算符无法覆盖 null）。`combined-state-updater.js` 在 `llm.complete()` 调用中明确传入 `thinking_level: null`。
- **修复2（兜底）**：新增 `repairTruncatedJson(text)` 函数作为 JSON.parse 失败时的补全 fallback；regex 匹配补充无尾 `}` 时的分支。
- **涉及文件**：`backend/llm/index.js`、`backend/memory/combined-state-updater.js`
- **验证**：重启后端，触发对话，观察 `all-state COMPLETE START` 日志中 `thinking=null`（不再显示 `budget_low`）；状态栏应稳定更新，不再出现 `JSON PARSE FAIL` 或 `len=0`。

## T224 — uiux-vibe: 全站视觉统一性 & 交互合理性审计修复 ✅
- **范围**：14 tasks · 3 Milestones，覆盖 token 合规、可达性、交互状态、视觉一致性
- **Milestone 1（Token & CSS）**：tokens.css 新增 `--we-z-spine/action/panel` 三个 z-index token；index.css / chat.css / ui.css / pages.css 中 17 处裸数字 z-index 全部迁移至 token 变量；12 处 `outline: none` 均补充 `:focus-visible` 焦点环替代，修复键盘可达性
- **Milestone 2（JSX 组件 Token 合规）**：ChatPage / WritingSpacePage Toast 错误色由 `bg-red-500` 改为 `--we-color-status-danger`；StateFieldList / settings 组件 / WritingPageLeft 中 11 处旧别名（`--we-ink-*` / `--we-paper-*` / `--we-gold-leaf`）迁移至新语义色；Sidebar / StateFieldList / settings 组件 13 处 `.5` 单位间距全部修正为 4px 倍数；StateFieldList 删除确认弹窗 z-index 改用 `--we-z-modal`
- **Milestone 3（交互状态 & 视觉一致性）**：TopBar 世界下拉新增 loading/empty 三态；WritingSessionList 编辑标题新增取消按钮（`onMouseDown + preventDefault` 防止 blur 提交）；CharactersPage `✦✎✕` 字符符号替换为 `<Icon>` 组件，empty 文案统一；全站 empty 文案统一为 `暂无X` 格式
- **涉及文件**：`tokens.css`、`index.css`、`chat.css`、`ui.css`、`pages.css`、`ChatPage.jsx`、`WritingSpacePage.jsx`、`StateFieldList.jsx`、`ModeSwitch.jsx`、`WritingLlmBlock.jsx`、`ImportExportPanel.jsx`、`WritingPageLeft.jsx`、`Sidebar.jsx`、`TopBar.jsx`、`WritingSessionList.jsx`、`CharactersPage.jsx`、`WorldsPage.jsx`
- **遗留技术债（已清零）**：WorldsPage 世界卡片 `✎✕` 已替换为 Icon；`StateValueField.jsx` `--we-gold-leaf` 已迁移至 `--we-color-gold`

## T223 — refactor: trigger inject_prompt 提前到 [8] 并重排提示词段号 ✅
- **对外接口**：`buildPrompt` / `buildWritingPrompt` 的 messages 结构仍为 `system + 历史消息 + 当前用户消息`；`inject_prompt` 从后置提示词移出，固定在 [8] system 段注入，`consumed` 模式仍递减 `rounds_remaining`。
- **涉及文件**：`backend/prompts/assembler.js`、`backend/tests/prompts/assembler.test.js`、`ARCHITECTURE.md`、`CLAUDE.md`
- **注意**：当前权威顺序为 14 段：[1]–[12] 合并为单条 system，[13] 历史消息，[14] 当前用户消息；后置提示词 [12] 不再包含 `inject_prompt`。

## T222 — fix: 后置提示词改为注入 system，修复 Gemini 连续 user 消息错位 ✅
- **根本原因**：`assembler.js` 的 [15] 后置提示词原以独立 `role:user` 消息注入，与 [16] 当前用户消息形成连续两条 user 消息；Gemini API 要求严格 user/model 交替，导致消息错位（第 1 轮的输入到第 3 轮才得到回应）。
- **变更**：`buildPrompt` 和 `buildWritingPrompt` 中将 postParts（`global_post_prompt` + `character.post_prompt` + post 位置 State 条目 + `inject_prompt`）统一 push 进 `systemParts`，在 diary 注入之后、systemContent 合并之前完成，final messages 中不再出现 [15] user 消息。
- **涉及文件**：`backend/prompts/assembler.js`、`ARCHITECTURE.md`
- **验证**：重启后端，发起对话，AI 应即时回应当轮用户输入，不再出现 1-2 轮错位。

## T221 — chore: 前端 ESLint warning 清零 ✅
- **变更**：一次性清理剩余 43 个视觉 inline style warning；覆盖 `App.jsx`、书页基础组件、纹理/印章动画、状态折叠区、聊天消息列表/选项卡/侧栏、设置页模型/提示词配置、`ChatPage.jsx` 与 `WorldsPage.jsx`。动态头像色、印章尺寸、纹理图片、状态条进度等改为 CSS custom property 承载，视觉规则落在 CSS class。
- **验证**：`npm --prefix frontend run lint` 通过（0 errors / 0 warnings）；`npm --prefix frontend run build` 通过；`git diff --check` 通过。
- **注意**：仍保留允许范围内的动态 `animationDelay`、`transform` 与 CSS custom property 注入；本次不改变业务行为。

## T220 — chore: 清理模式切换、写作左栏与导入导出 inline style 警告 ✅
- **变更**：将 `ModeSwitch.jsx`、`WritingPageLeft.jsx`、`ImportExportPanel.jsx`、`WritingLlmBlock.jsx`、`StateFieldList.jsx` 中的视觉 inline style / DOM hover 写法迁移到 Tailwind class 或既有 `we-settings-*` / `we-dialog-*` class；`WritingLlmBlock` 的温度滑条改用离散 `--range-pct` class 映射保留填充进度。
- **验证**：目标 5 文件 `rg "style=\\{|onMouseEnter|onMouseLeave"` 清零；`npm --prefix frontend run build` 通过；`npm --prefix frontend run lint -- src/components/settings/ModeSwitch.jsx src/components/state/StateFieldList.jsx src/components/book/WritingPageLeft.jsx src/components/settings/ImportExportPanel.jsx src/components/settings/WritingLlmBlock.jsx` 通过（0 errors，仓库其他文件仍有既有 inline style warnings）。
- **注意**：本批只处理指定五个组件；`PageLeft.jsx`、`PromptConfigPanel.jsx`、`ModelSelector.jsx` 等剩余 warning 留待后续批次。

## T219 — chore: 清理状态字段、写作消息与 LLM/日记配置 inline style 警告 ✅
- **变更**：将 `StateFieldEditor.jsx` 的必填标记、日记时间说明和错误文案迁移到 `we-state-field-*` class；将 `WritingMessageItem.jsx` 的 thinking block 与删除确认颜色迁移到 `we-writing-think-*` / `we-message-action-danger` class；将 `LlmConfigPanel.jsx`、`DiaryConfigPanel.jsx` 的连接状态、代理行、日期模式与说明文案迁移到共享 settings class。
- **验证**：`cd frontend && npx eslint src/components/state/StateFieldEditor.jsx src/components/writing/WritingMessageItem.jsx src/components/settings/LlmConfigPanel.jsx src/components/settings/DiaryConfigPanel.jsx --format stylish` 通过；全量 ESLint JSON 统计为 0 errors / 90 warnings。
- **注意**：`WritingMessageItem` 仍保留 textarea 自适应高度的 DOM style 写入；`LlmConfigPanel` 保留 range 组件 `--range-pct` CSS 变量，均不触发视觉 inline style 规则。

## T218 — chore: 清理关于页、章节、会话列表和状态面板 inline style 警告 ✅
- **变更**：将 `AboutPanel.jsx`、`ChapterDivider.jsx`、`SessionListPanel.jsx`、`StatePanel.jsx` 的视觉 inline style 迁移到 CSS class；补充 `we-settings-about-*`、`we-chapter-*`、`we-session-list-*`、`we-state-*` / `we-diary-*` 样式。`StatePanel` 仅保留动态 `animationDelay` 和骨架宽度。
- **验证**：`cd frontend && npx eslint src/components/settings/AboutPanel.jsx src/components/book/ChapterDivider.jsx src/components/book/SessionListPanel.jsx src/components/book/StatePanel.jsx --format stylish` 通过；全量 ESLint JSON 统计为 0 errors / 151 warnings。
- **注意**：本批只处理指定四个文件；剩余 warning 仍全部来自视觉 inline style 迁移债。

## T217 — chore: 清理记忆/功能配置与顶栏 inline style 警告 ✅
- **变更**：将 `MemoryConfigPanel.jsx`、`FeaturesConfigPanel.jsx` 的 toggle 行、日期模式按钮和确认文案迁移到共享 `we-settings-*` class；将 `TopBar.jsx` 的顶栏、世界下拉、导航项、分隔符和设置图标迁移到 `we-topbar-*` class，并移除 hover 专用 state。
- **验证**：`cd frontend && npx eslint src/components/settings/MemoryConfigPanel.jsx src/components/book/TopBar.jsx src/components/settings/FeaturesConfigPanel.jsx --format stylish` 通过；全量 ESLint JSON 统计为 0 errors / 240 warnings。
- **注意**：本批只处理指定三个文件；剩余 warning 仍全部来自视觉 inline style 迁移债。

## T216 — chore: 清理会话项与触发器卡片 inline style 警告 ✅
- **变更**：将 `SessionItem.jsx` 改为复用既有 `we-session-item__*` 样式；将 `TriggerCard.jsx` 的卡片、启用开关、摘要文本和操作按钮迁移到 `we-trigger-card-*` class，并同步更新快照。
- **验证**：`cd frontend && npx eslint src/components/chat/SessionItem.jsx src/components/state/TriggerCard.jsx --format stylish` 通过；`cd frontend && npx vitest run tests/components/state/TriggerCard.test.jsx -u` 通过并更新快照；全量 ESLint JSON 统计为 0 errors / 332 warnings。
- **注意**：本批只处理指定的会话项和触发器卡片；剩余 warning 仍全部来自视觉 inline style 迁移债。

## T215 — chore: 清理状态触发器与正则规则 inline style 警告 ✅
- **变更**：将 `TriggerEditor.jsx`、`RegexRulesManager.jsx`、`EntrySection.jsx` 的视觉 inline style 迁移到 CSS class；补充 `we-trigger-editor-*`、`we-regex-*`、`we-entry-section-*` 样式，保留原有触发器编辑、正则拖拽排序和条目编辑行为。
- **验证**：`cd frontend && npx eslint src/components/state/TriggerEditor.jsx src/components/settings/RegexRulesManager.jsx src/components/state/EntrySection.jsx --format stylish` 通过；`cd frontend && npm run lint` 通过（0 errors，剩余 397 warnings）。
- **注意**：本批只处理指定高密度文件；剩余 warning 仍全部来自视觉 inline style 迁移债。

## T214 — chore: 清理 Hook 依赖警告与 UI 原子 inline style ✅
- **变更**：收敛前端剩余 `react-hooks/exhaustive-deps` warning，使用 `useCallback`、派生值或窄范围注释处理加载/初始化类 effect；迁移 `AvatarCircle`、`AvatarUpload`、`FormGroup`、`ModalShell`、`ModelCombobox` 的视觉 inline style 到 CSS class / CSS 变量。
- **验证**：`cd frontend && npm run lint` 通过（0 errors，剩余 550 warnings）；`cd frontend && npm run build` 通过；`cd frontend && npm run test` 28 个文件 / 75 个测试全通过。
- **注意**：头像 fallback 背景色改为 CSS 变量承载动态值；`ModelCombobox` 保留允许的动态 `transform`。

## T213 — chore: 前端 ESLint 阻断错误清零 ✅
- **变更**：补齐 ESLint flat config 的 Vite/Vitest 运行环境 globals；拆分 `buildWorldTabs` 到 `blocks/world-tabs.js` 以满足 Fast Refresh 组件导出规则；清理未使用变量、空 catch、测试 mock/期望漂移；修复或窄范围标注 React hook/compiler 阻断错误。
- **验证**：`cd frontend && npm run lint` 通过（0 errors，剩余 593 warnings）；`cd frontend && npm run build` 通过；`cd frontend && npm run test` 28 个文件 / 75 个测试全通过。
- **注意**：剩余 warning 主要是 `no-restricted-syntax` 视觉 inline style 迁移债（584 条）和少量 `react-hooks/exhaustive-deps`（9 条），不阻断 lint。

## T212 — chore: 清理 CastPanel 视觉内联样式警告 ✅
- **变更**：将 `frontend/src/components/book/CastPanel.jsx` 中会触发 ESLint `no-restricted-syntax` 的视觉类 inline style 迁移到 `frontend/src/index.css` 的 `we-cast-*` class；保留动态折叠、动画延迟、骨架宽度等运行时样式。
- **验证**：`cd frontend && npx eslint src/components/book/CastPanel.jsx --format stylish` 不再出现 inline style 规则警告；该文件仍保留既有 `react-hooks/exhaustive-deps` warning。
- **注意**：本次只清 CastPanel 样式警告，不处理全仓 lint 既有 error/warning。

## T211 — feat(uiux): Icon Primitive + SVG 尺寸规范化 ✅
- **新增**：`frontend/src/components/ui/Icon.jsx` — SVG 图标容器 Primitive，三档 size（16/20/24），`aria-hidden` / `role=img` 自动管理，DEV 环境 console.warn 非法 size
- **注册**：`frontend/src/components/index.js` 的 "UI 原子" 区新增 `Icon` 导出
- **迁移（14 文件）**：所有非标准 SVG 尺寸（8/10/11/12/13/14/15px）按映射规则（<17→16，17-22→20，≥23→24）统一用 `<Icon size={N}>` 替换；涉及 CastPanel、StatePanel、StatusSection（8px chevron）、MessageItem、WritingMessageItem（10px 操作按钮）、ChapterDivider（10px）、ChatPage（11px）、SessionListPanel（12/15px）、WritingSessionList（12/13px）、SessionItem（13px）、Sidebar（14/16px）、TopBar（14px）、WritingPageLeft（15px）
- **测试**：`frontend/tests/components/ui/Icon.test.jsx` 4 项全通过
- **注意**：① Icon 组件用 `import.meta.env.DEV` 替代 prop-types（项目未安装 prop-types）；② 8px chevron 改 16px 是视觉两倍，但父容器 flex 无约束，实际视觉由 `we-state-section-title` 的 gap 控制；③ InputBox 的 16px SVG 未迁移（已是标准尺寸且不在迁移列表）

## T209 — feat(uiux): task9+10 CSS 色值迁移 + 禁止视觉样式清理 ✅
- **变更**：将前端所有 CSS/JSX 中的 `rgba()` 硬编码替换为 `color-mix(in srgb, var(--we-*) N%, transparent)` 语法；移除所有 `linear-gradient` / `radial-gradient`（range 滑条功能性渐变提升为 `--we-range-track-bg` token，书脊阴影改用 `--we-spine-shadow-left` token）；清除全部 `backdrop-filter: blur`、`text-shadow`、`!important`（改用高特异性选择器）；JSX 中的 `var(--token, #hex)` 回退色值全部清理
- **涉及文件**：`frontend/src/styles/tokens.css`（新增 `--we-range-track-bg` 功能性渐变 token）、`chat.css`、`pages.css`、`ui.css`、`index.css`、`components/ui/ModalShell.jsx`、`components/ui/ModelCombobox.jsx`、`components/ui/ToggleSwitch.jsx`、`components/settings/CustomCssManager.jsx`、`components/chat/SessionItem.jsx`、`components/state/TriggerEditor.jsx`、`components/book/StatePanel.jsx`、`components/book/CastPanel.jsx`、`components/book/SealStampAnimation.jsx`、`components/book/TopBar.jsx`、`components/book/ChapterDivider.jsx`、`components/writing/WritingMessageItem.jsx`
- **验收**：所有 6 项 grep 验收标准全部清零；测试数量未变（4 个预存失败）
- **注意**：`tokens.css` 中 `--we-color-bg-overlay` / `--we-color-accent-bg` 保留 `rgba()` 定义（tokens.css 是真相来源，不受迁移约束）；骨架屏动画改为 opacity-pulse（原 shimmer 渐变依赖动态位置无法 token 化）；状态栏填充色从双色渐变改为单色 `--we-color-status-success`

## T208 — bugfix: 补齐触发器通知与 `one_shot` 闭环 ✅
- **对外接口**：`trigger_fired` SSE 现在被前端统一消费并在 chat / writing 页面显示 toast；`POST /api/worlds/:worldId/triggers` 与 `PUT /api/triggers/:id` 正式支持 `one_shot`
- **涉及文件**：`frontend/src/api/stream-parser.js`、`frontend/src/pages/ChatPage.jsx`、`frontend/src/pages/WritingSpacePage.jsx`、`frontend/src/components/state/TriggerEditor.jsx`、`frontend/src/components/state/TriggerCard.jsx`、`frontend/tests/api/chat.test.js`、`frontend/tests/api/writing-sessions.test.js`、`backend/routes/triggers.js`、`backend/services/trigger-evaluator.js`、`backend/tests/routes/triggers.test.js`、`ARCHITECTURE.md`、`CHANGELOG.md`
- **注意**：① 之前后端会发 `trigger_fired`，但前端 SSE 解析器没消费，导致“前端通知”静默失效；② `one_shot` 之前只存在于 schema/query 和失败测试里，路由未透传、执行器也未自动禁用，这次补成真实闭环；③ 前端触发器通知当前采用底部 toast 合并展示，多条通知会用全角分号拼接

## T207 — docs: 同步状态页与组件抽取后的权威文档 ✅
- **对外接口**：无运行时接口变更；仅校正文档与当前实现对齐
- **涉及文件**：`ARCHITECTURE.md`、`SCHEMA.md`、`CHANGELOG.md`
- **注意**：① `docs/` 目录未整体 gitignore，当前只有 `/docs/superpowers/` 被忽略；② `ARCHITECTURE.md` 此次补齐了 `WorldStatePage`、组件统一出口 `components/index.js`、`state_updated` / `diary_updated` / `trigger_fired` SSE 事件，以及 `triggers.js` API 落点；③ `SCHEMA.md` 修正了 `trigger_actions` 已从 1:1 演进为 1:N 的事实，并补齐 `character_prompt_entries.position` 遗留列与触发器字段语义

## 前端通用组件库系统化提取 ✅
- **新增组件**：`components/ui/FormGroup`（label+input+hint+error 标准字段组）、`EditPageShell`（编辑页骨架，loading/overlay 双模式）、`ConfirmModal`（通用确认弹窗，内部管理 confirming 状态）、`AvatarUpload`（头像上传控件）；`components/ui/FieldLabel` 从 settings/ 迁移到 ui/（settings/FieldLabel 改为 re-export 兼容层）；新增 `utils/time.js` 导出 `relativeTime`
- **重构**：`Select.jsx` 内联 style 全部迁移至 `.we-select*` CSS 类（移除 JS hover 事件）；settings/ 六个组件（ProviderBlock、LlmConfigPanel、PromptConfigPanel、DiaryConfigPanel、WritingLlmBlock、MemoryConfigPanel）改用 FormGroup/ConfirmModal；WorldCreatePage、CharacterCreatePage、WorldEditPage、CharacterEditPage、PersonaEditPage 改用 EditPageShell + FormGroup + AvatarUpload；WorldsPage 改用 ConfirmModal + `relativeTime` import
- **新增索引**：`components/index.js` 统一导出所有 35 个可复用组件（ui/ 原子 10 个 + 分子 5 个 + book/ 20 个）
- **规范**：CLAUDE.md「前端分层」下新增「组件复用规则」6 条（强制查阅 index.js、EditPageShell/FormGroup/ConfirmModal 使用规则、新组件注册要求）
- **涉及文件**：`frontend/src/utils/time.js`（新建）、`frontend/src/components/ui/FieldLabel.jsx`（新建）、`frontend/src/components/ui/FormGroup.jsx`（新建）、`frontend/src/components/ui/AvatarUpload.jsx`（新建）、`frontend/src/components/ui/ConfirmModal.jsx`（新建）、`frontend/src/components/ui/EditPageShell.jsx`（新建）、`frontend/src/components/index.js`（新建）、`frontend/src/styles/ui.css`（新增 Select/ConfirmModal/AvatarUpload CSS 类段）、`frontend/src/components/ui/Select.jsx`（重构）、`frontend/src/components/settings/FieldLabel.jsx`（改为 re-export）、settings/ 六个组件、pages/ 六个页面、`CLAUDE.md`
- **注意**：① LlmConfigPanel/WritingLlmBlock 的 Temperature 滑块因 flex 布局特殊性，外层改为无 class `<div>`，内部保留 FieldLabel；② export 分区（"导出世界卡"等）的 `div.we-edit-form-group` 容器因含 `<h3>` 而非 `<label>` — 不适用 FormGroup，保留裸 div；③ AvatarUpload 的 `avatarColor` 背景色为运行时动态值，唯一保留的 inline style；④ ConfirmModal 不自动关闭——onConfirm resolve 后由调用方通过 onClose 控制

## T206 — refactor: 收口旧 Prompt 条目入口并统一到世界 State 页 ✅
- **对外接口**：`routes/prompt-entries.js` 现在只暴露世界级 State 条目接口：`GET/POST /api/worlds/:worldId/entries`、`GET/PUT/DELETE /api/world-entries/:id`、`PUT /api/world-entries/reorder`
- **涉及文件**：`backend/prompts/assembler.js`、`backend/routes/prompt-entries.js`、`backend/services/prompt-entries.js`、`backend/db/schema.js`（新增旧 world prompt 列到 `world_prompt_entries(always)` 的一次性迁移）、`assistant/server/routes.js`、`frontend/src/pages/WorldCreatePage.jsx`、`frontend/src/pages/WorldEditPage.jsx`、`frontend/src/pages/CharacterEditPage.jsx`、`frontend/src/components/settings/PromptConfigPanel.jsx`、`frontend/src/api/prompt-entries.js`
- **注意**：① 运行时不再消费 `global_prompt_entries` / `character_prompt_entries`，也不再直接消费 `worlds.system_prompt/post_prompt`；世界级提示词统一从 `world_prompt_entries` 读取；② 为避免旧世界静默丢 prompt，启动迁移会把非空 `worlds.system_prompt/post_prompt` 镜像写入常驻条目（按内容去重）；③ 写卡助手提案执行也已同步去掉角色/全局提示词 条目写入，避免残留调用在服务启动时报错

## 前端系统性审查与修复 ✅
- **修复内容**：① `--we-radius-sm` CSS 变量冲突：index.css 以 6px 覆盖 tokens.css 的 2px，影响 30+ 组件（含聊天气泡），已删除 index.css `:root` 中的覆盖项，羊皮纸 2px 圆角恢复；② WorldStatePage + EntrySection + StateFieldList 中的 Emoji 图标（📌🔑🤖⚡🔒）替换为古籍符号（✦ § ❦ ※ §），符合 DESIGN.md §13；③ TopBar.jsx 10+ 处硬编码 rgba/hex 颜色替换为 tokens.css 新增的 `--we-topbar-*` 变量组；④ TopBar.jsx `onMouseEnter/Leave` 中的 `e.target.style` 直接 DOM 操作替换为 React state（`hoveredWorldId`、`listBtnHover`）；⑤ `--we-ink-faded` 从 #8a7663（3.21:1，不通过 WCAG AA）加深为 #6d5c4b（~4.6:1，通过 AA）
- **涉及文件**：`frontend/src/styles/tokens.css`、`frontend/src/index.css`、`frontend/src/pages/WorldStatePage.jsx`、`frontend/src/components/state/StateFieldList.jsx`、`frontend/src/components/book/TopBar.jsx`
- **已知遗留**：WorldStatePage 全页内联 style 未迁移到 CSS 类（改动范围大，建议单独任务）；WorldStatePage 无加载态（Minor，待设计确认）；MessageItem DeleteButton 硬编码 fallback 色（Minor）
- **审查报告**：`.temp/frontend-audit-2026-04-22.md`

## v2 Phase 1A — fix: 触发器角色状态字段去重并统一为 `角色.xxx` ✅
- **对外接口**：无新增接口；TriggerEditor 角色条件下拉不再做“角色数 × 字段数”笛卡尔积，改为世界级通用字段 `角色.xxx`
- **涉及文件**：`frontend/src/components/state/TriggerEditor.jsx`、`backend/services/trigger-evaluator.js`、`backend/tests/services/trigger-evaluator.test.js`、`ARCHITECTURE.md`
- **注意**：① `character_state_fields` 本就是 world 级模板，触发器条件不再暴露 `阿尔托利亚.生命值` 这类按角色名复制的选项；② chat 会话里 `角色.xxx` 映射当前角色；③ writing 会话里，只要激活角色中任一角色满足带 `角色.` 前缀的整组条件即触发，同一触发器的多个角色条件仍要求落在同一角色上满足；④ 非角色条件（`世界.` / `玩家.`）仍按共享状态评估

## v2 Phase 1 — State 引擎触发器系统 ✅
- **对外接口**：`GET/POST /api/worlds/:worldId/triggers`、`PUT/DELETE /api/triggers/:id`；assembler.js 新增 systemEntryTexts/postEntryTexts 分流 + inject_prompt 注入；chat.js/writing.js priority-2 新增 trigger-eval 任务，SSE 事件 `trigger_fired`
- **涉及文件**：`backend/db/schema.js`（triggers/trigger_conditions/trigger_actions 三表 + world_prompt_entries 新增 position/trigger_type）、`backend/db/queries/triggers.js`（新建）、`backend/db/queries/prompt-entries.js`（支持 position/trigger_type）、`backend/services/trigger-evaluator.js`（新建）、`backend/routes/triggers.js`（新建）、`backend/prompts/entry-matcher.js`（trigger_type 分流）、`backend/prompts/assembler.js`（position 分流 + inject_prompt 注入）、`backend/routes/chat.js`、`backend/routes/writing.js`、`frontend/src/api/triggers.js`（新建）、`frontend/src/App.jsx`（/state 路由）、`frontend/src/pages/CharactersPage.jsx`（三标签导航）、`frontend/src/pages/WorldStatePage.jsx`（新建）、`frontend/src/components/state/`（EntrySection/EntryEditor/TriggerCard/TriggerEditor，全部新建）、`SCHEMA.md`（三表文档）
- **注意**：① `activate_entry` 动作的实现是把 prompt_entries 的 trigger_type 改为 `always`（irreversible，spec 约定"持续生效直到用户手动关闭"）；② trigger-eval 是 priority-2 同步操作，在 async-queue.js 的严格 FIFO 串行保证下，所有状态更新之后、turn-record 入队之前执行，无竞态；③ `inject_prompt` 最初固定为 post 位置，已在 T223 改为 [8] system 段注入；④ trigger_type 旧数据无字段时默认视为 `always`；⑤ 后端测试框架为 node:test（非 vitest），任何新测试必须用 `describe/test + assert` 而非 `it/expect`

## ROADMAP v2 Phase 3-10 任务拆解 ✅
- **对外接口**：无运行时变更；仅 ROADMAP.md 文档写入
- **涉及文件**：`ROADMAP.md`（新增 T182–T205，共 24 个任务，覆盖阶段 3-10）
- **注意**：T182 relations 表的 entity_a/b 多态引用无 SQLite FK，由应用层校验；T188 sessions.preset 列需 try/catch 防已存在报错；T193 assembler [11] 段取代原"已删除"的 [11] 世界时间线位置；T197 entity_changes.chronicle_id 此时无 FK（Phase 8 补应用层保证）；T205 需同步修改 T177-T179 的三个面板 status_tag 下拉从静态改为动态加载

## 记录格式模板

```
## T[编号] — [type]: [任务名] ✅
- **对外接口**：其他模块如何调用（函数名、路由路径等）
- **涉及文件**：新增或修改了哪些文件
- **注意**：容易踩的坑、约束、以及文档里没写清楚的决策
```

不写实现细节，不写"完成了什么功能"（ROADMAP 里已有）。  
只写**未来 Claude Code 需要知道、但从其他文件里找不到的东西**。

标题规范：
- `type` 只允许：`feat` `bugfix` `perf` `refactor` `docs` `chore`
- 新记录必须使用 `T[编号] — [type]: [标题] ✅`
- 旧记录允许保留历史格式，但应在触碰附近记录时顺手收敛

最近关键变更索引：
- `T168` `refactor` 后台任务声明式化（post-gen-runner） — 新增 `backend/utils/post-gen-runner.js`，导出 `runPostGenTasks`；chat.js 删除 `enqueueStreamTasks`，writing.js 删除两处 `ssePromises` 手工块；chat/writing 差异改为 TaskSpec 数据差异，SSE 保活逻辑统一由 runner 管理
- `T167` `bugfix` 写作标题空返回兜底 + continue 指令模板化 — title/chapter title 对 Gemini 空返回增加一次重试，仍为空时回退到本地裁剪标题；`buildContinuationMessages` 的续写指令移入 `backend/prompts/templates/continue-user-instruction.md`
- `T166` `bugfix` `/continue` 等待 SSE 真正结束后再允许下一次续写 — 前端 chat/writing 的 continue 从 `onDone` 提前解锁改为等 `onStreamEnd`，并为续写回调加 token 防止旧请求收尾覆盖新请求；补了对应页面测试
- `T163` `bugfix` `/continue` 统一显式续写指令 — `buildContinuationMessages` 不再按 provider 分支，统一改为 `assistant(originalContent) + user(直接继续上一条 AI 回复)`；既修 Gemini `CHAT DONE len=0`，也避免其他 provider 后续撞上同类尾 assistant 静默问题；新增 `backend/tests/routes/stream-helpers.test.js`
- `T162` `refactor` 对话/写作空间通用组件插件化（插件1-3） — 新增 `frontend/src/api/stream-parser.js` 作为 SSE 解析共享层；chat.js 和 writing-sessions.js 各增内部 `streamPost` 辅助消除重复模板；`backend/services/chat.js` 的 `processStreamOutput` 扩展 opts 参数（mode/createMessageFn/touchSessionFn），writing.js runWritingStream 改调用此函数而非内联处理；提示词内部重构（插件4）未实施
- `T161` `feat` 关闭日记时清除历史记录 + 确认弹窗 — `clearAllDiaryData()` 遍历所有世界所有会话清除 DB+文件；`POST /api/worlds/clear-all-diaries` 路由；MemoryConfigPanel 关闭 toggle 时先弹确认再执行；diary_time 字段由 syncDiaryTimeField 在页面进入时自动删除
- `T160` `feat` 写作空间 CastPanel 补"整理中/已整理"overlay — 对齐 StatePanel 轮询逻辑；加 `pollingHasChanged`/`stateJustChanged`；移除旧内联"更新中…"文字；`motion` 补入 framer-motion 导入
- `T159` `feat` 状态更新后台阻塞下轮 prompt 组装 + 输入立即解锁 — 新增 `state-update-tracker.js`；`onDone` 时立即 `setGenerating(false)` + `triggerMemoryRefresh`；下轮请求 `buildContext`/`buildWritingPrompt` 前 `awaitPendingStateUpdate`；StatePanel 恢复纯轮询 overlay；`state_updating`/`state_updated` SSE 事件全部清除
- `T158` `bugfix` 用户气泡编辑不变内容不重新生成 — 三处 confirmEdit（MessageItem/WritingMessageItem/assistant MessageList）改用 `editInitContentRef` 快照初始内容，比较 `trimmed !== initContent.trim()`；防止 prop 在编辑期间变化或空白字符差异导致误触重新生成
- `T157` `feat` 状态更新阻塞发送（已被 T159 取代）
- `T156` `bugfix` 选项生成失败 — SUGGESTION_PROMPT 从 [15] 移至 [16] 末尾追加，消除两条连续 user 消息导致的模型忽略问题
- `T155` `feat` 日记系统 — sessions 新增 diary_date_mode；新增 daily_entries 表；Priority 4 checkAndGenerateDiary；前端 Timeline 面板改为展示日记摘要；日记注入 [13+] 段
- `T151` `feat` 状态回滚机制 — turn_records 新增 state_snapshot 字段；createTurnRecord 在优先级 2 状态更新后捕获三层 session 级状态快照；regenerate/删除消息/编辑消息后从快照恢复，无快照时降级清空回 default；新增 backend/memory/state-rollback.js（captureStateSnapshot/restoreStateFromSnapshot）
- `T150` `refactor` turn_records 改为指针模式，历史消息链路清理 — turn_records 新增 user_message_id/asst_message_id 列（指针），不再复制消息内容；summary-expander 展开原文优先查 messages 表，旧数据回退 user_context/asst_context；delete all messages 同步清除 turn_records；修复 assembler.js/SCHEMA.md 过时注释
- `T148` `feat` MOTION.md 动效规范落地 — motion.js 重写（DURATION/EASE/STAGGER/BLUR/variants/transitions），tokens.css 补 --we-dur-* 变量，新增 useMotion hook，PageTransition 实现路由过渡，WritingMessageItem 补 inkRise，SealStamp/ModalShell/SectionTabs 对齐规范参数
- `T147` `chore` 临时后端测试隔离真实配置 — `backend/services/config.js` 支持 `WE_CONFIG_PATH`，`.temp` 脚本改用独立临时 config 文件
- `T146` `bugfix` 写作空间激活角色读取修复 — `buildWritingPrompt()` 不再把 `getWritingSessionCharacters()` 返回的 `c.*` 行误当成含 `character_id` 的联结行二次查询
- `T145` `bugfix` 写作空间多角色模板变量补全 — 共享段补首个激活角色 `{{char}}` fallback，角色级 prompt entries 改为按所属角色名渲染
- `T144` `feat` 写作空间接入记忆召回与原文展开 — buildWritingPrompt 补 [12][13]，writing.js 补 memory_recall_start SSE，前端设置页写作 tab 加记忆原文展开 toggle，config.writing 新增 memory_expansion_enabled 字段
- `T143` `bugfix` 写卡助手协议修复+多轮上下文补全 — character-card create entityId 协议对齐、stateFieldOps type 枚举硬约束（三个 prompt 文件）、工具结果字符串富化、AssistantPanel history 含 proposal 摘要
- `T142` `bugfix` 对话/写作上下文对齐修复 — entry description 退回 preflight、主历史源切回原始 messages、continue 不再重写轮次、turn record 按 round_index 配对
- `T141` `perf` 写卡助手 harness 稳定性六项优化 — 子代理 system/user 分离、temperature:0、retry 保留工具、error SSE 透传、resolveToolContext 不再静默降级、proposalStore GC
- `T140` `bugfix` 写卡助手气泡出现过早 — 移除预创建空气泡，改为首个 delta 到达时才创建，保证子代理调用全部结束后气泡才出现
- `T139` `bugfix` 写卡助手 character-card create 缺 worldId + 主代理跳过 preview_card — entityId 改为 required，描述去掉"省略"歧义，四个子代理 description 加 preview_card 强约束，ChangeProposalCard 加 currentWorldId 安全网
- `T138` `refactor` 写卡助手 skill→agent 改名 + 主代理职责收窄 — skills/→agents/，skill-factory→agent-factory，工具名 world_card_skill→world_card_agent 等，main.md 重写为研究→计划→分发三阶段，修复 SSE routing target 使用 proposalType 而非 def.name
- `T137` `bugfix` 写卡助手 entryOps description/keyword_scope 丢失 — normalizeEntryOps 读 summary→description，补 keyword_scope，update pickAllowed 同步修正，CONTRACT.md/ChangeProposalCard.jsx/main.md 同步
- `T136` `chore` 清理 [11] 删除后的废弃代码 — `renderTimeline()`、`WORLD_TIMELINE_COMPRESS_THRESHOLD`、`WORLD_TIMELINE_MAX_ENTRIES`
- `T135` `bugfix` 删除 [11] 时间线段、recall 排除上下文窗口内轮次 — 消除 impersonate/选项重复输出的三重注入根因
- `T134` `chore` M7 前端 api/ 目录文件命名统一为 kebab-case — 14 个文件重命名（含 _settingsConstants→_settings-constants），所有引用同步更新，CLAUDE.md 补充各目录命名约定
- `T133` `refactor` CP-6 路由层 404 重复代码统一 — 新增 assertExists，覆盖 12 个路由文件约 55 处
- `T131` `refactor` CS-6 runStream Feature Envy — processStreamOutput + enqueueStreamTasks 提取，修复 /continue sid bug
- `T130` `refactor` CS-2 importWorld 深嵌套 — 私有辅助函数提取，嵌套 5→3 层
- `T129` `refactor` CS-5 combined-state-updater God Object — 4 个模块级辅助提取，DB 写入三段合并
- `T128` `chore` 删除火烛 SVG 与相关残留
- `T127` `refactor` 代码异味修复（CS-1/CS-3/CS-4/CS-7）
- `T126` `refactor` templates 文件平铺化
- `T125` `refactor` 架构层问题修复（分层破坏、三件套残留、CP-4 残留）
- `T124` `refactor` backend/prompt 并入 backend/prompts
- `T123` `refactor` Prompt 模板分组重命名与 turn summary 命名修正
- `T122` `refactor` 后端内置 Prompt 模板外置到 backend/prompts
- `T121` `refactor` 大文件拆分（SettingsPage + openai.js）
- `T120` `refactor` Copy-Paste 重复代码消除（CP-1 至 CP-7）
- `T119` `docs` 将现有代码规范收敛进 CLAUDE / ARCHITECTURE
- `T117` `chore` 可维护性修复（M2/M3/M4/M6）
- `T116` `chore` 调用链旧路径审查与 P-3 注释整理
- `T114` `docs` CHANGELOG 历史标题标准化
- `T113` `docs` 根目录文档治理规范收敛
- `T112` `bugfix` 时间线实时更新与摘要清洁
- `T111` `bugfix` `<think>` 污染修复
- `T110` `feat` Next Prompt Suggestions
- `T109` `refactor` OptionCard 风格修复
- `T108` `feat` Prompt 条目 LLM 触发 + scope
- `T107` `feat` Prompt 条目关键词范围双勾选
- `T106` `perf` 前端首包拆分
- `T105` `docs` CLAUDE 主体 / AGENTS 镜像


---

## 历史存档索引

T01–T174 完整记录见 [`docs/CHANGELOG-archive-T1-T200.md`](docs/CHANGELOG-archive-T1-T200.md)。

| 范围 | 主要内容 |
|------|----------|
| T01–T09 | 项目骨架、数据库、LLM、世界/角色/会话 CRUD、对话流 |
| T10–T27 | 前端页面、Prompt 条目、记忆召回、Session Summary、跨会话召回 |
| T28–T40 | 渐进展开原文、角色卡导出、写作空间、状态字段、玩家头像 |
| T86–T103 | 写作模式独立配置、正则/CSS 模式分离、写卡助手、全链路日志、状态会话级隔离 |
| T104–T120 | 时间线重构、Prompt 条目重构、代码异味批量修复、大文件拆分 |
| T121–T135 | 模板外置、目录整合、OptionCard、LLM 触发、`<think>` 修复、时间线段删除 |
| T136–T155 | 写卡助手架构重构（单代理+Skill）、状态回滚、turn_records 指针模式 |
| T156–T174 | 日记系统、章节标题、续写竞态修复、后台任务声明式化、测试体系建立 |

---

## [2026-04-24] 废除触发器系统，新增状态条目

### 决策
废除 `triggers` / `trigger_conditions` / `trigger_actions` 三张表及其配套代码（`trigger-evaluator.js`、`triggers.js` 路由），改为在 `world_prompt_entries` 新增 `state` 类型条目，依托 `entry_conditions` 关联表存储评估条件。

### 设计意图
旧触发器在每次对话后异步执行动作（如注入 prompt）；新状态条目在提示词组装时同步评估，与 always/keyword/llm 三类条目统一走 matchEntries → 按 position 注入，assembler 无差异对待。

### 评估时机变化
- 旧：对话生成后，异步队列（priority 2）执行 `evaluateTriggers()`
- 新：提示词组装时（[7] 段），`matchEntries()` state 分支实时评估

### entry_conditions 评估逻辑
- 数值操作符：`>` `<` `=` `>=` `<=` `!=`（Number.isFinite 保护）
- 文本操作符：`包含` `等于` `不包含`
- 条件为空的 state 条目不触发
- AND 逻辑：所有条件全部满足才触发
- writing 模式：任一激活角色满足所有条件即触发

### 迁移注意
旧 `triggers` / `trigger_conditions` / `trigger_actions` 数据**不迁移**，由 `migrateDropTriggerTables()` 在服务器启动时自动 DROP（幂等）。
