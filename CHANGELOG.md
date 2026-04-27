# Changelog

> 每次任务完成后，在最上方追加一条记录。这是项目的"记忆"，给自己和 AI 看。  
> 新开对话时让 Claude Code 先读此文件，了解项目现状。

## 2026-04-28 修复状态栏"整理中"双次循环 + 补回背景虚化

**问题**：
1. 写作模式下 `state_updated` 和 `diary_updated` 是两条独立 SSE，分别触发 `stateTick` 和 `diaryTick` 自增，导致 `useSessionState` 的 tick effect 执行两次，"整理中"→"已整理"循环出现两次。
2. 状态栏 overlay 缺少 `backdrop-filter: blur`（在历史样式清理中未补入）。
3. 整理中→已整理切换时，两个 overlay `MotionDiv` 分别做淡出/淡入，blur 随 opacity 短暂消失，视觉上有虚化断档。

**改动**：
- `frontend/src/hooks/useSessionState.js` — 引入 `showOverlay = shouldRefreshState`：仅当 `stateTick` 变化时才显示"整理中"overlay；diary-only 更新（`diaryTick` 变化）静默刷新日记数据，不触发 `isUpdating`
- `frontend/src/components/book/StatePanel.jsx` — overlay 结构重构：外层容器由 `isUpdating || stateJustChanged` 控制，整个过程保持 blur 连续；内层用 `AnimatePresence mode="wait"` 切换"整理中"/"已整理"文字
- `frontend/src/components/book/CastPanel.jsx` — 同 StatePanel，写作模式 CastPanel 同步重构
- `frontend/src/index.css` — `.we-state-change-overlay` / `.we-cast-state-overlay` 新增 `backdrop-filter: blur(2px)`

**行为变化**：每轮生成后状态栏仅出现一次"整理中"→"已整理"；两段文字切换期间虚化背景持续不中断。

## 2026-04-28 删除编辑世界页面导入导出 tab 及相关链路

**改动**：
- `frontend/src/pages/WorldEditPage.jsx` — 删除"导入导出" tab（export section）、`handleExport` / `handleImportWorldFile` 函数、`exporting` / `sealKey` / `importing` state、`worldImportRef`、`SealStampAnimation` 组件及其 import、`import-export` API import
- `frontend/src/pages/WorldsPage.jsx` — 删除页头"导入世界卡"按钮及隐藏 file input、各 world card 上的"导出世界卡（↓）"按钮、`handleExportWorld` / `handleImportWorldFile` 函数、`exportingWorldId` / `importingWorld` state、`worldImportRef`、`useRef` import（无其他用途）、`pushErrorToast` import（无其他用途）、`import-export` API import

**注意**：`frontend/src/api/import-export.js` 中 `downloadWorldCard` / `importWorld` 函数定义仍保留（CharacterEditPage 等其他页面可能还在使用）。

## 2026-04-27 修复重新生成时状态回滚跳过 null-snapshot 记录

**问题**：重新生成较早轮次时，若最近的 turn record 的 `state_snapshot` 为 null（旧数据或创建时 worldId 为 null），`restoreStateFromSnapshot` 会降级清空全部状态而非正确回滚。

**改动**：
- `backend/db/queries/turn-records.js` — 新增 `getLatestTurnRecordWithSnapshot(sessionId)`，查询 `state_snapshot IS NOT NULL` 的最新记录
- `backend/routes/chat.js` — regenerate 路由回滚处改用新函数，确保跳过无快照记录找最近有效锚点
- `backend/routes/writing.js` — 写作模式 regenerate 路由同步修复

**行为变化**：若所有 turn records 均无快照，仍降级清空（与原行为一致）；只有"部分有快照、最新一条恰好无快照"场景得到修复。

## 2026-04-27 修复质量门残留：lint 与 Playwright e2e 稳定性

**问题**：前端全量 lint 仍被未提交的拖拽/制卡预览改动阻断；聊天 Playwright e2e 固定使用 4173 端口，机器上存在旧 Vite 进程时会连到陈旧前端，导致等待消息可见超时。

**改动**：
- `frontend/src/components/ui/SortableList.jsx` — 不再 render 阶段写 ref，改用 effect 同步最新 items。
- `frontend/src/components/state/EntrySection.jsx` — 移除 effect 内同步 localEntries 的 setState；条目列表抽为 keyed 子组件，外部 entries 变化时重挂载初始化本地拖拽状态。
- `frontend/src/components/writing/CharacterPreviewModal.jsx` / `frontend/src/styles/ui.css` — 将制卡预览弹窗 inline 视觉样式迁移到 CSS 类，清空 lint warning。
- `backend/tests/e2e/chat-playwright.test.js` — 前端测试服务器改为运行时分配空闲端口，并启用 `--strictPort`，避免误连旧服务。

**结果**：`npm run lint --prefix frontend`、聊天/写作 Playwright e2e、续写相关前后端测试均通过。

## 2026-04-27 条目列表（常驻/关键词/AI召回/状态条件）对齐 SortableList 拖拽动画

**改动**：
- `frontend/src/components/state/EntrySection.jsx` — 引入 `SortableList`；keyed 子列表内维护 `localEntries` 乐观排序状态，外部 `entries` 变化时通过重挂载初始化，拖拽松手后调用 `reorderWorldEntries` 持久化，无需触发 `onRefresh`；每行新增 ⠿ 拖拽把手。
- `frontend/src/styles/pages.css` — `.we-entry-section-row` 新增 `cursor: grab`；添加 `.we-entry-section-drag` 拖拽把手样式；添加 `.we-entry-section-list > div:last-child .we-entry-section-row` 规则，修复 SortableList `Reorder.Item` 包裹后最后一行多余下边框问题。

## 2026-04-27 修复 continue 续写内容前端渲染异常

**问题**：`continue` 续写时前端直接把原始流式增量拼到上一条 assistant 消息上。若模型输出 `<next_prompt>`，或后端对续写内容做了 `ai_output` 正则、状态块剥离、选项提取等后处理，前端展示文本会和数据库最终内容不一致，表现为 `<next_prompt>` 标签进入气泡、Markdown 渲染异常，或写作模式刷新后内容变化。

**改动**：
- `backend/routes/writing.js` — 写作 `/continue` 的 `done` / `aborted` SSE 现在与 chat 对齐，携带合并后的 `assistant` 消息。
- `frontend/src/pages/ChatPage.jsx` / `WritingSpacePage.jsx` — 续写流式预览阶段隐藏 `<next_prompt>` 段并提取选项；收尾时优先使用后端返回的最终 assistant 内容覆盖本地拼接结果。
- `frontend/tests/pages/chat-page.test.jsx` / `writing-space-page.test.jsx` / `backend/tests/routes/writing.test.js` — 增加回归覆盖，确保 `<next_prompt>` 不进入最终消息渲染，写作 continue SSE 返回最终 assistant。
- `ARCHITECTURE.md` — 同步 `/continue` SSE 与前端收尾契约。

**结果**：续写按钮生成的内容与落库内容一致，`<next_prompt>` 不再污染前端 Markdown 渲染。

## 2026-04-27 拖拽排序平滑动画 + SortableList 组件抽象

**目标**：所有可拖拽排序的列表改用 framer-motion `Reorder` 实现"其他条目自动滑开"的平滑动画；抽象为可复用的 `SortableList` 组件。

**改动**：
- `frontend/src/components/ui/SortableList.jsx` — 新增通用排序组件，封装 `Reorder.Group` / `Reorder.Item`；支持 `useHandle=true` 模式（仅句柄可拖）；`onReorderEnd` 由内部 ref 捕获最新顺序后回调，避免 closure 过时。
- `frontend/src/components/index.js` — 注册 `SortableList`。
- `frontend/src/components/state/StateFieldList.jsx` — 替换 HTML5 drag 为 SortableList；`diary_time` 字段单独渲染在列表末尾，保持不可拖。
- `frontend/src/components/settings/RegexRulesManager.jsx` — 每个 scope 分组独立使用一个 SortableList，跨 scope 不可拖。
- `frontend/src/components/settings/CustomCssManager.jsx` — 替换 HTML5 drag 为 SortableList。
- `frontend/src/pages/CharactersPage.jsx` — 角色列表从 grid 改为竖列表，使用 `useHandle=true` 模式（⠿ 句柄拖拽），不干扰卡片点击导航。
- `frontend/src/styles/pages.css` — 新增 `.we-characters-list`（竖列表容器）、`.we-char-drag`（角色卡拖拽句柄样式）。

**注意**：framer-motion 已是项目依赖（v11），无需新增安装。`diary_time` 字段始终固定在状态字段列表末尾（原行为：不可拖但可被其他项跨越；新行为：始终渲染在 SortableList 外部，视觉上位于末尾）。

## 2026-04-27 写卡助手 CUD 提示词统一 {{user}} / {{char}} 术语

**目标**：世界卡、角色卡、玩家卡等 CUD 生成时，不再在卡片正文、条目内容、状态字段说明、开场白和任务计划里混用“用户 / 玩家 / AI / NPC”等称呼；代入者统一写 `{{user}}`，模型扮演或回应的角色统一写 `{{char}}`。

