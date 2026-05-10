# Changelog

> 每次任务完成后，在最上方追加一条记录。这是项目的"记忆"，给自己和 AI 看。  
> 新开对话时让 Claude Code 先读此文件，了解项目现状。

## 2026-05-10 fix(state): table 类型默认值在角色/玩家编辑页可编辑且通过校验

**背景**：`type='table'` 状态字段在「编辑角色 / 编辑玩家(persona)」页的默认值输入框显示 `[object Object]`，保存时后端报 `字段 X 的值不符合类型约束`。三个根因合一：① 前端 `StateValueField.jsx` 未给 table 类型加渲染分支，对象被 `String()` 转成字面量；② 后端 `validateStateValue()` switch 缺 `case 'table'`，落到 `default` 返回 `undefined` 触发抛错；③ `getCharacterStateValuesWithFields` / `getPersonaStateValuesWithFields(ByPersonaId)` / `getWorldStateValuesWithFields` 三个 SELECT 漏取 `table_columns`，前端拿不到列定义。

**改动**：
- `backend/services/state-values.js`：`validateStateValue()` 新增 `case 'table'`，按 `field.table_columns` 解析列定义，逐列校验数值并应用 min/max；空值列跳过（稀疏），全空时按 `allow_empty` 判定。
- `backend/db/queries/{character,persona,world}-state-values.js`：三处 with-fields SELECT 补 `table_columns` 字段。
- `frontend/src/components/state/StateValueField.jsx`：新增 `field.type === 'table'` 渲染分支，按列展开数字输入框；onBlur 时以 `{colKey: number}` 形式 saveValue，与 `StateFieldEditor` 默认值序列化口径一致。

**约束**：列校验和 StateFieldEditor 列默认值序列化（`StateFieldEditor.jsx:157-165`）三方对齐，统一只接受数字、跳过空列。

**验证**：`npm run lint` 通过；`npm run test:backend` 414/414 pass。

**补丁**：`backend/db/queries/world-state-values.js` 的 `getWorldStateValuesWithFields` SELECT 同步补 `wsf.enum_options`（历史遗漏，与 character/persona 三方对齐），便于世界级 enum 字段在编辑页正确渲染选项。

## 2026-05-10 fix(prompt): nearby 新登场必填强化 — 关键约束块前置 + few-shot example + 缺字段 warn 日志

**背景**：上一轮（f6e92cf）把"新登场必填"加进 prompt 后，LLM 仍倾向只写正文显式提到的字段，新 transient 大量字段空缺。原因：规则放在任务说明第 6 条，注意力权重不够；缺少具体示例；缺少诊断手段。

**改动**：
- `backend/prompts/nearby-prompt.js`：把"新登场必填"提到任务说明前作为「关键约束 ‖ 新登场角色 state 字段必须 100% 填齐」块（带加重符号），并显式列出所有启用字段 key 的并集，要求 state 对象 key 严格等于该集合；增加三档值决定优先级（正文事实 → 暗示推理 → 合理性创作）；禁止占位符列表扩充至 "未知/待定/暂无/不详/无/N/A"；附 few-shot 示例（✓ 全填齐 / ✗ 缺字段）。空池与有池分支共享同一约束文本。
- `backend/memory/combined-state-updater.js`：`applyNearbyResult` 新建 transient 时检测 LLM 返回的 state key 集合，缺字段时写 `NEARBY NEW MISSING FIELDS` warn 日志（含 session、name、missing 字段名），便于诊断 LLM 是否仍未遵守约束。

**约束**：服务端不做 fallback 创作（避免幻觉污染事实），约束完全靠 prompt 表达 + LLM 自觉；warn 日志仅供诊断。

**验证**：`tests/memory/combined-state-updater-nearby.test.js` 6/6 pass（apply 层只加日志，行为不变）。

## 2026-05-10 fix(prompt): nearby state 更新规则——新登场/空字段必须创作补全，已有字段稀疏 patch

**背景**：Task 6 的 nearby prompt 没明确"新登场角色 state 必须填齐"，LLM 倾向只写正文显式提到的字段，导致新 transient 仅 1-2 个字段有值，其余永远为空，附近面板看起来"信息残缺"。

**改动**：`backend/prompts/nearby-prompt.js`：在任务说明中追加 state 写入规则三分支 — (a) 新登场角色必须填齐所有启用字段，正文未提及的依据姓名/记忆/上下文推理性创作合理值，禁止占位符；(b) 池中已有角色仅输出变更字段（稀疏 patch）；(c) 池中已有但某字段当前为空 —— 本轮必须补全。空池分支同步加新登场必填提示。

**约束**：服务端不做 fallback 创作，避免幻觉与事实污染；约束完全靠 prompt 表达 + LLM 自觉。

**验证**：`tests/memory/combined-state-updater-nearby.test.js` 6/6 pass（apply 层未变，行为兼容）。


**背景**：Task 13 把 `nearby_enabled` 字段从 DB 打通到前端编辑器，但写卡助手（assistant 子代理）的知识层、normalize-proposal 校验层尚未感知该字段，LLM 输出 `nearby_enabled` 会被静默丢弃。同时 Task 12 报告了 assistant 端 `/extract-characters` `/confirm-characters` 路由仍在但前端已无调用方，需要本任务统一清理。

**改动 — 同步 nearby_enabled**：
- `assistant/server/normalize-proposal.js`：`STATE_FIELD_KEYS` 追加 `nearby_enabled`（apply 时 `pickAllowed` 自动透传）；create/update 两条归一化路径分别加 explicit 处理 — `target='character'` 时归一为 0/1，其它 target 出现该键直接抛 `nearby_enabled 仅 target='character' 时允许使用`；缺省时不补默认值，留 DB 默认 1
- `assistant/knowledge/WORLDCARD.md`：在"prefix（仅 datetime）"之后新增"nearby_enabled（仅 `target:"character"`）"小节，说明语义、用例（HP/MP/复杂数值表只对正式角色有意义时设 false）、target 限制与"不要主动补 1"规则
- `assistant/knowledge/CHARCARD.md`：在 `stateValueOps 规则` 段添加一句备注 — 字段定义上的 `nearby_enabled` 由 world-card 管理，character-card 不感知不应输出
- `assistant/tests/normalize-proposal-extra.test.js`：新增 1 个用例覆盖 6 个分支（character + 0/true/缺省 / world 拒绝 / persona 拒绝 / update + character 切换 / update + world 拒绝）

**改动 — 清理 legacy 路由**（Task 12 残留）：
- `assistant/server/routes.js`：删除 `POST /api/assistant/extract-characters`（含其使用的 `parseCharacterArray` 内联函数、`buildPromptMessages` 加载器、`SSE` 工具 `openSSE` / `sendSSE` / `endSSE`）与 `POST /api/assistant/confirm-characters`；同步删除 9 个仅供这两个路由使用的 import：`readFileSync` / `path` / `fileURLToPath` / `getCharactersByWorldId` / `createCharacter` / `getConfig` / `getWorldPromptEntryById` / `listWorldPromptEntries` / `listCharacterStateFields` / `getMessagesBySessionId` / `getMessageById` / `getWritingSessionById` / `dbDeleteCharacter` / `upsertCharacterStateValue` / `llm`；同时清理无引用的 `proposalStore` Map + `PROPOSAL_TTL_MS` + 其 GC `setInterval`（曾标注"保留供测试用"，全仓零引用）；header 注释更新为只列 `/agent*` 端点；`__testables` 不再导出 `proposalStore`
- `assistant/prompts/extract-characters.md`：整文件删除（仅供已删路由使用）
- `assistant/tests/routes-http.test.js`：删除 4 个 `/extract-characters` `/confirm-characters` 用例（参数校验 + 走完一轮 ×2）；删除仅供这些用例使用的 `insertWritingSession` 本地 helper 与 `insertWorld` / `insertMessage` import；保留 `sandbox` 与 `postSSE`（仍被 `/agent` 用例使用）
- `ARCHITECTURE.md` §4.x 写作助手模型切换：移除 `routes.js（extract-characters）` 括号注释，只列 parent-agent / sub-agent

**未改动**：
- `assistant/server/tools/apply-world-card.js`：tool schema 中 `stateFieldOps: { type: 'array' }` 已是 open 数组，不限制内层字段；`apply_world_card` 透传到 `normalizeProposal`，nearby_enabled 走新加的归一化分支即可，无需改 tool definition
- `assistant/server/tools/apply-character-card.js`：character-card 提案不携带 stateFieldOps（白名单 `STATE_TARGETS_BY_PROPOSAL_TYPE['character-card']` 为空集，已在 normalize 处拒绝），nearby_enabled 不可能从 character-card 路径进入，无需改动
- `assistant/knowledge/CONTRACT.md`：契约表格只列 proposal 顶层结构，不展开字段细节，无需改动

**验证**：`assistant npm test` 全绿（含新加 nearby_enabled 用例）；`backend npm run test` 全绿；`frontend npm run test` 全绿；`npm run lint` 全绿。

**残留**：无。

## 2026-05-10 feat(state): character_state_fields 增加 nearby_enabled 编辑入口（Nearby Task 13）

**背景**：Task 1 在 `character_state_fields` 上加了 `nearby_enabled INTEGER NOT NULL DEFAULT 1` 列，但 CRUD 链路一直忽略它，UI 也没有控制入口。本任务把它从 DB → service → route → frontend API → 编辑器 UI 打通。

**改动**：
- `backend/db/queries/character-state-fields.js`：INSERT 列表追加 `nearby_enabled`（默认 1，显式传 0 / false 才落 0）；UPDATE allowed 列表追加 `nearby_enabled`，写入时归一为 0/1
- `backend/tests/db/queries/state-fields.test.js`：新增 2 个用例 — character 默认/显式/update 切换可读回；persona/world 字段对象上不应出现 `nearby_enabled` 键
- `frontend/src/components/state/StateFieldEditor.jsx`：新增 `scope` prop（StateFieldList 早就传了，编辑器之前没用）；form 初值从 `field.nearby_enabled` 读取，缺省 1；仅 `scope === 'character'` 时在"更新方式"下方渲染复选框，并把 `nearby_enabled` 加进 onSave payload；world / persona 编辑面板完全不显示该项

**未改动（已自然透传）**：
- `backend/services/character-state-fields.js`：直接转发 `data` / `patch`，无白名单
- `backend/routes/state-fields.js`：`req.body` 整体透传到 service
- `frontend/src/api/character-state-fields.js` + `state-fields-factory.js`：data / patch 整体作为 body 发送

**验证**：`backend npm run test` 414/417 pass（3 skip 与本任务无关）；`frontend npm run lint` 0 错；`frontend npm run test` 139/139 pass。

**残留**：该字段是否真的在 nearby 面板/状态更新中起作用由后续任务读取该列实现。

## 2026-05-10 feat(ui): 制卡 modal 重写 — 候选改为本轮登场角色（Nearby Task 12）

**背景**：Nearby Characters Task 12 — 把 stub 状态的 `MakeCardModal` 实装为基于 `nearby` 池的两步制卡流程；同时清理 Task 11 残留的 legacy "提取角色" UI 链路（前端按钮已无对应后端可用入口，属死代码）。

**改动**：
- `frontend/src/components/book/MakeCardModal.jsx`：实装 pick → preview 两步骤；pick 列出本轮 nearby（含已保存标记），点击触发 `analyzeNearbyForCard`；preview 四字段（name / description / system_prompt / first_message）可编辑，确认调用 `createCharacterFromNearby`；包含 loading（按钮 disabled + 文案）/ empty（"本轮无登场角色"）/ error（pushErrorToast，409 提示同名占用）三态；视觉沿用 `we-cast-add-modal-*`，新增 `we-make-card-modal-*` 字段块（无 hex/rgba，全部走 `--we-*` token）
- `frontend/src/index.css`：在 `we-cast-add-modal-close` 之后新增 `we-make-card-modal-preview/field/label/input/textarea/footer` 样式块
- `frontend/src/styles/ui.css`：删除 `we-character-preview-*`（98 行）与 `we-character-analyzing-*`（28 行）样式块；保留 `@keyframes we-spin`（其它消费者仍在用，定义另在 index.css）
- `frontend/src/components/writing/CharacterPreviewModal.jsx`：**删除**
- `frontend/src/components/writing/CharacterAnalyzingModal.jsx`：**删除**
- `frontend/src/components/index.js`：删除 `CharacterPreviewModal` 导出与空的 `// — Writing 专属 —` 段
- `frontend/src/pages/WritingSpacePage.jsx`：删除 `CharacterPreviewModal` / `CharacterAnalyzingModal` import；删除 `extractCharactersFromMessage` / `confirmCharacters` import；删除 state `cardPreviewChars` / `cardAnalyzing` 与 ref `makingCardRef`；删除 `handleMakeCard` / `handleConfirmCards` 两个函数；删除 `MessageList` 上的 `onMakeCard` prop；删除底部 AnimatePresence 中的两个 modal 块；移除空 import `pushToast`
- `frontend/src/api/writing-sessions.js`：删除 `extractCharactersFromMessage` / `confirmCharacters` 两个函数（对应后端路由仍在 `assistant/server/routes.js`，留给 Task 14 写卡助手对接处理）
- `frontend/src/components/chat/MessageList.jsx`：删除 `onMakeCard` prop 与转发
- `frontend/src/components/writing/WritingMessageItem.jsx`：删除 `onMakeCard` prop 与"制卡"按钮
- `frontend/tests/pages/writing-space-page.test.jsx`：删除 `extractCharactersFromMessage` / `confirmCharacters` mock 与 `CharacterPreviewModal` / `CharacterAnalyzingModal` 两个 vi.mock

**验证**：`npm run check` 全绿（frontend 48 文件 139 测试、backend、assistant 115 测试 + lint 全部通过）。

**残留**：assistant 端 `/api/assistant/extract-characters` `/confirm-characters` 路由及其测试仍在，由 Task 14 写卡助手对接统一处理；前端已无任何调用方。

## 2026-05-10 refactor: 整表删除 writing_session_characters；写作主 prompt 移除 [4]/[7] 角色段

**背景**：附近角色特性 Task 11（Option C）— 写作模式不再有"激活角色"概念，主 prompt 中的角色级段在写作模式下整体消失，角色出场由叙事文本驱动，nearby 池（Task 10 已落库）由副 LLM 单独维护状态。承接 Task 10 暂留的 CastPanel 文件与三个 active 角色 API。

**Prompt 段位变更**（`backend/prompts/assembler.js` `buildWritingPrompt`）：
- **[4] 角色 System Prompt 不注入**（`<char_info>` 段移除）
- **[7] 角色状态段不注入**（`<char_state>` 段移除）
- 写作 prompt 现含：[1] 全局 + [2] 常驻 cached + [3] 玩家 + [5] 世界状态 + [6] 玩家状态 + [8] 世界条目 + [8.5] 长期记忆 + [9] 召回摘要 + [10] 记忆展开 + [11] 日记 + [12] 历史 + [13+14] 后置/当前消息
- 锁定文件 `assembler.js` 已通过任务授权改动；`buildPrompt`（chat 模式）保持不变

**改动**：
- `backend/db/schema.js`：删除 `CREATE TABLE IF NOT EXISTS writing_session_characters` 块与 `CREATE INDEX ... idx_writing_session_characters_session_id`；在 `initSchema` 末尾追加迁移 `DROP TABLE IF EXISTS writing_session_characters`
- `backend/prompts/assembler.js`：`buildWritingPrompt` 删除 [4]/[7] 注入循环、`activeCharacters` 变量、`getWritingSessionCharacters` import、`tvChar` 闭包、`escapeXmlContent`/`escapeXmlAttr` 工具函数（仅这两段使用）；改写头部 jsdoc 与 cached/dynamic layer 注释；chat 路径完全未动
- `backend/prompts/entry-matcher.js`：state 条件评估写作分支由"对每个激活角色逐个评估"改为"含 `角色.*` 条件直接跳过"；删除 `getWritingSessionCharacters` import（chat 分支保留 `buildCharacterStateMap`/`mergeStateMaps`）
- `backend/memory/turn-summarizer.js`：写作模式 `characterIds` 直接置 `[]`（nearby snapshot 由本文件下方 nearby 段独立写入）；删除 `getWritingSessionCharacters` import
- `backend/routes/sessions.js`：编辑/删除消息路径写作模式 `characterIds = []`；删除 `getWritingSessionCharacters` import
- `backend/routes/session-state-values.js`：`/state-values` 写作模式不再聚合多角色 character 段，统一返回 `[]`；删除 import
- `backend/routes/writing.js`：删除 `GET/PUT/DELETE /:worldId/writing-sessions/:sessionId/characters` 三个端点；`runWritingStream` / `continue` / `regenerate` / `edit-assistant` 中所有 `getWritingSessionCharacters(...).map(c => c.id)` 替换为 `[]`；移除相关 import 与"CastPanel"日志注释
- `backend/services/writing-sessions.js`：删除 `getWritingSessionCharacters` / `addWritingSessionCharacter` / `removeWritingSessionCharacter` 三个 wrapper 与对应 db import 别名
- `backend/db/queries/writing-sessions.js`：删除同名三个查询函数；文件保留（其余 session CRUD 仍在用）
- `assistant/server/routes.js`：`/extract-characters` 与 `/confirm-characters` 创建角色卡后不再 `addWritingSessionCharacter`；删除 import；角色卡仍正常落 `characters` 表，只是不自动激活
- `frontend/src/components/book/CastPanel.jsx`：**删除**
- `frontend/src/components/index.js`：删除 `CastPanel` 导出
- `frontend/src/api/writing-sessions.js`：删除 `listActiveCharacters` / `activateCharacter` / `deactivateCharacter` 三个函数
- 测试同步：`backend/tests/prompts/assembler.test.js` 把"buildWritingPrompt 合并多角色条目"改写为"写作模式不注入 [4]/[7] 角色段"断言（`assert.doesNotMatch <char_info>/<char_state>`）；`backend/tests/prompts/assembler-shape.test.js` 删除 `INSERT INTO writing_session_characters`，写作分支锚点列表去掉 `ANCHOR_[3]_CHAR_*` 与 `ANCHOR_[6]_CHAR_STATE`；`__snapshots__/assembler-shape.snap` 同步更新；`backend/tests/routes/writing.test.js` 删除"写作会话角色管理路由可正常工作"测试与其他测试中残留的 `PUT /characters/:id` 调用与 `insertCharacter` 引用；`frontend/tests/api/writing-sessions.test.js` / `writing-space-page.test.jsx` 删除 `listActiveCharacters` 导入/mock 与 CastPanel mock
- 文档：`SCHEMA.md` 删除 `### writing_session_characters` 整节、删除策略段引用、state 条目语义段写作模式行为更新；`ARCHITECTURE.md` §4 buildWritingPrompt 段位差异表改写、§8 state 字段语义段更新、§9 writing 模式 `{{char}}` 替换说明、§11 数据模型表"激活角色"行替换为 nearby、§12 路由表注释更新

