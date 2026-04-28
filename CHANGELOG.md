# Changelog

> 每次任务完成后，在最上方追加一条记录。这是项目的"记忆"，给自己和 AI 看。  
> 新开对话时让 Claude Code 先读此文件，了解项目现状。

## 2026-04-28 写卡助手任务面板状态中文化与步骤视觉优化

**背景**：任务面板的 TaskBadge 直接显示英文状态码（`researching` / `completed` 等），步骤卡片无视觉区分，完成后无手动关闭入口，1.5s 自动消失用户常看不清结果。

**改动**（`assistant/client/MessageList.jsx`）：
- 新增 `TASK_STATUS_LABELS` 和 `STEP_STATUS_LABELS` 映射，TaskBadge 内容改为中文（"探索中" / "执行中" / "已完成" 等）
- 步骤卡片按状态着色：completed 绿底绿边、running 陶土底边、failed 红底红边，默认透明
- completed 步骤标题前加 `✓`，running 步骤标题前加 `⋯`
- 移除 1.5s 自动关闭 `useEffect`，改为终结状态（completed / failed / cancelled）显示"关闭"按钮，由用户主动关闭
- 任务面板展示条件扩展：`executing` 状态和所有终结状态也触发面板常驻显示，避免执行中或完成后面板消失

**验证方式**：触发一次多步骤任务，观察任务状态徽章显示中文；步骤完成后变绿底带 ✓；任务完成后面板不自动消失，出现"关闭"按钮。

## 2026-04-28 写卡助手状态字段类型选择强化

**背景**：写卡助手创建状态字段时几乎全选 number 或 text，enum/boolean/list 几乎从未出现。根因是 world-card.md 的三处互相矛盾/偏置的信号：自检步骤只禁 text 不禁 number、模板表把天气/剧情阶段标成 `enum/text` 混写、正例 2 字段配比 4 number+2 enum，0 boolean/list。

**改动**（仅 `assistant/prompts/world-card.md`）：
- 模板表消除 `enum/text` 混写：天气/剧情阶段/伤势/任务状态全部改为 `enum`；新增 boolean 行（黑市开放/是否死亡）和 list 行（背包/已知线索）
- 自检步骤 4 改为强制排查流程：每个 `stateFieldOps.create` 必须按 `boolean → number → enum → list → text` 顺序逐项排除，不允许跳步
- stateFieldOps 创建格式前增加警示块，明确要求选 type 前先过类型选择指南
- 正例 2 字段配比扩展到 8 条，覆盖全部五种类型（新增 boolean:黑市开放、list:背包），并附类型选择说明

**验证方式**：让助手创建一个包含天气、血量、背包、是否已接任务等字段的世界卡，观察 stateFieldOps 中应出现 enum（天气）、number（HP）、list（背包）、boolean（是否已接任务）四种类型，不应出现全 number/text。

## 2026-04-28 写卡助手 Plan-Execute 实质化改造

**背景**：原 `/api/assistant/tasks` 计划卡主要展示步骤标题与状态，planner 没有真实探索阶段，executor 也基本按线性步骤执行，难以像 Codex / Claude Code 的 plan 模式那样提升复杂任务稳定性。