**改动**：
- `assistant/prompts/world-card.md` / `character-card.md` / `persona-card.md` / `global-prompt.md` / `extract-characters.md` — 在硬规则中加入术语统一约束，并把容易被模型复制到正文里的示例措辞改为 `{{user}}` / `{{char}}`。
- `assistant/server/task-planner.js` — 规划器生成 `summary` / `assumptions` / `step.title` / `step.task` 时也要求使用同一套术语，并把输入标签从“用户输入”改成“原始需求”。
- `assistant/server/agents/*.js` — 子代理工具描述和 task 参数说明同步强调占位符术语，避免主代理分发任务时重新引入混乱称呼。
- `assistant/tests/task-planner.test.js` — 增加规划器提示词术语约束的回归测试。

**注意**：schema 字段值、接口枚举、正则 scope、历史状态标签仍按现有格式保留，例如 `target:"persona"`、`keyword_scope:"user"`、`target_field:"玩家.HP"` 不强行改名，避免破坏已有数据和运行时匹配。

## 2026-04-27 修复写作模式重新生成报 afterMessageId not found

**问题**：写作页 `handleSend` 乐观追加用户消息使用 `__optimistic_*` 临时 ID，但写作后端 `/generate` 路由从不发送 `user_saved` SSE 事件，前端的临时 ID 永远不会被替换成真实 DB ID。`onStreamEnd` 正常路径（`alreadyAppended = true`）不调用 `refreshMessages()`，导致消息列表里用户消息的 ID 一直是假的。点击重新生成时发出 `afterMessageId = __optimistic_*`，后端找不到返回 404，界面显示"生成失败：afterMessageId not found"。

**改动**：
- `backend/routes/writing.js` — `/generate` 路由捕获 `createMessage` 返回的真实 ID，作为 `userMsgId` 传给 `runWritingStream`；`runWritingStream` 在 `awaitPendingStateUpdate` 之后发送 `{ type: 'user_saved', id: userMsgId }` SSE 事件，与 chat 路由对称。
- `frontend/src/pages/WritingSpacePage.jsx` — 新增 `tempUserIdRef` 追踪乐观 ID；`handleSend` 里设置 `tempUserIdRef.current`；`makeStreamCallbacks` 里加 `onUserSaved` 回调原地替换消息列表中的临时 ID；`onStreamEnd` 里清除 `tempUserIdRef.current`。

**结果**：写作模式用户发送消息后，`user_saved` 事件一到达即替换临时 ID；后续点击重新生成发送的是真实 DB ID，后端正常找到并处理。

## 2026-04-27 修复旧 SSE 收尾覆盖新生成导致误中断

**问题**：聊天/写作普通生成在收到 `done` 后会提前解锁输入，但 SSE 连接可能还在等待标题或后台收尾事件。此时用户立刻再次输入或点击重新生成，旧流稍后触发的 `onStreamEnd` 会复用页面级 ref 清空新流状态，表现为画面闪一下、新输出被标记中断，或连续重新生成越来越短。

**改动**：
- `frontend/src/pages/ChatPage.jsx` / `frontend/src/pages/WritingSpacePage.jsx` — 普通生成、编辑后重生成、重新生成、错误重试统一分配 `streamRunId`；`delta/done/aborted/error/title/memory/state/diary/onStreamEnd` 回调只允许当前 run 生效，旧 SSE 收尾被忽略。
- `frontend/tests/pages/chat-page.test.jsx` / `frontend/tests/pages/writing-space-page.test.jsx` — 新增回归测试：旧普通流 `onStreamEnd` 晚到时，不得解锁正在进行的新流；同时补齐页面配置读取 mock 与流 API mock 重置，避免用例间污染。

**结果**：用户在 `done` 后立即再次输入或重新生成时，新一轮流式输出不会再被上一轮连接收尾覆盖。

## 2026-04-27 修复重新生成绕过异步队列导致状态整理冲突

**问题**：状态栏整理等后台任务仍在同 session 队列中运行时，点击聊天/写作重新生成会直接截断消息、回滚状态并启动新流；旧状态整理完成后可能写回旧轮次状态，写作模式下旧 SSE 收尾也可能打断新的重新生成体验。

**改动**：
- `backend/utils/async-queue.js` — 新增 `waitForQueueIdle(sessionId)`，可等待指定 session 已入队任务全部结束。
- `backend/routes/chat.js` / `backend/routes/writing.js` — 聊天与写作 `/regenerate`、会话标题重生成、章节标题重生成在执行前等待队列空闲；regenerate 后只清理优先级 4+ 的可丢弃任务，不再清掉 p2/p3。
- `backend/routes/sessions.js` — 用户消息编辑接口在截断并回滚前等待队列空闲，覆盖“编辑并重新生成”链路。
- `backend/tests/utils/async-queue.test.js` / `backend/tests/routes/chat.test.js` / `backend/tests/routes/writing.test.js` — 新增队列屏障与 regenerate 等待队列的回归测试。

**结果**：各种重新生成会排在同 session 已有后台任务之后启动，不再和状态栏整理、turn record、日记等队列任务互相覆盖。

## 2026-04-27 修复 diary_time 更新不积极（state-update.md Rule 5）

**问题**：`diary_time` 的 `update_instruction` 明确写"每轮必须更新"，但 LLM 只偶尔更新。根因：Rule 5 的保守措辞（"只有明确偏离默认值时才更新"）与字段指令冲突，叠加 recency bias 使通用规则压倒字段级指令。

**改动**：`backend/prompts/templates/state-update.md` — Rule 5 替换为积极措辞："字段有变化或自然推进时主动更新；不要因本轮未明确提及就保守跳过"。去掉了默认值相关表述，让隐含时间流逝等自然推进也能触发更新。

## 2026-04-27 状态字段超限自动压缩（text > 50字 / list > 10条）

**目标**：状态自动更新时，LLM 偶尔生成过长文本或过多列表条目，影响状态栏展示体验。

**改动**：
- `backend/utils/constants.js` — 新增 4 个常量：`STATE_TEXT_MAX_LENGTH=50`、`STATE_TEXT_COMPRESS_TARGET=20`、`STATE_LIST_MAX_ITEMS=10`、`STATE_LIST_TRIM_TARGET=5`，以及 `LLM_STATE_COMPRESS_MAX_TOKENS=512`
- `backend/prompts/templates/state-compress.md` — 新建压缩 prompt 模板，支持 text 压缩和 list 裁剪两种情形
- `backend/memory/combined-state-updater.js` — 在 patch 解析后、`applyStatePatch` 之前调用 `compressOverLimitFields`；text 字段超 50 字则发回 LLM 压缩到 20 字以内，list 字段超 10 条则发回 LLM 智能保留最重要的 5 条

**机制**：两类超限字段合并到同一次 LLM 调用；LLM 失败/返回解析错误时原值透传，不影响主流程。

## 2026-04-27 清理状态字段 trigger_mode/trigger_keywords 历史遗留

**问题**：用户实测多轮写作后 `current_mission` 和 `diary_time` 不更新。日志显示 `updateAllStates` 每轮执行，但只有 `mission_phase` 被送入状态更新；原因是状态字段表仍保留旧 `trigger_mode=manual_only`，`filterActive` 把这些 `llm_auto` 字段排除了。

**改动**：
- `combined-state-updater.js` — `filterActive` 只看 `update_mode === 'llm_auto'`，LLM 自动字段每轮参与状态更新
- 三类状态字段 query / fixture / 导入导出 / assistant proposal / 前端字段列表 — 移除 `trigger_mode` / `trigger_keywords` 读写、展示和契约
- `schema.js` — 新库不再创建这两列；旧库启动时对 `world_state_fields` / `character_state_fields` / `persona_state_fields` 执行 `DROP COLUMN`
- `SCHEMA.md` / `ARCHITECTURE.md` / `assistant/CONTRACT.md` / `assistant/prompts/main.md` — 同步为单一 `update_mode` 机制

**结果**：现有 `data/worldengine.db` 三张状态字段表已清除旧列；`diary_time` / `current_mission` / `mission_phase` 均为 `llm_auto`，下轮状态更新会全部进入 LLM 状态追踪 prompt。

## 2026-04-27 写卡助手补齐 stateValueOps：角色卡/玩家卡只填写现有状态字段值

**目标**：在已禁止 `character-card` / `persona-card` 管理字段定义之后，补回一条安全的“填写现有状态值”通道，让角色卡和玩家卡可以设置当前世界里已经存在的状态字段默认值。

**改动**：
- `assistant/server/routes.js` — 新增 `stateValueOps` 归一化、editedProposal 合并与执行逻辑；`character-card` 只允许 `target:"character"`，`persona-card` 只允许 `target:"persona"`；实际写入复用 `backend/services/state-values.js` 的校验层
- `assistant/server/tools/card-preview.js` — `character-card` / `persona-card` 预览新增当前默认状态值，供子代理按现状填写
- `assistant/client/ChangeProposalCard.jsx` / `assistant/client/history.js` — 提案卡与历史摘要新增 `stateValueOps` 展示与编辑
- `assistant/prompts/character-card.md` / `assistant/prompts/persona-card.md` / `assistant/server/agents/*.js` — 子代理描述改为：字段模板仍归世界卡管理，但允许填写现有字段值
- `assistant/tests/routes.test.js` / `assistant/tests/routes-integration.test.js` / `assistant/tests/tools/card-preview.test.js` — 新增 `stateValueOps` 格式、执行落库、未知字段拒绝、preview 返回当前值测试
- `assistant/CONTRACT.md` / `ARCHITECTURE.md` — 同步补充 `stateValueOps` 契约与运行时边界

**结果**：
- 角色卡/玩家卡现在只能改卡面正文 + 已存在字段的默认状态值
- 字段模板仍然只允许在世界卡层创建、修改、删除
- 不存在于当前世界卡的 `field_key` 会在执行时被拒绝