**验证**：
- `npm run test:backend` → 412 pass / 0 fail / 3 skip
- `npm run test:frontend` → 48 文件 / 139 测试全过
- `npm run lint` → 全过（前端 ESLint + assistant 语法检查 + git hygiene）
- grep 全 src 已无 `writing_session_characters` / `activateCharacter` / `deactivateCharacter` / `listActiveCharacters` / `CastPanel` / `getWritingSessionCharacters` / `addWritingSessionCharacter` 残留（仅 schema.js 的 DROP 迁移、CHANGELOG/SCHEMA/ARCHITECTURE 备忘、NearbyPanel.jsx 一行历史注释保留）

**坑点**：
- `entry-matcher` writing 分支只是"角色级条件不再触发"——选择的是 spec Option (a)。不重定向到 nearby，因为 nearby 的状态字段集是 character_state_fields 的子集（`nearby_enabled=1`），且 nearby 由副 LLM 维护，不参与世界 prompt 条目触发；如果未来需要 nearby 触发条目，再独立设计
- `captureStateSnapshot` / `restoreStateFromSnapshot` / `getSessionCharacterStateValues` 等下游均能正确处理 `characterIds=[]`（早就有 `if (characterIds.length === 0) return []` 类保护），实测验证通过
- `writing-session-characters.js` queries 文件保留为该文件还有 `getWritingSessionById` / `createWritingSession` 等 session CRUD；只删了 3 个角色相关函数
- `messages` 仍是 PUT 的 404：`backend/tests/routes/writing.test.js` 删除涉及该端点的所有调用，连带删除一并失效的 `insertCharacter` import

## 2026-05-10 feat(ui): NearbyPanel 替换 CastPanel — 附近区块 + 角色卡添加

**背景**：附近角色特性 Task 10 — 写作页右侧栏从 Cast（激活角色）切到 Nearby（附近角色池）。CastPanel 暂留文件系统（Task 11 删），与 `activeCharacters` 概念一同退出 WritingSpacePage。

**改动**：
- 新增 `frontend/src/components/book/NearbyPanel.jsx`：复制 CastPanel 骨架，去掉顶部印章行（无 Cast 概念），新增「附近」段（标题栏右侧两个动作 `＋角色卡` / `制卡`），保留「世界 / {{user}} / TIMELINE」三段。`useSessionState` 不动；nearby 由面板内 `useEffect + fetchNearby` 自管，依赖 `[worldId, sessionId, stateTick]`，setState 走 `Promise.resolve().then(...)` 规避 `react-hooks/set-state-in-effect`。
- 新增 `frontend/src/components/book/NearbyCharacterBlock.jsx`：单角色折叠块。已保存角色头部显示朱砂圆点 `we-nearby-seal`；记忆段 `we-nearby-memory` 点击进入编辑（textarea + 保存/取消）；状态部分复用 `StatusSection`，将后端的 `runtime_value_json` 一次性映射为 `effective_value_json` 给 StatusSection 读。写操作走 `setNearbySaved` / `patchNearbyMemory` / `patchNearbyState` / `removeNearby`，完成后 `onChange()` 触发父级 reload。
- 新增 `frontend/src/components/book/AddSavedNearbyModal.jsx`：列出 `getCharactersByWorld(worldId)`，按 nearby 当前名字集合去重（同名禁用「已在池中」），调 `addSavedNearbyFromCharacter`；409 提示「名字已在登场角色池中」。
- 新增 `frontend/src/components/book/MakeCardModal.jsx`：Task 12 占位，`return null`；保证 NearbyPanel 「制卡」按钮可挂接不崩。
- `frontend/src/pages/WritingSpacePage.jsx`：删除 `listActiveCharacters` import / `activeCharacters` state / `enterSession` 内 active chars 加载 / `handleConfirmCards` 内 `setActiveCharacters` 注入；`<CastPanel>` → `<NearbyPanel>`（去掉 `activeCharacters` / `onActiveCharactersChange` props）。CastPanel 保留在文件系统但不再被引用，待 Task 11 删除。
- `frontend/src/components/index.js`：注册 `NearbyPanel` / `NearbyCharacterBlock` / `AddSavedNearbyModal` / `MakeCardModal`。
- `frontend/src/index.css`：cast 块下追加 NearbyPanel 子样式 — `we-nearby-seal`（朱砂圆点 `var(--we-vermilion)` 8×8）、`we-nearby-memory`（左竖线 + 缩进段，`var(--we-text-sm)` + `var(--we-ink-faded)`）、`we-nearby-memory-edit/-actions`（编辑态布局）、`we-nearby-section .we-state-section-reset` 兄弟间距。
- `frontend/tests/pages/writing-space-page.test.jsx`：新增 `NearbyPanel.jsx` 模块 mock；将三处 `waitFor(listActiveCharacters)` 断言换成 `waitFor(listWritingSessions)`，因为 active chars 加载链路已删。

**验证**：`npm run lint` 全过；`cd frontend && npm run test` → 48 文件 / 139 测试全过。

**坑点**：
- `StatusSection` 只读 `effective_value_json`，nearby 后端只给 `runtime_value_json`，必须在 NearbyCharacterBlock 内做一次映射；`onSave` 仍传原始 valueJson 给 `patchNearbyState`。
- `react-compiler` 严格 useMemo 依赖：`[nearby?.state]` 被判 "less specific than inferred"，改成 `[nearby]` 才过 lint。
- 旧 `handleConfirmCards`（章节内提取角色）仍可调；现在不再写 `activeCharacters`，新角色卡直接落库到 `characters` 表，由 Task 11 后续统一清理 active 概念。
- `MakeCardModal` 在 NearbyPanel 内是真打开（state 控制），但组件 `return null`；点击「制卡」无可见反馈是预期，Task 12 才补可视实现。

## 2026-05-10 feat(api): session-nearby 前端 API 封装

**背景**：附近角色特性 Task 9 — 给前端补齐 nearby 全链路 API 封装，配合 Task 5/8 的后端路由。

**改动**：
- `frontend/src/api/session-nearby.js`（新文件，~60 行）：基于现有 `request` wrapper 导出 10 个方法 — `fetchNearby` / `addSavedNearbyFromCharacter` / `patchNearby` / `setNearbySaved` / `patchNearbyMemory` / `patchNearbyName` / `patchNearbyState` / `removeNearby` / `analyzeNearbyForCard` / `createCharacterFromNearby`；URL 前缀 `/api/worlds/:worldId/writing-sessions/:sessionId/nearby/...`。

**验证**：人工 grep 确认 import 路径与方法名；调用方接入留待 Task 10/11。

**坑点**：`writing-sessions.js` 用裸 `fetch`、`characters.js` 用 `request` wrapper；新文件统一走 `request` 以获得 4xx/5xx 自动抛错和 204 处理。`activateCharacter` / `deactivateCharacter` 暂留在 `writing-sessions.js`，由 Task 11 统一清理。

## 2026-05-10 feat(card): nearby → 公共角色卡 制卡服务 + 路由

**背景**：附近角色特性 Task 8 — 让用户把会话内的 nearby 角色"制成"公共角色卡，分两步：先 LLM 生成草稿，再用户确认后落库。

**改动**：
- `backend/services/nearby-card-maker.js`（新文件）：
  - `analyzeNearbyForCard(sessionId, nearbyId)`：取 nearby 行 + state values + 最近 6 轮（≤12 条）消息，拼 prompt 调 `llm.complete`（temp 0.7、max 1024、`configScope = resolveAuxScope(sessionId)`、`callType: 'nearby_card_analyze'`）。返回 `{ name, system_prompt, description, first_message }`，`name` 透传 nearby 当前名；LLM 非法 JSON 抛 `Error('LLM returned invalid JSON')`。
  - `createCharacterFromNearby({ worldId, sessionId, nearbyId, name, system_prompt, description, first_message })`：校验 session 属 world、nearby 属 session；`createCharacter` 写入 `characters` 表（`post_prompt=''`、`avatar_path=null`）；过滤 `character_state_fields.nearby_enabled === 1` 的字段，把 nearby 的 `runtime_value_json` 写入新角色的 `default_value_json`（不写 runtime、不带 memory、不带 nearby id）。返回新 charId。校验失败抛带 `code` 的 Error（`NEARBY_NOT_FOUND` / `SESSION_NOT_FOUND` / `NEARBY_SESSION_MISMATCH` / `SESSION_WORLD_MISMATCH`）。
- `backend/routes/writing.js`：新增 `POST /api/worlds/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/analyze`；错误走既有 `handleNearbyError`。
- `backend/routes/characters.js`：新增 `POST /api/worlds/:worldId/characters/from-nearby`，必须排在 `:id` 系列前。错误码映射：`NEARBY_NOT_FOUND`/`SESSION_NOT_FOUND` → 404，`*_MISMATCH` 与 `name required` → 400，其它 500。
- `backend/tests/services/nearby-card-maker.test.js`（新文件，4 用例）：mock LLM 走 `MOCK_LLM_COMPLETE` 环境变量；用例覆盖①草稿 name 透传 + LLM 三字段、②LLM 非 JSON 抛错、③仅启用字段写 default_value_json + runtime/memory/nearby id 不写、④校验错误（缺 name / nearby 不存在 / session 跨 world）。

**验证**：
- `cd backend && node --test tests/services/nearby-card-maker.test.js` → 4/4 pass。
- `npm run test:backend` → 413 pass / 0 fail / 3 skip，无回归。
- `npm run lint` → 通过。

**坑点**：
- writing session 与 chat session 共用 `sessions` 表（`mode='writing'`），无独立 `writing_sessions` 表；`getWritingSessionById` 仅多一个 `mode='writing'` 过滤。
- mock LLM 的标准做法是 `process.env.MOCK_LLM_COMPLETE = ...`，无需 `mock.method` / 注入参数；service 不为测试改生产 API。
- characters 路由把 `from-nearby` 放在 `:id` 系列之前，避免 Express 把 `from-nearby` 当作 `:id`。

## 2026-05-10 feat(state): turn_records snapshot 增加 nearby 层 + 回滚还原

**背景**：附近角色特性 Task 7 — 让每轮 turn record 的 `state_snapshot` 同时记录 nearby 池与其状态，使消息编辑/regenerate 回滚能精确还原"本轮登场角色"。

**改动**：
- `backend/memory/turn-summarizer.js`：在 `captureStateSnapshot` 之后，仅当 `session.mode === 'writing'` 时把 `listNearbyBySessionId` + `getStateValuesByNearbyId` 拼成 `snapshot.nearby = [{id,name,memory,is_saved,state}]`，与 world/persona/character 并列写入 JSON。chat 模式不写该字段（向下兼容）。
- `backend/memory/state-rollback.js`：`restoreStateFromSnapshot`
  - `snapshot=null` 分支追加：清空 nearby 两张表（CASCADE）。
  - 主路径末尾追加：先 `deleteNearbyById` 全删旧 nearby（CASCADE 同步清 state values），再按 `snapshot.nearby` 数组用 `createNearbyCharacter` + `upsertNearbyStateValue` 重建；id 不复用、新发 UUID；缺失/非数组（旧记录） → 仅清空（向下兼容）。
- `backend/tests/memory/state-rollback.test.js`：新增 2 个用例
  - 含 nearby 层 → 还原后旧 nearby 被清掉、name/memory/is_saved/state 全部回写、id 不复用；
  - 缺 nearby 字段（旧记录） → nearby 两张表清空。
- `SCHEMA.md`（本地，gitignored）：`turn_records.state_snapshot` JSON 示例添加 nearby 层 + 还原行为说明。

**验证**：
- `cd backend && node --test tests/memory/state-rollback.test.js` → 5/5 pass（原 3 + 新 2）。
- `npm run test:backend` → 409 pass / 0 fail / 3 skip，无回归。

**坑点**：
- snapshot 中保存的 nearby `id` 不复用：写作模式下 turn 之间不依赖 id 稳定（语义层只关心 name/state/memory/is_saved），新发 UUID 与池内现有约束更安全。
- `nearby: []` 与 `undefined nearby` 必须区分——前者代表"启用 nearby 但本轮空池，回滚要清干净"，后者代表旧记录无该字段、走向下兼容（同样清空，但语义不同）。
- nearby 层只在 `mode==='writing'` 时写入；chat 会话的 `session_nearby_characters` 始终为空，CASCADE 自然处理，无需特殊分支。

## 2026-05-10 feat(state): combined-state-updater 集成 nearby pool + applyNearbyResult

**背景**：附近角色特性 Task 6 — 在 `mode === 'writing'` 的同一次状态更新 LLM 调用里，让模型同时输出 `nearby_characters` 数组（本轮登场角色），并应用到 `session_nearby_characters` / `session_nearby_character_state_values`。

**改动**：
- 新建 `backend/prompts/nearby-prompt.js`：`buildNearbyPromptSection(pool, fields)`，渲染池条目 + nearby_enabled 字段定义 + 5 条任务说明；空池有简化文案。
- `backend/memory/combined-state-updater.js`：
  - 引入 nearby queries 与 `buildNearbyPromptSection`；
  - `updateAllStates` 按 `session?.mode === 'writing'` 组装 pool（`{id, name, is_saved, memory, state}`，state 由 `getStateValuesByNearbyId` 反序列化），追加 nearby 段，response keys 增加 `nearby_characters`；
  - 解析 patch 后，`isWriting` 时调用新增导出 `applyNearbyResult({ sessionId, worldId, fields, nearby_characters, pool })`；chat 模式分支不动；
  - `applyNearbyResult` 实现 6 条规则：ref_id 命中→更新 name/memory/state；ref_id=null+name 命中等同更新；ref_id=null+name 不在池→创建 transient（is_saved=0）；非法 ref_id 整条丢弃；池里没回的 transient 由 `deleteTransientNotInIds` 删（saved 全部保留）；未启用字段直接跳过。**复用本文件已有 `validateValue`**，避免与主 state patch 行为漂移。
  - `__testables` 新增 `applyNearbyResult` 导出。
- 新建 `backend/tests/memory/combined-state-updater-nearby.test.js`（node:test + sandbox），6 个场景全部 PASS。

**验证**：
- `cd backend && node --test tests/memory/combined-state-updater-nearby.test.js` → 6/6 pass。
- `cd backend && node --test tests/memory/combined-state-updater.test.js` → 4/4 pass，无回归。
- `npm run test:backend` → 410 pass / 0 fail / 3 skip。

**坑点**：
- `validateValue` 故意未抽出到独立 helper 文件——它依赖闭包 logger/常量；与 `applyNearbyResult` 同文件共享同一份校验，避免 serializer 漂移（spec 强调"必须复用"）。
- 改名时先在池里查同名占用，避免 nearby `(session_id, name)` UNIQUE 冲突；冲突仅 warn 不抛。
- 新建 transient 若仍 UNIQUE 冲突（极端情况），降级为复用同名既存行，不阻塞主流程。
- nearby 段插在 sections 末尾（与 persona 并列），response keys 同步追加；位置不影响协议正确性。

## 2026-05-10 feat(route): nearby characters HTTP 路由 + 集成测试

