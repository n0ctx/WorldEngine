# Changelog

> 每次任务完成后，在最上方追加一条记录。这是项目的"记忆"，给自己和 AI 看。  
> 新开对话时让 Claude Code 先读此文件，了解项目现状。

## 记录格式模板

```
## T[编号] — [任务名] ✅
- **对外接口**：其他模块如何调用（函数名、路由路径等）
- **涉及文件**：新增或修改了哪些文件
- **注意**：容易踩的坑、约束、以及文档里没写清楚的决策
```

不写实现细节，不写"完成了什么功能"（ROADMAP 里已有）。  
只写**未来 Claude Code 需要知道、但从其他文件里找不到的东西**。

---

<!-- 任务记录从下方开始，最新的放最上面 -->

## DOC — 新增 ARCHITECTURE.md + 精简 CLAUDE.md ✅
- **对外接口**：无代码改动；新增 `ARCHITECTURE.md` 作为架构快照（覆盖式维护，15 节，447 行）
- **涉及文件**：新增 `ARCHITECTURE.md`；修改 `CLAUDE.md`（213 行，从 269 行精简，"关键设计速查"节从 ~70 行压缩至 ~12 行，架构描述迁移至 ARCHITECTURE.md）
- **注意**：CLAUDE.md 只保留约束与规则；ARCHITECTURE.md 描述当前系统现状，每次大特性完成后覆盖式更新对应节；两文件职责不重叠——SCHEMA.md 管字段，CLAUDE.md 管规则，ARCHITECTURE.md 管运行时行为

## T45 — Prompt 编辑框可调高度 + 创建/编辑页面宽度扩展 ✅
- **对外接口**：无新增接口；`MarkdownEditor` prop `minHeight` 含义变化：原为 CSS `min-height`（自动拉伸），现为初始固定 `height`（用户可拖动调整）
- **涉及文件**：`frontend/src/components/ui/MarkdownEditor.jsx`（`style={{ minHeight }}` → `style={{ height: minHeight }}`）；`frontend/src/index.css`（`.we-md-content` 加 `overflow-y: auto / resize: vertical / min-height: 60px / border-bottom-radius: 7px`，追加 webkit 滚动条样式）；5 个页面 `max-w-2xl` → `max-w-[56rem]`：`WorldCreatePage` / `WorldEditPage` / `CharacterCreatePage` / `CharacterEditPage` / `PersonaEditPage`
- **注意**：`minHeight` prop 传入的 px 值既是初始高度也是 `min-height: inherit` 给 ProseMirror 的参照，ProseMirror 仍会填满可见区；滚动条宽 6px，`.we-md-editor` 不需要 `overflow: hidden`，底部圆角由 `.we-md-content` 的 `border-bottom-*-radius: 7px` 收束

## T44 — 创建页面对齐编辑页面 + 世界级模型参数下线 + Provider 切换 Bug 修复 ✅
- **对外接口**：新增路由 `/worlds/new` → `WorldCreatePage`；`/worlds/:worldId/characters/new` → `CharacterCreatePage`；两个创建页创建完成后用 `navigate(url, { replace: true })` 跳到编辑页（创建页不留在历史栈中，返回键直达列表）
- **涉及文件**：新增 `frontend/src/pages/WorldCreatePage.jsx`、`frontend/src/pages/CharacterCreatePage.jsx`；修改 `App.jsx`（注册两条新路由，`/worlds/new` 放在 `/worlds/:worldId` 之前）；修改 `WorldsPage.jsx`（删除 WorldFormModal，创建按钮改 navigate）；修改 `CharactersPage.jsx`（删除 CreateCharacterModal，创建按钮改 navigate）；修改 `WorldEditPage.jsx`（删除 temperature/maxTokens state 和 UI，保存时始终发 `temperature: null, max_tokens: null` 清除 DB 中旧值）；修改 `SettingsPage.jsx`（LLM 卡片追加 Temperature 滑块和 Max Tokens 输入；handleLlmChange/handleEmbeddingChange 切 provider 时同步清空 model；ModelSelector.load() 加载完成后若 value 为空或不在列表中自动选第一个模型）
- **注意**：worlds 表仍有 temperature/max_tokens 列，不删除 schema；现有世界中旧的非 null 值在下次保存时会被清为 null（assembler.js 已有 `world.temperature ?? config.llm.temperature` fallback，行为正确）；ModelSelector 自动选模型会触发 onChange→handleLlmChange('model')→patchConfig 保存，属预期行为；embedding provider 切换同样修复了相同 bug

## T43 — 编辑界面统一全屏+加宽 ✅
- **对外接口**：新增路由 `/worlds/:worldId/edit` → `WorldEditPage`，`/worlds/:worldId/persona` → `PersonaEditPage`
- **涉及文件**：新增 `frontend/src/pages/WorldEditPage.jsx`、`frontend/src/pages/PersonaEditPage.jsx`；修改 `App.jsx`（注册路由）、`WorldsPage.jsx`（WorldFormModal 简化为纯创建，编辑按钮改为 navigate）、`CharactersPage.jsx`（移除 PersonaEditModal 和 StateValueField，玩家编辑改为 navigate）、`CharacterEditPage.jsx`（max-w-lg → max-w-2xl）
- **注意**：创建世界仍用 Modal（WorldFormModal），编辑世界才走全屏页；PersonaCard 返回后自动刷新（React Router 重新挂载 CharactersPage），不再需要 personaRefreshKey；WorldFormModal 已移除 `initial` prop，不再支持编辑模式

## T42 — 无会话时发送消息自动建会话 ✅
- **对外接口**：无新增接口；复用 `createSession(characterId)` from `api/sessions.js`
- **涉及文件**：`frontend/src/pages/ChatPage.jsx`（`handleSend` 改为 async，guard 拆分，新增自动建会话逻辑）、`frontend/src/components/chat/Sidebar.jsx`（新增 `Sidebar.addSession` 静态方法，与 `Sidebar.updateTitle` 同模式）
- **注意**：`enterSession` 内部会调用 `setMessageListKey(k+1)` 重置消息列表，乐观 user 消息会随之丢失（新会话为空，可接受）；流式内容通过 `streamingText` state 正常展示；`Sidebar.addSession` 在同帧注册，React 批量更新后即可感知新会话

## T41 — 角色卡跨世界导入兼容性校验 ✅
- **对外接口**：无新增接口；复用 `listCharacterStateFields(worldId)`
- **涉及文件**：`frontend/src/pages/CharactersPage.jsx`（`handleImportCharFile` 中插入校验逻辑；新增 `listCharacterStateFields` import）
- **注意**：`character_state_values` 为空或长度 0 时跳过校验直接导入；目标世界无字段但角色卡有状态值时同样视为不兼容报错；错误提示用原有 `alert()`，与页面风格一致；后端的静默跳过逻辑保留作为保底

## T40 — 记忆面板实时更新感知 ✅
- **对外接口**：无新增接口；复用 `getPersonaStateValues` / `getWorldStateValues` / `getCharacterStateValues` / `getWorldTimeline` 轮询
- **涉及文件**：`frontend/src/store/index.js`（新增 `memoryRefreshTick` + `triggerMemoryRefresh`）、`frontend/src/pages/ChatPage.jsx`（`finalizeStream` 末尾调用 `triggerMemoryRefresh`，移除右栏外部标题头）、`frontend/src/components/memory/MemoryPanel.jsx`（内置标题头含脉冲指示、`tick` 订阅、3s 轮询 + 20s 超时）
- **注意**：轮询以 JSON.stringify 对比快照判断数据是否变化；轮询失败直接 setIsPolling(false) 静默停止；`tick === 0` 时不启动轮询（挂载时不触发）；标题头从 ChatPage 移入 MemoryPanel 以便内联展示指示

## T35 修订 — MarkdownEditor 改为 tiptap 真正 WYSIWYG ✅
- **问题**：原 T35 用 `@uiw/react-md-editor`（preview=live），渲染为左右分栏，不是所见即所得
- **修改**：移除 `@uiw/react-md-editor`，改用 `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-placeholder` + `tiptap-markdown`；`MarkdownEditor.jsx` 重写为 tiptap WYSIWYG，内容直接以富文本形式渲染（无分栏、无可见 markdown 符号）
- **涉及文件**：`frontend/src/components/ui/MarkdownEditor.jsx`（重写）、`frontend/src/index.css`（去掉旧 `.we-md-editor` 块，换成 tiptap `.ProseMirror` 样式）、`frontend/package.json`
- **注意**：组件 API（value/onChange/placeholder/minHeight/className）保持不变，调用方零改动；光标同步用 `useEffect` 比对当前 markdown 与 prop，仅外部变更时才调用 `setContent`

## T38 — 玩家卡导出为角色卡 ✅
- **对外接口**：`GET /api/worlds/:worldId/persona/export` → 返回 worldengine-character-v1 格式 JSON
- **涉及文件**：`backend/services/import-export.js`（新增 `exportPersona`）、`backend/routes/import-export.js`（新增路由）、`frontend/src/api/importExport.js`（新增 `exportPersona`/`downloadPersonaCard`）、`frontend/src/pages/CharactersPage.jsx`（PersonaEditModal 底部加「导出为角色卡」按钮）
- **注意**：personas 表无 first_message/post_prompt 列，导出时固定填空字符串；底部操作区由 `justify-end` 改为 `justify-between`，左侧放导出按钮，右侧保留取消/保存