## 2026-04-27 修复 trigger_mode/trigger_keywords 在三处链路中被错误删除的回归

**问题**（Codex review 发现）：上一次重构将 `trigger_mode`/`trigger_keywords` 从状态字段的三条链路中移除，导致三类运行时回归：
1. `filterActive` 不再检查 `trigger_mode`，所有 `llm_auto + manual_only / keyword_based` 字段变成每轮都更新（P1）
2. 导入器把 `trigger_mode` 硬编码为 `llm_auto→every_turn` / 其他→`manual_only`，覆盖导出文件中的实际值，破坏 round-trip（P2）
3. `normalizeStateFieldOps` 不再接受 `trigger_mode`/`trigger_keywords`，助手提案中对触发方式的修改被静默丢弃（P2）

**改动**：
- `backend/memory/combined-state-updater.js` — 恢复 `filterActive(fields, scanText)` 的 `trigger_mode` 门控逻辑（every_turn / keyword_based / manual_only 分支）
- `backend/db/queries/world-state-fields.js` / `character-state-fields.js` / `persona-state-fields.js` — 恢复 `create` 使用 `data.trigger_mode` / `data.trigger_keywords`；恢复 `update` 的 `allowed` 列表包含 `trigger_mode` / `trigger_keywords`，并正确做 JSON 序列化；移除错误的 `update_mode` 联动覆盖逻辑
- `backend/services/import-export.js` — 恢复三类字段（world/character/persona）导入时使用 `field.trigger_mode` / `field.trigger_keywords`
- `assistant/server/routes.js` — 恢复 `VALID_TRIGGER_MODES`；`STATE_FIELD_KEYS` 重新包含 `trigger_mode` / `trigger_keywords`；`normalizeStateFieldOps` update/create 分支补全对这两个字段的校验与写入
- `backend/tests/memory/combined-state-updater.test.js` — 更新 `filterActive` 单测，覆盖 every_turn / keyword_match / no_match / manual_only 各路径

**结果**：全部 157 项后端测试通过。

## 2026-04-27 写卡助手收口：角色卡/玩家卡禁止管理状态字段定义

**问题**：写卡助手此前允许 `character-card` / `persona-card` proposal 携带 `stateFieldOps`，这会让角色卡和玩家卡直接创建、修改、删除状态字段定义，越过“字段模板只在世界卡层维护”的边界。

**改动**：
- `assistant/server/routes.js` — `normalizeStateFieldOps` 对 `character-card` / `persona-card` 改为直接拒绝非空 `stateFieldOps`；`applyProposal` 同步移除角色卡/玩家卡分支里所有状态字段定义写入逻辑，形成后端硬边界
- `assistant/server/agents/character-card.js` / `assistant/server/agents/persona-card.js` — agent 描述改为只负责卡面正文，不再宣称支持状态字段管理
- `assistant/prompts/character-card.md` / `assistant/prompts/persona-card.md` — 提示词移除 `stateFieldOps` 生成规则与示例，明确动态字段模板应通过 `world_card_agent` 管理
- `assistant/tests/routes.test.js` — 新增回归测试，锁住 `character-card` / `persona-card` 不得再输出字段管理操作
- `assistant/CONTRACT.md` / `ARCHITECTURE.md` — 同步 assistant proposal 契约与运行时边界

**结果**：
- 角色卡和玩家卡的 assistant proposal 现在只能改卡面正文
- 状态字段的创建、修改、删除统一收口到 world-card 层

## 2026-04-27 对齐状态字段触发机制：trigger_mode 改为内部派生字段

**背景**：前端 `StateFieldEditor.jsx` 已简化为仅允许设置 `update_mode`（手动/LLM自动），`trigger_mode` 从 UI 移除。但后端 DB 写层仍从 `data.trigger_mode` 读取（默认 `manual_only`），导致通过 UI 创建的 `llm_auto` 字段实际上永远不会自动更新（因为 `filterActive` 同时检查两个字段）。

**修复**：
- **根因修复**：`filterActive`（`combined-state-updater.js`）简化为仅检查 `update_mode === 'llm_auto'`，不再读 `trigger_mode`。
- **DB 写层派生**：3 个 queries 文件的 CREATE 函数改为从 `update_mode` 派生 `trigger_mode`（`llm_auto` → `every_turn`，其余 → `manual_only`），不再读 `data.trigger_mode`。UPDATE 函数从 allowed list 移除 `trigger_mode`，改为当 `update_mode` 变更时同步派生写入。`trigger_keywords` 新记录写 NULL。
- **写卡助手**：`routes.js` 移除 `VALID_TRIGGER_MODES`、从 `STATE_FIELD_KEYS` 和 `normalizeStateFieldOps` 清除 `trigger_mode`/`trigger_keywords`。
- **导入**：`import-export.js` 三处 INSERT 改为派生 `trigger_mode`，忽略导入数据中的 `trigger_mode`/`trigger_keywords`。`import-export-validation.js` 移除 `trigger_mode`/`trigger_keywords` 校验。
- **worlds.js**：删除 diary 时间字段创建时显式传递的 `trigger_mode: 'every_turn'`（由 DB 层派生）。
- 文档（`SCHEMA.md`/`ARCHITECTURE.md`）更新标注为内部/派生字段。

**注意**：`trigger_mode` / `trigger_keywords` DB 列仍保留（schema.js 锁定文件），存量记录值不迁移（不影响运行，filterActive 不再读取）。

## 2026-04-27 frontend lint 风险清理：收口 React Hooks effect/immutability 规则债

**问题**：`frontend` 仍残留一批 ESLint 高噪音错误，集中在三类模式：
- `react-hooks/set-state-in-effect`：effect 体内同步 `setState`
- `react-hooks/refs`：render 期间直接写 `ref.current`
- `react-hooks/immutability`：给组件函数挂 `updateTitle/addSession` 静态方法

这些错误虽然不一定立刻导致运行时故障，但会持续掩盖真正的新问题，也会放大后续前端重构风险。

**改动文件**：
- `frontend/src/utils/session-list-bridge.js`（新文件）— 抽出 chat/writing 会话列表 imperative bridge，替代给组件函数挂静态方法
- `frontend/src/components/book/SessionListPanel.jsx` / `frontend/src/components/chat/Sidebar.jsx` / `frontend/src/components/book/WritingSessionList.jsx` — 改为在 effect 中注册/清理 bridge 回调；列表初始化加载改成异步调度
- `frontend/src/pages/ChatPage.jsx` / `frontend/src/pages/WritingSpacePage.jsx` — 改为通过 bridge 调用 `updateTitle/addSession`
- `frontend/src/components/chat/MessageList.jsx` — 把 `messagesRef.current = messages` 从 render 挪到 effect；消息列表初始化重置改成异步调度
- `frontend/src/components/book/CastPanel.jsx` / `frontend/src/components/book/StatePanel.jsx` / `frontend/src/components/book/TopBar.jsx` — 把若干同步 effect setState 改为异步调度/带取消保护的加载流程
- `frontend/src/components/settings/CustomCssManager.jsx` / `frontend/src/components/state/StateFieldList.jsx` / `frontend/src/pages/CharactersPage.jsx` / `frontend/src/pages/WorldsPage.jsx` — `load()` 触发改为异步调度，规避 effect 体内同步状态写入
- `frontend/src/pages/CharacterEditPage.jsx` / `frontend/src/pages/PersonaEditPage.jsx` / `frontend/src/pages/WorldEditPage.jsx` — 草稿恢复和新建页初始化改为异步调度

**结果**：
- `frontend` 的 lint 结果恢复干净，不再让历史规则债掩盖新增问题
- 会话列表和写作会话标题更新保留原有 imperative 行为，但实现从“修改组件函数对象”收口为显式 bridge
- MessageList 的 ref 使用恢复为标准模式，避免 render 期间副作用

**验证结果**：
- `npm run lint --prefix frontend` 通过
- `npm run build --prefix frontend` 通过

## 2026-04-27 assistant/client 长期结构化收口：升级为本地包并接入 workspace

**问题**：`frontend` 之前直接 alias/相对路径引用 `assistant/client` 源码，导致构建器把它当作 root 外裸源码处理；依赖解析脆弱，`AssistantPanel` 的懒加载也会因为共享入口被静态导入吞掉。

**改动文件**：
- `assistant/client/package.json` / `assistant/client/index.js` — 把助手前端升级为本地包 `@worldengine/assistant-client`，增加统一入口和子路径导出（`./AssistantPanel`、`./useAssistantStore`）
- `package.json` — 根级启用 `workspaces`，把 `frontend` 和 `assistant/client` 纳入同一依赖树
- `frontend/package.json` — 显式依赖本地包 `file:../assistant/client`
- `frontend/src/App.jsx` / `frontend/src/components/book/TopBar.jsx` — 改为从包名导入；`AssistantPanel` 走独立子路径动态导入，恢复真实懒加载
- `frontend/vite.config.js` — 删除临时 `@assistant` 和第三方包 alias，改为标准 `dedupe: ['react', 'react-dom', 'zustand']`
- `package-lock.json` / `frontend/package-lock.json` — 安装后同步更新锁文件

**结果**：
- `frontend` 不再直接借用 `assistant/client` 目录源码，而是消费一个有明确 `package.json`、入口和依赖声明的本地包
- 构建不再依赖那组手工 `react-markdown` alias 兜底
- `AssistantPanel` 重新恢复为独立 chunk，懒加载 warning 消失