**背景**：附近角色特性 Task 5 — 在 service 层（Task 4）之上暴露写作会话登场角色 HTTP 路由。

**改动**：
- `backend/routes/writing.js`：新增登场角色路由段（按现有 `/:worldId/writing-sessions/:sessionId/...` mount 风格落点）：
  - `GET    /:worldId/writing-sessions/:sessionId/nearby` → 200 list
  - `POST   /:worldId/writing-sessions/:sessionId/nearby`（body `{ character_id }`） → 201 `{ id }`；缺 `character_id` 返回 400（路由层校验，不进 service）
  - `PATCH  /:worldId/writing-sessions/:sessionId/nearby/:nearbyId`（body `{ is_saved? | memory? | name? }`）按 name → is_saved → memory 顺序调用 service，最后 `listNearby` 取该项返回；重名 409
  - `PATCH  /:worldId/writing-sessions/:sessionId/nearby/:nearbyId/state`（body `{ field_key, value_json }`） → 200 `{ ok: true }`；缺 `field_key` 400；字段未启用 400
  - `DELETE /:worldId/writing-sessions/:sessionId/nearby/:nearbyId` → 204
  - `handleNearbyError(err, res)` 统一映射：`code === 'NEARBY_NAME_CONFLICT'` → 409；`/not found/i` → 404；`/required|not enabled|world mismatch|not in this world/i` → 400；其它 500 + log.error
- `backend/tests/routes/writing-nearby.test.js`：node:test + `createRouteTestContext` + fetch（与 `writing.test.js` 一致风格）8 个用例覆盖：POST+GET 正常路径、POST 缺参 400、POST 重名 409、PATCH is_saved 切换 200、PATCH 重命名冲突 409、PATCH state 200、PATCH state 缺 field_key 400、DELETE 204。

**坑点**：service 实际抛错文案是 `character world mismatch: ...` 而非 plan 描述里的 `'Character not in this world'`，因此 `handleNearbyError` 的 400 正则把 `world mismatch` 也加进去（兼容 plan）。POST 缺 `character_id` 走路由层校验（400），不走 service 的「character not found」路径（那条是 404），语义不同。

**验证**：`npm run test:backend` → 401/404 pass（3 skipped，无回归，新增 8 个 nearby 路由用例全部通过）。

## 2026-05-10 feat(service): nearby characters CRUD service 层 + 单测

**背景**：附近角色特性 Task 4 — 在 queries 层（Task 2/3）之上提供写作会话级登场角色 CRUD 业务逻辑层。

**改动**：
- `backend/services/writing-sessions.js`：追加 7 个导出函数 `listNearby` / `addSavedFromCharacter` / `removeNearby` / `setNearbyIsSaved` / `patchNearbyMemory` / `renameNearby` / `patchNearbyState`，以及内部辅助 `ensureWritingSession` / `ensureNearbyOwned` / `getNearbyEnabledFields` / `buildNearbyRow` / `nameConflictError`。
  - `addSavedFromCharacter`：校验 session 存在、character 存在且 world 匹配、name 在 session 内未被占用（占用抛 `Error.code='NEARBY_NAME_CONFLICT'`）；建 nearby（is_saved=1, memory=''），从 `character_state_values.default_value_json` 复制到 nearby state，仅复制 `nearby_enabled=1` 字段，`default_value_json IS NULL` 跳过。
  - `renameNearby`：trim 后非空校验；与当前 name 一致时为 no-op；其它人占用抛 `NEARBY_NAME_CONFLICT`。
  - `patchNearbyState`：写入字段必须存在于该 world 且 `nearby_enabled=1`，否则抛错。
  - `listNearby` 返回结构：`{ id, session_id, name, memory, is_saved, created_at, updated_at, state: [{ field_key, label, type, description, enum_options, min_value, max_value, prefix, unit, table_columns, runtime_value_json }] }`，state 仅包含启用字段，未写入字段 `runtime_value_json=null`。
- `backend/tests/services/nearby-characters.test.js`：node:test 9 个用例覆盖：仅复制启用字段 + listNearby 形状、name 占用冲突、跨 world 拒绝、CASCADE 删 state、跨 session 拒绝、is_saved 切换、memory null→空串、改名/重名/同名 no-op/空名拒绝、patchNearbyState 启用 OK/未启用拒绝/不存在拒绝。

**坑点**：fixtures `insertCharacterStateField` 的 INSERT 不含 `nearby_enabled` 列（schema ALTER 加默认值 1，因此插入后默认为 1）；要测"未启用字段"需在测试 setup 用 raw SQL `UPDATE character_state_fields SET nearby_enabled=0` 显式置 0，避免改 fixtures.js 影响面。`getCharacterStateFieldsByWorldId` 用 `SELECT *` 已自动带出 `nearby_enabled` 列。

**验证**：`cd backend && node --test tests/services/nearby-characters.test.js` → 9/9 pass；`npm run test:backend` → 393/396 pass（3 skipped，无回归）。

## 2026-05-10 feat(db): session-nearby-characters queries + 单测

**背景**：附近角色特性 Task 2 — 在 schema（Task 1）之上为 `session_nearby_characters` 表提供 CRUD + 清理 queries 层。

**改动**：
- `backend/db/queries/session-nearby-characters.js`：新增 `createNearbyCharacter` / `getNearbyById` / `getNearbyByName` / `listNearbyBySessionId` / `updateNearbyName` / `updateNearbyMemory` / `updateNearbyIsSaved` / `deleteNearbyById` / `deleteTransientNotInIds`。沿用 `import db from '../index.js'` 项目惯例；id 用 `crypto.randomUUID()`，时间戳用 `Date.now()`。`listNearbyBySessionId` 排序为 `is_saved DESC, created_at ASC`（saved 置顶）。`updateNearbyIsSaved` 接 truthy/falsy 一律转 0/1。`getNearbyById` / `getNearbyByName` 未命中返回 `null`（`?? null`）。
- `backend/tests/db/queries/session-nearby-characters.test.js`：node:test + sandbox/fixtures 模式（项目实际惯例，非 plan 文中 vitest），10 个测试覆盖默认值、UNIQUE 冲突、列表排序、命中/未命中、updated_at 刷新、is_saved 强转、删除、cleanup 保留 saved/白名单、空 keepIds。

**坑点**：`deleteTransientNotInIds(sessionId, [])` 若直接拼 `id NOT IN (NULL)`，SQLite 三值逻辑下整体为 NULL（≠ TRUE），结果一行都不删——与"清空白名单 = 删全部 transient"语义相反。实现里改成 `keepIds.length === 0` 时走不带 `NOT IN` 的分支，单测 `空数组时删除所有 transient` 专门覆盖此路径。

**验证**：`cd backend && node --test tests/db/queries/session-nearby-characters.test.js` → 10/10 pass。

## 2026-05-10 feat(db): 新增 session_nearby_characters 表与 character_state_fields.nearby_enabled 列

**背景**：实施"附近 / 登场角色"特性 Task 1（DB schema），spec `docs/superpowers/specs/2026-05-10-nearby-characters-design.md` §3。

**改动**：
- `backend/db/schema.js`：在 TABLES 字符串内 `writing_session_characters` 块之后追加两张新表 `session_nearby_characters`（session 内出场角色，含 transient 与 saved 两类，UNIQUE(session_id, name)）和 `session_nearby_character_state_values`（nearby 角色的会话级状态值，UNIQUE(nearby_id, field_key)）；外键全部 `ON DELETE CASCADE`。在 `initSchema` 末尾追加 `ALTER TABLE character_state_fields ADD COLUMN nearby_enabled INTEGER NOT NULL DEFAULT 1`，旧行由 SQLite 默认值自动填 1；同时为两张新表补建索引 `idx_session_nearby_characters_session_id`、`idx_session_nearby_character_state_values_nearby_id`。
- `SCHEMA.md`：在 `writing_session_characters` 段加上"将整表删除"备注；新增 `session_nearby_characters` / `session_nearby_character_state_values` 两节；`character_state_fields` 表加上 `nearby_enabled` 行。

**注意**：本仓库迁移段统一用 `try { db.exec(\`ALTER TABLE ... ADD COLUMN ...\`); } catch {}` 模式，不存在 plan 文中提到的 `ensureColumn` 助手；沿用现有模式即可达到"列已存在则忽略"的效果。

**验证**：`cd backend && npm test` 全绿（369 pass / 3 skip）。

## 2026-05-10 chore(desktop): 瘦身 Node 运行时 + 限制 Electron 语言包，三平台再减重 ~25%

**问题**：在按 arch 过滤 Node 运行时之后（前一条 changelog），mac-arm64 .app 仍 516M。继续拆解发现两块冗余：
- 每份打包内的 Node 运行时附带 `include/`（66M C++ 头文件）、`lib/node_modules/npm`（15M）、`share/`、`README.md`/`CHANGELOG.md`/`LICENSE`、以及 `bin/{npm,npx}` 软链；win32 同理含 `node_modules/npm`、`npm*`/`npx*` 启动脚本和 `install_tools.bat` 等。Backend 通过 `spawn(node, ['server.js'])` 调用，根本不用这些。
- Electron 默认随包附带 55 套 .lproj 语言资源（mac 约 45M），WorldEngine 是简中应用，不需要其它语言。

**改动**：
- `desktop/scripts/prepare-build.js`：新增 `slimRuntime(runtimeDir, platform)`，在 `prepareRuntime()` 末尾调用；同时在缓存命中分支也调一次保证旧缓存幂等清理。darwin 删 `include/`、`share/`、`lib/node_modules/`、`bin/npm`、`bin/npx`、根目录三份文档；win32 删 `node_modules/`、所有 `npm*`/`npx*` 启动脚本、`install_tools.bat`、`nodevars.bat`、文档。瘦身后 darwin 仅留 `bin/node`，win32 仅留 `node.exe`。
- `desktop/electron-builder.json`：顶层加 `"electronLanguages": ["en", "zh_CN", "zh_TW"]`，把 Electron 语言资源从 55 套裁到 3 套。

**实测结果**（与"前一条 changelog 后"对比）：

| 产物 | 上轮 | 这轮 |
|---|---|---|
| mac-arm64 .app | 516M | **390M** |
| mac-x64 .app | 551M | **420M** |
| win-unpacked | ~520M | **433M** |
| mac-arm64.dmg | 174M | **151M** |
| mac-x64.dmg | 182M | **159M** |
| win-x64.exe (nsis) | — | **119M** |

累计三平台 DMG/EXE 较最初分别减重 44% / 42% / 59%。

**验证**：`cd desktop && npm run dist` → 检查 `dist/{mac-arm64,mac}/WorldEngine.app/Contents/Resources/node/<arch>/` 仅含 `bin/node`；`dist/win-unpacked/resources/node/win32-x64/` 仅含 `node.exe`；mac .app 中 `Frameworks/Electron Framework.framework/Versions/A/Resources/` 仅含 `en.lproj`/`zh_CN.lproj`/`zh_TW.lproj`。启动 .app 后通过 `pgrep` 确认后端进程使用瘦身后的 `bin/node` 正常拉起。已实测通过。

---

## 2026-05-10 chore(desktop): 按目标 arch 过滤 Node 运行时，安装包减重 ~38%

**问题**：mac arm64 .app 实测 832MB（DMG 272MB），其中 `Resources/node/` 单独占 522MB——每个平台/架构的安装包都把全部三套 Node.js 运行时（darwin-arm64 / darwin-x64 / win32-x64）一起打了进去。`desktop/electron-builder.json` 顶层 `extraResources` 把 `node-runtime/` 整目录无差别注入，没按目标平台过滤。

**改动**：`desktop/electron-builder.json`：
- 删除顶层 `extraResources` 中 `node-runtime → node` 那条。
- `mac.extraResources` 新增 `{ from: "node-runtime/darwin-${arch}", to: "node/darwin-${arch}" }`，多 arch 构建时 `${arch}` 会按 arm64/x64 分别展开，各包只包含自身 runtime。
- `win.extraResources` 同理 `win32-${arch}`。
- `desktop/scripts/prepare-build.js` 不变，开发期仍预下载三套以便复用缓存。
- `desktop/src/main.js` 的 `node/${process.platform}-${process.arch}` 路径解析与新目录天然吻合，无需改动。

**实测结果**（electron-builder 26.8.1）：

| 产物 | 改前 | 改后 |
|---|---|---|
| mac-arm64 .app | 832M | **516M**（-316M / -38%） |
| mac-x64 .app | ~830M | **551M** |
| mac-arm64.dmg | 272M | **174M** |
| mac-x64.dmg | 272M | **182M** |

**验证**：`cd desktop && npm run build` → 检查 `dist/mac-arm64/WorldEngine.app/Contents/Resources/node/` 应**仅含** `darwin-arm64`（mac-x64 同理仅含 `darwin-x64`）；启动 .app 后通过 `pgrep` 确认后端进程使用包内 `darwin-arm64/bin/node` 拉起 `backend/server.js`。已实测通过。

---

## 2026-05-10 fix(frontend): list 类型状态字段 chip 展开模板变量

**问题**：`StatusSection.jsx` 新增 tag 渲染路径时直接输出原始 `item`，导致 list 字段中的 `{{user}}`/`{{char}}`/`{{world}}` 显示为字面量，而 text 字段仍正常展开。

**改动**：`arr.map` 内每个 chip 改为 `applyTemplateVars(item, templateCtx)` 展开后渲染，与 text 字段行为一致。

**验证**：在状态栏 list 字段写入含 `{{user}}` 或 `{{char}}` 的条目，确认书卷面板显示展开后的名称。

---

## 2026-05-10 fix(frontend): 状态栏迟到事件不再被丢弃，修复连续对话状态/dairy_time 延迟一轮才更新

**问题**：用户连发消息时，状态面板（含 real_time 模式的 `dairy_time`）经常延迟一轮甚至几轮才刷新。后端 `updateAllStates` 实际上每轮都把 `dairy_time` 同步写进了 DB，且 `state_updated` SSE 也通过上一轮 response 流（`keepSseAlive=true`）正常发出；问题出在前端：`ChatPage.jsx` / `WritingSpacePage.jsx` 的 `onStateUpdated`/`onStateRolledBack` 用 `isCurrentStreamRun(runId)` 或 `continuationTokenRef` 拦截"非当前轮"的事件——一旦用户在第 N 轮 p2 任务完成前提交第 N+1 轮，第 N 轮迟到的 `state_updated` 即被丢弃，面板要等下一轮刷新才能看到第 N 轮已写入 DB 的状态。

**改动**：
- `frontend/src/pages/ChatPage.jsx` / `frontend/src/pages/WritingSpacePage.jsx`：把 `onStateUpdated`/`onStateRolledBack`/`onTitleUpdated`/`onChapterTitleUpdated` 这些 session 级事件的门控从 stream 级的 `runId`/`continuationToken` 换成 **session 级**比较——回调创建时捕获 `callbackSessionId`，事件到达时只比较当前 session 是否仍是同一个：
  - 同 session 内迟到事件（用户已开新一轮）必须刷新 → 修复"过了一轮才更新"。
  - 切到别的 session 时丢弃 → 防止跨 session 状态/标题串台。
  - `onTitleUpdated` 把侧边栏 `updateTitle` 始终用捕获的 `callbackSessionId` 推送，保证哪怕用户切走，目标 session 的标题仍能在列表里更新；只有"当前页 setCurrentSession"才按 isSameSession 门控。
- `stopMemoryWriting(runId)` 自带 runId 自守卫保留不变（仅关闭本轮 UI 动画）。
- 后端不动。

**Codex review 反馈修复**：`makeCallbacks(runId, sessionIdHint?)` / `makeStreamCallbacks(runId, sessionIdHint?)` 接受调用方显式传入 sessionId。`handleSend` 首次发送时会先 `createSession + enterSession` 再立即构造回调，此时 `currentSessionIdRef` 还未被 effect 同步，若仍读 ref 会捕获到 `null`，导致首轮 `state_updated`/`title_updated` 被丢弃；现在三个调用点（chat sendMessage、writing generate/edit-regen/regen）均显式传入对应 sessionId 兜底。

**验证**：连发 3-5 轮消息（每次 assistant 输出后立即再发），状态面板的 LLM 字段与 `dairy_time` 应在该轮 p2 完成后及时更新，不再"过了一轮才看到"。

## 2026-05-10 fix(state): list 字段超限不收敛的兜底链路

**问题**：用户反馈 `外貌` list 字段累计 13+ 条，多轮对话后仍未收敛到 8。原因是 `compressOverLimitFields` 只检查本轮 patch 中出现的字段；若 LLM 当轮没有把该字段塞进 patch（外貌等"近似静态"字段常如此），即使现有 runtime 值已远超 10，也不会进入压缩或硬截断分支，于是历史超限永远保留。