## T37 — 对话消息 CSS+HTML 渲染支持 ✅
- **对外接口**：无新增接口
- **涉及文件**：`frontend/src/components/chat/MessageItem.jsx`、`frontend/package.json`
- **注意**：仅 assistant 消息的 ReactMarkdown 加了 `rehypePlugins={[rehypeRaw, rehypeSanitize]}`；流式状态仍用 whitespace-pre-wrap 纯文本，不走 ReactMarkdown，未改动；sanitize 使用 rehype-sanitize 默认规则（允许常规 HTML 标签，过滤 script/on* 等危险属性）

## T36 — 状态字段表单逻辑修正 ✅
- **对外接口**：无新增接口
- **涉及文件**：`frontend/src/components/state/StateFieldEditor.jsx`、`backend/db/queries/world-state-fields.js`、`backend/db/queries/character-state-fields.js`、`backend/db/queries/persona-state-fields.js`
- **注意**：allow_empty 控件已从前端移除，handleSave 中硬编码为 `allow_empty: 1`（后端字段保留）；当 update_mode==='manual' 时，trigger_mode 整块（含关键词 tag 区域）不渲染；三个 queries 文件中新建字段的默认值已改为 `llm_auto` / `every_turn`

## T35 — Prompt 编辑框 WYSIWYG + 体验优化 ✅
- **对外接口**：新增 `frontend/src/components/ui/MarkdownEditor.jsx`，Props: `value`, `onChange(v: string)`, `placeholder`, `minHeight`, `className`
- **涉及文件**：`frontend/src/components/ui/MarkdownEditor.jsx`（新建）、`frontend/src/components/ui/Textarea.jsx`（resize-y）、`frontend/src/index.css`（MDEditor 样式覆盖）、`frontend/src/pages/SettingsPage.jsx`、`frontend/src/pages/WorldsPage.jsx`、`frontend/src/pages/CharacterEditPage.jsx`、`frontend/src/pages/CharactersPage.jsx`、`frontend/src/components/prompt/EntryEditor.jsx`
- **注意**：`MarkdownEditor` 的 `onChange` 接收字符串值（非 event 对象），与普通 textarea 不同——替换时需将 `(e) => setState(e.target.value)` 改为 `(v) => setState(v)` 或直接传 `setState`；`data-color-mode="light"` 强制浅色主题；`hideToolbar={false}` 仅保留 5 个工具按钮；`StateFieldEditor` 的 description/update_instruction 仍为纯 textarea，不受影响

## T39 — 状态字段编辑入口重构 ✅
- **对外接口**：新增 `PATCH /api/characters/:characterId/state-values/:fieldKey` 和 `PATCH /api/worlds/:worldId/persona-state-values/:fieldKey`；前端新增 `updateCharacterStateValue` / `updatePersonaStateValue`
- **涉及文件**：`backend/routes/character-state-values.js`、`backend/routes/persona-state-values.js`、`backend/db/queries/character-state-values.js`（getCharacterStateValuesWithFields 加 enum_options）、`backend/db/queries/persona-state-values.js`（同上）、`frontend/src/api/characterStateValues.js`、`frontend/src/api/personaStateValues.js`、`frontend/src/pages/WorldsPage.jsx`（世界编辑弹窗追加角色/玩家状态字段两个 StateFieldList）、`frontend/src/pages/CharacterEditPage.jsx`（移除 StateFieldList，改为状态值编辑面板）、`frontend/src/pages/CharactersPage.jsx`（PersonaEditModal 同步）
- **注意**：各页面内嵌了 `StateValueField` 组件（未提取为独立文件）；boolean/enum 即时保存（onChange），text/number/list 失焦保存（onBlur）；list 类型展示为逗号分隔字符串，保存时 split 转 JSON 数组；enum 渲染需要 enum_options，故两个联表查询均已补充该字段

## 规划 T35-T42 ✅
- **内容**：基于试用反馈规划了 8 个新任务，已追加到 ROADMAP.md 阶段 5
- **任务列表**：T35（Prompt编辑框WYSIWYG）、T36（状态字段表单修正）、T37（消息HTML渲染）、T38（玩家卡导出）、T39（状态字段入口重构，依赖T36）、T40（记忆面板实时刷新，建议T39后）、T41（角色卡导入兼容性校验）、T42（无会话自动建会话）
- **注意**：T35 需安装 @uiw/react-md-editor；T37 需安装 rehype-raw + rehype-sanitize；T39 必须在 T36 后执行

## T34 — 写作空间 ✅
- **入口**：角色选择页右上角 "写作空间" 按钮 → `/worlds/:worldId/writing`
- **路由（后端）**：`/api/worlds/:worldId/writing-sessions` 及子路由，注册在 `server.js` 的 `app.use('/api/worlds', writingRoutes)`
- **DB 迁移**：`sessions` 表通过 table-recreation 将 `character_id NOT NULL` 改为可空，同时新增 `world_id`（FK→worlds）和 `mode TEXT DEFAULT 'chat'`；新增 `writing_session_characters` 联结表（session_id, character_id UNIQUE）；迁移逻辑在 `initSchema` 末尾，先检测 `PRAGMA table_info(sessions)` 中 `charCol.notnull === 1` 再执行
- **对外接口**：`buildWritingPrompt(sessionId, options?)` 追加在 `assembler.js` 末尾，不修改 `buildPrompt`；写作路由在 `routes/writing.js`；写作 service 在 `services/writing-sessions.js`；DB 查询在 `db/queries/writing-sessions.js`
- **激活角色**：通过 `writing_session_characters` 表动态管理，可在会话中随时增删；`buildWritingPrompt` 循环所有激活角色注入 [4][5][6]
- **状态更新**：生成完成后并行 enqueue 所有激活角色的 `updateCharacterState`（优先级 2）+ persona 状态 + 世界状态
- **前端组件**：`WritingSpacePage`（主页）、`WritingSidebar`（会话列表）、`WritingMessageList/Item`（散文展示，无气泡）、`MultiCharacterMemoryPanel`（含激活角色选择器）、`ActiveCharactersPicker`；API 封装在 `api/writingSessions.js`
- **注意**：写作会话 `character_id = NULL`，`mode = 'writing'`；旧 chat 会话自动补 `mode = 'chat'`；`getWritingSessionById` 查询条件含 `mode = 'writing'` 防误用普通会话 id

## T33 — 状态字段 list 类型 ✅
- **新增类型**：状态字段（世界/角色/玩家）支持 `list`（字符串列表）类型，适用于装备列表、物品列表等场景
- **存储**：`value_json` 存 JSON 数组字符串（`["条目1","条目2"]`），无需改动数据库 schema
- **LLM 更新策略**：替换整个列表（LLM 返回完整新数组）；容错：LLM 返回逗号/顿号字符串时自动 split 转换
- **渲染**：`recall.js` 和 `MemoryPanel.jsx` 中用顿号（`、`）拼接条目，注入格式为 `- 背包：长剑、圆盾`
- **前端编辑器**：`StateFieldEditor.jsx` 新增"默认条目"tag-input（type=list 时替换普通默认值输入框）
- **涉及文件**：`SCHEMA.md`、`recall.js`、`character/world/persona-state-updater.js`（fieldsDesc + validateValue）、`services/characters.js`、`services/worlds.js`、`StateFieldEditor.jsx`、`StateFieldList.jsx`、`MemoryPanel.jsx`

## T29B — 组件样式重构 ✅
- **对外接口**：新增 6 个 UI 原语组件（`/frontend/src/components/ui/`），均通过 `className` prop 支持外部扩展
- **涉及文件**：
  - `frontend/src/components/ui/Button.jsx` — 新建，variants: primary/secondary/ghost/danger，sizes: sm/md/lg，挂 `we-btn we-btn-{variant}`
  - `frontend/src/components/ui/Card.jsx` — 新建，elevations: flat/contained/ring/whisper，挂 `we-card`
  - `frontend/src/components/ui/Input.jsx` — 新建，标准输入框，挂 `we-input`
  - `frontend/src/components/ui/Textarea.jsx` — 新建，多行文本域，挂 `we-textarea`
  - `frontend/src/components/ui/Badge.jsx` — 新建，胶囊标签，variants: default/accent/error，挂 `we-badge`
  - `frontend/src/components/ui/ModalShell.jsx` — 新建，模态框外壳，挂 `we-modal`/`we-modal-backdrop`
  - 18 个 `.jsx` 文件 — 替换所有旧 `var(--text)` / `var(--bg)` / `var(--accent)` / `var(--border)` 等为新 Tailwind 工具类；补齐 `we-*` 钩子类；主标题加 `font-serif`
  - `frontend/DESIGN_AUDIT.md` — 删除（T29B 完成后审计产物）