**验证结果**：
- `npm install`（仓库根目录）通过
- `npm run build --prefix frontend` 通过
- `npm run lint --prefix frontend` 仍失败，但失败项为仓库内既有的 React Hooks 规则问题，与本次包结构改造无关

## 2026-04-27 frontend 构建修复：补齐 assistant/client 跨目录源码依赖的 Vite alias 解析

**问题**：`frontend` 通过 `@assistant` alias 直接引用 `assistant/client` 源码；Rolldown 在处理 root 外文件时，没有把 `react-markdown` / `remark-gfm` 这类包稳定回退到 `frontend/node_modules`，导致 `npm run build` 报 `failed to resolve import "react-markdown"`。

**改动文件**：
- `frontend/vite.config.js` — 在现有 `react` / `react-dom` / `zustand` 强制解析规则基础上，补充 `react-markdown`、`remark-gfm`、`rehype-raw`、`rehype-sanitize` alias，统一从 `frontend/node_modules` 解析 assistant 面板依赖

**验证结果**：
- `cd frontend && npm run build` 通过

## 2026-04-27 写作页面新增"制卡"按钮：一键从当前轮次提取 NPC 并建卡激活

**功能**：assistant 消息操作栏新增"制卡"按钮（与复制/重新生成/编辑/删除并列）。点击后自动提取当前轮次（user+assistant 消息）中未建卡的 NPC，使用 LLM 生成 name/description/system_prompt/post_prompt/first_message/state_values，调用 `createCharacter` 服务建卡并 `addWritingSessionCharacter` 激活，SSE 实时更新右侧 CastPanel，toast 显示进度。

**关键实现**：
- 新建 `assistant/prompts/extract-characters.md`（提取 NPC 的 LLM prompt，要求填写所有已定义状态字段）
- `assistant/server/routes.js` 新增 `POST /api/assistant/extract-characters` SSE 端点；内联 `parseCharacterArray` 处理 LLM 数组响应（`extractJson` 工具不接受数组）
- `frontend/src/api/stream-parser.js` 新增 `onEvent` 通用回调兜底未知事件类型
- `frontend/src/api/writing-sessions.js` 新增 `extractCharactersFromMessage` SSE 封装
- `WritingMessageItem` 新增 `onMakeCard` prop + 制卡按钮；`MessageList` 透传；`WritingSpacePage` 实现 `handleMakeCard`（含并发锁 `makingCardRef`）

## 2026-04-27 写卡助手任务完成后增加摘要反馈消息

**问题**：任务完成后完全静默，用户不知道做了什么。
**修改**：`assistant/client/AssistantPanel.jsx` — `onTaskCompleted` 读取各步骤 proposal.explanation，生成摘要消息插入聊天（单步直接展示 explanation，多步加序号列表）。

## 2026-04-27 写卡助手 update 步骤现在统一走预览卡审批流

**问题**：`isHighRiskStep` 漏掉 `operation === 'update'`，所有 update 步骤直接 auto-apply，用户看不到预览卡。create 步骤保持 auto-apply 不变。

**修改**：`assistant/server/task-executor.js` — `isHighRiskStep` 加入 `step.operation === 'update'`

## 2026-04-27 写卡助手提示词优化：Persona 具体人物认知 + 澄清策略去机械化

**问题**：
1. `persona_card_agent` 把玩家卡写成"人设框架"而非"具体的人"，缺乏姓名/具体经历/当下处境
2. 主代理澄清时列问卷式清单，交互体验机械

**修改**：
- `assistant/prompts/persona-card.md`：写卡最佳实践强调"具体的人"而非框架；分层判断表 system_prompt 描述改为"以第一/第二人称描写具体人物"；正例3改写为有名有姓有具体经历的实例，并附反例对比
- `assistant/prompts/main.md`：新增"澄清原则"——先假设后确认，最多问一个问题，不列问卷；persona 架构说明补充"有名字、有经历、不是通用人设模板"

## 2026-04-27 写卡助手前端后续优化：Ghost Task 清除 + 静默失败修复 + TaskPanel Dismiss

**解决的三个具体问题**：

1. **Ghost task（高）**：`currentTask` 持久化到 localStorage，页面刷新后活跃任务残留（如 `awaiting_step_approval`），但后端 SSE 连接已断，无法继续审批，整个 TaskPanel 冻住无法操作。
   - 修复：`AssistantPanel` mount 时检测 `currentTask` 状态，若处于非终态（`pending/researching/clarifying/running/awaiting_plan_approval/awaiting_step_approval`）立即清除并插入提示消息"上次任务已中断（页面重载），请重新发起。"

2. **handleApproveStep 静默失败（中）**：`isStreaming=true` 时返回 `Promise.resolve(null)`，`ChangeProposalCard.handleApply` 拿到 null 后 catch 不触发，按钮短暂 loading 后静默重置。
   - 修复：改为 `Promise.reject(new Error('正在执行中，请稍候'))`，错误会在卡片内显示。

3. **TaskPanel 无消解路径（低）**：任务 completed/cancelled/failed 后 TaskPanel 永久悬挂。
   - 修复：终态时显示"关闭"按钮，调用 `setCurrentTask(null)` 仅清除任务面板，不影响消息记录。

**改动文件**：
- `assistant/client/AssistantPanel.jsx` — mount useEffect 清除 ghost task；handleApproveStep reject；新增 handleDismissTask；MessageList 透传 onDismissTask
- `assistant/client/MessageList.jsx` — TaskPanel 接收 onDismissTask；终态显示"关闭"按钮；取消按钮条件排除 failed 状态

**新增测试**：
- `assistant/tests/assistant-store.test.js`（新文件）— 8 个用例覆盖 store action 纯逻辑：patchCurrentTask、updateTaskStep、setResolvedId、clearMessages、ghost task 状态集、replaceRoutingWithProposal
- `assistant/tests/client-api.test.js` — 新增 3 个用例：步骤完整生命周期 SSE 序列、approveAssistantTaskStep 携带 editedProposal 的请求体验证、不携带时无该字段

**验证结果**：`npm test --prefix assistant` 通过（65/65，0 失败）

## 2026-04-27 写卡助手 Bugfix：character/persona create 场景补齐现有状态字段预研，避免重复创建 `field_key`

**问题**：实际使用中，角色卡或玩家卡的 `create` 场景如果同时补 `stateFieldOps`，子代理看不到该世界下已存在的共享状态字段，容易把已有 `field_key`（如 `level`）再次生成为 `create`，最终在 `applyStateFieldCreate` 命中 UNIQUE 约束并报 `状态字段创建失败：字段键 "level" 已存在`。

**改动文件**：
- `assistant/server/tools/card-preview.js` — `character-card` / `persona-card` 的 `operation="create"` 预览结果新增 `existingCharacterStateFields` / `existingPersonaStateFields`
- `assistant/prompts/character-card.md` / `assistant/prompts/persona-card.md` — 补 create 场景的预研要求和 `stateFieldOps` 的 op 选择规则，要求已有字段走 `update` 而不是重复 `create`
- `assistant/server/agents/character-card.js` / `assistant/server/agents/persona-card.js` — tool 描述同步强调 create + stateFieldOps 时也应先 `preview_card`
- `assistant/tests/tools/card-preview.test.js` — 新增 create 场景返回现有状态字段断言，锁住回归

**验证结果**：
- `node --test --test-isolation=process assistant/tests/tools/card-preview.test.js` 通过
- `npm test --prefix assistant` 通过（54/54）

## 2026-04-27 写卡助手后续优化：Planner 语义校验重试 + 高风险步骤内联审阅编辑

**目标**：在不推翻上一轮通用 Agent 架构的前提下，补两块稳定性/可控性缺口：
- planner 对 plan schema 只有 JSON 级容错，缺少结构与依赖语义校验
- 高风险步骤只能看 summary，不能在任务面板里直接审阅/修改完整 proposal

**改动文件**：
- `assistant/server/task-planner.js` — 新增 plan 结构校验（`targetType / operation / dependsOn / entityRef / create 依赖 / 高风险标记`），并在校验失败时做 semantic retry；失败多次后再报错，不再首轮直接降级
- `assistant/server/task-executor.js` — 高风险步骤改为“先生成完整 proposal，再进入 awaiting_step_approval”；`step_proposal_ready` 事件现在携带完整 proposal + summary
- `assistant/server/routes.js` — `POST /api/assistant/tasks/:taskId/approve-step` 新增 `editedProposal` 支持；编辑内容仍用原 proposal 的 `type / operation / entityId` 锁定后重新 `normalizeProposal()`
- `assistant/client/api.js` / `assistant/client/AssistantPanel.jsx` / `assistant/client/MessageList.jsx` — 任务流 SSE 解析补全完整 proposal；高风险步骤在任务面板内直接复用 `ChangeProposalCard` 查看/编辑/确认
- `assistant/client/ChangeProposalCard.jsx` — 提案卡抽象出可注入 apply 行为，同一套编辑 UI 同时兼容旧 `/execute` 和新 task 高风险审批流
- `assistant/tests/task-planner.test.js` / `assistant/tests/routes-integration.test.js` / `assistant/tests/client-api.test.js` — 补 planner semantic retry、完整 `step_proposal_ready` 事件、`approve-step + editedProposal` 集成测试
- `assistant/CONTRACT.md` / `ARCHITECTURE.md` — 同步更新 planner 校验规则、高风险步骤审阅流和 `approve-step` 契约