**改动**：
- `assistant/server/task-researcher.js` — 新增 Researcher 阶段，在 planner 前基于上下文调用 `preview_card` / `read_file`，产出 `research.summary / findings / constraints / gaps / needsPlanApproval`。
- `assistant/server/task-planner.js` — planner prompt 接收探索结果，并要求 step 输出 `rationale / inputs / expectedOutput / acceptance / rollbackRisk`；旧模型未输出时服务端会补默认值，避免兼容性断裂。
- `assistant/server/routes.js` — `/tasks` 和 `/tasks/:taskId/answer` 新增 `research_started` / `research_ready` SSE；计划审批闸门改为复杂写入触发：3 步以上、高风险、已有实体 update/delete、或 research 标记需要审批时才等待用户确认，简单低风险 create 仍可快进。
- `assistant/server/task-executor.js` — executor 从线性循环升级为 DAG ready-batch 调度；无依赖低风险步骤可并发执行，有依赖步骤等待前序 artifact；高风险步骤仍先生成完整 proposal 再等待审阅。
- `assistant/client/api.js` / `AssistantPanel.jsx` / `MessageList.jsx` — 前端解析 research / step_blocked 事件，任务卡展示探索依据、约束/缺口、步骤目的、预期产出、输入、验收点和风险。
- `assistant/server/tools/extract-json.js` — 修复 JSDoc 中直接写 `/* */` 导致 Node 25 解析失败的问题（只改注释文本）。
- `assistant/tests/*` — 新增 Researcher、DAG executor、research SSE、planner research 注入测试；同步 card-preview 测试，确认 `_globalSystemPrompt` 继续保持移除状态。
- `assistant/CONTRACT.md` / `ARCHITECTURE.md` — 同步记录 `Task -> Research -> Plan -> Step DAG -> Proposal -> Apply`、新增 SSE 和扩展 step schema。

**测试**：`npm test --prefix assistant`，77/77 通过。

## 2026-04-28 写卡助手 JSON 输出稳定性优化（第二轮）

**背景**：GLM/OpenRouter 模型有时输出含尾部逗号、`//` 行注释或 `/* */` 块注释的 JSON，纯 `JSON.parse` 失败，且 `MAX_JSON_RETRY=1` 只有一次补救机会，复发率高。

**改动**：
- `assistant/server/tools/extract-json.js` — 新增 `attemptRepair(text)` 函数，在 `tryParseObject` 首次 parse 失败时，自动移除尾部逗号、`//` 行注释、`/* */` 块注释后再尝试解析；轻微格式瑕疵的 JSON 无需触发 LLM 重试。
- `assistant/server/agent-factory.js` — `MAX_JSON_RETRY` 和 `MAX_PROPOSAL_RETRY` 均从 1 提升到 2；`parseWithJsonRetry` 重构为循环，第 2 次重试 prompt 额外强调"不要注释、不要尾部逗号"；proposal 重试逻辑同步改为循环，支持 2 次修复机会。

**验证方式**：触发复杂 world-card create，日志中 `RAW` 行后直接 `DONE`（无 `RETRY`）；历史上会失败的尾部逗号场景现在静默修复，无红色错误气泡。

## 2026-04-28 写卡助手 token 消耗优化

**背景**：写卡助手每次任务调用多次 LLM，系统 prompt 较大（main.md ~2400 tok，world-card.md ~4600 tok），且多步骤任务中 `preview_card` 每次返回 `_globalSystemPrompt` 全文导致重复注入。

**改动**：
- `backend/llm/providers/anthropic.js` — 所有 Anthropic 调用的 system message 改为带 `cache_control: { type: "ephemeral" }` 的数组格式，启用 Prompt Caching；5 分钟内重复调用 input token 费用打 1 折；增加 `prompt-caching-2024-07-31` beta header；`completeAnthropic` 补充 cache usage 日志字段。
- `assistant/server/tools/card-preview.js` — 从所有 preview 返回值中删除 `_globalSystemPrompt` 字段（主代理 context string 已有概览，子代理不需要重复接收全文）。
- `assistant/server/main-agent.js` — `buildContextString` 中 `character.system_prompt` 截断从 400 字缩至 120 字，`first_message` 从 150 字缩至 80 字。
- `assistant/prompts/world-card.md` — 删除与"硬规则"重复的"绝对不要"列表、删除与"各类型详细规则"表格重复的"常见字段正确类型"表格、压缩冗余正例；从 466 行缩至 423 行（~1100 tokens）。

**验证方式**：Anthropic provider 下跑多步骤任务，日志中出现 `cache_creation_input_tokens` / `cache_read_input_tokens`；第二次同类任务应有 `cache_read_tokens > 0`。