- **注意**：
  - `bg-border` 在 Tailwind v4 中解析为 `background-color: var(--color-border)` = `#f0eee6`，可用于 toggle 开关「关闭」态背景
  - UI 原语组件的 `className` prop 总是追加在末尾，外部覆盖优先
  - 25 个 `we-*` 钩子类全部挂载完毕，T24A 用户片段定位器保持稳定

## T29A — 设计令牌落地 & 视觉基线审计 ✅
- **对外接口**：无新路由；仅 CSS 变量层，所有 `--we-*` 变量通过 `:root` 定义，并通过 `@theme` 暴露为 Tailwind v4 工具类
- **涉及文件**：
  - `frontend/src/index.css` — 重写：删除 `prefers-color-scheme: dark` 块及旧变量（`--text`/`--bg`/`--accent` 等）；新增 26 个 `--we-*` 变量（画布/表面/品牌/文字/边框/阴影/字体/圆角）；新增 `@theme` 块映射 Tailwind 工具类；`body` 背景改 `var(--we-canvas)`；`typing-dot` 背景色改 `var(--we-text-tertiary)`；全局 `font-size` 从 15px 改 16px；字体栈改 `var(--we-sans)`
  - `frontend/DESIGN_AUDIT.md` — 新建，临时审计产物（T29B 完成后删除）：设计令牌清单、钩子类名清单（25 个）、字体回退策略、组件变更清单、T24A 兼容约定
- **注意**：
  - 本任务 0 行组件改动，组件 className 未动，T29B 按 DESIGN_AUDIT.md 施工
  - 旧紫色 `--accent: #7c3aed` 已删除；新陶土色 `--we-accent: #c96442` 作为品牌色
  - Tailwind v4 `@theme` 里的 `--color-*` 是框架约定必须写；用户层变量统一 `--we-*` 前缀避免冲突

## T32 — 会话上下文轮次压缩（Context Compression）✅
- **对外接口**：
  - `POST /api/sessions/:sessionId/summary` — 现在调用 `maybeCompress(sessionId, { force: true })`，跳过阈值强制压缩，同时重置轮次计数；无需用户消息检查（generateSummary 内部处理空对话）
  - `maybeCompress(sessionId, { force? })` — 核心压缩函数（`backend/memory/context-compressor.js`）
- **涉及文件**（新建）：
  - `backend/memory/context-compressor.js` — `maybeCompress`：阈值检查 → generateSummary → setCompressedContext → markAllMessagesCompressed → upsertSessionTimeline → embedSessionSummary
- **涉及文件**（修改）：
  - `backend/db/schema.js` — messages 加 `is_compressed`，sessions DDL 已含 `compressed_context`，world_timeline 加 `session_id`/`updated_at`，ALTER TABLE 迁移，新建两个索引
  - `backend/db/queries/messages.js` — 新增 `getUncompressedMessagesBySessionId`、`countUncompressedRounds`、`markAllMessagesCompressed`
  - `backend/db/queries/sessions.js` — 新增 `setCompressedContext`、`clearCompressedContext`
  - `backend/db/queries/world-timeline.js` — 新增 `upsertSessionTimeline`（SELECT→UPDATE/INSERT 模式，无需 UNIQUE 约束）
  - `backend/memory/world-timeline.js` — 彻底重写：去除 LLM 事件提取逻辑，改为直接调用 `upsertSessionTimeline`（此文件由 context-compressor.js 内联调用，不再入独立队列）
  - `backend/memory/recall.js` — `renderTimeline`：改为 LEFT JOIN sessions，按 updated_at DESC 取最新 5 条，格式变为 `[历史会话摘要]` + `- 【日期 · 标题】摘要`
  - `backend/memory/summary-expander.js` — `renderExpandedSessions` 改用 `getUncompressedMessagesBySessionId`；若 session 有 `compressed_context` 则作为历史前缀展示
  - `backend/prompt/assembler.js` — `[6]` 之前注入 `[早期对话摘要]`（`session.compressed_context`）；`[7]` 改用 `getUncompressedMessagesBySessionId`
  - `backend/routes/chat.js` — 删除每轮 `generateSummary`/`embedSessionSummary`/`appendWorldTimeline` 入队；替换为 `maybeCompress(sessionId)` 优先级 1；DELETE messages 路由加 `clearCompressedContext`；/summary 路由改为 `maybeCompress(force:true)`
  - `backend/utils/constants.js` — `WORLD_TIMELINE_RECENT_LIMIT`: 20 → 5
  - `SCHEMA.md`、`CHANGELOG.md` — 更新字段说明
- **注意**：
  - 阈值由 `config.context_compress_rounds`（默认 10）控制；0 不等于禁用（每轮 rounds=0 < 0 不触发），实际上设为极大值可近似禁用
  - 旧数据库：ALTER TABLE 安全迁移；旧消息 `is_compressed=0`（全部参与 context）；旧 world_timeline 条目 `session_id=NULL`（renderTimeline LEFT JOIN 时显示"未命名会话"）
  - 世界时间线语义变化：不再是"时序事件"，而是"各 session 摘要"，每 session 最多一行，压缩时覆盖

## T31 — 后置提示词 + 组装顺序调整 ✅
- **对外接口**：后置提示词在 assembler.js 内部拼接，无新路由；存储透传现有 PUT /api/worlds/:id 和 PUT /api/characters/:id
- **涉及文件**：`backend/prompt/assembler.js`、`backend/db/schema.js`、`backend/db/queries/worlds.js`、`backend/db/queries/characters.js`、`backend/services/config.js`、`frontend/src/pages/SettingsPage.jsx`、`frontend/src/pages/WorldsPage.jsx`、`frontend/src/pages/CharacterEditPage.jsx`、`SCHEMA.md`、`CLAUDE.md`
- **注意**：[2][3] 顺序已对调（世界 SP 现在在 Persona 前）；后置提示词为三层叠加（全局→世界→角色），全为空时不追加任何消息；现有 DB 通过 ALTER TABLE 迁移，无需重置

## T30 — 副作用资源生命周期自动维护 ✅
- **对外接口**：无新 HTTP 接口；核心 API 为 `registerOnDelete(entity, fn)` / `runOnDelete(entity, id)`（utils/cleanup-hooks.js）
- **涉及文件**（新建）：
  - `backend/utils/cleanup-hooks.js` — 钩子注册表
  - `backend/utils/file-cleanup.js` — `unlinkUploadFile` / `unlinkUploadFiles`
  - `backend/services/cleanup-registrations.js` — 所有钩子集中注册
- **涉及文件**（修改）：
  - `backend/db/queries/messages.js` — 新增 `getAttachmentsByMessageId/SessionId/CharacterId/WorldId`、`getMessageIdsBySessionId`、`getMessageIdsAfter`
  - `backend/db/queries/characters.js` — 新增 `getAvatarPathsByWorldId`、`getSessionIdsByCharacterId/WorldId`
  - `backend/db/queries/prompt-entries.js` — 新增 `getEmbeddingIdsByCharacterId/WorldId`
  - `backend/db/queries/personas.js` — 新增 `getPersonaAvatarPathByWorldId`
  - `backend/services/worlds.js` — `deleteWorld` 改 async，删前 `runOnDelete('world')`
  - `backend/services/characters.js` — `deleteCharacter` 改 async；`updateCharacter` 改 async，替换头像时 unlink 旧文件
  - `backend/services/sessions.js` — `deleteSession`、`deleteMessage`、`deleteMessagesAfter`、`deleteAllMessagesBySessionId`、`updateMessageAndDeleteAfter` 均改 async
  - `backend/services/personas.js` — `updatePersona` 改 async，替换头像时 unlink 旧文件
  - 所有路由层对应处理函数补 async/await
  - `backend/server.js` — 新增 `import './services/cleanup-registrations.js';`
  - `CLAUDE.md` — server.js 行补例外登记；核心约束补"副作用资源扩展规则"
- **注意**：
  - 钩子注册表模式：新增副作用资源（文件/向量）只需在 cleanup-registrations.js 注册，不改任何 delete service
  - 本任务已覆盖：消息附件、角色头像、玩家头像、Prompt 条目向量、Session Summary 向量
  - `runOnDelete` 在 DB DELETE **之前**执行（资源还存在时收集路径）；钩子失败仅 warn，不中断 DB 删
  - `updateMessageAndDeleteAfter` 内部调用 service 层 `deleteMessagesAfter`（而非 db 层），确保消息钩子被触发

## T30 — 玩家头像 + 斜杠命令去重 ✅
- **对外接口**：
  - `POST /api/worlds/:worldId/persona/avatar` — 上传玩家头像，返回 `{ avatar_path }`
  - `uploadPersonaAvatar(worldId, file)` — 前端 API 封装（`api/personas.js`）