**结果**：
- 旧 `/api/assistant/chat` 和旧 proposal token 执行流保持兼容，未改行为边界
- task planner 对无效 step graph 会先自修正重试，不再把一轮坏 plan 直接抛给前端
- 高风险步骤现在可以在任务面板里看到完整 proposal，并在应用前手动编辑内容
- 无论是旧 `/execute` 还是新 `approve-step` 的 edited proposal，最终都收敛到同一个 `normalizeProposal` 安全边界

**验证结果**：
- `npm test --prefix assistant` 通过（54/54）
- `npm run check:assistant` 通过

## 2026-04-26 写卡助手通用 Agent 落地：Task/Plan/Step Graph 编排 + 前端任务面板

**目标**：把写卡助手从“单轮 proposal 工具”升级为底层可复用的通用 agent。重点不是专门做“完整世界创建器”，而是引入一套能统一支撑创建、修改、跨实体联动的任务编排骨架。

**改动文件**：
- `assistant/server/routes.js` — 新增 `/api/assistant/tasks`、`/tasks/:taskId/answer`、`/approve-plan`、`/approve-step`、`/cancel`、`GET /tasks/:taskId`；抽出通用 SSE/task helper；旧 `/chat` 保持兼容
- `assistant/server/task-store.js` — 新增内存任务仓库（TTL + 事件缓存）
- `assistant/server/task-planner.js` — 新增 planner，统一输出 `answer | clarify | plan`
- `assistant/server/task-executor.js` — 新增 executor，按 step graph 解析依赖、调用子代理、统一落库
- `assistant/server/agent-factory.js` — 抽出 `runAgentDefinition()`，让旧 proposal 流和新 task executor 复用同一套子代理执行逻辑
- `assistant/client/api.js` — 新增 task SSE 事件解析与任务端点封装
- `assistant/client/useAssistantStore.js` / `assistant/client/AssistantPanel.jsx` / `assistant/client/MessageList.jsx` — 前端新增 `currentTask` 状态、计划确认/步骤确认/取消任务交互、任务步骤面板
- `assistant/tests/client-api.test.js` / `assistant/tests/routes-integration.test.js` — 新增 task 事件解析与任务执行集成测试
- `assistant/CONTRACT.md` / `ARCHITECTURE.md` — 同步记录通用 agent 的 task/plan/step 协议与接口

**结果**：
- 写卡助手现在同时支持两条链路：
  - 旧 `chat` proposal 链，保留兼容
  - 新 `task` 编排链，支持 `Task -> Plan -> Step Graph -> Proposal -> Apply`
- “从 0 创建完整世界”现在只是 planner 生成的一组 step，不再需要单独的专用 runtime
- 高风险步骤具备单独审批入口，低风险步骤可在计划确认后自动执行

**验证结果**：
- `npm test --prefix assistant` 通过（50/50）
- `npm run check:assistant` 通过

## 2026-04-26 写卡助手提示词修复：world-card.md stateFieldOps/entryOps update/delete 缺失 id 要求

**根因**：`world-card.md` 的 `stateFieldOps` 和 `entryOps` 章节只有 `create` 示例，未说明 `update`/`delete` 需带 `id` 字段（后端 `routes.js:758/764/809/814` 强制校验），导致助手每次修改/删除已有字段时触发"提案格式错误：stateFieldOps[0].id 缺失"。

**改动文件**：`assistant/prompts/world-card.md`
- `stateFieldOps` 章节：补充 update/delete 格式示例；新增"op 选择规则"（preview 已有字段 → update；不存在 → create）
- `entryOps` 章节：拆分"create/update 通用字段"为独立的三段（create / update 含 id / delete 含 id）
- `conditions` 说明：补充"不支持 OR，如需 OR 语义请拆两条 state 条目"
- `stateFieldOps` 新增类型选择指南（text 为最后后备）

**同步更新**：状态字段类型决策规则（number/boolean/enum/list/text 选型）

---

## 2026-04-26 Kimi Coding 空回复修复：Anthropic SSE 解析兼容无空格 event/data 行

**目标**：修复 `kimi-coding` 在聊天流式请求中稳定“HTTP 200 但正文为空”的问题；确认不是前端问题，也不是 Kimi 非流式能力缺失，而是后端 SSE 解析器过于严格。

**根因定位**：
- `data/logs/worldengine-2026-04-26.log` 显示多次 `provider="kimi-coding"` 的 `CHAT START` 后接 `CHAT DONE len=0`，但同一时段 `impersonate` 的 `COMPLETE DONE` 正常有正文
- 直接对 Kimi `POST /v1/messages` 做原始流抓包，确认服务端实际返回了大量 `content_block_delta`
- 进一步比对发现 Kimi 的 SSE 行格式是 `event:message_start` / `data:{...}`，冒号后**没有空格**
- 现有 `backend/llm/providers/_utils.js` 中 `parseSSE()` 只识别 `event: ` / `data: `，导致整条流被丢弃；同时它对 Web `ReadableStream` 的读取也不够稳健

**改动文件**：
- `backend/llm/providers/_utils.js`
  - `parseSSE()` 改为优先使用 `ReadableStream.getReader()` 读取返回体
  - 兼容 `event:` / `data:` 后无空格的 SSE 行格式
  - 补上流结束前最后一个未以空行收尾事件的尾块处理
- `backend/tests/llm/providers-utils.test.js`
  - 新增 Web `ReadableStream` SSE 解析测试
  - 新增“无尾部空行”测试
  - 新增“Kimi 风格无空格 event/data 行”兼容测试

**验证结果**：
- 真实 Kimi 会话 `sessionId=51067663-a4fc-47b7-857d-bd6f51ce25e2` 本地复现中，`streamAnthropic()` 现已能输出正文，不再是 `len=0`
- `npm run test --prefix backend -- tests/llm/providers-utils.test.js` 通过
- `npm run test --prefix backend` 全量通过（157 tests）

## 2026-04-26 Coding Plan 兼容修复：Kimi / MiniMax / GLM 接入校正 + 设置页官方跳转

**目标**：修复三家 Coding Plan 在设置页“填了 key 但识别不了”的核心问题，把实际协议差异收口到后端，并给用户明确的官方登录/控制台跳转入口。

**改动文件**：
- `backend/llm/providers/_utils.js` — 更新 `glm` / `glm-coding` 到官方 `api.z.ai` 地址；`minimax-coding` 改为官方 Anthropic-compatible base URL；新增 `extractProviderError()` 统一识别厂商错误 JSON
- `backend/llm/providers/openai.js` — `minimax-coding` 改走 Anthropic-compatible adapter
- `backend/llm/providers/openai-compatible.js` — 补 `HTTP 200 + error JSON` 识别，避免 Kimi / GLM 鉴权失败被误判成“模型列表空”
- `backend/routes/config.js` — `kimi/minimax/glm coding` 新增静态模型兜底；`/api/config/test-connection` 改为真实轻量 completion 验证；`glm-coding` 默认 endpoint 改到 `https://api.z.ai/api/coding/paas/v4`
- `frontend/src/components/settings/SettingsConstants.js` — 新增三家 Coding Plan 的官方说明/控制台/文档链接配置
- `frontend/src/components/settings/ProviderBlock.jsx` / `frontend/src/styles/pages.css` — 设置页新增 provider 专属说明卡和“打开控制台/文档/登录页”按钮，作为网页登录/获取 key 的自动跳转入口
- `backend/tests/routes/config.test.js` — 新增静态模型兜底和 `200 + error JSON` 识别测试
- `ARCHITECTURE.md` — 补充三家 Coding Plan 的默认协议与模型兜底行为

**结果**：
- Kimi Coding 不再因为厂商返回 `200` 但 body 里是鉴权错误而被前端误判
- Kimi Coding 进一步改为 Anthropic-compatible 运行时；已验证同一把 Coding Plan key 下，`/models` 可读、`/messages` 可用、`/chat/completions` 会被官方拒绝
- MiniMax Coding 不再依赖不稳定的 `/models` 接口；运行时直接按官方推荐的 Anthropic-compatible 协议接入
- GLM Coding 改到当前官方 `api.z.ai` Coding endpoint，避免继续使用旧地址
- 设置页现在可直接跳去三家官方控制台/文档/登录页，但当前仍不接收 OAuth callback；网页登录后如厂商要求 API key，仍需把 key 填回本应用

## 2026-04-26 根级质量门统一 + assistant SSE 收口 + 仓库卫生自动化

**目标**：一次性清理前面审查里剩下的三类工程债：顶层质量门不统一、`assistant` 子系统缺少针对性兜底、仓库卫生缺少自动检查。

**改动文件**：
- `package.json` — 根级新增 `lint` / `check:assistant` / `check:hygiene` / `check` 脚本，并把默认 `npm test` 收口为全量质量门
- `assistant/client/api.js` — 抽出 `processSseBlock()`，并在流结束时继续处理 buffer 中残留的最后一个 SSE 事件，避免末尾无换行时漏掉 `done` / `tool_call` / `proposal`
- `assistant/tests/client-api.test.js` — 新增前端助手 API 测试，覆盖 SSE 事件解析和尾 buffer 场景
- `.temp/check-assistant-syntax.mjs` — 新增 `assistant` 语法检查脚本，使用 `node --check` 扫描 client/server 关键 JS 文件
- `.temp/git-health-check.sh` — 新增仓库卫生检查脚本，阻止被追踪的 `node_modules` / `.DS_Store`
- `.gitignore` — 放行 `.temp/check-assistant-syntax.mjs` 供版本控制使用；保留 `.temp/` 目录默认忽略策略