**改动**（`backend/memory/combined-state-updater.js`）：
1. `compressOverLimitFields` 新增 `valueMap` 参数，对每个活跃实体也扫描现有 runtime 值；patch 未提及但已超限的 text/list 字段同样进入压缩队列。
2. `updateAllStates` 把已计算的 `worldValueMap` / `charValueMaps[i]` / `personaValueMap` 提升到外层作用域并下传给压缩函数，避免重复查询。
3. 压缩 LLM 返回失败/空/格式不符时，原本"静默放弃"，现改为以 `value.slice(-STATE_LIST_TRIM_TARGET)` 硬截取作为兜底写回 patch；新增 `ensureBucket(entityKey)`：当 LLM 返回畸形顶层桶（如 `"world": "..."`、`"char_0": 1`）时直接覆盖为 `{}`，避免对字符串/数字赋属性触发严格模式 TypeError 中断整个状态更新（修复 codex review 指出的回归）。

**验证**：(1) `npm run test:backend` 全绿（369 通过）；(2) 用户场景下次状态更新轮触发：日志会出现 `COMPRESS  list=1`，并写出 `COMPRESS LIST OK` 或 `COMPRESS LIST FALLBACK`，前端列表收敛到 ≤8 条。

## 2026-05-10 feat(entry): 关键词条目 active_turns=0 增加永久生效提示与列表徽标

**改动**：
- `EntryEditor.jsx`：关键词类型 `active_turns=0` 时，在输入框下方显示书卷风提示框 "✦ 此条目一旦命中将永久生效，不再随轮次衰减。"，并在标签后追加 hint " · 设为 0 永久生效"。
- `EntrySection.jsx`：关键词条目 `active_turns=0` 且未禁用时，在标题后渲染"永久"徽标（复用 `we-entry-cached-badge` 样式），与 always token=0 的 CACHED 徽标统一。

**验证**：编辑关键词条目把生效轮数改为 0 → 编辑器内出现永久生效提示；列表中标题旁出现"永久"徽标。

## 2026-05-10 style(entry): 触发范围复选框统一书卷风 + 修复 CACHED LAYER 提示覆盖

**改动**：
- `frontend/src/styles/ui.css` 给 `.we-entry-editor-scope-item input[type="checkbox"]` 增加书卷风样式：`appearance:none`、`--we-paper-shadow` 直角描边，勾选时 `--we-vermilion` 填充 + 内嵌 SVG 对勾（米色描边居中），去掉浏览器蓝勾，也避免 `✓` 字符在 13px 方块内偏移细弱。
- `.we-entry-editor-cached-note` 去掉负 `margin-top`，改为正 `--we-space-sm`，修复 "✦ 此条目将进入 CACHED LAYER..." 提示覆盖到上方"顺序权重"输入框的问题。

**验证**：(1) 条目编辑器 `trigger_type='keyword'` 下勾选/取消触发范围，复选框为陶土色直角方块 + 米色对勾；(2) `trigger_type='always'` 且 token=0 时，CACHED LAYER 提示在输入框下方独立成行不重叠。

## 2026-05-10 feat(entry): 关键词条目支持 AND/OR、user/assistant 触发范围、生效轮数

**目标**：把关键词条目升级到与状态条件条目同等的表达能力。三个新能力：(1) 关键词命中支持 AND/OR；(2) `keyword_scope` 暴露到前端，可选 user / assistant（多选，默认 user，空选保存报错）；(3) 关键词命中后可"持续生效 N 轮"（`active_turns`，0=永久、1=本轮、N=之后 N 轮）。

**Schema 变更**（`backend/db/schema.js`，全部 ALTER 追加）：
- `world_prompt_entries`：新增 `keyword_logic TEXT NOT NULL DEFAULT 'OR'`、`active_turns INTEGER NOT NULL DEFAULT 1`。`keyword_logic` 默认 OR 保持向后兼容（命中等同改造前）。仅对 `trigger_type='keyword'` 生效。
- `sessions`：新增 `keyword_active_state TEXT NOT NULL DEFAULT '{}'`，JSON 结构 `{ entry_id: { round, ttl } }`，跨轮持久化激活状态。

**命中匹配（`backend/prompts/entry-matcher.js`）**：
- `matchByKeywords` 改写：先用 `keyword_scope` 限定扫描面（user / assistant 任一 scope 出现即视为该关键词命中），再按 `keyword_logic` 决定 AND（所有关键词都命中）或 OR（任一命中）。
- 新增跨轮 TTL 逻辑：`currentRound` 取 session 内 user 消息总数（regenerate 不增、edit 后回退，符合直觉）；本轮新命中刷新 `state[id] = { round, ttl }`；旧记录 `ttl=0` 永久生效，`ttl>=1` 在 `currentRound - round < ttl` 期间继续注入；过期 / 条目被删自动清理。状态写入 `sessions.keyword_active_state`，新建 `backend/db/queries/session-active-entries.js` 封装读写。

**校验**：`backend/db/queries/prompt-entries.js` 新增 `KeywordScopeEmptyError`，前端显式提交空 `keyword_scope`（数组 / 字符串）时抛错；`backend/routes/prompt-entries.js` 在 POST/PUT 捕获并返回 400 + 中文提示。前端保存按钮也先做一次校验，双层防护。

**前端 EntryEditor**（`frontend/src/components/state/EntryEditor.jsx` + `frontend/src/styles/ui.css`）：
- 顺序权重与生效轮数同行布局（`we-entry-editor-inline-row` / `we-entry-editor-inline-col`），生效轮数仅在 keyword 类型显示。
- 关键词类条目新增触发范围多选（user / assistant 复选框）+ AND/OR 切换（复用状态条件已有的 `we-entry-condition-logic-row` 样式）。
- form 状态加载时把 `keyword_scope` 字符串解析为数组，提交前 `.join(',')` 转回字符串。新建条目默认勾选 `['user']`。

**导入导出**（`backend/services/import-export.js`）：`exportWorld` SELECT 增加 `keyword_logic` / `active_turns`；`insertPromptEntries` INSERT 列、参数同步扩展，旧卡缺字段时回退 `'OR'` / `1`。

**写卡助手对齐**（`assistant/`）：
- `knowledge/WORLDCARD.md` 字段说明加入 `keyword_logic` / `active_turns`，并补充 AND + 仅 user + 持续 3 轮的示例；`keyword_scope` 同步标注"留空会被后端拒绝"。
- `server/normalize-proposal.js` 解析时归一化两个新字段，`keyword_scope` 空集合宽容回退 `'user,assistant'`（避免提案直接被后端 400）；`updateWorldPromptEntry` 的 pickAllowed 白名单补 `keyword_logic` / `active_turns` / `condition_logic`（同步修复 condition_logic 之前未列入的遗漏）。
- `server/tools/apply-world-card.js` 的工具描述补一句字段提示，让 LLM 在不读 WORLDCARD.md 的情况下也能感知新字段。

**坑点 / 已知约束**：
- AND 语义判断的是"所有关键词在所选 scope 集合中至少各出现过一次"，不要求同一句、同一条消息、同一 scope。如需"同消息共存"语义，未来再扩展。
- TTL 计数挂在 session.user 消息总数上。**历史回退保护**（Codex review 修复）：当 `record.round > currentRound`（用户删消息 / 编辑早期消息 / 清空会话）时，触发该条目的消息已不存在，直接丢弃 carry-over 记录，避免 `active_turns=0` 永久条目变成幽灵注入。
- `condition_logic` 与 `keyword_logic` 故意分开两列：语义不同（一个针对 entry_conditions 行集，一个针对 keywords 数组），分开避免未来歧义。
- 前端 EntryEditor 新建关键词条目时 `keyword_scope` 默认勾选 user + assistant（与后端 schema、写卡助手归一化、导入兜底全部对齐；初版只勾 user 为不一致 bug，已修）。

---

## 2026-05-09 fix(state): list 字段硬上限 10、满则先删；修复压缩兜底静默失败导致列表无限增长

**Bug**：`combined-state-updater.js#compressOverLimitFields()` 在调用 LLM 压缩超长 list 时，若压缩调用返回空字符串、JSON 解析失败、或返回结构缺字段，会静默放过原 patch；而 `validateValue` 的 `case 'list'` 没有任何长度校验，导致超长数组（实测 20+ 条）原样写入 `runtime_value_json`，下一轮 prompt 又把全部条目展示给 LLM，越滚越多。

**修复**：
1. `validateValue` list 分支末尾增加硬截断：长度 > `STATE_LIST_MAX_ITEMS` 时保留**末尾** 10 条（`slice(-10)`）+ 输出 `LIST HARD TRUNCATE` 警告，作为兜底兜底；保留尾部而非头部是因为 LLM "替换整个列表"通常把新事实追加在末尾，截头部会丢本轮新增。
2. `compressOverLimitFields` 接收压缩结果时，要求返回数组长度在 `[1, STATE_LIST_MAX_ITEMS]` 区间内才覆盖 patch，否则记录 `COMPRESS LIST FAIL` 让硬截断接手。
3. `STATE_LIST_TRIM_TARGET`：`5` → `8`（按用户要求保留更多上下文）。
4. `state-update.md` 第 6 条改写：明确告知 LLM 每个 list 字段最多 10 个条目，已满 10 又要新增时必须先剔除一条旧条目。
5. 前端 `StateValueField.jsx` list 编辑器同步硬限制 10：满额时输入框 `disabled` 并显示「已达上限 10 条，请先删除」，`addListItem` 在 `>=10` 时直接 return。

**未改**：不动 DB schema，现有超长列表会在下一次 LLM 状态更新或用户编辑时被硬截断/压缩自然收敛。

---

## 2026-05-09 feat(state): 数值类型状态字段支持单位

**变更**：`world_state_fields` / `character_state_fields` / `persona_state_fields` 新增 `unit TEXT NOT NULL DEFAULT ''` 列（schema.js 用 ALTER 迁移）。`StateFieldEditor` 在 type=number 时新增「单位」输入（最长 16 字符，与 min/max 同行）。

**渲染**：`StatusSection` 数值显示在末尾拼上单位（含 max 进度条形态：`100 / 1000 元`）；`StateValueField` 数值编辑控件右侧加灰色单位提示。

**LLM 提示**：`combined-state-updater.js#buildFieldsDesc` 状态更新提示词在 number 字段 `unit` 非空时追加「单位：xxx（仅展示用途，写入值仍为纯数字）」，避免 LLM 把单位写进数值。同时 `memory/recall.js` 三个 `render*State` 函数（注入 [6] 状态段）的 `rowsToStateText` 在 number 字段渲染时拼接 ` ${unit}`，让正文生成路径也能感知单位（避免 UI 显示「100 元」但 LLM 仍按裸数字 100 生成的尺度错位）。空 `unit` 时不输出该后缀，保持现有提示词缓存前缀稳定。

**导入导出**：`exportWorld` / `importWorldCard` SELECT 与 INSERT 加 `unit` 字段；`import-export-validation.js` 加 `assertOptionalString(field.unit, ..., 16)`。旧卡缺 `unit` 字段时按 `''` 兜底。

**未改 LLM/条件比较**：`unit` 不参与条件求值，也不会包进 LLM 写入的 patch（与 `prefix` 一致）。

---

## 2026-05-09 fix(turn-dialogue): 修复 think 内含 <next_prompt> 字面字符串时整段 think 块被吞

**现象**：writing 会话用 DeepSeek thinking 模型生成时，流式期间前端能看到 ThinkBlock + 正文，SSE done 后 ThinkBlock 消失只剩正文。

**根因**：`extractNextPromptOptions`（`backend/utils/turn-dialogue.js:96`）的"防止 think 内 next_prompt 残留"分支错误剥光整个 think 块。当模型在 `<think>` 推理中复述了 shared-suggestion.md 的 `<next_prompt>` 格式指令但本轮正文未真的输出选项时，`stripped.indexOf('<next_prompt>') === -1` 但 `text.includes('<next_prompt>') === true` 命中分支返回 `stripped`（去 think 后的文本），落库后 think 标签丢失，前端 `parseStreamingBlocks` 重渲染时找不到 think。

**修复**：该分支直接返回 `{ content: text, options: [] }` 保留 think 块原样。think 内的 `<next_prompt>` 字面字符串：历史回灌前 `stripThinkBlocksFromText` 会剥除 think；前端 `ThinkBlock` 用 `stripNextPromptBlocks`（`frontend/src/utils/next-prompt.js`）屏蔽字面标签。两个出口都不会泄漏，无需代价整段剥光。

**测试**：`backend/tests/utils/turn-dialogue.test.js` 新增两条用例覆盖（think 内 next_prompt 字面 / think 块外合法 next_prompt 共存）。

---

## 2026-05-09 fix(title): 标题生成尊重用户思考链配置，修复 DeepSeek thinking 内容写入标题

**背景**：DeepSeek v4 flash 等默认开启思考的模型，用户在设置中已配置 `thinking_disabled`，但 `generateTitleWithRetry` 硬编码 `thinking_level: null`（不传参），导致：
1. 模型默认开启思考，响应 `reasoning_content` 有内容、`content` 为空 → "生成失败"
2. 此前错误修复用 `unwrapSoloThinkBlock` 提取推理过程作为标题，推理内容被截断写入标题栏

**修复**：移除 `backend/memory/title-generation.js` `generateTitleWithRetry` 中的 `thinking_level: null` 硬编码，让调用方 scope 配置的思考级别（用户设置的 `thinking_disabled`）正常生效。DeepSeek 将按 `thinking: {type: "disabled"}` 发送，避免思考。

---

## 2026-05-09 feat(settings): 副模型支持独立思考链级别配置

**变更**：
- `backend/services/config.js`：`DEFAULT_AUX_LLM` 新增 `thinking_level: null` 字段；`getAuxLlmConfig` / `getWritingAuxLlmConfig` 透传 `thinking_level`
- `backend/llm/index.js`：aux / writing-aux scope 改用自身的 `thinking_level`（原来统一回退主模型）
- `frontend/src/components/settings/AuxLlmBlock.jsx`：新增 `onThinkingLevelChange` prop，复用 `getProviderThinkingOptions` 渲染与主模型相同的思考链选择器
- `frontend/src/components/settings/LlmConfigPanel.jsx`：对话副模型与写作副模型均传入 `onThinkingLevelChange` 回调

**行为**：副模型未配置 `thinking_level`（null）时，`getAuxLlmConfig` 回退主模型时会继承其 `thinking_level`；副模型独立配置后使用自身值。

## 2026-05-09 feat(ui): 美化「已中断」徽章样式

**变更**：
- `frontend/src/styles/tokens.css`：新增 `--we-color-warning-bg`（amber 8% 透明叠加），用于中断徽章底色
- `frontend/src/styles/chat.css`：`.we-message-interrupted` 升级为精致徽章风格
  - `border: 1px solid` → `box-shadow: 0 0 0 1px`（匹配项目环形阴影设计语言）
  - 新增 `background: var(--we-color-warning-bg)`（浅琥珀底色）
  - 字号 9px → 10px，间距 `1px 5px` → `2px 6px`
  - 颜色从废弃的 `--we-amber` 迁移到 `--we-color-status-warning`
  - 去掉 `opacity: 0.7`（颜色透明度已由 token 本身控制）

## 2026-05-09 fix(llm): DeepSeek 全量 think 包裹导致消息丢失的修复

**背景**：DeepSeek 开启 thinking 时，偶发将正文（含 `<next_prompt>`）也写入 `reasoning_content` 而非 `content`，导致 streaming 层输出 `<think>全部内容</think>`。`extractNextPromptOptions` 剥除 think 块后内容为空，消息未持久化，会话历史中断。

**修复**：
- `backend/utils/turn-dialogue.js`：新增导出函数 `unwrapSoloThinkBlock(text)`——若文本完全被单个 `<think>...</think>` 包裹（外侧无实际内容），提取并返回内部文本，否则原样返回。
- `backend/services/chat.js` `processStreamOutput`：在入口对 `rawContent` 调用 `unwrapSoloThinkBlock`，确保 DeepSeek 异常输出能正常持久化。

**已知限制**：streaming 阶段（`</think>` 前），前端仍会显示 think 面板；`done` 事件到达后前端用已正确保存的消息替换展示，视觉短暂异常但数据正确。若模型将 CoT 推理混入正文，CoT 内容也会一并写入助手消息。

**测试**：新增 3 个后端测试覆盖解包路径（全量包裹无 next_prompt、含 next_prompt、正常混合不解包）。

---

## 2026-05-09 fix(prompts): XML 注入修复——转义 char_info 内容与 char_state name 属性

**变更**：`backend/prompts/assembler.js` 新增 `escapeXmlContent` / `escapeXmlAttr` 辅助函数。
- P1：`character.system_prompt` 插入 `<char_info>` 前先经 `escapeXmlContent` 转义，防止用户提示词中包含 `</char_info>` 等标签提前关闭 XML 块。
- P2：`character.name` 作为 `<char_state name="...">` 属性时先经 `escapeXmlAttr` 转义，防止角色名含 `"` / `<` / `&` 导致属性格式错误。

---

## 2026-05-09 refactor(prompts): 全段 XML 标签包裹，提升结构清晰度，减少身份漂移

**变更**：`buildPrompt` / `buildWritingPrompt` 中所有"参考数据块"统一用 XML 标签包裹；渲染函数内的中文方括号节头同步清除（已由 XML 标签语义覆盖）。