- **涉及文件**：
  - `SCHEMA.md` / `backend/db/schema.js` — personas 表新增 `avatar_path TEXT` 字段；`initSchema` 加 ALTER TABLE 迁移（现有库自动补列）
  - `backend/db/queries/personas.js` — `upsertPersona` 支持 `avatar_path` patch
  - `backend/routes/personas.js` — 加 multer + 头像上传路由
  - `frontend/src/api/personas.js` — 加 `uploadPersonaAvatar`
  - `frontend/src/pages/CharactersPage.jsx` — `PersonaCard` 展示头像；`PersonaEditModal` 加头像区域（点击上传）；父组件加 `personaRefreshKey` 刷新卡片
  - `frontend/src/pages/ChatPage.jsx` — 加载 persona，传给 MessageList
  - `frontend/src/components/chat/MessageList.jsx` — 透传 `persona` 到 MessageItem
  - `frontend/src/components/chat/MessageItem.jsx` — 用户消息右侧显示玩家头像
  - `frontend/src/components/chat/InputBox.jsx` — 删除重复的 `/regen` 命令，只保留 `/retry`
- **注意**：
  - 头像文件存 `data/uploads/avatars/persona-{personaId}.ext`，与角色头像同目录
  - 用户消息气泡改为 `flex items-end gap-3 justify-end`，右侧追加 6×6 头像圆

## bugfix — 错误气泡 / 设置入口 ✅
- **对外接口**：无新接口，纯前端
- **涉及文件**：
  - `frontend/src/pages/ChatPage.jsx` — 新增 `errorBubble` state、`streamingTextRef` ref、`handleRetryAfterError()`；`onError` 回调现在捕获部分内容并设置 errorBubble（不再丢失流中内容）；顶栏加设置齿轮按钮；发送/切换会话时清除 errorBubble
  - `frontend/src/pages/CharactersPage.jsx` — 页头加"设置"按钮
  - `frontend/src/pages/CharacterEditPage.jsx` — 导航栏加"设置"链接
- **注意**：
  - 错误气泡渲染在 `MessageList` 和 `InputBox` 之间（ChatPage 内），而非 MessageList 内部，避免破坏 MessageList 的 key/刷新逻辑
  - `streamingTextRef` 与 `streamingText` state 同步更新，用于在 `onError` 闭包（可能有 stale state）中正确取到部分内容
  - 编辑消息 → 自动重新生成已在 T28 前实现（`handleEditMessage` 调用 `editAndRegenerate`），本次未改变逻辑，仅补充了 `setErrorBubble(null)` 和 `streamingTextRef.current = ''` 的重置

## T28 — 渐进式展开原文 ✅
- **对外接口**：
  - `searchRecalledSummaries(worldId, sessionId)` — `/backend/memory/recall.js`（原 `renderRecalledSummaries` 拆分），返回 `{ recalled: [{ref, session_id, session_title, created_at, content, score}], recentMessagesText }`
  - `renderRecalledSummaries(recalled)` — `/backend/memory/recall.js`（重构后签名接受结构化列表），每条前加 `【#ref】` 前缀
  - `decideExpansion({ sessionId, recalled, recentMessagesText })` — `/backend/memory/summary-expander.js`，preflight 非流式调用，返回需展开的 `string[]`
  - `renderExpandedSessions(sessionIds, tokenBudget)` — `/backend/memory/summary-expander.js`，渲染展开原文文本块
  - `buildPrompt(sessionId, options?)` — `/backend/prompt/assembler.js`，签名新增 `options.onRecallEvent` 回调
  - `buildContext(sessionId, options?)` — `/backend/services/chat.js`，透传 options 到 buildPrompt
  - SSE 事件：`memory_expand_start`（candidates）/ `memory_expand_done`（expanded），仅 runStream 路径发送
- **涉及文件**：
  - 修改：`backend/utils/constants.js`（+3 个 MEMORY_EXPAND_* 常量）、`backend/memory/recall.js`（拆分函数 + 新格式）、`backend/prompt/assembler.js`（[6] 接入展开流程，签名扩展）、`backend/services/chat.js`（透传 options）、`backend/routes/chat.js`（+onRecallEvent 回调到 buildContext）、`backend/services/config.js`（+`memory_expansion_enabled` 默认 true）、`frontend/src/api/chat.js`（+expand 事件回调）、`frontend/src/pages/ChatPage.jsx`（+状态 + expand 事件处理）、`frontend/src/components/chat/MessageList.jsx`（+expand 胶囊 UI）、`frontend/src/pages/SettingsPage.jsx`（+「记忆原文展开」开关 section）
  - 新增：`backend/memory/summary-expander.js`
- **注意**：preflight 用 `llm.complete`（非流式），失败静默降级为"不展开"，不抛出不重试；`memory_expansion_enabled=false` 时整条展开链跳过，召回摘要仍保留（T27 行为不变）；`/continue` 路径不传 onRecallEvent 故无 expand 事件，符合预期；recall.js 的 `renderRecalledSummaries` 签名已变更（从 `(worldId, sessionId)` 改为接受结构化数组），任何直接调用该函数的代码需同步更新

## T27 — 跨 Session Summary 召回 ✅
- **对外接口**：
  - `embedSessionSummary(sessionId)` — `/backend/memory/summary-embedder.js`，优先级 5 异步任务
  - `renderRecalledSummaries(worldId, sessionId)` — `/backend/memory/recall.js`，返回 `{ text, hitCount }`，已接入 assembler.js [6] 位置末尾
  - SSE 事件：`{ type: 'memory_recall_start' }` / `{ type: 'memory_recall_done', hit: number }`，在 buildContext 前后发出（仅 runStream，不含 /continue）
  - `search(queryVector, { worldId, excludeSessionId, topK })` — `/backend/utils/session-summary-vector-store.js`
  - `getSummaryWithMetaById(summaryId)` / `listSummariesByWorldId(worldId, excludeSessionId)` — `/backend/db/queries/session-summaries.js`
- **涉及文件**：
  - 新增：`backend/utils/session-summary-vector-store.js`、`backend/memory/summary-embedder.js`
  - 修改：`backend/utils/constants.js`（+`MEMORY_RECALL_SIMILARITY_THRESHOLD=0.68`）、`backend/db/queries/session-summaries.js`（+2 函数）、`backend/memory/recall.js`（+`renderRecalledSummaries`，+若干 import）、`backend/prompt/assembler.js`（[6] 接入召回，返回值加 `recallHitCount`）、`backend/services/chat.js`（透传 `recallHitCount`）、`backend/routes/chat.js`（+`embedSessionSummary` import、SSE 事件、+priority 5 任务）
- **注意**：向量文件独立于 prompt_entries，路径 `data/vectors/session_summaries.json`；embedding 未配置时全链路静默降级（不报错、不注入）；召回阈值 0.68 比 prompt entry 阈值 0.72 略低（摘要语义更宽）；不做历史 backfill，已有 summary 在下次该 session 有新消息触发 generateSummary 后顺带 embed；`buildPrompt` / `buildContext` 返回值新增 `recallHitCount` 字段，旧调用忽略该字段向后兼容

## T26C 后续调整 — UI 归位 ✅
- **变更**：玩家人设编辑从 WorldFormModal 移出，改为 CharactersPage 的 PersonaCard 上的编辑按钮（PersonaEditModal，含玩家状态字段 StateFieldList）；角色状态字段从 WorldFormModal 移到 CharacterEditPage；WorldFormModal 仅保留世界状态字段；记忆面板顺序改为世界→玩家→角色→时间线
- **涉及文件**：`frontend/src/pages/WorldsPage.jsx`（移除 PersonaEditor、角色字段、玩家字段）、`frontend/src/pages/CharactersPage.jsx`（内联 PersonaCard + PersonaEditModal 替代旧组件）、`frontend/src/pages/CharacterEditPage.jsx`（加角色状态字段 StateFieldList）、`frontend/src/components/memory/MemoryPanel.jsx`（顺序调整）；删除 `PersonaCard.jsx`、`PersonaEditor.jsx` 独立组件文件
- **注意**：PersonaCard 编辑按钮 hover 显示（`group-hover:opacity-100`）；PersonaEditModal 保存按钮统一提交 name + system_prompt；CharacterEditPage 的 StateFieldList 用 `character.world_id` 作为 worldId

## T26C — Persona 作为 World 下的一等对象 ✅
- **对外接口**：`GET/PATCH /api/worlds/:worldId/persona`；`GET/POST/PUT/DELETE /api/worlds/:worldId/persona-state-fields`、`PUT /api/worlds/:worldId/persona-state-fields/reorder`、`PUT/DELETE /api/persona-state-fields/:id`；`GET /api/worlds/:worldId/persona-state-values`
- **涉及文件**：
  - 修改：`backend/db/schema.js`（worlds 表删 persona_name/persona_prompt，新增 personas/persona_state_fields/persona_state_values 三表及索引）、`backend/db/queries/worlds.js`（移除 persona 字段）、`backend/services/worlds.js`（createWorld 时 upsert persona + 初始化 persona_state_values）、`backend/prompt/assembler.js`（[2] 改读 personas 表，[6] 新增 personaStateText 排最前）、`backend/memory/recall.js`（新增 renderPersonaState）、`backend/routes/chat.js`（runStream + /continue 两处任务链各加 persona state 更新，/impersonate 改读 personas 表）、`backend/services/import-export.js`（导出/导入新增 persona / persona_state_fields / persona_state_values 块，兼容旧格式）、`backend/server.js`（注册 3 个新路由）、`frontend/src/pages/WorldsPage.jsx`（移除旧 persona 表单字段，改为 PersonaEditor 组件，新增玩家状态字段 StateFieldList）、`frontend/src/pages/CharactersPage.jsx`（加入 PersonaCard）、`frontend/src/components/memory/MemoryPanel.jsx`（加入玩家状态区块）、`frontend/src/components/state/StateFieldList.jsx`（支持 scope='persona' 显示正确标签）
  - 新增：`backend/db/queries/personas.js`、`backend/db/queries/persona-state-fields.js`、`backend/db/queries/persona-state-values.js`、`backend/services/personas.js`、`backend/services/persona-state-fields.js`、`backend/routes/personas.js`、`backend/routes/persona-state-fields.js`、`backend/routes/persona-state-values.js`、`backend/memory/persona-state-updater.js`、`frontend/src/api/personas.js`、`frontend/src/api/personaStateFields.js`、`frontend/src/api/personaStateValues.js`、`frontend/src/components/persona/PersonaEditor.jsx`、`frontend/src/components/persona/PersonaCard.jsx`