**结果**：
- 顶层 `npm test` 现在会统一执行：根级 lint、`assistant` 语法检查、仓库卫生检查、backend 测试、frontend 测试、assistant 测试
- `assistant` 前端 SSE 解析不再依赖最后一个事件必须以空行结尾
- 仓库卫生从“靠人记忆”改为“脚本兜底”

## 2026-04-26 开源前清理：.gitignore 加固 + frontend/package.json 依赖修正 + config.example.json

**改动文件**：
- `.gitignore` — 新增 `/data/config.json` 显式排除规则，双重保险防止 API 密钥意外提交
- `data/.gitignore` — 新增 `!config.example.json` 白名单，允许示例配置被追踪
- `frontend/package.json` — 移除混入 dependencies 的后端依赖（`better-sqlite3`、`cors`、`express`）
- `data/config.example.json` — 新增脱敏示例配置，供新用户参考；logging 默认为 `metadata` 模式，密钥字段留空

## 2026-04-26 前端日志清理：页面/组件层裸 console 收口，仅保留 ErrorBoundary / Icon 开发告警

**目标**：继续清理前端低级工程问题，把 `frontend/src/pages` 和 `frontend/src/components` 中裸露的 `console.error` / `console.log` 收口到用户提示或静默降级路径。

**改动文件**：
- `frontend/src/pages/WritingSpacePage.jsx` — 初始化加载、章节标题加载、stop 清理等背景失败改为静默降级；代拟/重标题/章节标题编辑失败改为 toast
- `frontend/src/pages/ChatPage.jsx` — 角色/规则加载和 stop 清理改为静默降级；续写失败、代拟失败改为 toast；移除 SSE 错误日志噪音
- `frontend/src/pages/CharacterEditPage.jsx`
- `frontend/src/pages/WorldEditPage.jsx`
- `frontend/src/pages/PersonaEditPage.jsx`
  - 状态值保存失败改为 toast
- `frontend/src/components/book/CastPanel.jsx` — 重置/保存/添加/移除角色、日记获取失败改为 toast；角色列表加载失败改为清空列表降级
- `frontend/src/components/book/StatePanel.jsx` — 状态重置/保存和日记获取失败改为 toast
- `frontend/src/components/book/WritingSessionList.jsx`
- `frontend/src/components/book/SessionListPanel.jsx`
- `frontend/src/components/chat/Sidebar.jsx`
  - 会话列表初始加载失败改为清空列表降级；创建/删除/重命名失败改为 toast
- `frontend/src/components/state/EntryEditor.jsx` — 状态字段加载失败改为 toast
- `frontend/src/components/settings/RegexRulesManager.jsx` — 规则/世界列表加载失败改为 toast

**结果**：
- `frontend/src/pages` / `frontend/src/components` 中已不再保留裸 `console.error` / `console.log`
- 当前仅保留两类有意日志：
  - `frontend/src/components/ui/ErrorBoundary.jsx` 的渲染错误边界日志
  - `frontend/src/components/ui/Icon.jsx` 的开发期参数告警 `console.warn`

**验证结果**：
- `rg -n "console\\.(error|warn|log)" frontend/src/pages frontend/src/components` 仅剩 `ErrorBoundary.jsx` 与 `Icon.jsx`
- `npm run lint --prefix frontend` 通过
- `npm run test:frontend` 通过（26 个文件，64 个测试全绿）

## 2026-04-26 前端工程清理：移除 alert、补全全局 toast、收回 Persona 直连 fetch、清理仓库卫生

**目标**：继续收口代码审查中剩余的低级工程问题，清掉前端页面级 `alert`、收回直接 `fetch`，并整理仓库卫生。

**改动文件**：
- `frontend/src/utils/toast.js` / `frontend/src/components/ui/GlobalToast.jsx` / `frontend/src/App.jsx` — 新增全局 toast 事件通道和统一渲染容器，复用现有视觉风格
- `frontend/src/pages/PersonaEditPage.jsx` / `frontend/src/api/personas.js` — 新增 `uploadPersonaAvatarById()` API 封装，移除页面里的直接 `fetch('/api/personas/:id/avatar')`
- `frontend/src/pages/CharactersPage.jsx`
- `frontend/src/pages/WorldsPage.jsx`
- `frontend/src/pages/ChatPage.jsx`
- `frontend/src/pages/CharacterEditPage.jsx`
- `frontend/src/pages/WorldEditPage.jsx`
- `frontend/src/components/settings/RegexRuleEditor.jsx`
- `frontend/src/components/chat/InputBox.jsx`
- `frontend/src/components/settings/RegexRulesManager.jsx`
- `frontend/src/components/settings/ProviderBlock.jsx`
- `frontend/src/components/state/EntrySection.jsx`
- `frontend/src/components/settings/CustomCssManager.jsx`
- `frontend/src/components/state/EntryEditor.jsx`
  - 上述文件的页面级错误提示全部由 `alert(...)` 改为 `pushErrorToast(...)`
- `frontend/tests/components/state/EntrySection.test.jsx`
- `frontend/tests/pages/persona-edit-page.test.jsx`
- `frontend/tests/pages/character-edit-page.test.jsx`
  - 测试从断言 `alert` 改为断言新的 toast 通道
- `.gitignore` — 补 `assistant/node_modules` 忽略规则（同时覆盖 symlink 形式）
- `assistant/node_modules` — 从 git 索引移除，保留本地使用

**验证结果**：
- `npm run lint --prefix frontend` 通过
- `npm run test:frontend` 通过（26 个文件，64 个测试全绿）
- `rg -n "\\balert\\(|fetch\\(" frontend/src/pages frontend/src/components assistant` 检查后，前端页面/组件层已无 `alert` 和直接 `fetch`

## 2026-04-26 前端质量门修复：settings hook 测试、chat/writing 页测试桩、lint 清理

**目标**：修复代码审查中暴露的低级工程错误，先恢复 `frontend` 的测试与 lint 质量门。

**改动文件**：
- `frontend/tests/hooks/use-settings-config.test.jsx` — `displaySettings` store mock 改为稳定引用，补齐 `setShowTokenUsage` / `setCurrentModelPricing`，避免 effect 依赖抖动导致配置加载反复覆盖本地编辑状态
- `frontend/tests/pages/chat-page.test.jsx` — `MessageList` mock 改为通过 `forwardRef + useImperativeHandle` 暴露 `appendMessage/updateMessages/messagesRef`，与页面真实依赖的 imperative API 对齐
- `frontend/tests/pages/writing-space-page.test.jsx` — 同步修复写作页 `MessageList` mock 的 ref 接口
- `frontend/src/hooks/useSettingsConfig.js` — 补齐 effect 依赖，消除 hooks lint warning
- `frontend/src/components/book/TopBar.jsx` — 抽出 `loadWorlds()`，移除 effect 内同步 `setState` 的 lint error
- `frontend/src/components/settings/RegexRuleEditor.jsx` — 以 `rule` 初始化 state，移除仅用于同步 props 的 effect
- `frontend/src/components/book/StatusSection.jsx` — 删除未使用局部变量
- `frontend/src/pages/CharactersPage.jsx` / `frontend/src/styles/pages.css` — 去掉空态段落的内联样式，补 CSS 类；同时删除未使用的 `idx`
- `frontend/src/components/state/EntryEditor.jsx` — 补齐 `useEffect` 依赖
- `frontend/src/pages/CharacterEditPage.jsx` — 草稿自动保存 effect 补上 `description` 依赖

**验证结果**：
- `npm run lint --prefix frontend` 通过
- `npm run test:frontend` 通过（26 个文件，64 个测试全绿）

## 2026-04-26 Token 消耗行新增费用估算显示

**目标**：在每条 AI 消息的 token 消耗行末尾显示本条消息的估算费用（美元）。

**改动文件**：
- `backend/routes/config.js` — `GET /api/config` 响应新增 `llm.model_pricing`（从 `KNOWN_PRICES` / `ANTHROPIC_MODELS` 查当前模型，作为初次加载兜底）
- `frontend/src/store/displaySettings.js` — 新增 `currentModelPricing` 状态
- `frontend/src/hooks/useSettingsConfig.js` — 配置加载后同步 `setCurrentModelPricing`（兜底路径）
- `frontend/src/components/settings/ModelSelector.jsx` — 模型列表拉取后及模型切换时，从列表价格字段更新 store（主路径，优先级高于兜底）
- `frontend/src/components/chat/MessageItem.jsx` — 新增 `calcCost` / `formatCost` 函数；token 消耗行末尾显示费用（陶土色强调）
- `frontend/src/styles/chat.css` — 新增 `.we-token-usage-cost` 样式

**行为**：
- 已知价格且非零（正常按量计费 provider）→ 显示 `$x.xxxxxx`
- 价格全为 0（Coding Plan）或未知模型 → 不显示费用，只显示 token 数
- 费用 < $0.000001 → 显示 `<$0.000001`

**验证方式**：开启「显示 Token 消耗」后发一条消息，消耗行末尾应出现带陶土色的费用数字；切换到 GLM Coding Plan 后发消息，费用不显示。

## 2026-04-25 新增 Kimi / MiniMax / GLM Coding Plan provider

**目标**：支持三家国内大模型的按周/配额计费 Coding Plan，与现有按 token 计费的标准 provider 并列。