- `[2]` 世界知识条目（always-on & 触发） → `<world_entries>`
- `[3]` 玩家人设 → `<user_info>`（原内部节头 `[{{user}}人设]` / `[玩家背景]` 删除）
- `[4]` 角色人设 → `<char_info>`（原内部节头 `[{{char}}人设]` 删除）
- `[5]` 世界状态 → `<world_state>`（`renderWorldState` 不再输出节头行）
- `[6]` 玩家状态 → `<user_state>`（`renderPersonaState` 不再输出节头行）
- `[7]` 角色状态 → `<char_state>`；写作模式多角色用 `name` 属性区分（`renderCharacterState` 不再输出节头行）
- `[8]` 触发条目 → `<world_entries>`
- `[8.5]` 长期记忆 → `<long_term_memory>`（原 `[长期记忆]` 前缀删除）
- `[9]` 召回摘要 → `<recalled_memories>`（`renderRecalledSummaries` 不再输出节头行）
- `[10]` 展开原文 → `<expanded_dialogues>`（`renderExpandedTurnRecords` 不再输出节头行）
- `[11]` 日记注入 → `<diary>`（原 `[日记注入]` 前缀删除）
- `[1]` 全局 System Prompt 不包裹（IS 指令根节点）

**原因**：LLM 有时把玩家/角色人设解读为自身身份（漂移）。XML 标签创造明确的知识块边界，Claude 对其语义理解优于纯文本节头。项目已有先例（`shared-suggestion.md` 的 `<suggestion>`）。

**修改文件**：`backend/prompts/assembler.js`（锁定文件）、`backend/memory/recall.js`、`backend/memory/summary-expander.js`；测试断言同步更新（3 个测试文件 + 1 个 snap 文件）。

## 2026-05-09 refactor(prompts): 后置提示词从独立 system message 合并入当前用户消息

**变更**：`buildPrompt` / `buildWritingPrompt` 中 [13] 后置提示词（`global_post_prompt`、`character.post_prompt`、兜底角色名、`SUGGESTION_PROMPT`）不再作为独立的 `role:system` 消息发送，改为追加到 [14] 当前用户消息末尾，合并为一条 `role:user`。附件消息（vision 数组格式）以额外 `type:text` part 追加。

**原因**：部分 provider 对 system 消息位置有限制，合并为 user 消息可提高兼容性，同时减少消息总数。

**影响**：历史消息之后不再有独立的 system 后置消息；`messages.length` 减少 1；ARCHITECTURE.md §4 表格已同步更新。

**续写路径（`buildContinuationMessages`）核查**：无需改动。续写时 rawMessages 末尾仍是 `role:user`（[13+14] 合并消息），三条分支（prefill、role≠user 守卫、主路径）行为均与改前等价；suggestion 在原始请求和续写指令中各出现一次，职责分开不冲突，与改前相同。

## 2026-05-09 refactor(prompts): cached layer 编号重排，[4] 常驻条目上移至 [2]

**变更**：`assembler.js` cached layer 顺序调整为 [1] 全局 → [2] 常驻条目 → [3] 玩家 → [4] 角色（原顺序 [1][2][3][4] = 全局/玩家/角色/常驻）。写作模式同步调整：cached layer 变为 [1][2][3]，dynamic 层角色提示词从 [3] 改为 [4]。仅代码位置和注释编号变化，功能不变。同步更新 `ARCHITECTURE.md` §4 表格与说明。

## 2026-05-09 feat(prompts): 删除写作模式叙述者身份声明

**变更**：移除 `backend/prompts/assembler.js` 中 `[NARRATOR]` 段——写作模式 dynamic 层最前的硬编码身份声明 `[写作模式]\n你是全知中立叙述者…` 已删除。

**影响**：写作模式不再自动注入固定叙述者人设；若需要叙述者身份设定，可在世界/全局的系统提示词中手动配置。

## 2026-05-08 fix(assistant/knowledge): 纠正写卡助手对 token 权重的认知错误

**问题**：助手在面板上回复"token 权重为 1（优先级最高）"，认知错误。`token` 是注入顺序权重，不是优先级；LLM 对 prompt 末尾内容 recency 更强，**靠后（token 数越大）实际优先级越高**，靠前（token 数越小）反而更容易被后续内容覆盖。

**修复**：`assistant/knowledge/WORLDCARD.md` 中 `token` 字段说明改写为"越小越靠前、越大越靠后；越靠后实际优先级越高"，并明令"回复用户时禁止把 token=1 描述为 优先级最高"。

**验证**：人工阅读知识文件；下一次让助手新增 always 常驻条目时，回复中不应再出现"token=1（优先级最高）"。

## 2026-05-08 fix(assistant): 修复 codex review 指出的两处回归

**背景**：上一次覆盖率改动引入两个 P2 回归，由 `/codex:review` 检出。

- `assistant/package.json`：`test:coverage` 的 `--test-coverage-include` 改用双引号包裹 glob。原单引号在 Windows `cmd.exe` 下不会被剥离，glob 字面传入会匹配不到任何文件，导致覆盖率统计在 Windows 下完全失效。
- `assistant/server/tools/apply-persona-card.js`：persona-card 的 `entityId` 在 create/update 中始终代表 worldId（与 `normalize-proposal.js` 语义一致）。原实现把 create 后的返回值改为 `result.id`（新 persona 主键），后续链式 update 会拿 personaId 当 worldId 查表导致失败。修复：始终回填 `args.entityId`，新 persona 主键单独放到 `personaId` 字段。

**验证**：`npm run -s test --prefix assistant` 全 115 个用例通过。

## 2026-05-08 test(coverage): assistant 单测覆盖率拉到 92%+

**背景**：上一轮覆盖率任务遗留 `assistant/` 自身覆盖率仅 46.58%；`parent-agent.js`/`routes.js`/`sub-agent.js`/`task-store.js`/`plan-doc.js` 等大文件覆盖率均偏低。本次专项补测把 assistant workspace 拉到 92.47% 行覆盖（≥ 80% 目标达成）。

**配置调整**
- `assistant/package.json`：
  - `test` glob 改为 `tests/**/*.test.{js,mjs}`，修复历史遗留——原 `*.test.js` 不匹配 `parent-agent.test.mjs` / `plan-doc.test.mjs`，导致它们从未被执行（隐藏问题）。
  - `test:coverage` 加 `--test-coverage-include='server/**'`，只统计 assistant 自身；不再把 import 进来的 backend/shared 代码记入 assistant 覆盖率。

**新增/扩充测试（5 → 13 文件，34 → 113 tests）**
- 新增 `tests/task-store.test.js`：CRUD + SSE 订阅/广播/失败客户端隔离/endAllSse 等全路径。
- 扩充 `tests/plan-doc.test.mjs`：补 `writePlanDoc/readPlanDoc/deletePlanDoc/ensurePlanDir`、空文档解析、completedAt 渲染。
- 扩充 `tests/parent-agent.test.mjs`：通过 `__testables` 覆盖 `wrapApply` 异常捕获、`buildContextBlock`、`buildMetaTools` 5 个工具的成功/失败/dispatch 分支；用 mock LLM 跑通 `runParentAgent` 的流式成功 / 流式抛错 / approved sentinel 三条路径。
- 新增 `tests/sub-agent.test.js`：`__testables` 三种 `toLLMTool` 形态、`resolveEntityRef`、`buildUserMessage`；`dispatchSubAgent` 走 mock LLM 的成功 / LLM 抛错 / tool 抛错 / emitFn 事件序列。
- 新增 `tests/normalize-proposal-extra.test.js`：补 `stateFieldOps` 表格类型校验（columns/min/max/重复 key/未声明列等 8 个分支）、`normalizeEntryOps` 校验全路径、`applyProposal` 的 world-card delete / character-card delete / persona-card create / state field update + delete / UNIQUE 冲突幂等 / 各种 entityId 缺失抛错。
- 新增 `tests/routes-http.test.js`：用 Express + `node:http` 装路由，覆盖 `/extract-characters` `/confirm-characters` `/agent` `/agent/:id/cancel|approve|truncate|delete|plan-doc` 全部端点 + SSE 收流。
- 新增 `tests/tools/apply-tools.test.js`：6 个 apply_* 工具的 create / update / delete 全路径（用 backend 测试沙盒里的真 SQLite + mock LLM），含 `apply_global_config` 的 api_key 剥离。
- 新增 `tests/tools/list-resources.test.js`：4 个 target、worldId 必填校验、>200 条截断。
- 新增 `tests/tools/project-reader.test.js`：路径越界拒绝、读真实文件、50KB 截断。

**结果**
- 113 tests 全绿；`assistant/server/**` 行覆盖 50.25% → **92.47%**：
  - `task-store.js` 33% → 100%
  - `plan-doc.js` 24% → 100%
  - `sub-agent.js` 35% → 100%
  - `parent-agent.js` 16% → 89.82%
  - `routes.js` 23% → 80.74%
  - `normalize-proposal.js` 60% → 93.22%
  - 6 个 `tools/apply-*.js` 均到 100%
  - `tools/list-resources.js` 57% → 100%

**修复了上一次列出的两个残留风险**
- 修：`apply_world_card` / `apply_character_card` / `apply_persona_card` / `apply_css_snippet` / `apply_regex_rule` 的 `entityId` 回填逻辑——原 `result.entityId ?? null` 与下游 service 返回的 `{id}` 字段名不一致，create 时永远回填为 null。改为 `result?.id ?? result?.entityId ?? args.entityId ?? null`，create 后正确回填新建实体 id；apply-tools 测试加 `assert.equal(created.entityId, db_row.id)` 防回归。
- 测：补 `runParentAgent` 在 Step 1（resolveToolContext）通过工具调用切到 `completed` / `awaiting_approval` 时的两条早返回分支：用 `MOCK_LLM_TOOL_CALLS` 注入 `finalize_task` / `write_plan_doc` 触发，断言 `delta` 不再发出、终态分支发 done、awaiting_approval 分支不发 done 保持长连接。`parent-agent.js` funcs 91.67% → **100%**，line 89.82% → **92.55%**。

**残留风险**
- assistant 测试沙盒共享 backend 的 `createTestSandbox`，启动时间对 list-resources 的 200 条截断测试约 65ms，可接受。

## 2026-05-08 test(coverage): 前后端单测覆盖率拉到 80%+

**背景**：基线前端 78.18%、后端 71.16%，多个薄弱模块仅有部分测试覆盖。本次集中补测使两端均超过 80% 行覆盖。

**新增/扩充前端单测（135 → 139）**
- 新增 `tests/api/long-term-memory.test.js`：覆盖读取/更新与 HTTP 错误。
- 扩充 `tests/api/worlds.test.js`：补 `reorderWorlds` / `uploadWorldCover`（含 body.error 优先级与 body 解析失败兜底）。
- 扩充 `tests/api/chat.test.js`：补 `editAssistantMessage` / `retitle` / `impersonate` / `stopGeneration` / `regenerate` 错误回调。
- 扩充 `tests/api/persona-state-values.test.js`：补 `*ByPersonaId` 系列与 `reset*` 兜底分支。
- 扩充 `tests/api/session-state-values.test.js`：补 `patchSessionStateValue` 三个 category 分支与失败错误。
- 扩充 `tests/api/character-state-values.test.js` / `world-state-values.test.js`：补 `.json()` 解析失败的状态码兜底。

**新增后端单测（≈45 个新用例）**
- `tests/routes/worlds.test.js`：覆盖 11 个 handler 的参数校验、404、reorder、cover 上传 400/404。
- `tests/routes/chat-extra.test.js`：补 `/chat`/`/regenerate`/`/continue`/`/edit-assistant`/`/retitle`/`/impersonate` 的参数校验、404、retitle 空标题、retitle LLM 抛错 500、impersonate 空 character/world 400。
- `tests/services/long-term-memory.test.js`：覆盖读写、append（含触发 compress、空内容跳过）、compress（剥 `<think>`、空返回、LLM 抛错被吞）、`restoreLtmFromTurnRecord` 三种分支。
- `tests/services/persona-state-fields.test.js`：create 初始化所有 persona、update 仅刷新未自定义、delete 级联删除、reorder 排序。
- `tests/utils/session-summary-vector-store.test.js`：loadStore 缺文件/损坏、deleteBySessionId 不写盘、search 各种过滤/topK/维度/零向量。
- `tests/utils/turn-dialogue.test.js` + `tests/utils/token-counter.test.js`：边界与 nullish 安全。

**配置调整**
- `backend/package.json`：`test:coverage` 增加 `--test-coverage-exclude="../assistant/**"` 与 `--test-coverage-exclude="tests/**"`。理由：assistant 是独立 workspace，有自己的 `npm run test:coverage`；后端覆盖率不应再把 assistant 代码计入。tests 目录自身为测试代码，无需被计入。

**结果**
- 前端：47 → 48 files、116 → 139 tests 全绿；`All files` 行覆盖 78.18% → **80.25%**。
- 后端：314 → 359 tests 全绿（3 skip）；`all files` 行覆盖（已排除 assistant）71.16% → **81.16%**。
- 已知未达成：`assistant/` 自身覆盖率仍为 46.58%（落在另一 workspace 的 `npm run test:coverage:assistant`），其 `parent-agent.js`/`routes.js`/`normalize-proposal.js` 等大文件需要专门的 LLM mock 与 plan-doc fixture，本轮未触及。

**残留风险**
- `routes/worlds.js` 的 cover 上传成功路径（`updateWorld(cover_path)`）未测：multer 在 Express 5 + Node 25 自带 `fetch`+`FormData` 上传时，req.file 在我们的服务器入口下未被填充（隔离环境可复现）。改为只测 400/404 分支，cover_path 写库由 `updateWorld` 的现有测试间接覆盖。
- `chat.js` 流式生成主循环（`runStream`）仍由 `chat.test.js` 既有 SSE 测试覆盖，本次未深入流内分支。

## 2026-05-08 fix(tests): 修复前端 15 个历史遗留测试 failures

**背景**：上一次修复后剩余的 15 个前端测试失败均为生产代码已演化但测试未同步，全部是测试侧问题。

**修复（116 tests, 0 failures）**
- `tests/assistant/api.test.js`：旧 `chatAssistant`/`executeProposal` API 已被 `streamAgent`/`approveTask` 替换；改写为单 `onEvent` 回调断言事件序列，并断言 `approveTask` 命中 `/api/assistant/agent/:id/approve`
- `tests/api/config.test.js`：移除已删除的 `updateApiKey`/`updateAuxApiKey`/`updateEmbeddingApiKey`/`updateWritingApiKey`，改测唯一的 `updateProviderKey(provider, key)` 命中 `/api/config/provider-key`
- `tests/hooks/use-settings-config.test.jsx`：mock 与断言全部从分散的 `update*ApiKey` 收敛到 `updateProviderKey`
- `tests/pages/settings-page.test.jsx`：overlay 关闭从 `click` 改为 `mouseDown`+`mouseUp`（生产代码使用按下/抬起一致性判定）
- `tests/pages/world-edit-page.test.jsx`：`WorldEditPage` 不再在页内编辑默认状态值，移除 save-weather 交互与 `updateWorldStateValue` 断言
- `tests/pages/persona-edit-page.test.jsx`：补 `updatePersonaStateValueByPersonaId`/`getPersonaStateValuesByPersonaId` mock；状态值保存断言改为 `(worldId, personaId, fieldKey, valueJson)` 四参数
- `tests/components/state/EntryEditor.test.jsx`：作用域/字段已拆为两个 Select；先选 `世界` 再选 `温度`，option 文本断言对应去掉 scope 前缀
- `tests/components/state/EntrySection.test.jsx`：`-u` 重新生成快照，纳入新增的禁用切换按钮
- `tests/pages/chat-page.test.jsx`：`InputBox` 不再暴露 `onClear`，移除清空消息交互与对应 `confirm` 断言

**验证**：`cd frontend && npx vitest run` → 47 files / 116 tests 全绿；`npm run lint` 通过。

## 2026-05-08 fix(tests): 修复前后端测试套件，消除 lint 错误

**背景**：`npm run check` 跑出 10 个 ESLint 错误 + 7 个后端测试失败，均为前几次功能迭代遗留。

**前端 ESLint 修复（0 errors，4 warnings 均为已知 warn-only）**
- `frontend/eslint.config.js`：安装 `eslint-plugin-react`，添加 `react/jsx-uses-vars` 规则，消除 `<motion.X>` 引用对象被误报未使用的假阳性
- `GlobalToast.jsx`：删除真正未使用的 `variants` import
- `StateFieldEditor.jsx`：删除未使用的 `mouseDownOnBackdrop` ref；将 `lockedColumnKeys` 从 `useRef` 改为 `useState` 初始化函数（修复渲染期 ref.current 访问）
- `LongTermMemoryModal.jsx`：将同步 `setLoading/setError` 移到 Promise 回调，修复 effect 同步 setState 警告
- `CastPanel.jsx`：同上，`setWorldName(null)` 移至 Promise 链，消除同步 setState
- `WorldConfigPage.jsx`：`refresh` 改为 `useCallback`，修复 `exhaustive-deps` 警告