- **注意**：persona_state_values 以 (world_id, field_key) 为主键，不绑 persona_id（每世界一 persona，world_id 已唯一）；PersonaEditor 在 WorldFormModal 内采用 onBlur 自动保存（独立 PATCH 请求）而不随世界表单一起 submit；导入世界卡时兼容旧格式（data.world.persona_name / persona_prompt），优先读 data.persona；数据库有变更需执行 `npm run db:reset`

## T26B — 世界 Prompt 条目迁移到编辑世界弹窗 ✅
- **对外接口**：无（纯 UI 迁移，后端 API 不变）
- **涉及文件**：`frontend/src/pages/CharactersPage.jsx`（删除 EntryList 区块和 import）、`frontend/src/pages/WorldsPage.jsx`（新增 EntryList import，在 StateFieldList 之上插入 EntryList 区块）
- **注意**：EntryList 在 WorldsPage 放在 `initial?.id &&` 条件块内，新建世界时不显示；位置在两个 StateFieldList 之上、`error` 信息之下

## T26A — 修复对话气泡 hover 抖动 ✅
- **对外接口**：无（纯 UI 修复）
- **涉及文件**：`frontend/src/components/chat/MessageItem.jsx`
- **注意**：删除了 `hovered` state 和 onMouseEnter/onMouseLeave 绑定；外层容器加 `group` 类；三处原 `{hovered && ...}` 条件渲染改为始终渲染 DOM，用 `opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto` 控制可见性；user 气泡时间戳用 `group-hover:opacity-40` 而非 `group-hover:opacity-100` 以匹配原视觉效果

## T25 — Slash 命令系统 ✅
- **对外接口**：`POST /api/sessions/:id/continue`（SSE 续写）、`POST /api/sessions/:id/impersonate`（返回 `{content}`）、`DELETE /api/sessions/:id/messages`（返回 `{success, firstMessage}`）、`POST /api/sessions/:id/summary`（返回 `{success}`）；前端新增 `continueGeneration`、`impersonate`、`clearMessages`、`triggerSummary` 在 `frontend/src/api/chat.js`
- **涉及文件**：修改 `backend/routes/chat.js`（+4 个端点）、`backend/services/sessions.js`（+deleteAllMessagesBySessionId、+updateMessageContent 导出）、`backend/db/queries/messages.js`（+deleteAllMessagesBySessionId）；修改 `frontend/src/api/chat.js`（实现4个占位函数）、`frontend/src/pages/ChatPage.jsx`（+续写/代入/重试/清空/摘要 handlers + toast + fillText）、`frontend/src/components/chat/InputBox.jsx`（+Slash命令浮层 + 激活 Continue/Impersonate 按钮）、`frontend/src/components/chat/MessageList.jsx`（+continuingMessageId/continuingText props）
- **注意**：`/continue` 后端不走 `runStream()`，单独实现 `runContinueStream` 逻辑；ai_output 规则只作用于新生成部分，再拼接原内容写库；续写期间 `generating=true` 但 `continuingMessageId` 非空，MessageList 不渲染新的 `__streaming__` 气泡，而是在原消息上追加 `continuingText`；`/impersonate` 当前从 `worlds.persona_name/persona_prompt` 读取（T26C 实现后需改从 personas 表读）；`/clear` 使用 `window.confirm()` 做二次确认；`/summary` 手动调用直接执行，不入异步队列

## T24B — 正则替换规则系统 ✅
- **对外接口**：`GET/POST /api/regex-rules`、`PUT /api/regex-rules/reorder`、`GET/PUT/DELETE /api/regex-rules/:id`（支持 `?scope=xxx&worldId=xxx` 过滤）；后端 `applyRules(text, scope, worldId)` 在 `backend/utils/regex-runner.js`；前端 `applyRules(text, scope, worldId)` + `loadRules()` + `invalidateCache()` 在 `frontend/src/utils/regex-runner.js`
- **涉及文件**：新增 `backend/db/queries/regex-rules.js`、`backend/services/regex-rules.js`、`backend/routes/regex-rules.js`、`backend/utils/regex-runner.js`、`frontend/src/api/regexRules.js`、`frontend/src/utils/regex-runner.js`、`frontend/src/components/settings/RegexRulesManager.jsx`、`frontend/src/components/settings/RegexRuleEditor.jsx`；修改 `backend/db/schema.js`（+regex_rules 表和索引）、`backend/server.js`（+1 路由）、`backend/routes/chat.js`（ai_output scope 接入 + 提前查询 session/character/world）、`backend/prompt/assembler.js`（[7] 历史消息 prompt_only scope 接入）、`frontend/src/pages/SettingsPage.jsx`（+正则替换分区）、`frontend/src/pages/ChatPage.jsx`（+loadRules 初始化 + worldId 传递）、`frontend/src/components/chat/MessageList.jsx`（+worldId prop）、`frontend/src/components/chat/InputBox.jsx`（user_input scope 接入）、`frontend/src/components/chat/MessageItem.jsx`（display_only scope 接入）
- **注意**：前端用模块级缓存（`_cachedRules`），ChatPage 挂载时调用 `loadRules()` 填充，RegexRulesManager 每次变更后调用 `invalidateCache()` + `loadRules()` 刷新；ai_output 规则仅对非 aborted（正常完成）内容生效，已中断的内容跳过处理，直接存原始内容（含 [已中断] 标记）；`world_id IS NULL` 表示全局规则，查询时用 `(world_id IS NULL OR world_id = ?)` 覆盖两类；chat.js 中 session/character/world 查询提前到 ai_output 处理之前，供后续异步任务复用，无重复查库

## bugfix — Provider 设置页追加修复 ✅
- **Embedding openai_compatible**：后端 `fetchModels` 新增对 `openai_compatible` provider 的支持（使用自定义 base_url 拉取模型列表）；前端对该 provider 显示 Base URL 输入框，切换时不清除已填写的 base_url
- **UI 整合**：全局 Prompt 条目（EntryList）移入通用配置卡片，置于全局 System Prompt 下方，不再单独成卡
- **涉及文件**：`backend/routes/config.js`、`frontend/src/pages/SettingsPage.jsx`

## bugfix — Provider 设置页两个 Bug 修复 ✅
- **Bug 1（API Key 无已配置提示）**：后端 `stripApiKeys()` 改为保留 `has_key: !!api_key` 布尔字段；前端 `ProviderSection` 据此显示 `••••••••（已配置，输入新密钥可覆盖）` placeholder，保存后通过 `onApiKeySaved` 回调同步本地 state
- **Bug 2（切换 Provider 后拉取的仍是旧模型）**：竞态条件——旧代码先 `setLlm` 触发 ModelSelector 重挂载，再 await 保存；改为 `field === 'provider'` 时先 await patchConfig 写入后端，再更新 state，确保后端 config 已更新再发起 `/models` 请求
- **涉及文件**：`backend/routes/config.js`（stripApiKeys）、`frontend/src/pages/SettingsPage.jsx`（ProviderSection + handleLlmChange + handleEmbeddingChange）

## T24A — 自定义 CSS 片段管理 ✅
- **对外接口**：`GET/POST /api/custom-css-snippets`、`PUT /api/custom-css-snippets/reorder`（body: `{items:[{id,sort_order}]}`）、`GET/PUT/DELETE /api/custom-css-snippets/:id`（PUT 白名单：name/enabled/content）；前端 `refreshCustomCss()` 在 `frontend/src/api/customCssSnippets.js`，拉取所有 enabled=1 条目拼接后写入 `<style id="we-custom-css">`
- **涉及文件**：新增 `backend/db/queries/custom-css-snippets.js`、`backend/services/custom-css-snippets.js`、`backend/routes/custom-css-snippets.js`、`frontend/src/api/customCssSnippets.js`、`frontend/src/components/settings/CustomCssManager.jsx`；修改 `backend/db/schema.js`（+custom_css_snippets 表和索引）、`backend/server.js`（+1 路由）、`frontend/src/pages/SettingsPage.jsx`（+自定义样式分区）、`frontend/src/App.jsx`（+useEffect 启动时 refreshCustomCss）
- **注意**：reorder 路由用 `{items:[{id,sort_order}]}` 格式（与 T10 characters reorder 一致，非 state-fields 的 orderedIds 格式）；enabled 字段前端发送 0/1 整数而非 boolean；refreshCustomCss() 在增/删/改/排序/启用切换后均需主动调用（CustomCssManager 内部已调用），无需 localStorage 缓存；CSS 注入完全客户端运行，不影响后端