## 2026-04-28 后端日志覆盖率补齐与文件日志过滤修复

**背景**：审查发现后端生成主链路日志较完整，但文件日志会被终端 `LOG_LEVEL` 提前过滤，导致默认 `LOG_LEVEL=warn` 时 `LOG_FILE_LEVEL=info` 仍丢失 info 文件日志；同时部分降级/清理错误仍绕过统一 logger，普通 CRUD 也缺少写操作结构摘要。

**改动**：
- `backend/utils/logger.js` — 终端输出级别与文件写入级别分离；`LOG_LEVEL` 只影响终端，`LOG_FILE_LEVEL` 独立控制文件；同时支持 `WE_CONFIG_PATH`，与测试/桌面配置路径保持一致。
- `backend/server.js` — HTTP 请求日志对 `POST/PUT/PATCH/DELETE` 追加 `bodyFields` / `queryFields` 摘要，提升普通 CRUD 排查信息量，不记录请求正文。
- `backend/prompts/entry-matcher.js` / `backend/utils/regex-runner.js` / `backend/utils/cleanup-hooks.js` / `backend/utils/file-cleanup.js` / `backend/routes/import-export.js` — 将裸 `console.warn/error` 收口到 `createLogger()`，保证降级和清理失败进入按日文件日志。
- `assistant/server/task-executor.js` — 新增 `as-exec` 日志，覆盖 step start、等待审批、完成、失败、unsupported target 与 task done。
- `backend/tests/utils/logger.test.js` — 新增 logger 单测，覆盖文件日志不受终端级别过滤、`LOG_FILE_LEVEL` 生效、`WE_CONFIG_PATH` 生效。

**测试**：`npm --prefix backend test -- tests/utils/logger.test.js` 实际执行后端测试套件，163/163 通过。

## 2026-04-28 写卡助手 prompt 输出质量优化

**背景**：基于 `.temp/无限轮回模拟器.weworld.json` 这类复杂状态机世界卡，单靠风控/语法检测只能拦坏输出，不能提升模型第一次输出的拆步智能、内容稳定性和成功率。

**改动**：
- `assistant/server/task-planner.js` — Planner prompt 新增内部任务分类：单资源小改、复杂世界卡、状态机世界卡、多资源创建、修复已有卡；复杂/状态机世界卡要求优先拆成基础结构、状态字段、触发条目、后续状态值填写步骤。
- `assistant/prompts/world-card.md` — 新增内部生成流程和“状态机世界卡”正例：阶段 enum 字段 + 每阶段 state 条目 + 非空 conditions + 入口 keyword/llm 选择，减少空关键词、空条件和字段引用漂移。
- `assistant/server/agent-factory.js` — 子代理 JSON 可解析但 `normalizeProposal()` 契约失败时，会把具体错误反馈给同一子代理再重试一次，要求基于上一版 proposal 定向修复。
- `assistant/tests/task-planner.test.js` / `assistant/tests/agent-factory.test.js` — 增加 prompt 规则回归与 proposal 契约失败重试测试。
- `assistant/CONTRACT.md` / `ARCHITECTURE.md` — 同步记录复杂任务 prompt 策略与子代理契约失败重试机制。

**测试**：`npm test --prefix assistant`，72/72 通过。

## 2026-04-28 写卡助手复杂任务稳定性与准确性提升

**背景**：分析一张含 6 条 entryOps + 35 个 stateFieldOps 的复杂世界卡，发现写卡助手在以下场景存在稳定性和准确性问题：JSON 自我纠错信息不具体、静默 bug（空 conditions/keywords）无校验、条件字段 label 与 field_key 混用静默通过、Planner 缺乏大体量任务的拆步策略。

**改动**：