**后端测试修复（301 tests, 0 failures）**
- `state-values.test.js`：persona 套件 `createOwner` 加入 `insertPersona`，使 `upsertPersonaStateValue` 能找到 active persona
- `state-values-extra.test.js`：`resetPersonaStateValuesValidated` 测试在 `insertPersonaStateValue` 前先创建 persona
- `assembler.test.js`：`messages.length 2→3`（identity drift 兜底消息总在 [13]）；`maxTokens 777→577`（写作建议保留 200 token）；`next_prompt` 断言改到 messages[3]/messages[1] 而非末尾 user 消息；`char` 占位符在写作 global prompt 改为 `叙述者`
- `assembler-shape.test.js` + `assembler-shape.snap`：`next_prompt` 锚点从 user 消息（index 4）移到 post-system（index 3）；snapshot `maxTokens 444→500`（suggestion 预留后的最低保证值）
- `writing.test.js`：删除已被 `refactor: 移除写作会话的 clearMessages API` 移除的 DELETE messages 路由相关断言

**坑点**：前端 15 个测试失败为历史遗留（git stash 验证），与本次修改无关。

## 2026-05-08 feat(entries): 状态条件 datetime 字段改为部分选择模式

**背景**：datetime 类型状态字段的条件值原来是 5 段 ISO 输入框（YYYY-MM-DD T HH:MM），需要填写完整时间才能判断，无法只对"年份"或"月份"单独比较。

**改动**
- `frontend/src/components/state/DatetimePartInput.jsx`（新增）：下拉选年/月/日/时/分 + 单个数字输入框，value 格式为 `"year:2024"`、`"month:3"` 等。
- `frontend/src/components/state/EntryEditor.jsx`：条件行的 datetime 字段从 `DatetimeSplitInput` 换为 `DatetimePartInput`。
- `frontend/src/styles/ui.css`：新增 `.we-datetime-part-input` flex 容器样式。
- `backend/prompts/entry-matcher.js`：`evaluateCondition` 新增对 `"part:number"` 格式的识别，提取 datetime 状态值中对应段位后做数值比较；旧的全量 ISO 比较作为兼容路径保留。

**不变**：`DatetimeSplitInput` 保留供状态值编辑器（StatusSection 等）使用；entry_conditions 表结构无变化，value 字段改存 part 格式字符串。

## 2026-05-08 feat(entries): 状态条件字段选择器拆分为 2-3 级联下拉

**背景**：原来的状态条件下拉把所有字段平铺成"世界.时间""角色.xxx""玩家.xxx.col"，用户很难快速找到目标字段。

**改动**
- `frontend/src/components/state/EntryEditor.jsx`：
  - `emptyCondition()` 新增 `scope / field_label / col_key` 三个子字段
  - 新增 `parseTargetField(tf)` 将已有 `target_field` 反解为三个子字段（用于回填编辑）
  - 新增 `SCOPE_OPTIONS / getFieldOptions / getColOptions` 三个辅助函数
  - 用 `rawFieldsByScope`（按范围分组的字段对象）替换原有平铺 `fieldOptions`
  - `updateCondition` 处理级联清空：切换范围→清空字段和列，切换字段→清空列，并重组 `target_field`
  - 渲染层：单个 Select 换成 2-3 级联 Select（第三级仅 table 类型时出现）
- `frontend/src/styles/ui.css`：`.we-entry-condition-field` 改为 flex 容器（含 gap + `min-width: 60px` 约束），兼容 2-3 个下拉横排

**不变**：`target_field` 存储格式（"世界.时间" / "世界.属性.atk"）不变，后端零改动

## 2026-05-08 feat(state): 新增 type='table' 状态字段（2 行 N 列）

**背景**：状态字段此前仅支持 6 种原子类型；本次需要"一组同结构的并列数值"的紧凑表达（六维属性、攻防速等）。新增 `type='table'`：第 1 行表头 + 第 2 行数值，列数固定，仅支持数值列，每列可选独立上下限；条件条目可定位到具体一列。

**改动**
- `backend/db/schema.js`：三张 state_fields 表 CREATE 加 `table_columns TEXT`；`initSchema` 末尾追加 ALTER 迁移。
- `backend/db/queries/_state-fields-base.js`：`parseRow` 自动 JSON.parse `table_columns`。
- `backend/db/queries/{world,character,persona}-state-fields.js`：INSERT/UPDATE 加 `table_columns` 列，序列化为 JSON 字符串。
- `backend/db/queries/session-state-values.js`：三个 SELECT 加 `table_columns` 字段，方便前端渲染与条件评估识别 type。
- `backend/memory/combined-state-updater.js`：`validateValue` 增 `case 'table'`（按列裁剪 + 数值校验）；`buildFieldsDesc` 输出列结构与上下限给 LLM。
- `backend/memory/recall.js`：`parseValueForDisplay` 处理对象值，渲染为 `key=val,...`。
- `backend/prompts/entry-matcher.js`：抽出 `setStateMapRow()`，`type='table'` 字段按列展开 `scope.label.column_key` 写入 stateMap，三段 target_field 自动命中。
- `assistant/server/normalize-proposal.js`：`VALID_STATE_TYPES` 加 `'table'`；`STATE_FIELD_KEYS` 加 `'table_columns'`；create/update 路径新增 `normalizeTableColumns` + `assertTableDefaultValue`，禁止与 enum_options/min_value/max_value/prefix 同时使用。
- `assistant/knowledge/{WORLDCARD,CHARCARD,USERCARD}.md`：补 table 类型 type 表行、default_value 写法、value_json 写法、CRUD 示例和列条件 target_field 说明。
- `frontend/src/components/state/StateFieldEditor.jsx`：TYPE_OPTIONS 加 `table`；新增列编辑器（key/label/min/max/默认值），handleSave 序列化 `table_columns` 与对象 default_value。
- `frontend/src/components/book/StatusTable.jsx`（新建）：2 行 N 列 grid 渲染，每列可选进度条；单元格点击进入 `CellEditor` 编辑数值。
- `frontend/src/components/book/StatusSection.jsx`：在 row 渲染分支加 `type === 'table'` 处理，调用 StatusTable + commit 整行对象 JSON。
- `frontend/src/components/index.js`：注册 StatusTable。
- `frontend/src/index.css`：新增 `.we-status-table` / `.we-status-table-row` / `.we-status-table-cell` / `.we-status-table-head-cell` 等样式块（沿用 `--we-ink-*` token 与 `.we-status-bar` 风格）。
- `frontend/src/components/state/EntryEditor.jsx`：fieldOptions 加载时把 `type='table'` 字段展开为每列虚拟选项，target_field 写入 `scope.label.column_key` 三段格式；getOpsForField 对列字段返回数值操作符。
- `backend/services/import-export.js`：三套 state_fields 的 SELECT/INSERT 加 `table_columns`，导入导出经 JSON parse/stringify 来回。
- `backend/services/import-export-validation.js`：`assertStateFields` 校验 `table_columns` 为数组（若提供）。
- `SCHEMA.md`：三张 state_fields 表 type 枚举加 `'table'`，新增 `table_columns` 字段行；`entry_conditions.target_field` 行新增三段语法说明，下方说明追加 table 列定位规则。
- `ARCHITECTURE.md` §8：状态系统的字段类型列表追加 `datetime` 与 `table`，并补 entry-matcher 的列展开行为。

**关键约束**
- 仅支持数值列；缺列保持缺省；`enum_options / min_value / max_value / prefix` 与 `table_columns` 互斥。
- 条件 target_field 三段格式 `scope.field_label.column_key`，仅参与数值操作符；列缺失或值非有限数 → 跳过该条件（与既有数值跳过策略一致）。
- 不保留向后兼容；旧库由 `initSchema` 末尾的 ALTER 自动补列。

**验证**
1. 重启 backend/frontend 后，世界编辑页新增 `type='table'` 字段（列 atk/def/spd，默认 30/20/15，每列上限 99）。
2. 进入会话页确认右侧状态栏渲染 2 行 N 列表格，进度条与点击编辑生效；写作模式同步验证。
3. 创建 `trigger_type='state'` 条目，条件选 `角色.三围.atk > 50`，断言命中切换正确。
4. 写卡助手对话："给主角加一个表格状态'三围'，列攻防速，默认 30/20/15"，断言提案通过 normalize 校验并落库。
5. 导出 .weworld.json → 重置数据库 → 导入 → 表格字段与值完整恢复。

## 2026-05-08 feat(entries): 状态条件 AND/OR 模式切换

**背景**：编辑 state 类型条目时，状态条件仅支持 AND 逻辑（全部满足才触发）。用户需要支持 OR 模式（任一满足即触发），每个条目统一一种模式，默认 AND。

**改动**
- `backend/db/schema.js`：`world_prompt_entries` 建表语句新增 `condition_logic TEXT NOT NULL DEFAULT 'AND'`；`initSchema` 末尾追加 ALTER TABLE 迁移，兼容现有库。
- `backend/db/queries/prompt-entries.js`：`createWorldEntry` INSERT 加入 `condition_logic`；`updateWorldEntry` 的 allowed 字段列表加入 `condition_logic`。
- `backend/prompts/entry-matcher.js`：state 条件评估改用 `entry.condition_logic === 'OR' ? 'some' : 'every'` 动态切换，writing 模式和 chat 模式均已更新。
- `frontend/src/components/state/EntryEditor.jsx`：`form` state 加入 `condition_logic`；保存时透传；状态条件区块标签行右侧加 AND/OR pill 切换按钮组，标签文字随模式动态变化。
- `frontend/src/styles/ui.css`：新增 `.we-entry-condition-logic-row`、`.we-entry-condition-logic-toggle`、`.we-entry-condition-logic-btn`（含 `.active`）样式。
- `SCHEMA.md`：`world_prompt_entries` 字段表新增 `condition_logic` 行；`entry_conditions` 说明更新。

## 2026-05-08 fix(import-export): 世界导出/导入保留 prompt_entries.enabled 状态

**背景**：Codex review 发现 exportWorld 的 SELECT 未包含 `enabled`，importWorld 的 INSERT 也未写入，导致禁用条目经 `.weworld.json` 圆形回路后被静默重置为启用。

**改动**
- `backend/services/import-export.js`：`exportWorld` SELECT 加 `enabled`；`importWorld` INSERT 列表加 `enabled`；`insertPromptEntries` 辅助函数传参加 `entry.enabled ?? 1`。

**验证**：禁用若干条目 → 导出世界 → 删除世界 → 导入 → 确认原本禁用的条目仍为禁用。

## 2026-05-08 feat(entries): 条目启用/禁用开关

**改动**
- `backend/db/schema.js`：`initSchema` 末尾追加 `ALTER TABLE world_prompt_entries ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1` 迁移。
- `backend/db/queries/prompt-entries.js`：`updateWorldEntry` 的 allowed 字段列表加入 `enabled`。
- `backend/prompts/assembler.js`：`getAllWorldEntries` 结果在对话模式和写作模式两处均追加 `.filter((e) => e.enabled !== 0)`，禁用条目不注入提示词。
- `frontend/src/components/state/EntrySection.jsx`：每行加小开关，点击乐观更新本地状态，调 `updateWorldEntry` 写库，失败时回滚；禁用行加 `we-entry-section-row--disabled`（整体 opacity 降低）。
- `frontend/src/styles/pages.css`：新增 `.we-entry-section-toggle`、`.we-entry-section-toggle--off`、`.we-entry-section-toggle-thumb`、`.we-entry-section-row--disabled` 样式，开关宽 28px × 高 16px，嵌入现有行内不占额外空间。

**验证**：进入世界编辑页 → 任意条目列 → 点击开关变灰/变亮，刷新后状态持久；在聊天中发送消息，确认禁用条目不出现在提示词（可开 `logging.mode=raw` 验证）。

## 2026-05-08 fix(assistant): verbose 工具间隙期持续显示打字动画，消除静默断档

**背景**：工具调用完成（绿勾）后、LLM 推理或下一个工具启动前，存在一段"静默间隙"：`pendingAssistant` 仅在最后一条消息为 `user` 时为 true，工具完成后立即变 false，`PendingBubble`（打字动画）消失，面板冻结在最后一个绿勾状态，用户无法判断任务是否仍在运行。

**改动**
- `assistant/client/AssistantPanel.jsx`：将 `pendingAssistant` 的计算逻辑从「最后一条是 user 消息」改为「任务处于 planning/executing/paused 状态，且当前无任何消息处于 running 或 streaming」，移除冗余的 `lastMsg` 变量。

**行为变化**：工具完成 → 打字动画接替 → 下个工具 spinner 接替 → 流式输出光标接替，全程无静默断档。

**验证**：打开写卡助手，发送需要多工具调用的请求，观察每个工具完成后均立即出现打字动画，直到下一个 spinner 或流式输出出现。

**同步文档**：`CHANGELOG.md`（本条）。

## 2026-05-07 fix(assistant): 移除无效 flushSync + 限制失败行复用范围至当前任务

**背景**：Codex Review 发现上次提交的两处 P2 问题：
1. `flushSync` 包装 `tool_call_started` 回调无法让浏览器绘制中间帧（同一 JS 任务内无法 paint），该用法无效且误导人。
2. `tool_call_started` 的失败行复用逻辑按 toolName 扫描全部 `messages`，面板保留跨任务历史时，新任务的同名工具调用会覆盖旧任务的失败记录，污染历史日志。

**改动**
- `assistant/client/AssistantPanel.jsx`：移除 `flushSync` import 及 `handleEvent` useCallback，`streamAgent` 直接接收 `ingestEvent`。
- `assistant/client/useAssistantStore.js`：新增 `taskMsgOffset: 0` 字段；`task_created` 事件时记录 `s.messages.length` 作为偏移；`tool_call_started` 只在 `taskMsgOffset` 之后搜索失败行，防止跨任务覆盖。

**验证**：触发写卡任务 → verbose 列表行为不变（`running` → `done`/`error`）；多个连续任务使用同名工具时，各任务的失败记录独立保留，不互相覆盖。

**同步文档**：`CHANGELOG.md`（本条）。

## 2026-05-07 fix(assistant): verbose 进行中图标可见 + 重试后不再常驻失败标记

**背景**：两个 verbose 显示问题：
1. 工具调用的 running spinner 因 React 18 自动批处理被跳过：`tool_call_started` 和 `tool_call_completed` 在同一 SSE chunk 内同步处理，两次 Zustand `set()` 被合并成一次渲染，导致 `status: running` 的旋转图标从未出现。
2. 工具重试成功后，原失败条目仍以红色 ✗ 常驻：每次重试生成新 callId，旧的 `status: error` 条目不会更新。

**改动**
- `assistant/client/AssistantPanel.jsx`：引入 `flushSync` 包装 `onEvent` 回调；`tool_call_started` / `step_started` 事件强制同步渲染，保证 running 状态可见。
- `assistant/client/useAssistantStore.js`：`tool_call_started` case 先扫描 `messages` 中同名工具的最近失败条目；若找到，复用该条目槽位（替换 id 并重置为 `status: running`），而非追加新条目，从而使重试成功后条目更新为 ✓。

**验证**：触发写卡任务 → 观察 verbose 列表中执行中的条目出现旋转图标；模拟工具失败并重试后，该条目最终显示 ✓ 而非 ✗。

**同步文档**：`CHANGELOG.md`（本条）。

## 2026-05-07 fix(assistant): messages_changed 不再丢弃合成 plan_doc 行

**背景**：`plan_doc_updated` 把计划文档注入 `messages` 数组（role `plan_doc`，id `'plan-doc'`）。但 truncate / delete 操作广播 `messages_changed` 时，服务端只返回真实消息列表，不含合成行，导致 store 直接替换 `messages` 后计划文档从 UI 永久消失。

**改动**
- `assistant/client/useAssistantStore.js`：`messages_changed` 处理器在替换数组前，检查当前 `messages` 中是否有 `role === 'plan_doc'` 的合成行；若有，以原索引（上限 clamp 到新数组长度）重新插入，保证计划文档在任何编辑 / 删除操作后仍然可见。

**验证**：触发写卡任务生成计划文档 → 删除某条消息 → 确认计划文档仍然显示；截断消息后同样保留。

**同步文档**：`CHANGELOG.md`（本条）。

**锁定文件**：未触碰。

**残留风险**：无。

---

## 2026-05-07 fix(assistant): 计划文档嵌入会话流 + 重开面板保留消息历史

**背景**：两个独立问题。① 计划文档（PlanDocViewer）作为独立 prop 渲染在 MessageList 末尾，不进入 `messages` 数组，导致 auto-scroll 不触发、卡片视觉上"悬浮"于会话之上。② 写卡助手面板关闭后再打开，若上一个任务处于终态（completed / failed / cancelled），会调用 `reset()` 清空消息历史，导致对话记录丢失。