## T23 — 角色卡 / 世界卡导入导出 ✅
- **对外接口**：`GET /api/characters/:id/export`、`POST /api/worlds/:worldId/import-character`、`GET /api/worlds/:id/export`、`POST /api/worlds/import`；前端 `downloadCharacterCard(id, filename)`、`importCharacter(worldId, data)`、`downloadWorldCard(id, filename)`、`importWorld(data)` 在 `frontend/src/api/importExport.js`
- **涉及文件**：新增 `backend/services/import-export.js`、`backend/routes/import-export.js`、`frontend/src/api/importExport.js`；修改 `backend/server.js`（+1 路由）、`frontend/src/pages/CharacterEditPage.jsx`（导出按钮）、`frontend/src/pages/CharactersPage.jsx`（导入角色卡按钮）、`frontend/src/pages/WorldsPage.jsx`（导出按钮 + 导入世界卡按钮）
- **注意**：导出含头像时使用 `avatar_base64` + `avatar_mime` 字段（非 SCHEMA 示例中的简单 null），导入时解码写文件到 `/data/uploads/avatars/`；导入角色卡时 character_state_values 中 field_key 不在目标世界 character_state_fields 中的条目会被静默跳过；导入世界卡时 world_state_values 中 field_key 不在本次导入的 world_state_fields 中的条目同样跳过；整个导入操作在同一 better-sqlite3 transaction 内执行，任何步骤失败自动回滚；服务层直接用 `db.prepare()` 而未走 queries 层封装（因为批量 insert 操作不在现有 queries 函数中）

## T22 — 前端记忆面板 ✅
- **对外接口**：`GET /api/worlds/:worldId/state-values`、`GET /api/characters/:characterId/state-values`、`GET /api/worlds/:worldId/timeline?limit=50`
- **涉及文件**：新增 `backend/db/queries/world-state-values.js`（`getWorldStateValuesWithFields`）、`character-state-values.js`（`getCharacterStateValuesWithFields`）；新增路由 `backend/routes/world-state-values.js`、`character-state-values.js`、`world-timeline.js`；新增前端 `api/worldStateValues.js`、`characterStateValues.js`、`worldTimeline.js`、`components/memory/MemoryPanel.jsx`；修改 `backend/server.js`（+3 路由）、`frontend/src/pages/ChatPage.jsx`（嵌入 MemoryPanel）
- **注意**：MemoryPanel 接收 `worldId`（来自 `character.world_id`）和 `characterId` 两个 prop，仅当 `character` 已加载时渲染；三块数据各自独立 loading/error 状态；`value_json` 为 null 时显示破折号不崩溃；boolean 类型转"是"/"否"；is_compressed=1 的时间线条目以灰色斜体「早期历史」前缀展示

## T21 — 记忆召回与状态注入 ✅
- **对外接口**：`renderWorldState(worldId)`、`renderCharacterState(characterId)`、`renderTimeline(worldId, limit)` —— 均在 `backend/memory/recall.js`
- **涉及文件**：新增 `backend/memory/recall.js`；修改 `backend/prompt/assembler.js`（[6] 位置填入）
- **注意**：用原始 SQL JOIN 查询（world_state_fields LEFT JOIN world_state_values，character_state_fields LEFT JOIN character_state_values），不走各自的 queries 封装，避免二次遍历；value_json 经 JSON.parse 后转 String 展示，null 值行跳过（不渲染）；时间线取最近 WORLD_TIMELINE_RECENT_LIMIT 条（seq DESC LIMIT），rows.reverse() 后正序展示；全部为空时 [6] 不向 systemParts 追加任何内容

## T20 — 对话后异步追加世界时间线 ✅
- **对外接口**：`appendWorldTimeline(sessionId)`（优先级 4，可丢弃）
- **涉及文件**：新增 `backend/db/queries/world-timeline.js`、`backend/memory/world-timeline.js`；修改 `backend/routes/chat.js`（+import `appendWorldTimeline`、`clearPending`，runStream 加优先级 4 入队，regenerate 加 `clearPending(sessionId, 4)`）
- **注意**：读取 session summary（`getSummaryBySessionId`），summary 为空则直接返回不调用 LLM；LLM 返回 JSON 数组，过滤非字符串/空字符串后批量插入；seq 在事务内取 `MAX(seq)+1` 原子递增，保证全局单调；压缩触发条件：插入后总条数 > `WORLD_TIMELINE_MAX_ENTRIES`（200）；压缩取最早 `WORLD_TIMELINE_COMPRESS_THRESHOLD`（50）条，LLM 生成摘要后以 `is_compressed=1`、`minSeq` 替换；regenerate 时调用 `clearPending(sessionId, 4)` 丢弃尚未开始的时间线任务

## T19D — 对话后按配置异步更新世界状态与角色状态 ✅
- **对外接口**：`updateCharacterState(characterId, sessionId)`（优先级 2，不可丢弃）；`updateWorldState(worldId, sessionId)`（优先级 3，不可丢弃）
- **涉及文件**：新增 `backend/memory/character-state-updater.js`、`backend/memory/world-state-updater.js`；修改 `backend/routes/chat.js`（+imports，runStream 任务链扩展）
- **注意**：只处理 `update_mode=llm_auto` 字段；trigger_mode 过滤：manual_only 跳过，every_turn 每轮，keyword_based 近 `PROMPT_ENTRY_SCAN_WINDOW` 条消息内命中关键词才参与；LLM 返回 JSON patch（只含变化字段），空对象 `{}` 表示无变化；类型校验：number 允许字符串转换，boolean 支持字符串 "true"/"false"，enum 必须精确匹配 enum_options；`null` 值以 SQL NULL 写入（不做 JSON.stringify）；角色状态在 title 之后入队（同优先级 2，先入先出），世界状态优先级 3 在二者之后；state updater 内部查库获取 character/world 信息，不依赖调用方传入

## T19C — 新建世界/角色时自动初始化状态值 ✅
- **对外接口**：无新增接口；`services/worlds.createWorld()` 和 `services/characters.createCharacter()` 内部自动触发初始化
- **涉及文件**：修改 `backend/services/worlds.js`、`backend/services/characters.js`
- **注意**：`getInitialValueJson` 逻辑：优先用 `field.default_value`（已是 JSON 字符串）；为 null 时按 type 给默认值（text→`""`，number→`0`，boolean→`false`，enum→第一项或 null）；新建空世界时 world_state_fields 通常为空，初始化为 no-op；主要应用场景是"先建字段模板再建角色"，角色创建时自动按字段模板初始化所有 character_state_values

## T19B — 世界设置页状态字段模板配置 ✅
- **对外接口**：`GET/POST /api/worlds/:worldId/world-state-fields`、`PUT /api/worlds/:worldId/world-state-fields/reorder`、`PUT/DELETE /api/world-state-fields/:id`；角色状态字段同上（world-state-fields → character-state-fields）
- **涉及文件**：新增 `backend/services/world-state-fields.js`、`backend/services/character-state-fields.js`、`backend/routes/state-fields.js`；新增 `frontend/src/api/worldStateFields.js`、`characterStateFields.js`、`frontend/src/components/state/StateFieldEditor.jsx`、`StateFieldList.jsx`；修改 `backend/server.js`（+stateFieldsRoutes）、`frontend/src/pages/WorldsPage.jsx`（编辑世界弹窗底部嵌入两个 StateFieldList）
- **注意**：状态字段配置仅在**编辑**现有世界时显示（通过 `initial?.id` 判断），新建世界时不显示（无 worldId）；StateFieldEditor 弹窗 z-index 为 60（高于世界编辑弹窗的 50）；field_key 编辑时自动替换空格为下划线，且编辑模式下禁用（不允许修改 key）；reorder 路由必须在 `:id` 路由前注册（state-fields.js 中已保证顺序）；两套字段（world/character）共用同一组组件，通过 props 注入不同的 API 函数

## T19A — 世界/角色状态字段与状态值 queries ✅
- **对外接口**：`world-state-fields.js`（createWorldStateField/getWorldStateFieldById/getWorldStateFieldsByWorldId/updateWorldStateField/deleteWorldStateField/reorderWorldStateFields）；`character-state-fields.js`（同上，前缀 Character）；`world-state-values.js`（upsertWorldStateValue/getWorldStateValue/getAllWorldStateValues/deleteWorldStateValue）；`character-state-values.js`（同上，前缀 Character，key 为 characterId）
- **涉及文件**：新增 `backend/db/queries/world-state-fields.js`、`character-state-fields.js`、`world-state-values.js`、`character-state-values.js`；`schema.js` 和 `index.js` 无需修改（建表 SQL 早已存在）
- **注意**：`trigger_keywords`、`enum_options` 在 queries 层自动 JSON parse/stringify，调用方透明；`default_value`、`value_json` 保持原始 JSON 字符串，调用方按字段 type 自行解析；`character_state_fields` 归属于 world（不是 character），sort_order 按 world_id 分组取 MAX+1；删除 state_field 不会级联删除 state_value（两表外键指向不同父表），需业务层手动清理孤立值