**改动文件**：
- `backend/llm/providers/_utils.js` — `DEFAULT_BASE_URLS` 和 `OPENAI_COMPATIBLE` 加入 `kimi-coding` / `minimax-coding` / `glm-coding`
- `backend/routes/config.js` — `OPENAI_COMPATIBLE_BASE_URLS` 加入三个新 endpoint；`KNOWN_PRICES` 加入 `kimi-for-coding` / `codex-MiniMax-M2.7` / `GLM-4.7`（价格填 0，因按配额计费无 token 单价）
- `frontend/src/components/settings/SettingsConstants.js` — `LLM_PROVIDERS` 加入三个新 label

**Base URL 来源**：
- Kimi Coding: `https://api.kimi.com/coding/v1`（OpenAI-compatible，模型 `kimi-for-coding`）
- MiniMax Coding: `https://api.minimax.io/v1`（OpenAI-compatible，模型 `codex-MiniMax-M2.7`）
- GLM Coding: `https://open.bigmodel.cn/api/coding/paas/v4`（OpenAI-compatible，模型 `GLM-4.7`，与标准 GLM endpoint 不同）

**验证方式**：进入设置页 → LLM 配置 → Provider 下拉，应出现三个新选项；填入对应 Coding Plan API Key 后可拉取模型列表并正常对话。

## 2026-04-25 Electron 桌面打包链路修复：多架构 runtime + Windows 无 unzip + 崩溃恢复计数

**目标**：修复 desktop 审核中发现的 3 个实质问题：mac 双架构产物共用错误 Node runtime、Windows 构建依赖外部 `unzip`、后端自动恢复累计 3 次后永久失效。

**改动文件**：
- `desktop/scripts/prepare-build.js` — 改为按目标矩阵预下载 `darwin-x64` / `darwin-arm64` / `win32-x64` 三套 Node runtime，目录结构改为 `desktop/node-runtime/{platform}-{arch}/...`；Windows zip 解压改用 `extract-zip`，移除对系统 `unzip` 的依赖；运行后校验目标 `node` 可执行文件存在
- `desktop/src/main.js` — 打包态按 `process.platform + process.arch` 选择对应 runtime 路径；后端成功启动后重置 `backendRestartCount`，将“累计 3 次”修正为“连续失败 3 次”；新增 `isShuttingDown`，避免应用主动退出时误触发自动重启
- `desktop/package.json` / `desktop/package-lock.json` — 新增 `extract-zip` 依赖
- `desktop/electron-builder.json` — 追加 `artifactName`，显式区分 mac/win 与架构产物名称，降低多架构产物混淆风险

**验证结果**：
- `node --check desktop/src/main.js` 通过
- `node --check desktop/scripts/prepare-build.js` 通过
- `node -e "JSON.parse(...electron-builder.json...)"` 通过
- `npm run prepare-build --prefix desktop` 实际执行成功，已下载并解压 `darwin-x64` / `darwin-arm64` / `win32-x64` 三套 runtime

**结果**：
- mac `x64` 与 `arm64` 安装包现在可在运行时各自命中正确的内置 Node
- Windows 构建机不再要求系统存在 `unzip`
- 后端自动恢复策略改为“成功一次就清零”，避免偶发崩溃耗尽终身重试次数

## 2026-04-25 Electron 桌面应用（macOS + Windows）+ 数据目录迁移 + 白屏修复

**目标**：在不改动前端业务代码、不影响现有网页版的前提下，新增桌面应用打包能力；桌面版数据放在用户目录而非应用安装目录；修复打包后端口冲突导致的白屏。

**架构决策**：
- 采用 Electron（而非 Tauri），因为项目已有 Node.js 后端 + better-sqlite3 原生模块，Electron 是唯一零后端改造就能跑起来的方案
- 不将后端跑在 Electron 的 Node.js 中（ABI 不兼容：系统 Node.js modules=141，Electron 35 modules=133），而是打包时附带独立的 Node.js v25.9.0 运行时
- 后端条件性 serve 前端静态文件（`WE_SERVE_STATIC=true`），Electron 窗口只需访问单一 URL
- 桌面版数据目录通过 `app.getPath('userData')` 指向用户目录（macOS: `~/Library/Application Support/worldengine-desktop/`，Windows: `%APPDATA%/worldengine-desktop/`）
- 后端使用随机端口（`PORT=0`），Electron 主进程通过解析 stdout 中的 `SERVER_READY:PORT` 获取实际端口，彻底避免端口冲突

**新增文件**：
- `desktop/package.json` — Electron 依赖与构建脚本
- `desktop/electron-builder.json` — mac/win 打包配置（extraResources 包含 backend、frontend/dist、assistant、node-runtime）
- `desktop/src/main.js` — 主进程：设置 `WE_DATA_DIR` → spawn 独立 Node.js 启动后端（随机端口）→ 解析 stdout 获取端口 → 打开 BrowserWindow
- `desktop/src/preload.js` — 安全桥接（预留）
- `desktop/src/utils.js` — `waitForPort` 轮询检测、`getProjectRoot` 路径解析
- `desktop/scripts/prepare-build.js` — 打包前自动下载对应平台 Node.js 运行时
- `desktop/assets/.gitkeep` — 图标占位说明
- `desktop/.gitignore` — 忽略 node_modules / dist / node-runtime

**改动文件**：
- `backend/server.js` — `DATA_ROOT` 支持 `WE_DATA_DIR` 环境变量覆盖；`createApp()` 末尾条件性添加 `express.static(frontend/dist)` + fallback；`startServer()` 输出 `SERVER_READY:PORT` 供父进程解析
- `backend/db/index.js` — `DB_PATH` 支持从 `WE_DATA_DIR` 派生
- `package.json`（根目录）— 新增 `desktop:install` / `desktop:dev` / `desktop:build` / `desktop:dist` scripts

**验证结果**：
- `npm run dev` 网页版前后端正常启动，不受影响
- `npm run desktop:dev` 弹出 Electron 窗口，数据目录指向 `~/Library/Application Support/worldengine-desktop/`，功能正常
- 打包后的 `.app` 在 macOS arm64 上可正常运行，数据不写入 `.app` 内部，随机端口避免冲突

**坑点记录**：
- `app.get('*')` 在 Express 5（path-to-regexp）中会抛 `Missing parameter name`，fallback 路由必须用 `app.use((req, res, next) => ...)`
- electron-builder 默认会忽略 `extraResources` 中的 `node_modules`，必须将 `node_modules` 单独列为一项 `extraResource`
- `backend/db/index.js` 在 `server.js` 的 `dataDirs` 创建之前初始化数据库，若 `data/` 目录不存在会直接崩溃；桌面端主进程需在 spawn 前 `fs.mkdirSync(dataDir, { recursive: true })`
- 开发模式使用系统 `node` 命令；打包后使用 `process.resourcesPath/node/bin/node`
- **白屏根因**：固定端口 3000 可能被之前未退出的后端进程占用，`app.listen()` 触发 `EADDRINUSE` 但错误未被捕获，server 未启动，Node.js 因事件循环无活跃任务而正常退出（exit code 0）；`waitForPort` 却检测到旧进程仍在监听该端口，导致 Electron 加载了一个无前端服务的 HTTP 端口，显示白屏/连接错误。修复方案：后端改用随机端口 + stdout 广播实际端口

## 2026-04-25 模型 token 价格展示 + 每轮对话 token 消耗统计

**功能 A：模型下拉显示 token 价格**
- `backend/routes/config.js`：Anthropic 模型追加 `cacheWritePrice`/`cacheReadPrice`；新增 `KNOWN_PRICES` 静态 Map（覆盖 OpenAI/DeepSeek/Gemini/Kimi/GLM/SiliconFlow 主流模型）；`fetchOpenAICompatibleModels` 和 Gemini 分支合并静态价格兜底
- `frontend/src/components/ui/ModelCombobox.jsx`：下拉选项追加 `缓存写/读` 价格渲染

**功能 B：每轮对话显示 token 消耗**
- `backend/db/schema.js`：messages 表 ALTER TABLE 追加 `token_usage TEXT`
- `backend/db/queries/messages.js`：新增 `updateMessageTokenUsage()`；三个查询函数追加 `token_usage` JSON.parse
- Provider 层（openai-compatible / anthropic / gemini / ollama）：通过 `usageRef` 引用对象在流结束后填充 usage 数据；openai-compatible 追加 `stream_options: { include_usage: true }`
- `backend/llm/index.js`：`buildLLMConfig` 透传 `usageRef`
- `backend/routes/chat.js` / `writing.js`：创建 `usageRef`、传给 `llm.chat`、流结束后写库（`updateMessageTokenUsage`）、done 事件携带 `usage`
- `frontend/src/api/stream-parser.js`：`onDone` 回调追加第三参数 `usage`
- `frontend/src/store/displaySettings.js`：追加 `showTokenUsage` / `setShowTokenUsage`
- `frontend/src/hooks/useSettingsConfig.js`：追加 `showTokenUsage` state、store、`handleToggleShowTokenUsage`，加入 `llmProps` 返回
- `frontend/src/components/settings/FeaturesConfigPanel.jsx`：新增「Token 消耗」子节和 ToggleRow
- `frontend/src/pages/SettingsPage.jsx`：传递 `showTokenUsage`/`onToggleShowTokenUsage` props
- `frontend/src/components/chat/MessageItem.jsx`：assistant 消息底部渲染 token 消耗（受 `showTokenUsage` 开关控制）
- `frontend/src/styles/chat.css`：追加 `.we-token-usage` 样式
- `SCHEMA.md`：messages 表新增字段说明；config.json ui 对象补充 `show_token_usage`
- `ARCHITECTURE.md §7`：done 事件 payload 追加 `usage` 字段说明