**改动**
- `assistant/client/useAssistantStore.js`：
  - `plan_doc_updated` 事件处理：除更新 `planDoc` 状态外，同步将计划文档注入 `messages` 数组（role `plan_doc`，id 固定为 `'plan-doc'`）。首次注入 append，后续更新 in-place map，不改变消息条数，不触发多余 auto-scroll。
  - 新增 `resetTask()`：仅重置任务态字段（`taskId / status / planDoc / error / currentStepId`），保留 `messages` 历史，专用于面板重开场景。
- `assistant/client/MessageList.jsx`：
  - 渲染循环新增 `role === 'plan_doc'` 分支，直接渲染 `<PlanDocViewer>`。
  - 移除末尾独立的 `{planDoc && <PlanDocViewer content={planDoc} />}` 和 `planDoc` prop，计划文档改由消息数组驱动。
- `assistant/client/AssistantPanel.jsx`：
  - 面板重开时改用 `resetTask()` 替换原 `reset()`，输入框解锁同时保留消息历史。
  - `MessageList` 调用移除 `planDoc` prop。

**效果**
- 计划文档首次出现时触发 auto-scroll（`messages.length` 增加），随会话流自然滚动，不再悬浮。
- 后续计划文档更新（步骤勾选、日志追加）仅更新消息内容，不触发额外滚动。
- 关闭面板再打开后，消息历史完整保留，手动点"清空"才真正清空。

**验证**：触发写卡任务，确认计划文档出现在用户消息气泡正下方并随滚动条移动；关闭面板再打开，历史消息仍在；点"清空"后消息消失。

**同步文档**：`CHANGELOG.md`（本条）。

**锁定文件**：未触碰。

**残留风险**：`planDoc` 状态字段仍保留（用于"清空"按钮条件判断），未做清理；如后续不需要可移除。

---

## 2026-05-07 feat(assistant): verbose 显示美化 — 便签分组 + SVG 状态图标 + 复制按钮内嵌

**背景**：写卡助手的 step / tool_call 消息原先是逐条平铺、无视觉容器的文本行，状态用原始 ✓/✗ 字符，复制按钮孤立于气泡下方。整体观感与主界面风格脱节。

**改动**
- `assistant/client/MessageList.jsx`：
  - 新增 `groupMessages()`：render 阶段扫描 messages 数组，将相邻 step / tool_call 条目动态收入同一 `StepGroup` 容器（纯展示层分组，不缓冲数据，实时性不变）。
  - 新增 `StepGroup`：左侧 2px 竖线按状态着色（运行中=朱砂 `--we-color-accent`；全部完成=苔绿 `--we-color-status-success`；有失败=朱砂 `--we-color-status-danger`），完成后背景切换为 canvas、透明度 0.72 表示"已归档"。
  - 新增 `CheckIcon` / `ErrorIcon` inline SVG：替换原 ✓/✗ 文本字符，使用语义 token 着色（`--we-color-status-success` / `--we-color-status-danger` 填充，`--we-color-text-inverse` 描边）。
  - `StatusIcon`：三态 spinner / CheckIcon / ErrorIcon，均带 `aria-label`。
  - `StepItem`：12px，运行中 font-medium，完成后 text-tertiary，失败朱砂。
  - `ToolCallItem`：10px monospace，`pl-5` 缩进作为二级步骤，样式层次与 StepItem 区分。
  - `AssistantMessage`：复制按钮移入气泡底部，`opacity-0 group-hover:opacity-100` 悬停显示；重新生成 / 删除保留在气泡外 ActionBar；气泡 border / bg 改用语义 token（`--we-color-border-subtle` / `--we-color-bg-surface`）。
- `frontend/src/styles/chat.css`：新增 `.we-step-group` 系列规则（background / border-color / transition / archived 淡化），全部引用 `--we-*` 语义 token，无裸 hex / rgba。

**实时性保证**：step/tool_call 分组在 render 阶段计算，每条 SSE 事件到达立即触发 store set → re-render → 组内条目实时增长，无批处理或 debounce。

**验证**：启动前端 dev server，触发写卡任务，确认步骤逐条出现（竖线朱砂）→ 完成（竖线变苔绿、组淡化）→ 结果气泡悬停显示复制按钮。

**同步文档**：`CHANGELOG.md`（本条）。

**锁定文件**：未触碰。

**残留风险**：`PlanDocViewer` / `PendingBubble` / `ErrorMessage` 仍使用 `--we-paper-aged` / `--we-vermilion` 等旧别名 token（token 仍有效，仅为待迁移技术债），不在本次改动范围内。

---

## 2026-05-07 fix(assistant): 任务终态后 SSE 连接未关闭导致 isStreaming 卡死

**问题**：经过 `awaiting_approval → /approve → finalize_task` 路径时，原始 `/agent` SSE 连接被 `longLived=true` 保留。`/approve` 以 fire-and-forget 调用 `runParentAgent`，`finalize_task` 触发终态事件后无任何位置主动 `res.end()`。前端 `streamAgent` 的 `reader.read()` 永远不返回 `done:true`，导致 `isStreaming` 卡在 `true`，用户看到"停止"按钮无法正常交互。同类隐患：执行期间队列消息建立的新连接、取消时旧连接均同样泄漏。

**改动**
- `assistant/server/task-store.js`：新增 `endAllSse(taskId)`，关闭并清除该 task 所有 SSE 客户端（`clients.clear()` 而不删 Map entry，确保后续 `detachSse` 无副作用）。
- `assistant/server/parent-agent.js`：在 TERMINAL_AFTER_TOOLS 分支（`done` emit 后）和 catch 错误路径（`done` emit 后）各调一次 `endAllSse`。
- `assistant/server/routes.js`：`/cancel` 路由补 `done` 事件 + `endAllSse`，覆盖非前端触发取消的场景。

**验证**：`node --test assistant/tests/routes.test.js` 20/20；路由层 `res.writableEnded` 守卫确保双关安全。

## 2026-05-07 fix(db): persona_state_values 按 persona 拆分，每张玩家卡持有独立状态值行

**问题**：上一次修复（`clearPersonaStateValues`）是临时补丁——同一 world 下的多张玩家卡仍共用一份状态值行，切换 persona 会清除另一张卡的值。

**改动**
- `backend/db/schema.js`：新增 `migratePersonaStateValuesPerPersona(db)` 迁移函数；`persona_state_values` 表结构加 `persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE`，UNIQUE 键从 `(world_id, field_key)` 改为 `(persona_id, field_key)`（`world_id` 保留用于级联/批量删除查询）。迁移时将旧行挂到该 world 的 active_persona 或最早创建的 persona。
- `backend/db/queries/persona-state-values.js`：全面重写。新增 `upsertPersonaStateValueByPersonaId(personaId, worldId, ...)` 供直接指定 personaId 的场景；`upsertPersonaStateValue(worldId, ...)` 等其余函数内部通过 `resolveActivePersonaId` 自动解析；删除 `clearPersonaStateValues`（临时补丁）；新增 `deletePersonaStateValuesByFieldKey(worldId, fieldKey)` 跨 persona 删除。
- `backend/services/persona-state-fields.js`：`createPersonaStateField` 改为为该 world 所有 persona 各 upsert 一行；`updatePersonaStateField` 同理；`deletePersonaStateField` 改用 `deletePersonaStateValuesByFieldKey` 全量删除。
- `backend/services/worlds.js`：`createWorld` 捕获 `upsertPersona` 返回值，用 `persona.id` 调用 `upsertPersonaStateValueByPersonaId`。
- `backend/memory/recall.js`：`renderPersonaState` 内联解析 `active_persona_id`，JOIN 条件从 `psv.world_id` 改为 `psv.persona_id = ?`。
- `assistant/server/normalize-proposal.js`：`persona-card create` 分支：删除 `clearPersonaStateValues` 调用（临时补丁），改在 `createPersonaDb` 后立即调用 `setActivePersona(worldId, newPersona.id)`，使 stateValueOps 写入新卡独立行。
- `assistant/knowledge/USERCARD.md`：回滚"自动清空旧卡"措辞，改为"新卡拥有独立状态值行"。
- `SCHEMA.md`：更新 `persona_state_values` 表结构说明。
- `backend/tests/helpers/fixtures.js`：`insertPersonaStateValue` 改为解析 active persona 并写入 `persona_id`。

**验证**：`npm test`（assistant 目录）32/32 通过。

**锁定文件**：`backend/db/schema.js`（迁移函数）、`SCHEMA.md` 已更新。

**残留风险**：`session_persona_state_values` 仍按 `(session_id, world_id, field_key)` 索引，不区分 persona——会话级 runtime 状态在同一 world 下跨 persona 共享（属已知设计，不在本次修复范围）。

## 2026-05-07 fix(assistant): 创建新玩家卡时清除旧卡遗留的状态值

**问题**：`persona_state_values` 按 `(world_id, field_key)` 唯一索引，同 world 下多张玩家卡共用一份状态值。通过写卡助手 `create` 新玩家卡时，旧卡的 `default_value_json` / `runtime_value_json` 不会自动清除，导致新卡"继承"了旧卡的状态字段默认值。

**改动**
- `backend/db/queries/persona-state-values.js`：新增 `clearPersonaStateValues(worldId)` —— `DELETE FROM persona_state_values WHERE world_id = ?`，用于在创建新卡时整体清零。
- `assistant/server/normalize-proposal.js`：导入 `clearPersonaStateValues`；在 `applyProposal` 的 `persona-card create` 分支，`createPersonaDb` 之后、`stateValueOps` 应用之前调用，确保新卡从字段模板 `default_value` 起步。
- `assistant/knowledge/USERCARD.md`：`create` 操作说明补充"会自动清空旧状态值"。
- `SCHEMA.md`：修正 `persona_state_values` 注释（原"一个 world 只有一个 persona"已过时）。

**验证**：`node --test assistant/tests/routes.test.js` 20/20 通过。手工验证：在同一 world 下用写卡助手创建第二张玩家卡，查询 `persona_state_values`，旧卡的行已被清除，新卡仅保留 `stateValueOps` 中显式填写的值，其余字段回归模板 `default_value`。

**同步文档**：`CHANGELOG.md`（本条）、`SCHEMA.md`、`assistant/knowledge/USERCARD.md`。

**锁定文件**：未触碰。

**残留风险**：同 world 内切换玩家卡会连带清除运行时状态值——这是现有 schema 设计的固有约束（多 persona 共用一份状态值），不在本次修复范围内；将来若要隔离，需给 `persona_state_values` 添加 `persona_id` 列并迁移数据。

## 2026-05-07 feat(assistant): 写卡助手抽屉支持左侧拖拽改宽 + 滚动条接入全局风格 + 重新生成不再 remount user 气泡

**改动**
- `assistant/client/useAssistantStore.js`：新增 `width`（默认 400px，clamp 到 [320, 720]）+ `setWidth`，与 `isOpen` 一起 `partialize` 持久化。
- `assistant/client/AssistantPanel.jsx`：
  - 抽屉 `<aside>` 改为 inline `style={{ width }}`（去掉硬编码 `w-[400px]`）。
  - 左边沿加 4px 命中区拖拽手柄 `cursor-ew-resize`，hover 显示 1px 朱砂引线；`onPointerDown` 走 `setPointerCapture` + 在手柄元素本身挂 `pointermove/up/cancel`，松手前临时把 `body.style.userSelect='none'` 防止文字被选中。
  - **重新生成 / 编辑后页面闪烁(类刷新感)** 修复：`handleRegenerate` / `handleEdit` 改为复用原 messageId（`replaceTailWithUser(prev.id, ..., prev.id)`），React 以同 key 复用 user 气泡 DOM，不再 unmount→remount，`we-bubble-in` 入场动画也不会重复触发；assistant 气泡仍按预期 unmount → PendingBubble → 新流式气泡的过渡。
- `assistant/client/MessageList.jsx`：消息列表滚动容器加 `we-assistant-scroll` 类。
- `frontend/src/styles/chat.css`：把 `.we-assistant-scroll` 选择器并入既有 `.we-chat-area / .we-settings-body / .we-persona-drawer-body / .we-edit-panel-overlay` 的 4px / `var(--we-paper-shadow)` 滚动条规则组，复用全局风格，不再单独维护一份。

**验证**
- 在浏览器中打开抽屉：左边沿能拖拽改宽，松手后宽度持久化（刷新仍生效），上限 720 / 下限 320。
- 抽屉内消息列表滚动条与世界书 / 编辑面板等的 4px 朱砂尾色一致。
- 发送一条消息得到回复后点"重新生成"或"编辑确认"，user 气泡原地停留（不再先消失再重新淡入）；assistant 气泡按"消失 → 三点 → 流式回填"自然过渡。

**同步文档**：`CHANGELOG.md`（本条），`ARCHITECTURE.md` 不涉及（仅前端 UI 行为，未触动 SSE 协议 / 任务状态机）。

**锁定文件**：未触碰。

**残留风险**：拖拽过程中正文如有大量富文本 / Markdown 解析，宽度持续变化会触发 ReactMarkdown 重新计算行宽，低端机可能轻微卡顿；可接受。

## 2026-05-07 fix(assistant): /agent 路由按 task.status 主动关闭 SSE

**动机**：之前 `runParentAgent` 完成后 `/api/assistant/agent` 不调 `res.end()`，旧 fetch 永远挂在 `reader.read()`，靠客户端 abort 兜底，留下竞态隐患（旧/新客户端并发收 `delta` 双写、`messages_changed` 广播误覆盖本地 store）。

**改动**：`assistant/server/routes.js` 在 `/agent` 处理器加 finally：
- `executing` 分支：入队 `pendingUserMessages` 后保留长连接（沿用旧行为）
- `awaiting_approval` / `paused` / `executing` 终态：保留长连接，等用户 `/approve` 或后续 step 事件通过本连接广播；依赖客户端 abort（`handleSend` / `handleRegenerate` / `handleEdit` 起新流前都已主动 abort）解订阅
- 其余（`planning` 直接对话回复、`completed` / `failed` / `cancelled` 终态）：`detachSse(task.id, res)` + `res.end()`，让客户端 `reader.read()` 收到 done 后自然退出，`handleSend` 的 `await streamAgent` 自然 resolve

`catch` 写 `task_failed` 前增加 `!res.writableEnded` 兜底。

**验证**：
- 直接对话："你好" → 收到回复后 `await streamAgent` 自然 resolve，浏览器 Network 面板显示该请求完成；下一轮 send 不再依赖 abort 也能干净起新流。
- 计划模式：触发 `write_plan_doc` → `awaiting_approval` 后 SSE 依然保留；点"确认执行"→ 子步骤 SSE 事件正常推送到原连接。

**同步文档**：`CHANGELOG.md`（本条），`ARCHITECTURE.md` §14 写卡助手段补充 "SSE 关闭时机"。

**残留风险**：长连接（`awaiting_approval` / `paused` / `executing`）仍需客户端 abort 才能从 `sseClients` 中移除；面板关闭/刷新时浏览器自然断 TCP，Node `res.on('close')` 也会 detach，目前没有内存泄漏路径。

## 2026-05-07 fix(assistant): 重新生成 / 编辑后 user 消息被吞

**问题**：点"重新生成"或"编辑确认"后，刚刚替换的新 user 消息从对话区直接消失（连同 assistant 回复一起）。

**根因**：`/api/assistant/agent/:taskId/truncate` 路由在截断后调用 `taskStore.emit({ type:'messages_changed', messages: task.messages })`，会广播给 **所有** 仍订阅 `sseClients` 的连接。上一次 send 留下的旧 SSE fetch 还挂在 `reader.read()`，它会在客户端 `apiTruncateFrom` 返回前后异步收到这帧 `messages_changed`（此时 `task.messages` 已是空数组），`ingestEvent` 用它直接覆盖本地 `messages`，把刚 `replaceTailWithUser` 写入的新 user 消息也一并清掉。

**改动**：`assistant/client/AssistantPanel.jsx`，在 `handleRegenerate` / `handleEdit` 调 `apiTruncateFrom` **之前** 先 `abortRef.current?.abort?.()`：浏览器 abort → Node `res.on('close')` → `taskStore.detachSse` 把旧连接从 `sseClients` 拿掉；之后 truncate 广播 `messages_changed` 时无订阅者收到，本地 store 不被覆盖。

**验证**：发送一条消息得到回复 → 点"重新生成"或"编辑确认"，新 user 消息原地保留并立即出现 PendingBubble，随后 assistant 流式正常返回。

**同步文档**：`CHANGELOG.md`（本条）。

**残留风险**：服务端 `/agent` SSE 仍未在 `runParentAgent` 后 `res.end()`，依赖客户端 abort 才能解订阅；后续可再补一道服务端兜底。

## 2026-05-07 fix(assistant): 重新生成的页面闪烁 + 流式光标换行另起

**问题**
- 点"重新生成"或"编辑后重发"时，对话区先变空再重新填回，整页明显闪烁/跳动。
- 流式过程中末尾光标位于最后一段段落 **下方新行** 而非段尾。