## T18 — Session Summary 异步生成 ✅
- **对外接口**：新增 `backend/db/queries/session-summaries.js`（upsertSummary/getSummaryBySessionId）；新增 `backend/memory/summarizer.js`（generateSummary/generateTitle）
- **涉及文件**：新增 `backend/db/queries/session-summaries.js`、`backend/memory/summarizer.js`；修改 `backend/routes/chat.js`、`backend/services/sessions.js`（删除占位 generateSessionTitle）
- **注意**：summary（优先级1）和 title（优先级2）通过 async-queue 串行，summary 先跑完才出标题；SSE 连接保持到 generateTitle 完成后才 end（与 T11 约定一致）；title 仅当 session.title 为 NULL 时才入队；summary fire-and-forget（catch 静默）；title 生成后通过 sseSend 推送 `{type:"title_updated",title}`，若连接已关闭则跳过，前端下次读接口可得到更新的 title

## T17 — 前端：Prompt 条目管理界面 ✅
- **对外接口**：新增 `frontend/src/api/prompt-entries.js`（listGlobalEntries/listWorldEntries/listCharacterEntries/createGlobalEntry/createWorldEntry/createCharacterEntry/updateEntry/deleteEntry/reorderEntries）、`frontend/src/api/config.js`（getConfig/updateConfig/updateApiKey/updateEmbeddingApiKey/fetchModels/fetchEmbeddingModels/testConnection）
- **涉及文件**：新增 `frontend/src/components/prompt/EntryEditor.jsx`、`EntryList.jsx`、`frontend/src/pages/SettingsPage.jsx`；修改 `CharacterEditPage.jsx`（底部嵌入 character 级 EntryList）、`CharactersPage.jsx`（底部嵌入 world 级 EntryList）、`App.jsx`（+/settings 路由）、`WorldsPage.jsx`（+设置按钮）
- **注意**：keywords 字段后端返回已解析 JSON 数组（queries 层处理），前端直接使用数组；EntryList 使用原生 HTML5 draggable 拖拽排序，无额外依赖；ModelSelector 在 mount 时自动调用 loadModels，provider 或 base_url 变更时通过 key prop 强制重置；API Key 独立保存（PUT /api/config/apikey），不随其他配置一起提交；SettingsPage 中 llm/embedding 配置每项变更后立即 patch 到服务器（无"保存"按钮），通用配置（context_compress_rounds / global_system_prompt）需手动点保存

## T16 — 组装器接入对话流程 ✅
- **对外接口**：`buildContext(sessionId)` 变为 async，返回 `{ messages, overrides: { temperature, maxTokens } }`，接口形态不变
- **涉及文件**：修改 `backend/services/chat.js`（移除旧 buildContext 逻辑，改为调用 assembler）、`backend/routes/chat.js`（加 `await`）
- **注意**：services/chat.js 删掉了 getSessionById/getCharacterById/getWorldById/getMessagesBySessionId 的导入（已被 assembler 内部处理）；`readAttachmentAsDataUrl` 和 `formatMessageForLLM` 也随 buildContext 一起移出，附件处理（saveAttachments）仍保留；overrides 现在始终包含 temperature 和 maxTokens（resolved 值），不再是仅当 world 有非 null 值时才填充

## T15 — 提示词组装器 ✅
- **对外接口**：`import { buildPrompt } from './prompt/assembler.js'`（返回 `{ messages, temperature, maxTokens }`）；`import { matchEntries } from './prompt/entry-matcher.js'`（返回 `Set<entryId>`）
- **涉及文件**：新增 `backend/prompt/assembler.js`、`backend/prompt/entry-matcher.js`
- **注意**：`buildPrompt` 不含 [8] 当前用户消息，由调用方追加；[6] 为 TODO T21 占位注释；系统消息 [1-6] 合并为单个 role:system；向量匹配使用 `search(queryVector, Math.max(entries.length*3, 100))` 避免因 topK 过小漏掉目标条目，再过滤 source_id 归属；keyword 匹配为大小写不敏感子串匹配，OR 逻辑；embed 抛出时降级到关键词匹配不抛出；生成参数 `world.temperature ?? config.llm.temperature`（max_tokens 同理）

## T14 — Prompt 条目自动向量化 ✅
- **对外接口**：无新增对外接口；`prompt-entries.js` 的 create/update/delete 函数内部自动触发向量化/删除
- **涉及文件**：修改 `backend/services/prompt-entries.js`
- **注意**：create/update 后异步调用 `embed(title + ' ' + summary)`，embed 返回 null（未配置）时静默跳过；embedding_id 复用旧值做 upsert，首次创建时 `crypto.randomUUID()` 生成；embedding_id 写回数据库用直接 SQL（三张表通用），不改动 queries 层；delete 操作同步（先读 embedding_id 再删 DB 再删向量），三种条目（global/world/character）均保持一致

## T13 — Embedding 服务 ✅
- **对外接口**：`import { embed } from './llm/embedding.js'`（返回 `number[] | null`）；`import { loadStore, upsertEntry, deleteEntry, search } from './utils/vector-store.js'`
- **涉及文件**：新增 `backend/llm/embedding.js`、`backend/utils/vector-store.js`
- **注意**：embedding provider 支持 `openai`（官方）、`openai_compatible`（兼容接口，走同一套 OpenAI embeddings API，适用于 OpenRouter/硅基流动/Qwen 等）、`ollama`（本地，endpoint `/api/embeddings`）；provider 为 null 或未配置时 embed() 返回 null 不报错；向量文件不存在时自动初始化空结构；search() 跳过维度不一致条目，空库返回 []；deleteEntry 对不存在 id 静默忽略；每次 upsert/delete 都立即写回文件（同步 I/O，因 better-sqlite3 本身也是同步风格）

## T12 — Prompt 条目的增删改查（后端） ✅
- **对外接口**：`GET/POST /api/global-entries`、`GET/POST /api/worlds/:worldId/entries`、`GET/POST /api/characters/:characterId/entries`、`GET/PUT/DELETE /api/entries/:type/:id`（type=global/world/character）、`PUT /api/entries/:type/reorder`；Service 层 `import { createGlobalPromptEntry, listGlobalPromptEntries, ... } from './services/prompt-entries.js'`
- **涉及文件**：新增 `backend/db/queries/prompt-entries.js`、`backend/services/prompt-entries.js`、`backend/routes/prompt-entries.js`；修改 `backend/server.js`
- **注意**：reorder 路由必须在 `/entries/:type/:id` 前注册，否则被 :id 捕获；keywords 字段在 queries 层自动 JSON.stringify/parse，service 和路由层透明；sort_order 默认取同父级 MAX(sort_order)+1，首条为 0；reorder 时 orderedIds 第一个 sort_order=0 依次递增；world/character reorder 时 SQL 同时校验归属（WHERE id=? AND world_id=?），避免跨域误改

## T11 — 前端：对话界面 ✅
- **对外接口**：新增 `frontend/src/api/sessions.js`（getSessions/getSession/createSession/deleteSession/renameSession/getMessages/editMessage）、`frontend/src/api/chat.js`（sendMessage/stopGeneration/regenerate/editAndRegenerate/continueGeneration占位/impersonate占位）；所有 SSE 流式接口统一解析 delta/done/aborted/error/title_updated/memory_recall_start/memory_recall_done，额外增加 **onStreamEnd** 回调（流连接实际关闭时触发，晚于 done 因为 title_updated 在 done 后异步推送）
- **涉及文件**：新增 `frontend/src/components/chat/Sidebar.jsx`、`SessionItem.jsx`、`MessageList.jsx`、`MessageItem.jsx`、`InputBox.jsx`；修改 `frontend/src/pages/ChatPage.jsx`（完整三栏实现）、`frontend/src/index.css`（+typing-dot 动画）、`backend/server.js`（express.json limit 20mb）
- **注意**：SSE 流不可在 onDone 时终结——需等 onStreamEnd（流连接关闭），因为 title_updated 在 done 之后到达；MessageList/Sidebar 通过静态方法属性（appendMessage/updateMessages/updateTitle）供 ChatPage 命令式操作内部状态；MessageList 使用 `key` prop 切换会话/流结束后完整重载；react-markdown + remark-gfm 渲染 assistant 消息，代码块含复制按钮；角色头像 fallback 逻辑复用 utils/avatar.js；右栏记忆面板为 T22 占位；T25 占位按钮（续写/代入）已预留；continueGeneration/impersonate 已作占位导出