**坑点记录**：
- `usageRef` 必须在 `try` 块外声明，流结束后才能在路由层访问到 provider 填充的数据
- openai-compatible 的 `stream_options.include_usage` 末尾 chunk 的 `choices[]` 为空，usage 解析必须在 `if (!delta) continue` 之前执行
- abort 时 usageRef 可能为空对象，路由层用 `Object.keys(usageRef).length > 0` 判断是否写库，不写入部分数据

## 2026-04-25 写卡助手 world-card 对齐当前状态条目系统

- **Assistant Prompt / Contract**：`world-card.md`、`main.md`、`assistant/CONTRACT.md` 清除废弃 `position` 与旧版 `eq/lt/contains` 示例，改为当前真实格式：`state` 条件使用 `世界.xxx / 玩家.xxx / 角色.xxx` + 运行时支持的符号/中文操作符
- **routes.js**：`normalizeProposal` 为 world-card 建立状态字段上下文，`normalizeEntryOps` 可把旧式 `field_key + gt/lt/eq` 条件安全归一为真实 `entry_conditions` 格式；遇到歧义字段时直接报错，避免写入半错数据
- **card-preview.js**：world-card 预览中的 `existingEntries` 对 `trigger_type='state'` 条目补回 `conditions`，主代理和前端提案卡都能看到完整状态条目结构
- **ChangeProposalCard.jsx**：world-card 提案卡重做内联编辑，条目编辑支持 `always/keyword/llm/state` 四类真实字段；`state` 条件支持按当前字段类型选择操作符；状态字段编辑补齐 `target/type/update_mode/trigger_mode/default_value/enum/range` 等核心项；预览态同步显示 trigger、token、conditions 和字段元数据
- **测试 / 文档**：新增 assistant routes/card-preview 测试覆盖条件归一与预览回传；`ARCHITECTURE.md` 补充 world-card assistant 对齐规则

## 2026-04-25 写卡助手继续收口：清理 global 假能力并补齐角色/玩家卡字段

- **global-config**：`global-prompt.md`、`main.md`、`CONTRACT.md`、`global-prompt.js` 统一删除已失效的 `entryOps/global_prompt_entries` 能力描述；`routes.js` 也不再为 global-config 归一化 `entryOps`，避免模型继续输出不会执行的假功能
- **character/persona**：assistant 提案执行与 prompt 规则补回 `description`，对齐当前 `CharacterEditPage` / `PersonaEditPage` 的真实编辑字段
- **card-preview**：角色卡/玩家卡预研返回补充 `existingWorldEntries`、`_worldName`、`_worldDescription`，让子代理生成内容时能读到上层世界语境，而不是继续依赖废弃的 `world.system_prompt`
- **ChangeProposalCard.jsx**：状态字段编辑器按 proposal 类型收紧可选 target；角色卡不再能误选 `world`，玩家卡只允许 `persona`
- **测试**：新增 assistant normalize/integration 测试，覆盖 character/persona `description` 落库与 global-config 去除 `entryOps`

## 2026-04-25 文档入口降噪：收口 agent 入口并降低误读风险

- **AGENTS.md**：删除误导性的 `claude-mem-context` 块，恢复为纯镜像入口，只保留跳转 `CLAUDE.md` 的最小说明
- **CLAUDE.md**：在文档分工规则中补充非权威来源声明，明确 `README.md` / `PROJECT.md` / `ROADMAP.md` 不是 agent 入口规范，`docs/` `.superpowers/` `.obsidian/` `.claude/` `.temp/` 仅作辅助材料或本地工作目录
- **ROADMAP.md**：顶部新增警示，明确其角色是任务池与排期，而非执行规范入口
- **README.md**：顶部补充 AI agent 导航说明，文档表加入 `CLAUDE.md`
- **.gitignore**：补充 `.superpowers/`、`backend/node_modules/`、`frontend/node_modules/`、`frontend/dist/`，减少工作区噪音

## 2026-04-24 角色选择页新增右侧条目顺序面板（三栏布局）

- **CharactersPage.jsx**：新增 `EntryOrderPanel` 组件，展示当前世界全部条目（按 token ASC + sort_order 排序），token 值可内联点击编辑（blur/Enter 保存，Escape 取消）；`loadData` 并发加载 `listWorldEntries`；新增 `handleTokenChange` 调用 `updateWorldEntry` 后刷新列表
- **pages.css**：已有 `.we-characters-col-entries` / `.we-entry-order-*` 样式，布局为三栏（左 Persona / 中 Character / 右条目顺序）

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
- `T162` `refactor` 对话/写作通用组件插件化（插件1-3） — 新增 `frontend/src/api/stream-parser.js` 作为 SSE 解析共享层；chat.js 和 writing-sessions.js 各增内部 `streamPost` 辅助消除重复模板；`backend/services/chat.js` 的 `processStreamOutput` 扩展 opts 参数（mode/createMessageFn/touchSessionFn），writing.js runWritingStream 改调用此函数而非内联处理；提示词内部重构（插件4）未实施
- `T162` `bugfix` 记忆召回跨会话搜索修复 — recall.js 第 221 行 `sessionOnly: true` 改为 `false`；此前因限定只在当前 session 内搜索，叠加上下文窗口排除逻辑，导致所有召回 hit 恒为 0；跨会话双阈值设计（ARCHITECTURE §6）现可正常生效
- `T161` `feat` 关闭日记时清除历史记录 + 确认弹窗 — `clearAllDiaryData()` 遍历所有世界所有会话清除 DB+文件；`POST /api/worlds/clear-all-diaries` 路由；MemoryConfigPanel 关闭 toggle 时先弹确认再执行；diary_time 字段由 syncDiaryTimeField 在页面进入时自动删除
- `T160` `feat` 写作 CastPanel 补"整理中/已整理"overlay — 对齐 StatePanel 轮询逻辑；加 `pollingHasChanged`/`stateJustChanged`；移除旧内联"更新中…"文字；`motion` 补入 framer-motion 导入
- `T159` `feat` 状态更新后台阻塞下轮 prompt 组装 + 输入立即解锁 — 新增 `state-update-tracker.js`；`onDone` 时立即 `setGenerating(false)` + `triggerMemoryRefresh`；下轮请求 `buildContext`/`buildWritingPrompt` 前 `awaitPendingStateUpdate`；StatePanel 恢复纯轮询 overlay；`state_updating`/`state_updated` SSE 事件全部清除
- `T158` `bugfix` 用户气泡编辑不变内容不重新生成 — 三处 confirmEdit（MessageItem/WritingMessageItem/assistant MessageList）改用 `editInitContentRef` 快照初始内容，比较 `trimmed !== initContent.trim()`；防止 prop 在编辑期间变化或空白字符差异导致误触重新生成
- `T157` `feat` 状态更新阻塞发送（已被 T159 取代）
- `T156` `bugfix` 选项生成失败 — SUGGESTION_PROMPT 从 [15] 移至 [16] 末尾追加，消除两条连续 user 消息导致的模型忽略问题
- `T155` `feat` 日记系统 — sessions 新增 diary_date_mode；新增 daily_entries 表；Priority 4 checkAndGenerateDiary；前端 Timeline 面板改为展示日记摘要；日记注入 [13+] 段
- `T151` `feat` 状态回滚机制 — turn_records 新增 state_snapshot 字段；createTurnRecord 在优先级 2 状态更新后捕获三层 session 级状态快照；regenerate/删除消息/编辑消息后从快照恢复，无快照时降级清空回 default；新增 backend/memory/state-rollback.js（captureStateSnapshot/restoreStateFromSnapshot）
- `T150` `refactor` turn_records 改为指针模式，历史消息链路清理 — turn_records 新增 user_message_id/asst_message_id 列（指针），不再复制消息内容；summary-expander 展开原文优先查 messages 表，旧数据回退 user_context/asst_context；delete all messages 同步清除 turn_records；修复 assembler.js/SCHEMA.md 过时注释
- `T148` `feat` MOTION.md 动效规范落地 — motion.js 重写（DURATION/EASE/STAGGER/BLUR/variants/transitions），tokens.css 补 --we-dur-* 变量，新增 useMotion hook，PageTransition 实现路由过渡，WritingMessageItem 补 inkRise，SealStamp/ModalShell/SectionTabs 对齐规范参数
- `T147` `chore` 临时后端测试隔离真实配置 — `backend/services/config.js` 支持 `WE_CONFIG_PATH`，`.temp` 脚本改用独立临时 config 文件
- `T146` `bugfix` 写作激活角色读取修复 — `buildWritingPrompt()` 不再把 `getWritingSessionCharacters()` 返回的 `c.*` 行误当成含 `character_id` 的联结行二次查询
- `T145` `bugfix` 写作多角色模板变量补全 — 共享段补首个激活角色 `{{char}}` fallback，角色级 prompt entries 改为按所属角色名渲染
- `T144` `feat` 写作接入记忆召回与原文展开 — buildWritingPrompt 补 [12][13]，writing.js 补 memory_recall_start SSE，前端设置页写作 tab 加记忆原文展开 toggle，config.writing 新增 memory_expansion_enabled 字段
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
| T28–T40 | 渐进展开原文、角色卡导出、写作、状态字段、玩家头像 |
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