**根因**
- `handleRegenerate` / `handleEdit` 顺序执行 `truncateFromId(prev.id)` → 等到下一行 `pushUserMessage` 之间，React 会先以"空 messages"完成一次 commit，然后才用 push 后的状态再 commit 一次。中间这帧导致用户看到的就是闪烁。
- 流式光标用 `<span class="inline-block">` 作为 `<SimpleMarkdown>` 的兄弟节点；ReactMarkdown 输出最末是 `<p>`（block），sibling span 自然落到下一行。

**改动**
- `assistant/client/useAssistantStore.js`：新增 `replaceTailWithUser(prevId, content, newId)`，单次 `set` 完成"截到 prevId 之前 + 追加新 user 消息"，消除中间空帧。
- `assistant/client/AssistantPanel.jsx`：
  - `handleSend` 增加 `opts.skipPush` / `opts.messageId`，允许调用方先把 user 消息原子写入 store、本函数只负责开 SSE。
  - `handleRegenerate` / `handleEdit` 改为：服务端 `apiTruncateFrom` → `replaceTailWithUser` → `handleSend(text, { skipPush:true, messageId:newId })`。
- `assistant/client/MessageList.jsx`：删除流式末尾的独立 `<span>` 光标；assistant 气泡在 `streaming && content` 时挂 `we-stream-bubble` 类。
- `frontend/src/index.css`：`.we-stream-bubble > :last-child::after` 用 CSS 伪元素生成光标，作为最后一个块级子元素的 inline-block ::after，落在段尾、不再换行。`we-stream-pulse` 关键帧只控 opacity，移除 transform 以免位移微抖。

**验证**：发送一句话获取回复后点"重新生成"或编辑用户消息后确认；对话区不再先空后填、无可见跳动；流式过程光标始终贴在最后一段末尾。

**同步文档**：`CHANGELOG.md`（本条；已合并并替换 4 处修复条目）。

**锁定文件**：未触碰。

**残留风险**：若 markdown 末节点是 `<ul>/<ol>/<pre>` 等块级容器，`::after` 会落在容器内底端的空白处而非"最后一个文字字符"右侧，视觉略偏；流式正文绝大多数情况以 `<p>` 收尾，可接受。

## 2026-05-07 fix(assistant): 写卡助手对话气泡 UX 四处修复

**问题**
- user 气泡总是撑满 80% 宽度，短文本（如"你好"）也被拉得很宽，不会随内容收缩。
- 用户发送后到首个 SSE delta 到达之前，没有任何视觉占位，看起来像卡住了。
- assistant 流式过程中末尾的方块光标 `h-3.5 w-[7px]` + step-end 硬切 + 随 markdown 重渲染换位，整体观感"鬼畜乱跳"。
- **重新生成后字符级双写**（"你你好好！我是 WorldEngine 写！我是 WorldEngine 写卡助手…"）：服务端 `/agent` 路由在 `runParentAgent` 完成后没有调用 `res.end()`，旧的 SSE fetch reader 一直挂着；前端 `handleSend` 起新流时也没 abort 旧 controller，于是旧/新两个 fetch 同时挂在 `sseClients` 集合里，每个 delta 被 `ingestEvent` 追加两次。

**改动**
- `assistant/client/MessageList.jsx`
  - `UserMessage` 外层从 `group max-w-[80%]` 改为 `group flex max-w-[80%] flex-col items-end`，让气泡按内容自适应（content-fit）并始终右对齐，ActionBar 跟随气泡宽度。
  - 新增 `PendingBubble`（左侧 typing-dots，复用 `.we-typing-dots` + `.typing-dot.typing-dot-accent`）；MessageList 接收 `pending` 布尔，挂载在消息列表底部，挂载时自动滚到底。
  - 流式光标：方块 `h-3.5 w-[7px] / we-blink step-end` → 细线 `h-[0.9em] w-[2px] translate-y-[2px] / we-stream-pulse 1.2s ease-in-out`，随行高自适应，平滑脉冲、不再硬闪、不再在文本末尾跳动。
- `assistant/client/AssistantPanel.jsx`：
  - 派生 `pendingAssistant = lastMsg.role === 'user' && !TERMINAL_STATUSES.has(status)`，传给 `MessageList`（首个 delta 触发新建 assistant 消息后自动消失）。
  - `handleSend` 起新流前先 `abortRef.current?.abort?.()`，杀掉上一条仍 hang 在 `reader.read()` 的旧 fetch；浏览器 abort → Node 侧 `res.on('close')` → `taskStore.detachSse`，旧 res 不再收到广播，重新生成 / 连续发送不再字符级双写。
- `frontend/src/index.css`：新增 `@keyframes we-stream-pulse`（保留旧 `we-blink` 不动以免影响其他用法）。

**验证**：前端 `npm run dev`，打开写卡助手 → 发送"你好"，气泡随文本收缩；发送后到流式开始之前出现左侧三点跳动；流式过程末尾光标为细线平滑脉冲，不再随每个 token 跳动。

**同步文档**：`CHANGELOG.md`（本条）。`ARCHITECTURE.md` / `SCHEMA.md` 不涉及。

**锁定文件**：未触碰。

**残留风险**：`pendingAssistant` 在 `awaiting_approval` 且最后一条恰为 user 时也会显示（当前流程下不会出现该序列；若后续父代理改为 plan→user 追问→approve 的链路需复评条件）。

## 2026-05-07 feat(assistant): 写卡助手批 B — parent-agent 切流式（resolveToolContext + chat 双步）

**动机**：批 A 恢复了 UX 形态，但父代理仍走 `llm.completeWithTools`，最终文本作为单条 delta 一次性下发，token-by-token 流式体验缺失。批 B 改回 2-步式：先非流式跑工具循环，再流式生成正文。

**改动**

- `assistant/server/parent-agent.js`：`runParentAgent` 不再调用 `completeWithTools`，改为：
  1. `llm.resolveToolContext(messages, tools, { temperature: 0.3 })` 跑非流式 tool-use 循环，返回富化后的 messages（system + history + tool_calls + tool_results）。期间 meta tools（write_plan_doc / dispatch_subagent / finalize_task 等）的 SSE 事件照常 emit。
  2. 提前 `appendMessage({ role:'assistant', content:'' })` 占位拿到 stamped id；
  3. `for await (chunk of llm.chat(enriched, { temperature: 0.7 }))` 逐 chunk emit `{ type:'delta', delta, messageId }`；
  4. 流式结束后通过 `taskStore.__testables.tasks.get(id)` 把累积文本回填到那条预占消息。
- 错误路径：流式中途抛错时，移除预占的（多半空内容）assistant 消息，再 emit `task_failed` + `done`，保持 task.messages 干净。
- 新增 `TOOLS_RESOLVED` 日志，标识 tool-loop 结束、流式开始的边界。

**未改动**：sub-agent.js 仍走 `completeWithTools`（输出会被父代理摘要，无需流式）；`backend/llm/index.js` 完全沿用现有 API；前端 `appendDelta` 已在批 A 支持 `evt.messageId` adopt，无需调整。

**验证**：`node --test assistant/tests/*.{js,mjs}` 26/26 通过；`vite build` 成功；后端 boot 日志干净；curl SSE 可见多条小 chunk delta（每条 1-3 字符），不再是单条大 delta。

## 2026-05-07 feat(assistant): 写卡助手批 A — UX 恢复 + 稳定 messageId + 截断/删除 API

**动机**：单代理 + 计划文档迁移后，UX 比旧 AssistantPanel 出现回退：消息无入场动效、缺少 typing dots、缺 hover 操作按钮（复制/编辑/删除/重新生成）、编辑后无法自动重发。这批改动按"批 A"恢复交互，同时落地后端稳定 messageId 和截断/删除 API 作为前置条件。

**改动**

- 后端
  - `assistant/server/task-store.js`：`appendMessage` 现在为每条消息打上稳定 `id`（来源：调用方传入或 `msg-<uuid8>`），并返回 stamped 后的对象；新增 `deleteMessage(taskId, messageId)` 与 `truncateFrom(taskId, messageId)`。
  - `assistant/server/parent-agent.js`：`runParentAgent(task, userInput, opts?)` 接受可选 `userMessageId`，落库时透传给 `appendMessage`；assistant 终稿落库后把服务端 stamped id 一并放进 `delta` 事件（`{ type:'delta', delta, messageId }`），使前端流式气泡能采纳服务端 id。新增 `user_message` SSE 事件，让前端给 push 进去的 user 消息补上服务端 id（用于后续 truncate/delete）。
  - `assistant/server/routes.js`：`POST /api/assistant/agent` 接受 `messageId` 字段并透传给 parent-agent；新增 `POST /api/assistant/agent/:taskId/truncate` 与 `POST /api/assistant/agent/:taskId/delete`。两者在 `executing` 状态下拒绝（避免与正在运行的工具竞态），其它状态执行后 emit `messages_changed` 全量 messages 让所有 SSE 订阅者重新对齐。
- 前端
  - `assistant/client/api.js`：新增 `truncateFrom(taskId, messageId)` / `deleteMessage(taskId, messageId)`；`streamAgent` 入参新增 `messageId`，会被一起 POST 到 `/agent`。
  - `assistant/client/useAssistantStore.js`：本地 push user 消息时生成 `msg-<uuid8>` 临时 id 并随 streamAgent 上传；`appendDelta` 接受 server `messageId` 后覆盖到正在流式的 assistant 气泡上；新增 `deleteMessage` / `truncateFromId` / `replaceMessages` actions；新增 `user_message` / `messages_changed` 两个事件分支；末尾 `{ done: true }` 帧会清掉最后一条 assistant 的 `streaming` 标志，让 ActionBar 出现。
  - `assistant/client/MessageList.jsx` 重写：恢复 hover ActionBar（user：复制/编辑/删除；assistant：复制/重新生成/删除），编辑态用 textarea + ESC 取消 / Cmd|Ctrl+Enter 确认；删除采用两段确认（首次"确认？"，2 秒内再次点击才真正删除）；流式开始无内容时显示 typing dots，首字到达后显示闪烁光标。所有样式改用 Tailwind 工具类 + `--we-*` 变量，删除全部内联 `style`。
  - `assistant/client/AssistantPanel.jsx`：新增 `handleEdit / handleDelete / handleRegenerate` 并下传到 MessageList。编辑：truncate 到该 user 消息（含）→ 本地 mirror → 用编辑后内容重新 `handleSend`，触发新一轮流式回复。重新生成：truncate 到对应 user 消息（含）→ mirror → 重发 prev.content。`handleSend(overrideText?)` 仅在 `typeof overrideText === 'string'` 时使用 override（避免 onClick event 被误当文本）。
  - `frontend/src/index.css`：新增 `@keyframes we-bubble-in`（消息入场）和 `@keyframes we-blink`（流式光标）；MessageList 用 Tailwind 任意值类 `animate-[we-bubble-in_0.2s_ease-out]` / `animate-[we-blink_0.8s_step-end_infinite]` 引用。

**验证**

- `node --test assistant/tests/*.{js,mjs}` 26/26 pass。
- `cd frontend && npx vite build` 通过；bundled CSS 中可见 `@keyframes we-bubble-in` / `@keyframes we-blink` 与对应 `animate-[…]` 任意值类。
- `cd backend && npm run dev` 启动后输出 `SERVER_READY:3000` 无报错。
- `cd assistant/client && npx eslint .` 无 warning。

**残留风险**

- truncate/delete 在 `executing` 状态下被服务端拒绝（400），前端目前只通过 ingestEvent 错误提示，未做更细的按钮状态门控；如需在 executing 中提供 abort 体验，需要走 cancelTask 路线。
- `messages_changed` 事件目前由 truncate/delete 端点主动 emit；后续若有其它路径直接修改 `task.messages` 也需要自行 emit 才能让其它打开的面板同步。
- `replaceMessages` action 已新增但当前未被使用（`messages_changed` 直接走 ingestEvent 内联替换），保留以备未来跨标签页同步。

---

## 2026-05-07 feat(assistant): 重做写卡助手为单接口父子代理 + 计划文档架构

**动机**：旧双轨架构（`/chat` 兼容轨 + `/tasks` 通用轨）维护成本高，研究→规划→执行→提案审批四段链路彼此耦合，prompt 与重试策略散落在 `task-researcher.js` / `task-planner.js` / `task-executor.js` 三处；前端 `ChangeProposalCard` 步骤审批卡 UI 与 Claude Code 风格不符，且需要在每个 step 暂停重审，节奏割裂。整体迁移到 Claude Code 风格的“父代理 + 通用执行子代理 + Markdown 计划文档”架构。

**改动**

- 后端
  - 删除 `/api/assistant/chat`、`/api/assistant/tasks`、`/api/assistant/tasks/:taskId/answer|approve-plan|approve-step` 全部路由与相关 task-researcher / task-planner / task-executor / agent-factory / 6 资源域子代理；改为单一主入口 `POST /api/assistant/agent`（SSE）+ 4 个辅助接口 `agent/:taskId/{approve,cancel,plan-doc,(GET task)}`。
  - 新增 `assistant/server/parent-agent.js`：长上下文父代理，每轮在首条 system 自动注入 `assistant/knowledge/CONTRACT.md`，工具集 = 3 读 + 6 apply（每 targetType 各一）+ 5 meta（`update_plan_doc` / `dispatch_subagent` / `request_clarification` / `complete_task` / `fail_task`）。
  - 新增 `assistant/server/sub-agent.js`：通用执行子代理，按 `task.targetType` 注入 `assistant/knowledge/<TARGET>.md`（一次只一份），工具集 = 3 读 + 1 个对应 `apply_*` 工具。替代过去 6 个资源域子代理。
  - 新增 `assistant/server/plan-doc.js`：计划文档原子读写 + 状态字段切换；物理文件落 `/.temp/assistant/<taskId>.md`，每次更新 emit `plan_doc_updated` SSE。
  - 抽出 `assistant/server/normalize-proposal.js`：所有 apply 入口统一过 `normalizeProposal()` 后再调资源服务，作为落库唯一安全边界。
  - `assistant/server/task-store.js`：补 `pendingUserMessages` 队列与 `takeUserMessages()` API，承载 spec §6.4 暂停语义。
  - 知识库：`assistant/knowledge/` 下 7 份 markdown（CONTRACT + WORLDCARD/CHARCARD/USERCARD/GLOBALPROMPT/CSSSNIPPET/REGEXRULE）替代旧 `assistant/prompts/` 中分散的 planner / 子代理提示词。
- 前端
  - 删除 `ChangeProposalCard` 步骤审批卡 UI 与对应 store 字段；新增 `frontend/src/components/assistant/PlanDocViewer.jsx` 渲染父代理维护的 markdown 计划文档。
  - `assistant/client/AssistantPanel.jsx` 改用单接口 `/agent` 驱动；`useAssistantStore.js` 监听 `plan_doc_updated` / `awaiting_approval` / `paused` / `step_completed` 等新事件清单；`api.js` 新增 `fetchPlanDoc(taskId)`、`approveTask(taskId)`、`cancelTask(taskId)`。
  - SSE 事件白名单收敛为 14 类：`delta` / `thinking` / `plan_doc_updated` / `awaiting_approval` / `plan_approved` / `step_started` / `step_completed` / `step_failed` / `paused` / `task_completed` / `task_failed` / `task_cancelled` / `done` / `error`。
- 任务规模与状态机
  - 步骤数 < 3 走 simple mode：父代理直接 apply，不写计划文档、不进入审批门。
  - 步骤数 ≥ 3 走 plan mode：父代理 `update_plan_doc` 写计划 → 切 `awaiting_approval` → 用户 `/approve` → 父代理逐步 `dispatch_subagent`。
  - 状态机：`planning → clarifying → awaiting_approval → executing → paused → completed | failed | cancelled`。
  - 暂停语义：`executing` 中用户消息 enqueue，不打断当前 step；step 结束后由父代理消费、切 `paused`、`update_plan_doc` 调整未完成步骤、等用户再次 `/approve` 续派（详见 Phase 9 条目）。

**参考**

- 设计文档：`docs/superpowers/specs/2026-05-07-assistant-redesign-design.md`
- 实施计划：Phase 0/1（knowledge）→ Phase 2（normalizeProposal/applyProposal）→ Phase 3（plan-doc TDD）→ Phase 4（apply_* 工具 ×6 + list_resources）→ Phase 5（通用 sub-agent）→ Phase 6（parent-agent + task-store）→ Phase 7（routes 重构）→ Phase 8（前端重构）→ Phase 9（暂停语义）→ Phase 10（集成测试）→ Phase 12（文档同步）
- 落库安全边界唯一入口：`assistant/server/normalize-proposal.js`
- 知识库分工权威：`assistant/knowledge/CONTRACT.md`

**残留风险**

- 前端 localStorage 旧持久化键 `we-assistant-v1` 不再被新代码读写；浏览器若残留旧条目无功能影响，仅占少量空间，无需主动清理。
- 旧 `/chat` `/tasks` 端点已彻底删除；任何外部脚本或文档若仍指向旧路径需要同步更新到 `/agent`。
- 计划文档物理文件落在 `/.temp/assistant/`，跨重启不持久；若服务进程重启正在 `awaiting_approval` 的任务会丢失计划文档原文（task-store 内存态本身重启即清空，对齐预期）。