## T10 — 前端世界/角色管理页面 + 角色卡编辑页 ✅
- **对外接口**：新增后端 `PUT /api/characters/reorder`（body: `{items:[{id,sort_order}]}`）、`POST /api/characters/:id/avatar`（multipart/form-data, 字段名 avatar）；前端路由 `/` / `/worlds/:worldId` / `/characters/:characterId/edit` / `/characters/:characterId/chat`（占位）
- **涉及文件**：新增 `frontend/src/api/worlds.js`、`api/characters.js`、`store/index.js`、`utils/avatar.js`、`pages/WorldsPage.jsx`、`pages/CharactersPage.jsx`、`pages/CharacterEditPage.jsx`、`pages/ChatPage.jsx`（T11 占位）；修改 `backend/routes/characters.js`（+reorder+avatar）、`backend/services/characters.js`、`backend/db/queries/characters.js`、`backend/server.js`（+静态文件 /uploads）、`frontend/src/App.jsx`、`frontend/src/main.jsx`、`frontend/src/index.css`、`frontend/vite.config.js`（+proxy）
- **注意**：头像 avatar_path 存相对路径（如 `avatars/abc123.png`），前端拼接为 `/uploads/avatars/abc123.png`，Vite dev proxy 转发到后端；reorder 路由必须在 `/characters/:id` 前注册，否则被 :id 捕获；multer 存储目标 `/data/uploads/avatars/{characterId}.{ext}`；角色列表拖拽排序用原生 HTML5 draggable API，无额外依赖；`store/index.js` 已创建，今后锁定（CLAUDE.md 约束）

## T09 — 对话流式接口（后端） ✅
- **对外接口**：`POST /api/sessions/:sessionId/chat`（SSE）、`POST /api/sessions/:sessionId/stop`、`POST /api/sessions/:sessionId/regenerate`（SSE）
- **涉及文件**：新增 `backend/services/chat.js`、`backend/routes/chat.js`；修改 `backend/db/queries/messages.js`（+updateMessageAttachments）、`backend/services/sessions.js`（+deleteMessagesAfter）、`backend/server.js`
- **注意**：chat 路由挂载在 `/api/sessions`；SSE 事件格式：`{delta}` / `{done:true}` / `{aborted:true}` / `{type:'error',error}` / `{type:'title_updated',title}`；aborted 时在已输出内容末尾追加 `\n\n[已中断]`；buildContext 为简化版（仅拼接 world+character system_prompt + 历史消息），后续 assembler.js 接管；saveAttachments 写磁盘后自动调用 updateMessageAttachments 更新 DB，路由层无需手动更新；activeStreams Map 在 services/chat.js 维护，同一 session 新请求会 abort 旧请求；req.on('close') 监听客户端断开并触发 abort；title_updated 通过同一 SSE 连接推送（T18 实现具体生成逻辑）

## T08 — 会话和消息的增删改查（后端） ✅
- **对外接口**：`GET/POST /api/characters/:characterId/sessions`、`GET/DELETE /api/sessions/:id`、`PUT /api/sessions/:id/title`、`GET /api/sessions/:id/messages`、`POST /api/sessions/:id/messages`、`PUT /api/messages/:id`；Service 层 `import { createSession, getSessionById, ... } from './services/sessions.js'`
- **涉及文件**：新增 `backend/db/queries/sessions.js`、`backend/db/queries/messages.js`、`backend/services/sessions.js`、`backend/routes/sessions.js`；修改 `backend/server.js`
- **注意**：POST 创建会话时自动查询角色 first_message，非空则插入 role=assistant 的开场白（created_at 与会话相同）；PUT /api/messages/:id 编辑消息后自动调用 deleteMessagesAfter 删除后续消息；消息 attachments 字段在 queries 层自动 JSON.parse；touchSession 在创建消息时自动更新会话 updated_at；generateSessionTitle 已占位（T18 实现）

## T07 — 角色的增删改查（后端） ✅
- **对外接口**：`GET /api/worlds/:worldId/characters`、`POST /api/worlds/:worldId/characters`、`GET /api/characters/:id`、`PUT /api/characters/:id`、`DELETE /api/characters/:id`；Service 层 `import { createCharacter, getCharacterById, getCharactersByWorldId, updateCharacter, deleteCharacter } from './services/characters.js'`
- **涉及文件**：新增 `backend/db/queries/characters.js`、`backend/services/characters.js`、`backend/routes/characters.js`；修改 `backend/server.js`
- **注意**：createCharacter 的 sort_order 自动取当前 world 下 MAX(sort_order)+1，首个角色为 0；列表按 sort_order ASC, created_at ASC 排序；characters 路由挂载在 `/api` 下（因混合路径 `/worlds/:worldId/characters` 和 `/characters/:id`）；删除世界时角色被 SQLite 外键级联删除

## T06 — 世界的增删改查（后端） ✅
- **对外接口**：`GET /api/worlds`、`POST /api/worlds`、`GET /api/worlds/:id`、`PUT /api/worlds/:id`、`DELETE /api/worlds/:id`；Service 层 `import { createWorld, getWorldById, getAllWorlds, updateWorld, deleteWorld } from './services/worlds.js'`
- **涉及文件**：新增 `backend/db/queries/worlds.js`、`backend/services/worlds.js`、`backend/routes/worlds.js`；修改 `backend/server.js`
- **注意**：POST 创建时 name 必填，temperature 和 max_tokens 不传则默认 NULL；PUT 为部分更新（只更新传入的字段），自动刷新 updated_at；DELETE 返回 204，SQLite 外键级联自动清理子数据；updateWorld 白名单字段 name/system_prompt/persona_name/persona_prompt/temperature/max_tokens

## T05 — LLM 接入层 ✅
- **对外接口**：`import { chat, complete } from './llm/index.js'`；`chat(messages, options)` 返回 AsyncGenerator（流式），`complete(messages, options)` 返回 string（非流式）；options 可传 `{ temperature, maxTokens, model, signal }`
- **涉及文件**：新增 `backend/llm/index.js`、`backend/llm/providers/openai.js`、`backend/llm/providers/ollama.js`；修改 `backend/routes/config.js`、`SCHEMA.md`
- **注意**：provider 分三类 API 风格——OpenAI-compatible（openai/openrouter/glm/kimi/minimax/deepseek/grok/siliconflow）、Anthropic 原生 Messages API、Gemini 原生 generateContent API；本地 provider（ollama/lmstudio）走 OpenAI-compatible；重试逻辑在 index.js 统一处理，AbortError 和 4xx（非 429）不重试，流式已输出内容后不重试；消息格式转换（多模态图片等）在 provider 内部完成，上层无需感知；routes/config.js 的 fetchModels 已补齐所有新 provider 支持

## T04 — 全局配置读写 ✅
- **对外接口**：`import { getConfig, updateConfig } from './services/config.js'`；路由 `GET/PUT /api/config`、`PUT /api/config/apikey`、`PUT /api/config/embedding-apikey`、`GET /api/config/models`、`GET /api/config/embedding-models`、`GET /api/config/test-connection`
- **涉及文件**：新增 `backend/services/config.js`、`backend/routes/config.js`；修改 `backend/server.js`
- **注意**：GET/PUT /api/config 响应中自动剥离 `llm.api_key` 和 `embedding.api_key`，api_key 只能通过专用 PUT 接口更新；config.json 不存在时自动初始化默认结构；updateConfig 做深度合并而非整体替换；Anthropic 模型列表为硬编码；test-connection 始终返回 HTTP 200（前端判断 success 字段），models 拉取失败返回 HTTP 502

## T03 — 基础工具文件 ✅
- **对外接口**：`import { XXX } from './utils/constants.js'`；`import { enqueue, clearPending } from './utils/async-queue.js'`；`import { countTokens, countMessages } from './utils/token-counter.js'`
- **涉及文件**：新增 `backend/utils/constants.js`、`backend/utils/async-queue.js`、`backend/utils/token-counter.js`
- **注意**：constants.js 是所有硬性数值的唯一来源（CLAUDE.md 锁定文件），其他模块禁止硬编码数字；async-queue 按 sessionId 分组串行，`clearPending(sessionId, minPriority)` 可批量丢弃低优先级待处理任务；token-counter 是纯估算（中文 0.5、其他 0.25），无外部依赖

## T02 — 数据库建表 ✅
- **对外接口**：`import db from './db/index.js'` 获取 better-sqlite3 实例；`import { initSchema } from './db/schema.js'` 执行建表
- **涉及文件**：新增 `backend/db/index.js`、`backend/db/schema.js`；修改 `backend/server.js`
- **注意**：`db/index.js` 打开 `/data/worldengine.db` 并执行 `PRAGMA foreign_keys = ON`；`schema.js` 此文件后续不得随意修改（CLAUDE.md 锁定文件）；server.js 启动时自动调用 `initSchema(db)`

## T01 — 项目骨架初始化 ✅
- **对外接口**：前端 `cd frontend && npm run dev`（:5173）；后端 `cd backend && npm run dev`（:3000）
- **涉及文件**：`frontend/`（Vite + React + TailwindCSS）、`backend/`（Express + ES Modules + better-sqlite3）、`data/`（uploads/avatars、uploads/attachments、vectors）、`.gitignore`
- **注意**：后端 `server.js` 启动时自动 `mkdirSync` 创建 `/data/` 子目录；`data/.gitignore` 只跟踪 `.gitkeep` 占位文件；后端 `package.json` 设 `"type": "module"` 使用 ES Modules