- `assistant/server/agent-factory.js` — JSON 解析失败 retry 时，将 `extractJson` 的具体错误（如"输出为空"、"找不到 JSON 对象"）拼入 retry prompt，让 LLM 知道具体哪里不合法
- `assistant/server/task-planner.js` — Planner system prompt 补充大体量拆步规则：world-card create 同时涉及 10+ 状态字段或 5+ entryOps 时强制拆为两步；明确 world-card 不支持 stateValueOps，初始状态值须通过后续 persona-card 步骤填写；同时改用 `extractJson` 替代裸 `JSON.parse`，Planner 的 JSON 错误信息也更具体
- `assistant/server/routes.js` — `normalizeEntryOps` 新增 `warnings` 收集机制：
  - `trigger_type:"keyword"` + `keywords` 为空 → 追加警告"该条目永远不会触发"
  - `trigger_type:"state"` + `conditions` 为空 → 追加警告"该条目永远不会触发"
  - `resolveConditionField` 新增 `unresolved` 标记：`target_field` 含 `.` 但在 conditionContext 中找不到对应字段时，追加警告"引用了未知字段"（此前静默通过，落库后永远不匹配）
  - `normalizeProposal` 的 world-card 分支收集全部 entryWarnings，追加到 `proposal.explanation`，主代理和前端均可见
- `assistant/prompts/world-card.md` — 硬规则区新增两条：禁止输出空 keywords 的 keyword 条目、禁止输出空 conditions 的 state 条目；新增正例 4：说明初始状态值须通过 persona-card stateValueOps 而非 world-card

**坑点备忘**：
- `STATE_VALUE_TARGETS_BY_PROPOSAL_TYPE['world-card']` 为空集，world-card 提案**不支持** stateValueOps，CONTRACT.md 第 570 行是正确的；初始状态值只能通过 persona-card / character-card 步骤的 stateValueOps 填写
- state 条目 conditions 为空的运行时语义（永不触发 or 恒触发）取决于 state 评估器实现，未在本次变更中确认，仅新增了校验警告

**测试**：`assistant/tests/routes.test.js` 16/16、`routes-integration.test.js` 14/14 全部通过。

## 2026-04-28 重新生成时立即回滚状态栏

**背景**：点击重新生成或 /retry 时，后端在 `runStream` 之前就已完成状态回滚，但前端需等到 `state_updated`（生成结束后异步任务完成）才刷新状态栏，导致旧状态显示直到新一轮生成完毕。

**改动**：
- `backend/routes/chat.js` — 在 `runStream` 开头新增 `opts.stateRolledBack` 分支，立即推送 `state_rolled_back` SSE；regenerate 路由传入 `{ stateRolledBack: !!regenWorldId }`
- `backend/routes/writing.js` — 同上，`runWritingStream` 开头发 `state_rolled_back`；writing regenerate 路由传入 `{ stateRolledBack: !!regenWorldId }`
- `frontend/src/api/stream-parser.js` — 新增 `state_rolled_back` 事件分发 → `callbacks.onStateRolledBack?.()`
- `frontend/src/pages/ChatPage.jsx` — `makeCallbacks` 新增 `onStateRolledBack` → `triggerMemoryRefresh()`
- `frontend/src/pages/WritingSpacePage.jsx` — `makeStreamCallbacks` 新增 `onStateRolledBack` → `setStateTick(t => t + 1)`
- `ARCHITECTURE.md §7` — 新增 `state_rolled_back` 事件记录

**行为变化**：重新生成开始时，状态栏立即更新为回滚后状态（触发"整理中"overlay）；生成完成后 `state_updated` 再次刷新为新状态。

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

## 2026-04-28 删除编辑世界页面导入导出 tab

**改动**：
- `frontend/src/pages/WorldEditPage.jsx` — 删除"导入导出" tab（export section）、`handleExport` / `handleImportWorldFile` 函数、`exporting` / `sealKey` / `importing` state、`worldImportRef`、`SealStampAnimation` 组件及其 import、`import-export` API import

**保留**：`WorldsPage` 页头"导入世界卡"按钮与 card 上"↓"导出按钮不变，这是正常的导入导出入口。

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
