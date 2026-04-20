# Changelog

> 每次任务完成后，在最上方追加一条记录。这是项目的"记忆"，给自己和 AI 看。  
> 新开对话时让 Claude Code 先读此文件，了解项目现状。

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

<!-- 任务记录从下方开始，最新的放最上面 -->

## T120 — refactor: Copy-Paste 重复代码消除（CP-1 至 CP-7）✅
- **对外接口**：所有 named export 保持不变，行为不变
- **涉及文件**：
  - 新增：`frontend/src/api/request.js` — 统一 fetch 封装（CP-1）；含 Content-Type 注入、错误抛出、204 返回 null
  - 修改：`frontend/src/api/characters.js`、`worlds.js`、`config.js`、`prompt-entries.js`、`importExport.js` — 删除各自内联 `request()` 实现，改用 `./request.js`（CP-1）
  - 新增：`frontend/src/api/stateFieldsFactory.js` — 状态字段三件套 CRUD 工厂（CP-2）
  - 修改：`frontend/src/api/worldStateFields.js`、`characterStateFields.js`、`personaStateFields.js` — 改用工厂，各文件缩减到 8 行，named export 不变（CP-2）
  - 修改：`frontend/src/api/regexRules.js`、`customCssSnippets.js` — 内联 fetch 替换为 `request()`（CP-3）
  - 新增：`frontend/src/components/state/StateValueField.jsx` — 从 WorldEditPage/CharacterEditPage 提取，props `{ field, onSave }` 不变（CP-4）
  - 修改：`frontend/src/pages/WorldEditPage.jsx`、`CharacterEditPage.jsx` — 删除内联 StateValueField 定义，改 import（CP-4）
  - 新增：`backend/db/queries/_state-fields-base.js` — `parseRow` / `parseAll` 共享实现（CP-5）
  - 修改：`backend/db/queries/world-state-fields.js`、`character-state-fields.js`、`persona-state-fields.js` — 删除内联 parseRow/parseAll，改 import（CP-5）
  - 新增：`backend/services/_state-field-helpers.js` — `getInitialValueJson` 共享实现（CP-7）
  - 修改：`backend/services/world-state-fields.js`、`character-state-fields.js`、`persona-state-fields.js` — 删除内联 getInitialValueJson，改 import（CP-7）
- **注意**：
  - CP-6（20+ 路由文件 404 检测模式）按要求跳过
  - `importExport.js` 原 `request()` 缺少 204 分支；迁移后自动获得，无副作用
  - `regexRules.js` / `customCssSnippets.js` 的 list 函数 URL 构造（URLSearchParams）无法工厂化，保留原逻辑，只替换内部 fetch
  - `refreshCustomCss` 内部调用 `listSnippets`，无 fetch，不需改动

## T119 — docs: 将现有代码规范收敛进 CLAUDE / ARCHITECTURE ✅
- **对外接口**：不新增新规范文件；代码规范继续内嵌在 `CLAUDE.md` / `ARCHITECTURE.md` 中维护
- **涉及文件**：`CLAUDE.md`、`ARCHITECTURE.md`、`CHANGELOG.md`
- **注意**：本次只提炼项目已经在执行的分层和验证规则，不引入与现有代码风格并行的新规范体系；高层硬约束写入 `CLAUDE.md`，模块落点规则写入 `ARCHITECTURE.md`

## T117 — chore: 可维护性修复（M2/M3/M4/M6）✅
- **对外接口**：无变化；所有 HTTP 响应语义不变
- **涉及文件**：
  - `backend/utils/constants.js` — 新增 LLM 生成参数常量（`LLM_TASK_TEMPERATURE/TITLE/TURN_SUMMARY/STATE_UPDATE/IMPERSONATE/TOOL_RESOLUTION_MAX_TOKENS`、Thinking Budget 三档）及本地服务默认地址（`OLLAMA/LMSTUDIO_DEFAULT_BASE_URL`）
  - `backend/routes/prompt-entries.js` — 响应 `{ ok: true }` 统一为 `{ success: true }`（M2）
  - `backend/memory/summarizer.js` — 引用 `LLM_TASK_TEMPERATURE`、`LLM_TITLE_MAX_TOKENS`（M3）
  - `backend/memory/turn-summarizer.js` — 引用 `LLM_TASK_TEMPERATURE`、`LLM_TURN_SUMMARY_MAX_TOKENS`（M3）
  - `backend/memory/combined-state-updater.js` — 引用 `LLM_TASK_TEMPERATURE`、`LLM_STATE_UPDATE_MAX_TOKENS`（M3）
  - `backend/routes/writing.js` — 引用 `LLM_IMPERSONATE_MAX_TOKENS`（M3）
  - `backend/routes/chat.js` — 引用 `LLM_TASK_TEMPERATURE`、`LLM_TITLE_MAX_TOKENS`（M3，retitle 路由）
  - `backend/llm/providers/ollama.js` — 引用 `LLM_TOOL_RESOLUTION_MAX_TOKENS`、`OLLAMA/LMSTUDIO_DEFAULT_BASE_URL`（M3/M6）
  - `backend/llm/providers/openai.js` — 引用 `LLM_THINKING_BUDGET_*` 三档常量（M3）
  - `backend/llm/embedding.js` — 引用 `OLLAMA_DEFAULT_BASE_URL`（M6）
  - `backend/routes/config.js` — 引用 `OLLAMA/LMSTUDIO_DEFAULT_BASE_URL`（M6）
  - `backend/utils/proxy.js` — `console.log` 替换为 `createLogger('proxy').info`（M4）
  - `backend/memory/summary-expander.js` — `console.warn` 替换为 `createLogger('memory-expand').warn`（M4）
  - `backend/server.js` — 启动 `console.log` 替换为 `serverLog.info`（M4）
- **注意**：
  - M1（routes/*-state-values.js 缺 return）在本次任务开始前已修复，跳过
  - M5（activeStreams 清理机制）按要求跳过，不处理
  - M7（前端 api/ 命名规范）重命名会破坏 import，跳过
  - M8（proxy.js 配置边界）server.js 已通过参数传入 proxyUrl，proxy.js 本身不需要读 config，无需改动
  - `{ ok: true }` 仅在 prompt-entries reorder 端点出现，前端 `reorderEntries()` 不读 body，兼容安全
  - `cleanup-hooks.js`、`file-cleanup.js`、`regex-runner.js`、`entry-matcher.js` 的 `console.warn` 不在 review M4 列表内，未处理

## T116 — chore: 调用链旧路径审查与 P-3 注释整理 ✅
- **对外接口**：无变化
- **涉及文件**：
  - 修改：`backend/db/queries/sessions.js` — 更新 `clearCompressedContext` JSDoc，说明 `setCompressedContext` 已删除，此函数保留仅为防御性清理
- **注意**：
  - [P-1] `triggerSummary` 死调用已在 T115 清理，本次跳过
  - [P-2] assembler.js [14] 降级路径（`getUncompressedMessagesBySessionId`）必须保留：turn records 为 Priority 3 异步生成，新会话前几轮必然触发此路径；代码中已有注释说明
  - [P-3] `clearCompressedContext` 保留：`setCompressedContext` 已删除，字段写入路径不再存在，但清空消息时仍调用此函数以清理旧用户数据库中可能残留的 `compressed_context` 值
  - [P-4] review.md 描述有误——报告将此端点标为"POST + 前端未调用"，实际为 **GET** 端点，且被 `CastPanel.jsx`、`StatePanel.jsx` 通过 `frontend/src/api/sessionTimeline.js` 活跃调用；端点为正常路径，无需处理
  - 冗余 Adapter（provider 策略模式、toolLoopExecutor、buildHistoryMessages）本批不处理，见 review.md 第 4 阶段

## T115 — chore: 死代码与失效路径清理（Session Summary 集群）✅
- **对外接口**：无变化；`generateTitle` 保留，`generateSummary` 已删除
- **涉及文件**：
  - 删除：`backend/memory/summary-embedder.js`（全文件）
  - 删除：`backend/db/queries/session-summaries.js`（全文件）
  - 修改：`backend/memory/summarizer.js` — 删除 `generateSummary` 函数及 `upsertSummary`、`ALL_MESSAGES_LIMIT` 两个死 import
  - 修改：`backend/utils/session-summary-vector-store.js` — 删除 `upsertEntry` 函数（`deleteBySessionId`/`search` 保留）
  - 修改：`backend/db/queries/messages.js` — 删除 `countUncompressedRounds`、`markAllMessagesCompressed`（旧压缩系统残留）
  - 修改：`backend/db/queries/sessions.js` — 删除 `setCompressedContext`（旧压缩系统残留，`clearCompressedContext` 保留）
  - 修改：`backend/llm/providers/openai.js` — 内联 `resolveAnthropicThinking` → `resolveThinkingBudget`，删除 `@deprecated` 别名
  - 修改：`backend/services/state-values.js` — 去掉 `validateStateValue` 的 `export`（仅内部使用）
  - 修改：`frontend/src/api/chat.js` — 删除 `triggerSummary` 函数（对应后端路由不存在）
  - 修改：`frontend/src/pages/ChatPage.jsx` — 删除 `triggerSummary` import、`handleManualSummary` 函数、`onSummary` prop
- **注意**：
  - `cleanup-registrations.js` 的 Session Summary 向量清理钩子（`deleteBySessionId`）仍保留——旧用户磁盘上可能有 `data/vectors/session_summaries.json`，清理钩子确保删 session 时向量条目同步清除；但注释仍写"模块：summary-embedder"已不准确，下次触碰该文件时更新
  - `db/schema.js` 中 `session_summaries` 表 DDL 保留（旧数据库用户有存量数据）
  - 审查记录 `markMessagesAsCompressed` 为误写，实际函数名为 `markAllMessagesCompressed`，两者均已删除
  - `InputBox` 组件通过可选链 `onSummary?.()` 调用，去掉 prop 后 `/summary` 命令静默忽略，无报错

## T114 — docs: CHANGELOG 历史标题标准化 ✅
- **对外接口**：`CHANGELOG.md` 全文件标题统一向 `T### — type: 标题 ✅` 靠拢；历史无编号记录补充为可追踪任务号或子编号
- **涉及文件**：`CHANGELOG.md`
- **注意**：本次只标准化标题，不改历史正文内容；保留 `T59A`、`T88b`、`T103/T104` 这类已有复合编号，避免破坏旧引用

## T113 — docs: 根目录文档治理规范收敛 ✅
- **对外接口**：根目录文档系统统一采用“`CLAUDE.md` 入口规范 / `SCHEMA.md` 数据权威 / `ARCHITECTURE.md` 运行时权威 / `CHANGELOG.md` 历史决策”四分工；`CHANGELOG.md` 新增 `T### — type: 标题` 记录规范
- **涉及文件**：`CLAUDE.md`、`SCHEMA.md`、`ARCHITECTURE.md`、`CHANGELOG.md`
- **注意**：`CLAUDE.md` 不再重复维护易漂移的运行时细节；`SCHEMA.md` 导入导出示例已从旧 `summary` 收敛到 `description`；`ARCHITECTURE.md` 明确只描述当前行为，不承担 schema/规则权威职责

## T105 — docs: 根目录文档入口收敛（CLAUDE 主体 / AGENTS 镜像） ✅
- **对外接口**：`CLAUDE.md` 成为根目录唯一入口正文；`AGENTS.md` 改为镜像入口，只负责把通用 agent 导向 `CLAUDE.md`
- **涉及文件**：`CLAUDE.md`、`AGENTS.md`、`CHANGELOG.md`
- **注意**：以后修改入口规范时只改 `CLAUDE.md`，不要再维护两份等价正文；字段看 `SCHEMA.md`，运行时行为看 `ARCHITECTURE.md`，历史坑点看 `CHANGELOG.md`

## T106 — perf: 前端首包拆分（路由 / 助手 / 编辑器） ✅
- **对外接口**：无 API 变更；前端行为保持不变，页面、写卡助手和 Markdown 编辑器改为按需加载
- **涉及文件**：`frontend/src/App.jsx`、`frontend/src/components/ui/MarkdownEditor.jsx`、`frontend/src/components/ui/MarkdownEditorInner.jsx`、`ARCHITECTURE.md`
- **注意**：`AssistantPanel` 仅在首次打开助手后才加载；`MarkdownEditor` 变为轻量包装层，Tiptap 依赖只在进入编辑场景时拉取；抽屉路由仍保留背景页，只是目标页改为 lazy

## T107 — feat: Prompt 条目关键词范围改为双勾选 ✅
- **对外接口**：`keyword_scope` 不再使用 `"both"`；合法值改为 `"user"` / `"assistant"` / `"user,assistant"`；前端 Prompt 条目编辑器改为两个复选框，两个都勾选即双向触发
- **涉及文件**：`frontend/src/components/prompt/EntryEditor.jsx`、`EntryList.jsx`、`backend/prompt/entry-matcher.js`、`backend/db/queries/prompt-entries.js`、`backend/routes/prompt-entries.js`、`backend/db/schema.js`、`backend/services/import-export.js`、`SCHEMA.md`、三个 assistant prompt
- **注意**：后端继续兼容旧库里的 `"both"` 并在读写时归一化为 `"user,assistant"`；关键词兜底只扫描 user / assistant 消息，不再把 system 文本混进双向匹配；角色卡/世界卡/全局设置导入同时兼容旧导出的 `summary` 和旧 `keyword_scope`

## T108 — feat: Prompt 条目 LLM 触发 + 关键词 scope ✅
- **对外接口**：`matchEntries(sessionId, entries)` 签名不变；assembler.js [8-10] 注入格式变为：`[条目触发索引]`（全量 description）+ 触发条目的 `【标题】\n正文`
- **涉及文件**：`backend/prompt/entry-matcher.js`（完整重写）、`backend/prompt/assembler.js`（[8-10] 段两处）、`backend/memory/summary-expander.js`（decideExpansion 改为内部取 1 轮上文）、`backend/services/prompt-entries.js`（移除 vectorize）、`backend/db/queries/prompt-entries.js`、`backend/db/schema.js`、`backend/utils/constants.js`、`frontend/src/components/prompt/EntryEditor.jsx`、三个写卡 prompt md
- **Schema 变更**：三张 prompt_entries 表：`summary` RENAME → `description`，新增 `keyword_scope TEXT DEFAULT 'both'`；`embedding_id` 字段随数据库迁移保留（旧库），新建库无此字段
- **注意**：description 全量注入主 LLM system prompt（格式：[条目触发索引]），pre-flight llm.complete() 用最近 1 轮上文（1 user+1 assistant）判断触发；LLM 失败降级为纯关键词匹配；keyword_scope 控制关键词匹配范围（'both'/'user'/'assistant'）；decideExpansion（摘要展开）也改为自行取 1 轮上文，不再依赖 recall.js 传入

## T109 — refactor: OptionCard 风格修复 ✅
- **风格**：OptionCard.jsx 重写用 Tailwind + CSS 类（`.we-option-btn`/`.we-option-dismiss` 加入 ui.css），移除 onMouseEnter/Leave JS hover
- **注意**：选项生成仍走 assembler.js [15] 注入 SUGGESTION_PROMPT 方案（保留完整上下文），chat/regenerate/writing 所有路径均注入

## T110 — feat: 选项功能（Next Prompt Suggestions） ✅
- **对外接口**：全局设置 `suggestion_enabled`（对话）/ `writing.suggestion_enabled`（写作）；后端 `done` SSE 事件新增 `options: string[]` 字段
- **涉及文件**：
  - `backend/utils/constants.js`（新增 `SUGGESTION_PROMPT`）
  - `backend/utils/turn-dialogue.js`（新增 `extractNextPromptOptions`）
  - `backend/services/config.js`（新增两个 boolean 字段）
  - `backend/prompt/assembler.js`（[15] 段条件注入，改动只在段内容，不改顺序）
  - `backend/routes/chat.js` / `writing.js`（提取选项、done 事件携带 options）
  - `frontend/src/api/chat.js` / `writingSessions.js`（onDone 增加 options 参数）
  - `frontend/src/components/chat/OptionCard.jsx`（新建）
  - `frontend/src/pages/ChatPage.jsx` / `WritingSpacePage.jsx`（pendingOptionsRef + currentOptions 状态管理）
  - `frontend/src/pages/SettingsPage.jsx`（两个 toggle 开关）
- **注意**：
  - `<next_prompt>` 标签在 `extractNextPromptOptions` 中被剥除，**不保存进 DB**；选项只在当轮 done 事件返回时展示，刷新后消失
  - 续写（`/continue`）路由不生成选项，`handleContinue` 开头主动 `setCurrentOptions([])` 清空上一轮残留
  - `makeCallbacks`/`makeStreamCallbacks` 开头重置 `pendingOptionsRef.current = []`，防止连接断开（AbortError）后残留选项在下一轮错误显示
  - OptionCard 的 hover 效果用 JS onMouseEnter/Leave 内联修改 style（已知技术债，项目约定要求 Tailwind，暂未重构）

## T111 — bugfix: decideExpansion & generateTitle <think> 污染修复 ✅
- **涉及文件**：`backend/memory/summary-expander.js`、`backend/memory/summarizer.js`
- **注意**：
  - `decideExpansion`：`cleaned` 只去 `` ```json `` 包裹而未剥 `<think>` 标签，导致 JSON.parse 报错并降级为不展开。修复：在去 `` ```json `` 前先 strip `<think>` 推理链。
  - `generateTitle`：`stripThinkTags` 已存在，但模型输出全为 `<think>` 内容时剥完为空字符串，仍会调用 `updateSessionTitle("")` 写坏标题。修复：剥除后若为空直接 `return null`，保留 NULL 供下次重试。

## T112 — bugfix: 时间线实时更新 & 摘要清洁 ✅
- **涉及文件**：`frontend/src/components/book/StatePanel.jsx`、`backend/memory/turn-summarizer.js`
- **注意**：
  - 时间线（优先级3任务）在状态更新（优先级2任务）之后才完成；旧轮询逻辑在检测到状态变化时立即 `clearInterval`，导致时间线更新被漏掉。修复：改为 `let currentSnapshot` 并在每次变化时更新快照，继续轮询至 30s 超时，不提前停止。
  - 摘要生成时 LLM 可能输出 `<think>...</think>` 推理链和 `**摘要：**` 等前缀。修复：在 `raw` 后追加 `.replace(/<think>[\s\S]*?<\/think>\n*/g, '').replace(/<think>[\s\S]*$/, '').replace(/^\s*\*{1,2}[^*\n]{0,20}[：:]\*{0,2}\s*/u, '').trim()`；同时在 prompt 中明确指示不加标题前缀。

## T103/T104 — refactor: 时间线重构 & 状态栏会话级隔离 ✅

### 时间线重构
- **删除** `world_timeline` 表及所有遗留代码：`context-compressor.js`、`world-timeline.js` 路由/queries、`worldTimeline.js` API、`MemoryPanel.jsx`（死代码）
- **删除** `/api/sessions/:id/summary` 路由（`/summary` 接口）
- **新增** `GET /api/sessions/:sessionId/timeline`：返回当前会话近5轮 turn_records 摘要
- prompt [11] 段从 `renderTimeline(worldId)` 改为 `renderTimeline(sessionId)`，数据来源改为当前会话 turn_records
- 前端 `sessionTimeline.js` 对应新接口；写作空间 StatePanel / CastPanel TIMELINE section 改为实时显示当前会话摘要

### 状态栏会话级隔离
- **新增3张表**：`session_world_state_values`、`session_persona_state_values`、`session_character_state_values`，均有 `session_id ON DELETE CASCADE`
- 状态运行时值读写改为会话级，新建会话从全局默认值（`*_state_values.default_value_json`）开始，各会话独立
- 值优先级（COALESCE）：`session_*_state_values.runtime_value_json` > `*_state_values.default_value_json` > `*_state_fields.default_value`
- **新增路由** `session-state-values.js`：`GET /:sessionId/state-values`（world/persona/character 三合一）、各 `DELETE` 重置接口、`GET /:sessionId/characters/:characterId/state-values`
- `combined-state-updater.js` 改为写 `session_*_state_values` 表
- 消息回滚（删除消息）时同步清空该会话三张 session 状态表并删除超出轮次的 turn_records
- 前端 `sessionStateValues.js` 对应新接口

### 涉及文件
- **删除**：`backend/memory/context-compressor.js`、`backend/memory/world-timeline.js`、`backend/routes/world-timeline.js`、`backend/db/queries/world-timeline.js`、`frontend/src/api/worldTimeline.js`、`frontend/src/components/memory/MemoryPanel.jsx`
- **新增**：`backend/routes/session-timeline.js`、`backend/routes/session-state-values.js`、`backend/db/queries/session-world-state-values.js`、`backend/db/queries/session-persona-state-values.js`、`backend/db/queries/session-character-state-values.js`、`frontend/src/api/sessionTimeline.js`、`frontend/src/api/sessionStateValues.js`

### 注意
- `renderTimeline` 签名从 `(worldId)` 改为 `(sessionId)`，调用方需更新
- 状态重置 API 现在针对会话级，不影响全局默认值层（`*_state_values.default_value_json`）
- 三张 session 状态表均用 `CREATE TABLE IF NOT EXISTS` 追加，不重建现有表

## T102 — refactor: 写卡助手重构：单代理 + Agent Skill 架构 ✅
- **对外接口**：
  - 架构变更：取消子代理模式，改为主代理 + Agent Skill（skill-as-tool）架构
  - `assistant/server/main-agent.js`：`export async function* runAgent(message, history, context, tools)`
  - `assistant/server/skill-factory.js`：`createSkillTool(def, skillCtx)` — 按请求绑定 SSE/proposalStore/context
  - `assistant/server/tools/card-preview.js`：`createPreviewCardTool(context)` — preview_card tool 工厂
  - `assistant/server/tools/extract-json.js`：从 sub-agents/ 迁移到 tools/
  - `assistant/server/skills/index.js`：`ALL_SKILLS` 数组，包含 6 个 skill 定义
  - `assistant/CONTRACT.md`：重写，移除子代理路由 schema，新增 skill tool 说明和 operation 约束表
- **涉及文件**：
  - 新增：`assistant/server/main-agent.js`（完整重写）、`assistant/server/skill-factory.js`、`assistant/server/tools/card-preview.js`、`assistant/server/tools/extract-json.js`、`assistant/server/tools/project-reader.js`、`assistant/server/skills/`（6 个 skill + index）
  - 修改：`assistant/server/routes.js`（完整重写）、`assistant/prompts/main.md`、`assistant/prompts/sub-*.md`（移除静态注入占位符，改为引导调用 preview_card）、`assistant/CONTRACT.md`
  - 删除：`assistant/server/sub-agents/`（整目录删除：world-card、character-card、persona-card、global-prompt、css-snippet、regex-rule、css-regex、extract-json）
- **注意**：
  - skill LLM 现通过 `preview_card` tool 按需获取实体数据，不再静态注入 `{{WORLD_DATA}}` 等占位符
  - `resolveToolContext`（非流式工具循环）+ `llm.chat`（流式）两阶段，skill 在工具循环阶段执行并通过 SSE 发送提案
  - `preview_card` 和 skill tools 是按请求创建的闭包，绑定 `res`/`proposalStore`/`context`/`normalizeProposal`
  - openai.js Anthropic/Gemini provider 的 loop-exhaustion fallback 修复：改用 `currentMessages`（含工具结果）而非原始 `messages`

## T101 — feat: 全链路日志增强（metadata/raw 双模式） ✅
- **对外接口**：
  - `data/config.json` 新增 `logging` 配置块：`mode: "metadata" | "raw"`、`max_preview_chars`、`prompt.enabled`、`llm_raw.enabled`
  - `backend/utils/logger.js` 新增 `getLoggingConfig()`、`shouldLogRaw()`、`previewText()`、`previewJson()`、`formatMeta()`、`summarizeMessages()`
- **涉及文件**：
  - `backend/services/config.js` — 补 `logging` 默认配置，并把旧 `log_prompt` 自动迁移到 `logging.prompt.enabled`
  - `backend/utils/logger.js` — 从纯终端/file logger 扩展为“配置驱动的 metadata/raw preview logger”
  - `backend/routes/config.js` — 记录配置 patch 字段、日志模式切换、模型列表拉取结果
  - `backend/llm/index.js` — 记录 chat/complete 的 START/RETRY/DONE，raw 模式下附截断 preview
  - `backend/routes/chat.js` / `backend/routes/writing.js` — 记录 request start、context/prompt ready、SSE 关键事件、queue 入队、continue/regenerate 分支
  - `assistant/server/routes.js` + `assistant/server/sub-agents/*.js` — 记录 assistant route/task/proposal/execute 全链路，以及各子代理 START/RAW/RETRY/DONE/FAIL
  - `backend/memory/combined-state-updater.js` / `turn-summarizer.js` — 记录状态更新、turn summary、JSON parse fail、embedding 结果
  - `CLAUDE.md` / `AGENTS.md` / `ARCHITECTURE.md` — 补充 `logging` 配置说明
- **注意**：
  - 默认仍是 metadata-only，不会把 prompt/模型原文全文落盘；只有 `logging.mode="raw"` 且相应开关打开时才写截断 preview
  - `logPrompt()` 不再直接看旧 `config.log_prompt`；兼容迁移仍保留，旧配置会被自动收敛到新结构
  - assistant SSE 的 `delta`/`thinking` 仍不逐条刷日志，避免日志洪水；重点只记 routing/proposal/error/done 等高价值节点

## T100 — refactor: 写卡助手路由/Prompt/契约硬化 ✅
- **对外接口**：
  - `assistant/CONTRACT.md` — 写卡助手唯一契约文档；集中定义 `/api/assistant/chat`、SSE 事件、主代理路由 JSON、6 类 proposal schema、`/api/assistant/execute`
  - 公开子代理 target 固定为：`world-card`、`character-card`、`persona-card`、`global-prompt`、`css-snippet`、`regex-rule`
- **涉及文件**：
  - `assistant/server/main-agent.js` — ROUTING_SYSTEM 重写为“执行判定→目标选择→字段补全”；新增路由结果归一化，非法 action/target/task 自动降级 `respond`
  - `assistant/server/routes.js` — 新增 proposal schema 归一化与白名单校验；编辑后的 proposal 重新走归一化；`regex-rule` 执行时补齐 `enabled`
  - `assistant/server/sub-agents/extract-json.js` — 从“最后一个 }”改为：剥离 think → 试整段/代码块 → 扫描顶层对象；支持 `prefer:first|last`
  - `assistant/server/sub-agents/world-card.js` / `character-card.js` / `persona-card.js` / `global-prompt.js` — JSON 解析失败时追加一次“只重发合法对象”的低温修复重试
  - `assistant/prompts/sub-*.md` — 6 个子代理 prompt 全部重写为单职责 + 单一输出 schema，并补正反例与写卡最佳实践
  - `CLAUDE.md` / `AGENTS.md` / `ARCHITECTURE.md` — 补写 `assistant/CONTRACT.md` 与 `/api/assistant` 路由说明
- **注意**：
  - `assistant/server/sub-agents/css-regex.js` 仍保留为 legacy 兼容文件，但不再是公开 target；新 prompt/契约只认 `css-snippet` 与 `regex-rule`
  - `persona-card` 禁止 `entryOps`；`global-config` 禁止 `entityId/stateFieldOps`；`css-snippet` / `regex-rule` 固定 `create`
  - `editedProposal` 现在只能覆盖 `changes/entryOps/stateFieldOps`，其余顶层字段继续由 token 锚定，避免前端编辑把 type/operation/entityId 改脏
  - T100 后续补丁：`assistant/server/main-agent.js` 新增 `as-route` 日志（RAW / DONE / FAIL / FALLBACK）；当路由模型输出非法 JSON 或误回 `respond` 时，会对“regex + css 混合需求”做启发式兜底，例如“美化 `<think>` + 丧尸末日风动效”强制落为 `multi-delegate(regex-rule + css-snippet)`
  - T100 后续补丁 2：`assistant/server/sub-agents/css-snippet.js` / `regex-rule.js` 兼容旧输出格式；若模型直接返回顶层 `content/pattern/...` 而非嵌套在 `changes` 中，子代理会自动折叠成新契约格式，避免被 `提案格式错误：css-snippet.changes.content 不能为空` 拒绝

## T99 — feat: 完整日志系统 ✅
- **对外接口**：
  - 环境变量 `LOG_LEVEL=debug|info|warn|error`（终端，默认 warn）
  - 环境变量 `LOG_FILE=false`（关闭文件写入，默认开启）
  - 环境变量 `LOG_FILE_LEVEL=debug|info|warn|error`（文件，默认 info）
  - `createLogger(tag, color?)` — 新增可选第二参数指定 tag 颜色（cyan/magenta/green/yellow）
  - 日志文件路径：`data/logs/worldengine-YYYY-MM-DD.log`（按日轮换，`data/.gitignore` 已覆盖）
  - 推荐启动方式：`LOG_LEVEL=info npm run dev`（看完整链路）；`LOG_LEVEL=debug` 看 prompt 组装细节
- **涉及文件**：
  - `backend/utils/logger.js` — 新增文件写入（ANSI 剥离、按日轮换、setImmediate 批量非阻塞）；新增每级别行首图标（◆ · ▲ ✖）；tag 统一 8 字符对齐；createLogger 支持可选颜色参数
  - `backend/server.js` — dataDirs 添加 `data/logs`；新增 HTTP 请求日志中间件（info 级，不记录请求体）
  - `backend/prompt/assembler.js` — buildPrompt / buildWritingPrompt 添加 `┌─`/`│`/`└─` 分组日志（START、entries、recall、expand、history、DONE）
  - `backend/routes/chat.js` — runStream 添加 `▶`/`■` 流式日志；chat/regenerate/continue 路由各添加一行 info 日志
- **注意**：
  - assembler.js 是锁定文件，此次修改仅添加 log 调用，组装顺序/逻辑未变
  - 文件日志写入独立于终端级别（LOG_FILE_LEVEL），可同时设 LOG_LEVEL=warn（终端安静）+ LOG_FILE_LEVEL=info（文件完整记录）

## T98 — feat: 思考链配置与渲染 ✅
- **对外接口**：
  - `GET /api/config/models` — 额外返回 `thinkingOptions: [{value, label}]`（provider 级别，anthropic/openai 有值，其他为空数组）
  - `config.llm.thinking_level` — 选中的级别（`null`=auto；`budget_low/medium/high`=Anthropic；`effort_low/medium/high`=OpenAI）
  - `config.ui.show_thinking` — 是否渲染 `<think>` 标签（默认 `true`）
  - `useDisplaySettingsStore` — 前端 Zustand store（`showThinking / setShowThinking`），位于 `frontend/src/store/displaySettings.js`
- **涉及文件**：
  - `backend/services/config.js` — DEFAULT_CONFIG.llm 加 `thinking_level: null`；ui 加 `show_thinking: true`
  - `backend/routes/config.js` — 新增 `getThinkingOptions(provider)`；models 接口返回 `thinkingOptions`
  - `backend/llm/index.js` — `buildLLMConfig` 传递 `thinking_level`
  - `backend/llm/providers/openai.js` — Anthropic：流式/非流式处理 thinking 块，包裹 `<think>`；OpenAI-compat：`reasoning_effort` 参数；两者有 thinking/effort 时不传 temperature
  - `frontend/src/store/displaySettings.js` — **新建**，全局 showThinking Zustand store
  - `frontend/src/App.jsx` — mount 时拉取 config 初始化 showThinking
  - `frontend/src/pages/SettingsPage.jsx` — ModelSelector 加 `onThinkingOptionsLoaded`；ProviderBlock 加 thinking level 下拉；LlmSection 加"渲染思考链"开关
  - `frontend/src/components/chat/MessageItem.jsx` — `parseThinkBlocks()`/`stripThinkContent()`/`ThinkBlock` 组件；非流式时按 block 渲染；流式时剥除/直通
  - `frontend/src/components/writing/WritingMessageItem.jsx` — 同上
- **注意**：
  - Anthropic extended thinking 要求 `anthropic-beta: interleaved-thinking-2025-05-14` header，且不能传 temperature
  - OpenAI reasoning_effort 同样不传 temperature（部分 o-series 模型不兼容）
  - thinking_level 选项与 provider 绑定，切换 provider 后旧 thinking_level 值可能无效但不报错（auto 时不传参）
  - `<think>` 标签解析纯前端，适用于所有天然输出 `<think>` 的模型（DeepSeek R1 等）；show_thinking=false 时剥除整个 block，流式中亦实时剥除
  - `ThinkBlock` 默认折叠，点击"思考过程"展开；内容为 pre-wrap 纯文本

## T97 — feat: 对话/协作空间删除消息 + 写卡助手气泡操作 ✅
- **对外接口**：
  - `DELETE /api/sessions/:sessionId/messages/:messageId` — 删除该消息及之后所有消息，清理 turn_records，回滚状态栏 runtime_value 至 NULL
  - `deleteMessage(sessionId, messageId)` — 前端 API 封装，位于 `frontend/src/api/sessions.js`
- **涉及文件**：
  - `backend/db/queries/world-state-values.js` — 新增 `clearWorldStateRuntimeValues(worldId)`
  - `backend/db/queries/character-state-values.js` — 新增 `clearCharacterStateRuntimeValues(characterId)`
  - `backend/db/queries/persona-state-values.js` — 新增 `clearPersonaStateRuntimeValues(worldId)`
  - `backend/routes/sessions.js` — 新增删除消息路由；写作模式同时清空激活角色状态
  - `frontend/src/api/sessions.js` — 新增 `deleteMessage`
  - `frontend/src/components/chat/MessageItem.jsx` — 新增 DeleteButton（两次点击确认，2s 超时复位）
  - `frontend/src/components/chat/MessageList.jsx` — 新增 `onDeleteMessage` prop
  - `frontend/src/components/writing/WritingMessageItem.jsx` — 新增 DeleteBtn
  - `frontend/src/pages/ChatPage.jsx` — 新增 `handleDeleteMessage`
  - `frontend/src/pages/WritingSpacePage.jsx` — 新增 `handleDeleteMessage`
  - `assistant/client/useAssistantStore.js` — 新增 `editMessage`、`truncateToMessage`、`deleteMessage`
  - `assistant/client/MessageList.jsx` — user/assistant 气泡增加复制/编辑/重新生成/删除操作（hover 显示）
  - `assistant/client/AssistantPanel.jsx` — 新增 `handleUserEdit`（编辑后重新生成）、`handleAssistantRegenerate`、`handleDeleteMessage`；重构为 `sendContent` 内部函数复用
- **注意**：
  - 状态回滚 = 将 runtime_value_json 清 NULL（回到 default_value），非真正"历史回滚"
  - 删除消息后前端乐观更新（slice 到被删消息之前），不重新拉取
  - 写作模式删除时同时清空 `getWritingSessionCharacters` 返回的所有角色状态
  - 写卡助手的编辑/删除只操作 Zustand store，不影响后端数据库

## T96 — feat: 新增 persona-card 子代理，区分玩家卡与角色卡 ✅
- **涉及文件**：
  - `assistant/prompts/sub-persona-card.md` — 新建，玩家卡子代理 prompt（upsert、无 Prompt 条目、只有 persona stateFieldOps）
  - `assistant/server/sub-agents/persona-card.js` — 新建，调用 LLM 生成玩家卡修改方案
  - `assistant/server/routes.js` — 注册到 SUB_AGENTS；loadEntityData 支持 persona-card；executeOneTask 补 entityId 回退；applyProposal 新增 case（upsertPersona + stateFieldOps）
  - `assistant/server/main-agent.js` — ROUTING_SYSTEM 新增 persona-card 描述、"玩家卡 vs 角色卡"判断规则
  - `assistant/client/ChangeProposalCard.jsx` / `MessageList.jsx` — 新增 persona-card 标签和图标（🎭）
- **注意**：persona 是 upsert（每世界唯一），operation 固定为 update；entityId 为 worldId；applyStateFieldCreate 强制 target: 'persona' 防止子代理写错 target

## T95 — bugfix: 修复多角色创建 UNIQUE 冲突 + 提案应用后自动滚底 ✅
- **涉及文件**：
  - `assistant/server/routes.js` — `applyStateFieldCreate` 捕获 UNIQUE constraint 错误并忽略（character_state_fields 按世界共享，多角色各自携带相同 state field ops 时第二个会冲突）
  - `assistant/client/MessageList.jsx` — scroll effect 改为只在消息数量增加时滚底，`applied` 状态变更不再触发
- **注意**：UNIQUE 冲突只 ignore，其他 DB 错误仍正常抛出

## T94 — bugfix: 修复已有世界创建角色时提案卡误显示"等待世界卡" ✅
- **涉及文件**：`assistant/server/main-agent.js`（ROUTING_SYSTEM prompt）
- **根因**：主代理路由 prompt 未说清楚 entityId 填写规则和 worldRef 使用场景，LLM 会误生成带 `worldRef` 的 multi-delegate，导致前端提案卡以为依赖的世界卡还没创建
- **修复**：在 ROUTING_SYSTEM 中明确"已有世界时创建角色用 `delegate`+`entityId=世界ID`；`worldRef` 只在同一请求同时新建世界+角色时使用"
- **注意**：character-card create 时 `entityId` 填的是**世界 ID**（不是角色 ID），LLM 子代理输出 null 后由代码 `result.entityId ?? entityId` 回退到正确的世界 ID，无需改子代理

## T93 — bugfix: 修复角色列表加载卡死 + 提案卡编辑按钮位置 ✅
- **涉及文件**：
  - `frontend/src/pages/CharactersPage.jsx` — `loadData()` 新增 try/catch + finally；新增 `loadError` state 和错误页展示（含重试按钮），避免请求失败时页面永久卡在加载中
  - `assistant/client/ChangeProposalCard.jsx` — "编辑"/"取消编辑"按钮从卡片顶部 header 移到底部操作区（与"创建/应用"按钮并排）；header 改为仅在编辑中时显示"编辑中"状态标记
- **注意**：
  - 编辑按钮原来在 header 右上角（用户视线通常在底部的应用按钮上，容易忽视），移到操作区后两个按钮更自然地并列显示
  - CharactersPage 错误页含重试入口，避免需要刷新整个应用

## T92 — feat: 写卡助手：三层状态字段分层（world/persona/character） ✅
- **涉及文件**：
  - `assistant/prompts/sub-world-card.md` — 状态字段定义改为三层架构表（world/persona/character），stateFieldOps 示例补充三种 target，底部占位符拆分为 `{{EXISTING_WORLD_STATE_FIELDS}}` / `{{EXISTING_PERSONA_STATE_FIELDS}}` / `{{EXISTING_CHARACTER_STATE_FIELDS}}`
  - `assistant/prompts/sub-character-card.md` — 状态字段定义改为两层（character/persona），明确禁止 `target:"world"`，底部占位符同步拆分
  - `assistant/server/sub-agents/world-card.js` — 加载三类状态字段（existingWorldStateFields/existingPersonaStateFields/existingCharacterStateFields），替换三个独立 prompt 占位符
  - `assistant/server/sub-agents/character-card.js` — 加载 character + persona 两类字段，替换两个独立 prompt 占位符
  - `assistant/server/routes.js` — 新增 persona-state-fields 服务 import；loadEntityData 分别为 world-card/character-card 加载三层/两层字段；新增 `applyStateFieldCreate` / `applyStateFieldDelete` 辅助函数，根据 `op.target` 分发到对应服务
- **注意**：
  - character target 的字段全世界 NPC 共享；persona target 每世界只有一份玩家状态；world target 只追踪世界/环境动态
  - `applyStateFieldDelete` 根据 `op.target` 调用对应 delete 服务，delete 时需要前端传入正确的 target

## T91 — bugfix: 写卡助手：提案卡用户编辑 + JSON 截断修复 ✅
- **涉及文件**：
  - `assistant/server/sub-agents/world-card.js` / `character-card.js` — maxTokens 2000→4000（prompt 变长后输出被截断导致 JSON 解析失败）
  - `assistant/server/routes.js` — `/execute` 新增可选 `editedProposal` 参数；以 token 锚定 type/operation/entityId，内容字段（changes/entryOps/stateFieldOps）可被用户编辑覆盖
  - `assistant/client/api.js` — `executeProposal(token, worldRefId, editedProposal)` 新增第三参
  - `assistant/client/ChangeProposalCard.jsx` — 全面重写：头部增加"编辑"切换按钮；编辑模式下 changes 字段变为 textarea/input，entryOps 变为可编辑表单（标题/简介/内容/关键词），stateFieldOps 变为可编辑表单（标识符/类型/名称/描述/更新指令/默认值/范围/枚举选项）；编辑模式下应用携带本地编辑内容
- **注意**：
  - 安全设计：type/operation/entityId 固定来自 token，客户端只能修改内容；即使用户发送伪造 editedProposal 也无法改变操作类型
  - delete 操作不显示"编辑"按钮（无内容可编辑）
  - 编辑模式为组件级临时状态，不持久化（关闭面板或刷新后丢失）

## T90 — feat: 写卡助手：状态字段支持 + Prompt 条目说明修正 ✅
- **涉及文件**：
  - `assistant/prompts/sub-world-card.md` / `sub-character-card.md` — 新增"内容分层速查"表（明确 system_prompt/entryOps/stateFieldOps 各自适用场景），修正 Prompt 条目说明（只用于静态触发型知识），新增状态字段说明和 `{{EXISTING_STATE_FIELDS}}` 占位符，`stateFieldOps` 加入输出 schema
  - `assistant/server/sub-agents/world-card.js` / `character-card.js` — 传入 `existingStateFields`，返回值新增 `stateFieldOps`
  - `assistant/server/routes.js` — 导入 world/character state field 服务；`loadEntityData` 加入 `existingStateFields`；`applyProposal` 处理 `stateFieldOps`（create 调 createWorldStateField/createCharacterStateField，delete 调 delete*）；新增 `STATE_FIELD_KEYS` 白名单常量
  - `assistant/client/ChangeProposalCard.jsx` — 计算并渲染 `stateFieldOps` 展示区（新增/删除字段名、类型 badge、description）
- **注意**：
  - character state fields 归属于 world，不是 character——`createCharacterStateField(world_id, data)` 创建后该世界所有角色自动获得初始值
  - update 操作对状态字段暂不支持（service 层虽然有 updateXxx，但状态字段定义更新很少通过助手做，用户直接在 UI 改即可）
  - `default_value` 必须是 JSON 字符串（number → `"100"`，text → `"\"文本\""` ），由 LLM 按 prompt 规范生成

## T89 — feat: 写卡助手 B 方向：子代理 CRUD + 主代理并行调度 ✅
- **涉及文件**：
  - `assistant/server/sub-agents/world-card.js` / `character-card.js` — 扩展 create/delete 操作（delete 直接返回，create 空 entityData + 提示词注入）
  - `assistant/server/sub-agents/global-prompt.js` / `css-regex.js` — 兼容新的 taskObj 参数签名
  - `assistant/prompts/sub-world-card.md` / `sub-character-card.md` — 新增 `{{OPERATION_HINT}}` 占位符，运行时注入"新建/修改"指示
  - `assistant/server/routes.js` — 重构 `/chat` 为 `executeOneTask` 辅助函数，支持 `multi-delegate` 并行；`/execute` 新增 `worldRefId` 参数；`applyProposal` 支持 create/delete 分支（调用 createWorld/createCharacter/deleteWorld/deleteCharacter）
  - `assistant/server/main-agent.js` — ROUTING_SYSTEM 新增 create/delete/multi-delegate 格式说明；maxTokens 提升至 600
  - `assistant/client/api.js` — onProposal 透传 taskId；executeProposal 新增可选 worldRefId 参数
  - `assistant/client/useAssistantStore.js` — replaceRoutingWithProposal 按 taskId 匹配；新增 resolvedIds 表和 setResolvedId 方法
  - `assistant/client/AssistantPanel.jsx` — routing/proposal 回调透传 taskId
  - `assistant/client/ChangeProposalCard.jsx` — create/delete 差异化显示（标题/按钮文字/红色删除）；worldRef 依赖检测（等待世界卡禁用按钮）；apply 后存储 resolvedId
  - `assistant/client/MessageList.jsx` — 传 taskId prop 给 ChangeProposalCard
- **注意**：
  - sub-agent 第一参数改为 `taskObj = { task, operation, entityId }`，string 兼容（旧调用不受影响）
  - world-card/character-card create 时 entityId 为 null；character-card create 依赖世界时 `worldRef` 字段携带 taskId，apply 时前端传 `worldRefId`
  - multi-delegate 中所有任务并行执行（包括有 worldRef 的 character 任务）；worldRef 仅在 apply 阶段解析，chat 阶段 character sub-agent 不需要 worldId
  - `resolvedIds` 在 clearMessages 时重置，不持久化（避免陈旧 ID 干扰跨会话）

## T88c — bugfix: 写卡助手对抗性审查三项修复 ✅
- **涉及文件**：
  - `assistant/server/main-agent.js` — routeMessage 增加 context 参数，路由时注入当前世界/角色名称
  - `assistant/server/routes.js` — proposalStore（token 锚定）、entryOps 执行、existingEntries 加载
  - `assistant/server/sub-agents/world-card.js` / `character-card.js` / `global-prompt.js` — 传入 existingEntries，输出 entryOps
  - `assistant/prompts/sub-*.md` — 输出 schema 改为 entryOps（含 create/update/delete）
  - `assistant/client/api.js` / `useAssistantStore.js` / `AssistantPanel.jsx` / `ChangeProposalCard.jsx` / `MessageList.jsx` — token 流
- **注意**：
  - [Fix1] `routeMessage(message, history, context)` 新增第三参，路由 prompt 末尾附加"当前激活上下文"，解决"改这个角色"路由错目标的问题
  - [Fix3] `/execute` 不再接受 `{ proposal }`，改为 `{ token }`；token 由 `/chat` 阶段生成存入内存 `proposalStore`（TTL 30min），一次性消费；直接 POST 伪造 proposal → 400
  - [Fix2] 子代理 entityData 附加 `existingEntries`（id/title/summary）；prompt 输出改为 `entryOps` 数组，支持 op: create/update/delete；executor 向后兼容 `newEntries`（视为全 create）
  - `ChangeProposalCard` 展示改用 entryOps，显示 [新增]/[修改]/[删除] 标签

## T88b — bugfix: 写卡助手 Codex Review 修复 ✅
- **涉及文件**：`assistant/server/routes.js`、`assistant/client/ChangeProposalCard.jsx`、`assistant/client/AssistantPanel.jsx`
- **注意**：
  - [P1] Prompt 条目改走 `backend/services/prompt-entries.js`（含 `vectorize()`），不再直接调 DB 层
  - [P2] CSS 提案应用后调 `refreshCustomCss()`，正则提案应用后调 `invalidateCache()` + `loadRules()`
  - [P3] 移除全屏透明遮罩（阻断了背景页点击），面板只能通过 × 按钮关闭

## T88 — feat: 写卡助手（Assistant） ✅
- **对外接口**：
  - 后端：`POST /api/assistant/chat`（SSE）、`POST /api/assistant/execute`
  - 前端：TopBar "✦ 助手" 按钮 toggle 侧边面板
- **涉及文件**：
  - 新增目录 `/assistant/`（前后端混合，独立于原代码）
  - `assistant/prompts/` — 5个 agent system prompt MD 文件
  - `assistant/server/` — 主代理、4个子代理、路由
  - `assistant/client/` — AssistantPanel、MessageList、ChangeProposalCard、InputBox、useAssistantStore、api
  - 修改 `backend/server.js`（+2行：import + app.use）
  - 修改 `frontend/vite.config.js`（resolve.alias + fs.allow）
  - 修改 `frontend/src/App.jsx`（挂载 AssistantPanel）
  - 修改 `frontend/src/components/book/TopBar.jsx`（添加助手按钮）
- **注意**：
  - `assistant/node_modules` 是指向 `backend/node_modules` 的符号链接（Node.js ESM 模块查找需要）
  - Vite 需要在 `resolve.alias` 里显式指定 react/react-dom/zustand/react-router-dom，否则 Rolldown 从 `assistant/client/` 路径解析不到这些包
  - 子代理路由决策用 `complete()`（非流式），主代理最终回复用 `chat()`（流式）
  - 提案提案类型：`world-card`、`character-card`、`global-config`、`css-snippet`、`regex-rule`
  - `global-config` 提案执行时会过滤掉 `api_key`、`llm.api_key`、`embedding.api_key` 防止覆写

## T87A — chore: Git 仓库健康度维护 ✅
- **对外接口**：无
- **涉及文件**：`.mailmap`、`.gitignore`、`.temp/git-health-check.sh`
- **注意**：(1) `.mailmap` 将 n0ctx / entropy / Yunzhi Wang 三个分裂身份归并为 **n0ctx**，不改变 commit hash，只影响 `git log` / `git shortlog` / `git blame` 显示；(2) `.gitignore` 显式保护 `.temp/` 目录（只允许 `.gitkeep` 和 `git-health-check.sh` 被跟踪），防止以后误提交临时文件；(3) 远程分支 `docs/add-project-docs` 已清理；(4) 交付 `.temp/git-health-check.sh` 脚本，以后在项目根目录执行 `bash .temp/git-health-check.sh` 即可一键输出健康度报告

## T87 — feat: 导入导出按对话/写作模式分离 ✅
- **对外接口**：`GET /api/global-settings/export?mode=chat|writing`（按 mode 过滤导出，文件顶层带 `mode` 字段）；`POST /api/global-settings/import`（从 `data.mode` 推断目标模式，缺失时默认 `chat`），返回 `{ ok: true, mode }`
- **涉及文件**：`backend/services/import-export.js`、`backend/routes/import-export.js`、`frontend/src/api/importExport.js`、`frontend/src/pages/SettingsPage.jsx`（ImportExportSection 加 ModeSwitch）
- **注意**：导出文件名为 `worldengine-global-settings-{mode}.weglobal.json`；导入只清空/覆盖对应 mode 的三张表记录，另一空间数据不受影响；旧版无 mode 字段的文件导入时自动按 chat 处理（向后兼容）

## T86 — feat: 全局设置双模式分离（对话 / 写作） ✅
- **对外接口**：`GET/POST /api/global-entries?mode=` 按 mode 过滤全局 Prompt 条目；`GET/POST /api/custom-css-snippets?mode=` 按 mode 过滤 CSS；`GET /api/regex-rules?mode=` 按 mode 过滤全局规则；`GET /api/config` 返回包含 `writing` 命名空间的配置；`PATCH /api/config` 支持 `{ writing: { llm, global_system_prompt, ... } }` 深度合并
- **涉及文件**：`backend/db/schema.js`（三表加 mode 列 ALTER TABLE migration）、`backend/db/queries/prompt-entries.js`、`backend/db/queries/regex-rules.js`、`backend/db/queries/custom-css-snippets.js`、`backend/services/config.js`（writing 命名空间默认值）、`backend/prompt/assembler.js`（buildWritingPrompt 使用 writing.* 配置）、`backend/routes/writing.js`（model 透传）、`backend/routes/prompt-entries.js`、`backend/routes/regex-rules.js`、`backend/routes/custom-css-snippets.js`、`backend/utils/regex-runner.js`（mode 参数透传）、`backend/services/import-export.js`（writing 块导出导入）、`frontend/src/store/appMode.js`（新建）、`frontend/src/pages/WritingSpacePage.jsx`、`frontend/src/pages/SettingsPage.jsx`、`frontend/src/components/settings/CustomCssManager.jsx`、`frontend/src/components/settings/RegexRulesManager.jsx`、`frontend/src/components/prompt/EntryList.jsx`、`frontend/src/api/customCssSnippets.js`、`frontend/src/api/prompt-entries.js`、`frontend/src/api/regexRules.js`
- **注意**：（1）mode 严格二分 `'chat' | 'writing'`，现有数据默认归入 `'chat'`；（2）世界规则（world_id IS NOT NULL）忽略 mode 字段，始终对该世界所有会话生效；（3）writing.llm.model = '' 时继承对话 model，writing.context_history_rounds = null 时继承对话 context_history_rounds；（4）`store/index.js` 为锁定文件，appMode 独立 store 新建为 `store/appMode.js`；（5）CSS 片段的 refreshCustomCss 需传 appMode，不传则拉取全部（兼容旧调用）；（6）SettingsPage 的 settingsMode state 在所有 tab 间共享，切换 tab 不重置模式

## T85 — chore: 发布前第三方声明清单 ✅
- **对外接口**：新增仓库根文档 `THIRD_PARTY_NOTICES.md`，用于发布前汇总当前仓库可确认的第三方依赖、外链字体和待人工复核的静态资产
- **涉及文件**：`THIRD_PARTY_NOTICES.md`、`CHANGELOG.md`
- **注意**：当前 npm 直接依赖可从三份 lockfile 读取许可证；前端字体来自 Google Fonts，许可不应统一按 MIT 处理；仓库内 `frontend/src/assets/react.svg`、`frontend/src/assets/vite.svg`、`frontend/public/icons.svg` 未发现活跃引用，发布前宜删除或单独补来源/品牌使用说明

## T84 — feat: 全局设置导入导出 + 标签页标题与 favicon 更新 ✅
- **对外接口**：`GET /api/global-settings/export`（返回 `worldengine-global-settings-v1` 格式 JSON）、`POST /api/global-settings/import`（body 同上，条目追加，config 覆盖）；前端 `downloadGlobalSettings() / importGlobalSettings()` 封装于 `importExport.js`
- **涉及文件**：`backend/services/import-export.js`（新增 `exportGlobalSettings` / `importGlobalSettings`）、`backend/routes/import-export.js`（新增两条路由）、`frontend/src/api/importExport.js`（新增三个函数）、`frontend/src/pages/SettingsPage.jsx`（新增"导入导出"导航项与 `ImportExportSection` 组件）、`frontend/index.html`（title 改为 WorldEngine）、`frontend/public/favicon.svg`（换为书卷风地球仪图标）
- **注意**：导出文件后缀约定为 `.weglobal.json`，format 字段为 `worldengine-global-settings-v1`；导入是**追加**不去重；scope 白名单校验（`user_input/ai_output/display_only/prompt_only`），无效 scope 的正则规则跳过；DB 事务成功后才调用 `updateConfig`，保证原子性；不含 LLM 配置与 API 密钥；导入后前端调 `getConfig()` 重新同步 React state，不刷页

## T83 — bugfix: 修复 impersonate 新 session 丢失开场白上下文 ✅
- **对外接口**：无新增接口；`buildPrompt` / `buildWritingPrompt` 在无 turn record 的降级路径里，改为仅移除“最新一条 user 消息”，不再盲目裁掉数组最后一项
- **涉及文件**：`backend/prompt/assembler.js`、`ARCHITECTURE.md`、`CHANGELOG.md`
- **注意**：这个修复直接影响 `/impersonate` 的首轮取上下文；此前新 session 若只有 assistant 开场白、还没有 user 消息，降级路径会误删开场白，导致代拟内容只能参考 system prompt 和跨 session 召回记忆

## T82 — feat: 将全局 Prompt 条目整合到全局 Prompt 设置页 ✅
- **对外接口**：无变更；纯 UI 重组
- **涉及文件**：`frontend/src/pages/SettingsPage.jsx`
- **注意**：导航从 6 项减为 5 项（移除独立的"全局 Prompt 条目"）；EntryList 嵌入 PromptSection，位于全局后置提示词之后，由 hr 与下方记忆展开/保存区隔开；EntryList 独立保存，与"保存"按钮互不干扰

## T81 — chore: 统一测试/临时文件目录并清理仓库残留 ✅
- **对外接口**：无运行时接口变更；`CLAUDE.md` 与 `AGENTS.md` 新增同一条仓库约束：所有测试文件、测试目录、临时文件、临时目录统一放到项目根目录 `/.temp/`
- **涉及文件**：`CLAUDE.md`、`AGENTS.md`、`CHANGELOG.md`；新建根目录 `/.temp/`（含 `.gitkeep` 以便 Git 跟踪）；删除 `backend/tests/` 和仓库内残留 `.DS_Store`
- **注意**：本次清理只删除项目源码树中的测试/临时内容，不处理 `node_modules`、`.git` 等依赖或元数据目录；根目录 `.temp/` 作为后续统一落点，由 `.gitkeep` 保持目录存在

## T80 — bugfix: 修复写作空间流式结束闪烁回归 ✅
- **对外接口**：无新增接口；`MessageList` prose 模式渲染逻辑内部调整
- **涉及文件**：`frontend/src/components/chat/MessageList.jsx`
- **注意**：根因是 commit 325dc83（章节分组）将 prose 模式的流式占位放到 `chapter.messages.map()` 外部作为条件元素，React 调和时 key 匹配失败导致 `WritingMessageItem` 重挂载，`.we-writing-prose` 的 `weInkRise` 动画重播产生闪烁。修复方案：新增 `messagesForDisplay` useMemo，在 prose+generating 时将流式伪消息（带 `_isStream: true`）注入数组末尾，让其自然落入 `groupMessagesIntoChapters` 的 chapter.messages，map 内通过 `msg._isStream` 判断 streaming 态，删除 map 外的条件占位和 `chapters.length === 0` fallback

## T79 — docs: 文档同步 + SectionTabs 布局修正 ✅
- **对外接口**：无新增运行时接口；`SCHEMA.md` / `ARCHITECTURE.md` 现已与当前实现对齐，可作为会话模型、turn record、召回阈值、路由映射与中间件行为的最新权威参考
- **涉及文件**：`SCHEMA.md`、`ARCHITECTURE.md`、`CHANGELOG.md`、`frontend/src/styles/pages.css`
- **注意**：`SCHEMA.md` 和 `ARCHITECTURE.md` 被 `.gitignore` 忽略，提交时需显式强制 add；chat session 的 `sessions.world_id` 仍通常为 `NULL`，不要按文档旧版本假设其恒非空；`turn_records.user_context/asst_context` 当前保存的是 `{{user}}` / `{{char}}` 前缀的纯对话文本，不再含状态快照；`pages.css` 中 `.we-section-tabs` 现补 `width: 100%`，分隔花饰改为固定宽度居中，避免标签行宽度和垂直对齐异常

## T78 — refactor: 羊皮纸物理质感阴影系统 + 调试日志 start 修复 ✅
- **对外接口**：新增 CSS 变量 `--we-shadow-stamp-up / stamp-down / paper-stack / paper-stack-hover / paper-lift / paper-indent`（定义于 `tokens.css`）；`ParchmentTexture` 新增 fiber 纹理层（内部 SVG feTurbulence），opacity prop 默认值不变
- **涉及文件**：`tokens.css`（6 个物理阴影变量）、`pages.css`（世界卡/角色卡阴影改用变量）、`BookSpread.jsx`（多层书本阴影 + ParchmentTexture opacity=0.55）、`ParchmentTexture.jsx`（新增 fiber 纤维层叠加）、`backend/package.json`（`start` 脚本补 `LOG_LEVEL=debug`）、`启动WorldEngine.bat / .command`（补 `LOG_LEVEL=debug`）
- **注意**：`--we-paper-deep` / `--we-paper-shadow` 已在 tokens.css 定义，阴影系统直接引用；`start` 与 `dev` 脚本现在行为一致（均 debug 模式），避免直接 `node server.js` 时无日志输出

## T77 — bugfix: 修复流式输出闪烁 + HTML 额外空行 ✅
- **问题根因**：① 流结束时 `finalizeStream` 调用 `refreshMessages()` 导致 `MessageList` 整体重挂载，`AnimatePresence popLayout` 触发全部气泡 exit/enter 动画（视觉闪烁）。② 流式期间用 `<span whiteSpace:pre-wrap>` 渲染原始文本，`\n\n` 以双换行显示；流结束切换 `<ReactMarkdown>` 后段间距收紧，产生内容跳变。
- **修复方案**：后端 `runStream` 在 SSE `done`/`aborted` 事件中附带真实 assistant 消息行、在流起始广播 `user_saved` 事件传递真实 user id；前端 `finalizeStream` 改为直接 `appendMessage`（复用本轮 `streamingKey` 作为 `_key` 实现 AnimatePresence 零动画切换），仅在后端未回传 payload 时降级到 `refreshMessages`；`onAborted`/`onError` 移除直接 `finalizeStream` 调用，统一由 `onStreamEnd` 的 finally 块触发，消除双重 finalize；`MessageItem` assistant 流式/终态统一走 `<ReactMarkdown>`，`<QuillCursor>` 作为同级后置元素。
- **涉及文件**：`backend/routes/chat.js`、`frontend/src/api/chat.js`、`frontend/src/pages/ChatPage.jsx`、`frontend/src/components/chat/MessageList.jsx`、`frontend/src/components/chat/MessageItem.jsx`
- **注意**：`streamingKey` 每轮流生成唯一 key（`__stream_<ts>_<rand>__`），避免连发两条消息时 React key 冲突；`user_saved` 替换 temp id 时保留 `_key=tempId` 防止 AnimatePresence 因 key 变化触发气泡进出场；`onStreamEnd` finally 保证单次触发，旧前端无 `assistant` 字段时自动降级为 `refreshMessages`。

## T76 — refactor: 全局 UI 羊皮纸化：对话框、输入栏、Markdown 渲染优化 ✅
- **对外接口**：新增 CSS 类 `.we-dialog-panel / .we-dialog-header / .we-dialog-body / .we-dialog-footer / .we-dialog-label / .we-dialog-hint / .we-tag-input / .we-tag / .we-tag-input-field / .we-range`；`Select.jsx` 和 `ModelCombobox.jsx` 全部改为 inline style（无 Tailwind 依赖）
- **涉及文件**：`ui.css`（新增 dialog/tag/range 类）、`index.css`（MarkdownEditor Tiptap 重设计、`we-range` 样式、combobox focus 样式）、`chat.css`（h1-h3、blockquote、table、hr、del、GFM 任务列表补全）、`InputBox.jsx`（输入栏羊皮纸化、斜杠命令弹层重设计）、`Select.jsx`（全面 inline style 改造）、`ModelCombobox.jsx`（inline style 改造）、`EntryEditor.jsx`、`EntryList.jsx`、`StateFieldEditor.jsx`、`StateFieldList.jsx`、`RegexRuleEditor.jsx`（均换用 `.we-dialog-panel` 系列类）、`SettingsPage.jsx`（temperature 滑条用 `we-range` + CSS 变量驱动填充）、`MessageItem.jsx`（移除 MD_COMPONENTS 内联样式，改由 CSS 控制）
- **注意**：`Select.jsx` 与 `ModelCombobox.jsx` 视觉完全对齐，下拉选项悬浮色用 `var(--we-paper-aged)`，选中项用 `var(--we-vermilion)`；`we-range` 通过 `--range-pct` CSS 变量驱动已选填充渐变，需在 JSX 中通过 `style={{ '--range-pct': '...' }}` 传入；斜杠命令弹层顶部有 2px 朱砂上边框、选中项左侧有 2px 朱砂竖线指示

## T75 — refactor: 代码简化与气泡宽度修复 ✅
- **对外接口**：`CharacterSeal` 新增 `color` prop（默认 `var(--we-vermilion)`），persona 印章传 `color="var(--we-amber)"`
- **涉及文件**：`CharacterSeal.jsx`（color prop）、`MessageItem.jsx`（删除 PersonaSeal，改用 CharacterSeal）、`BookSpread.jsx`（移除 Bookmark）、`chat.css`（用户气泡宽度改 `fit-content + max-width 420px`）、`turn-summarizer.js`（getTurnRecordById 改静态 import）
- **注意**：`Bookmark.jsx` 文件保留未删；用户气泡去掉 65% 百分比约束，短句不再莫名换行

## T74 — feat: ChatPage 左右气泡对话布局 ✅
- **对外接口**：`MessageList` 移除 `sessionTitle` / `onChapterChange` 两个 prop（ChatPage 传入仍安全，被忽略）；`MessageItem` 移除 `isChapterFirstAssistant` prop
- **涉及文件**：`frontend/src/components/chat/MessageItem.jsx`（气泡布局重构）、`frontend/src/components/chat/MessageList.jsx`（移除章节分组）、`frontend/src/styles/chat.css`（新增 `.we-message-bubble-user/assistant`，删除 Drop Cap，操作菜单改绝对定位）
- **注意**：`ChapterDivider.jsx` / `FleuronLine.jsx` / `chapter-grouping.js` 保留未删（写作空间备用）；`.we-message-actions` 改为绝对定位并加了半透明背景+边框，避免悬浮在内容上时难以辨认；`isAssistant` 变量已删除（不再需要）

## T73 — refactor: CharactersPage 羊皮纸化改造 ✅
- **对外接口**：无新增 API
- **涉及文件**：`frontend/src/pages/CharactersPage.jsx`（全量重构样式）、`frontend/src/styles/pages.css`（追加 `.we-characters-*` 和 `.we-persona-*` 锚点样式块）
- **注意**：`AvatarCircle` 改为 `style` 内联 `width/height` 数值，移除 Tailwind sizeClass；`--we-vermilion-muted` 未定义，已用 fallback `var(--we-vermilion-muted, var(--we-vermilion))` 兜底；导航"← 所有世界"按钮 hover 效果通过 `onMouseEnter/onMouseLeave` 实现；文件输入框保留 `className="hidden"`（Tailwind base utilities）

## T72（部分） — feat: 羽毛笔光标 + 盖印动画 ✅
- **对外接口**：新增 `SealStampAnimation`（Props: `trigger: number | visible: boolean, text?: string`）；新增 `QuillCursor`（Props: `visible: boolean`）
- **涉及文件**：新建 `frontend/src/components/book/QuillCursor.jsx`、`frontend/src/components/book/SealStampAnimation.jsx`；修改 `frontend/src/pages/CharacterEditPage.jsx`（导出成功触发盖印）、`frontend/src/pages/WorldEditPage.jsx`（同）；追加 `frontend/src/index.css`（`@keyframes quill-blink` + `.we-quill-cursor`）
- **注意**：减少动效开关部分（useReducedMotion / SettingsPage toggle）已按用户要求跳过。`SealStampAnimation` 用 `trigger`（数字计数器）触发，每次+1播放一次动画；`position: fixed` 定位在视口右下角 40px，无需父容器 relative。`QuillCursor` 已创建但未接入 MessageItem，供后续使用。

## T71 — feat: 写作页并入书本布局 + 顶栏恢复世界上下文 ✅
- **对外接口**：新增 `GET /api/worlds/:worldId/latest-chat-session`（返回该世界最近更新的一条 `mode='chat'` 会话，404 表示该世界还没有对话）；`frontend/src/api/sessions.js` 新增 `getLatestChatSession(worldId)`；新增写作页组件 `WritingPageLeft` / `WritingSessionList` / `CastPanel`，`WritingSessionList` 暴露静态方法 `addSession(session)`、`updateTitle(sessionId, title)` 供 `WritingSpacePage` 在流式生成和自动建会话时同步左栏
- **涉及文件**：`backend/db/queries/sessions.js`、`backend/routes/sessions.js`、`backend/services/sessions.js`、`frontend/src/api/sessions.js`、`frontend/src/components/book/TopBar.jsx`、`frontend/src/pages/WritingSpacePage.jsx`、`frontend/src/components/book/WritingPageLeft.jsx`、`frontend/src/components/book/WritingSessionList.jsx`、`frontend/src/components/book/CastPanel.jsx`、`frontend/src/components/chat/SessionItem.jsx`、`frontend/src/components/book/SessionListPanel.jsx`、`frontend/src/App.jsx`、`frontend/src/pages/WorldEditPage.jsx`、`frontend/src/pages/CharacterEditPage.jsx`、`frontend/src/pages/WorldsPage.jsx`、`frontend/src/pages/CharactersPage.jsx`、以及对应样式文件；删除旧写作页专用组件 `frontend/src/components/writing/*`
- **注意**：TopBar 不再只依赖 URL 上的 `worldId`；在角色聊天页会额外通过 `getCharacter(characterId)` 回填 `effectiveWorldId`，并在点“对话”时优先查 `latest-chat-session` 跳回该世界最近一次聊天，否则退回世界角色页。`WorldEditPage` / `CharacterEditPage` 现在既可全屏打开，也可通过 `location.state.backgroundLocation` 作为 overlay 打开，关闭统一 `navigate(-1)`；`WritingSpacePage` 不再自己维护完整消息数组，而是复用 `MessageList.appendMessage` + `messageListKey` 刷新，流结束/中断后统一重新拉取，避免写作模式再维护一套独立消息组件。

## T70C — bugfix: 重新生成按钮失效（afterMessageId 异步读取问题） ✅
- **涉及文件**：`frontend/src/components/chat/MessageList.jsx`（暴露 `MessageList.messagesRef`）、`frontend/src/pages/ChatPage.jsx`（`handleRegenerateMessage` / `handleRetryLast` / `handleRetryAfterError` 三处）
- **注意**：React 18 concurrent mode 下 `setMessages(updater)` 的 updater 函数在渲染阶段异步执行，在 updater 内对外部变量赋值（如 `afterMessageId`）在同步代码中无法读取。修复方法：在 MessageList 中暴露 `messagesRef`（`messagesRef.current = messages` 在 render 内同步赋值），在 ChatPage 里先从 `messagesRef.current` 同步读取目标 messageId，再调用 `updateMessages` 更新 UI，最后调用 `regenerate()` API。

## T70B — bugfix: 状态栏文本混入会话正文 ✅
- **涉及文件**：`backend/prompt/assembler.js`（导出 `stripAsstContext`）、`backend/routes/chat.js`（普通回复 + 续写各加一次调用）、`backend/routes/writing.js`（写作模式加一次调用）
- **注意**：`stripAsstContext` 此前仅在读取历史消息组装 Prompt 时调用，保存新 AI 回复到 DB 前从未调用，导致 LLM 输出的状态块直接写入 `messages.content`。修复顺序：先 `stripAsstContext(fullContent)`，再 `applyRules(..., 'ai_output', ...)`，再追加 `[已中断]` 标记（如有）

## T70 — feat: SettingsPage 双栏 + CustomCssManager 引导 ✅
- **对外接口**：`SettingsPage` 无新增对外接口；`CustomCssManager` 无 props 变化；`RegexRulesManager` 无 props 变化
- **涉及文件**：重写 `frontend/src/pages/SettingsPage.jsx`；更新 `frontend/src/components/settings/CustomCssManager.jsx`（添加折叠引导 + 替换 Button/Input/Textarea）；更新 `frontend/src/components/settings/RegexRulesManager.jsx`（替换按钮为 T67 Button）；追加 `frontend/src/styles/pages.css`（`.we-settings-panel`/`.we-settings-nav`/`.we-settings-nav-item`/`.we-settings-body` 等设置页专用类 + `.we-css-reference*` 折叠引导样式）
- **注意**：`SettingsPage` 使用 `we-edit-canvas`（外层书本背景，与 T69 保持一致）+ 新建 `we-settings-panel`（flex 双栏，最大宽度 1100px）；LLM 和 Embedding 同在"LLM 配置"分区，分隔线区分；"全局 Prompt"分区包含 context_rounds、memory_expansion 及保存按钮；CSS 折叠引导用原生 `<details>`/`<summary>`，默认收起；"关于"分区版本号硬编码 0.0.0，数据库重置引导用 CLI 命令展示（无 HTTP 接口）；`RegexRulesManager` 原有 Tailwind 类在行级规则项上仍保留（只替换了顶部新建按钮和行内编辑/删除按钮）

## T69A — bugfix: T69 后续修复 ✅
- **涉及文件**：`App.jsx`、`PageTransition.jsx`、`BookSpread.jsx`、`TopBar.jsx`、`CharactersPage.jsx`、`PersonaEditPage.jsx`、`StatePanel.jsx`、`ChatPage.jsx`、`pages.css`
- **注意**：`PageTransition` 去除 framer-motion 动画与 `key`（消除页面切换闪烁）；改为 `overflowY: auto` 使编辑页可滚动，`BookSpread` 对应改为 `flex: 1; min-height: 0`（`height: 100%` 在 overflow:auto 容器中解析不稳定）；`PersonaEditPage` 关闭动画改为内部 `closing` state 驱动（`x: 0→400`），`handleClose()` 统一入口；顶部栏"玩家人设"点击已开时发 `closingDrawer` state 信号触发关闭动画；`CharactersPage` 玩家卡片 ✎ 按钮同步传 `backgroundLocation`；抽屉及遮罩 `top: 40px`（TopBar 高度）；`StatePanel` 宽 280→340px；`ChatPage` 移除 `PageFooter`；删除 `demo/index.html`

## T69 — refactor: World / Character / Persona 编辑页羊皮纸化 ✅
- **对外接口**：新建 `SectionTabs` 组件（`frontend/src/components/book/SectionTabs.jsx`），Props: `{ sections: [{ key, label, content }], defaultKey }`；`WorldEditPage` 新增加载 `getWorldTimeline` 并接线 temperature/max_tokens 到 state；`CharacterEditPage` 新增 `AvatarUpload` 内部子组件；`PersonaEditPage` 不再是整页，改为 framer-motion 右侧抽屉
- **涉及文件**：新建 `frontend/src/components/book/SectionTabs.jsx`；重写 `frontend/src/pages/WorldEditPage.jsx`、`WorldCreatePage.jsx`、`CharacterEditPage.jsx`、`CharacterCreatePage.jsx`、`PersonaEditPage.jsx`；追加 `frontend/src/styles/pages.css`（`.we-edit-*`、`.we-section-tab*`、`.we-persona-drawer*`、`.we-state-value-*`、`.we-edit-tl-*` 等类）
- **注意**：`WorldEditPage.updateWorld` 现在真正保存 temperature/max_tokens（空字符串→null，否则转 Number/parseInt）；`CharacterEditPage` 导入角色卡需要 `character.world_id`（`SELECT *` 已返回该字段）；`PersonaEditPage` 保留原路由 `/worlds/:worldId/persona`，渲染为固定定位遮罩 + 右侧 400px 抽屉（`navigate(-1)` 关闭）；framer-motion 首次被引入，需确保 `frontend/node_modules/framer-motion` 已安装（`npm install framer-motion` 在 frontend 目录）；`SectionTabs` 将 sections 的 content 作为 JSX 传入，AnimatePresence 按 key 标识切换，父组件 state 变化会透传进入 content 无需特殊处理

## T68 — refactor: WorldsPage 卷宗书架 ✅
- **对外接口**：`WorldsPage` 无新增对外接口；新增 `frontend/src/styles/pages.css` 定义所有 `.we-worlds-*`、`.we-world-card*` 类；新增 `relativeTime(ts)` 纯函数（组件内）；页面加载时用 `getCharactersByWorld(worldId)` 并行拉取各世界角色数并合并为 `world.character_count`
- **涉及文件**：新建 `frontend/src/styles/pages.css`；重写 `frontend/src/pages/WorldsPage.jsx`；修改 `frontend/src/main.jsx`（pages.css 导入在 ui.css 之后、index.css 之前）
- **注意**：角色数通过 `getCharactersByWorld` 并行加载（N+1 但可接受，失败 fallback 0）；印章圆点颜色复用 `getAvatarColor(world.id)`；FAB `+` 按钮 fixed 定位，注意与其他固定元素的层叠（z-index: 10）；hover 操作按钮通过 `.we-world-card:hover .we-world-card-actions { opacity: 1 }` 显现；原 `world.updated_at` 为毫秒时间戳

## T67 — refactor: 基础 UI 组件羊皮纸化：Button / Input / Textarea / Card / Badge ✅
- **对外接口**：Button props `variant`（primary/secondary/ghost/danger）、`size`（sm/md/lg）API 不变；Input/Textarea/Card/Badge API 不变；新增 `frontend/src/styles/ui.css` 集中定义所有 `.we-btn*`、`.we-input`、`.we-textarea`、`.we-card*`、`.we-badge*` 类
- **涉及文件**：新建 `frontend/src/styles/ui.css`；修改 `frontend/src/main.jsx`（新增 ui.css 导入，位于 chat.css 之后、index.css 之前）；重写 `frontend/src/components/ui/Button.jsx`、`Input.jsx`、`Textarea.jsx`、`Card.jsx`、`Badge.jsx`
- **注意**：所有组件移除了 Tailwind 工具类，仅保留 `we-*` CSS 类；Button 的 `we-btn-icon` 是独立 variant（32×32 无 padding）；Card elevation `flat`/`ring`/`whisper` 映射为 `we-card-flat`/`we-card-ring`/`we-card-whisper` 附加类；Badge variant `accent`/`error` 映射为 `we-badge-accent`/`we-badge-error`；className prop 仍可透传额外类

## T66 — feat: 路由/模态框动画 + SSE 召回指示（蜡烛） ✅
- **对外接口**：`PageTransition` 包裹 `<Routes>` 实现 pageTransition 动画；`CandleFlame` 接收 `visible` prop 显示/隐藏蜡烛 SVG；`ModalShell` 现已使用 framer-motion motion.div 实现入场动画；`ChatPage` 新增 `recallVisible`/`recalledItems` state，通过 `recalledItems` prop 传给 `StatePanel`
- **涉及文件**：新建 `frontend/src/components/book/PageTransition.jsx`、`frontend/src/components/book/CandleFlame.jsx`；重写 `frontend/src/components/ui/ModalShell.jsx`；修改 `frontend/src/App.jsx`、`frontend/src/api/chat.js`、`frontend/src/pages/ChatPage.jsx`
- **注意**：`chat.js` 的 `onMemoryRecallDone` 回调现在会将 `evt`（含 `hit` 字段）传入；召回条目为占位数据（`{ id, text }`），hit > 0 时创建 N 条，300ms 后蜡烛淡出；`StatePanel` 已有 `recalledItems = []` prop 无需修改；`ModalShell` padding 32px 40px 覆盖了原 Tailwind 样式，使用时 children 不需要额外 padding wrapper

## T65 — refactor: 章节分组 + 花饰分隔线 + 页脚 ✅
- **对外接口**：新建纯函数 `groupMessagesIntoChapters(messages, sessionTitle)` in `frontend/src/utils/chapter-grouping.js`；`MessageList` 新增 `sessionTitle` / `onChapterChange` props；`ChatPage` 新增 `PageFooter` 渲染
- **涉及文件**：`frontend/src/utils/constants.js`（新建，含 `CHAPTER_MESSAGE_SIZE=20` / `CHAPTER_TIME_GAP_MS=6h`）、`frontend/src/utils/chapter-grouping.js`（新建）、`frontend/src/components/book/ChapterDivider.jsx`（新建）、`frontend/src/components/book/FleuronLine.jsx`（新建）、`frontend/src/components/book/PageFooter.jsx`（新建）、`frontend/src/components/chat/MessageList.jsx`（章节渲染）、`frontend/src/pages/ChatPage.jsx`（worldName 获取 + 页脚接入）、`frontend/src/index.css`（追加章节/花饰/页脚样式）
- **注意**：`MessageList._lastChapterCount` 作内部静态缓存，防止 `onChapterChange` 在每次渲染都触发；`isChapterFirstAssistant` 改为章节内相对首条（T62 全局首条行为变化，每章第一条 assistant 消息均触发 Drop Cap）；`AnimatePresence` 直接子元素改为 `div.we-chapter`，章节内消息不再是 AnimatePresence 直接子元素，popLayout 行为保留流式消息动画；FleuronLine 用 `IntersectionObserver` 延迟触发动画，不在 SSR 场景使用；页面数固定显示"第一页"（scroll 追踪复杂度不值），章节数实时更新

## T64A — refactor: StatePanel 视觉与逻辑优化 ✅
- **修复**：CURRENT STATE 不再重复显示角色名（头部已有）；`rows===null` 显示骨架屏、`rows===[]` 才显示"暂无数据"；RECALLED 区块 empty 时隐藏不占位；`we-marginalia-list` 去除内置 border-top（改由父级 `we-recalled-section` 负责分隔线）
- **视觉**：字段行改用"key ··· value"点线引导格式；区块标题改为"label + 右延横线 + hover 才显重置"；金箔分隔线升级为 ✦ 装饰线；骨架屏加载动画；时间线条目朱砂小点区分新旧；进度条改为苔绿→金叶渐变
- **涉及文件**：`CharacterSeal.jsx`、`StatusSection.jsx`、`MarginaliaList.jsx`、`StatePanel.jsx`、`index.css`（StatePanel 区块全量重写）

## T64 — feat: 右侧档案页 StatePanel：印章 + 全层状态 + 时间线 + 召回批注 ✅
- **对外接口**：新建 `StatePanel`（`frontend/src/components/book/StatePanel.jsx`），props: `{ character, worldId, characterId, persona, recalledItems=[] }`；T66 通过 `recalledItems` prop 接入 SSE 召回数据填充 `MarginaliaList`
- **涉及文件**：`CharacterSeal.jsx`（新建）、`StatusSection.jsx`（新建）、`MarginaliaList.jsx`（新建）、`StatePanel.jsx`（新建）、`ChatPage.jsx`（移除 MemoryPanel + rightOpen，插入 StatePanel）、`index.css`（追加 `.we-state-panel*`、`.we-status-*`、`.we-timeline`、`.we-marginalia*` 样式）
- **注意**：`MemoryPanel.jsx` 保留不删（P8 清理）；StatePanel 以第三列挂在 `BookSpread` 内（`</PageRight>` 之后）；API 返回字段名为 `type`（非 `field_type`），StatusSection 兼容两者（`row.field_type ?? row.type`）；进度条依赖 `max_value` 字段，当前 DB 查询未返回该字段故进度条暂不显示（后续可在 DB queries 里追加 `csf.max_value` AS max_value 启用）；`recalledItems` 本任务占位为 `[]`，T66 接入 SSE `memory_recall_done` 后填充

## T63 — feat: 左页会话列表（无 Tab）+ 三栏布局接入 ✅
- **对外接口**：新增 `SessionListPanel`（`frontend/src/components/book/SessionListPanel.jsx`），对外暴露两个静态方法 `SessionListPanel.updateTitle(sessionId, title)` / `SessionListPanel.addSession(session)`；`PageLeft` props 由 `children` 改为 `{ character, currentSessionId, onSessionSelect, onSessionCreate, onSessionDelete }`
- **涉及文件**：`SessionListPanel.jsx`（新建）、`PageLeft.jsx`（重构）、`ChatPage.jsx`（移除 Sidebar，改接 PageLeft props + 更新静态方法引用）、`Sidebar.jsx`（加弃用注释）
- **注意**：`Sidebar.jsx` 保留不删（P8 清理）；`ChatPage.jsx` 仍需 `import SessionListPanel` 以调用静态方法（`SessionListPanel.updateTitle` / `SessionListPanel.addSession`）——静态方法在组件挂载时由渲染闭包写入，ChatPage 调用前确保 SessionListPanel 已渲染；`PageLeftTabs.jsx` 未曾实际创建，T63 不处理

## T62A — refactor: 布局方案调整（三栏 + 档案侧页） ✅
- **对外接口**：无代码改动，仅文档更新
- **涉及文件**：`DESIGN.md`（§5.1/§5.3/§5.4/新增§5.5/更新§6.1/§10.2/§12）、`ROADMAP.md`（T63/T64 重定义，T66 SSE 数据流更新）
- **注意**：原 DESIGN §5.3 的左页双 Tab（[会话] | [角色状态]）方案废弃，改为三栏固定布局——左页 260px 纯会话列表 / 中页 flex:1 对话区 / 右侧档案页 280px StatePanel；StatePanel 取代旧 MemoryPanel，统一呈现角色印章 + 角色/玩家/世界三层状态 + 时间线 + 召回批注；`PageLeftTabs.jsx` 保留但废弃（P8 清理）；T63/T64 Claude Code 指令已同步更新

## T62 — refactor: 消息组件重构：稳定类名 + inkRise + Drop Cap + 流式光标 ✅
- **对外接口**：新增 `StreamingCursor` 组件；`MessageItem` 新增 `isChapterFirstAssistant` prop；`MessageList` 外层加 `we-chat-area` 类
- **涉及文件**：`frontend/src/styles/chat.css`（新建）、`frontend/src/components/chat/StreamingCursor.jsx`（新建）、`frontend/src/components/chat/MessageItem.jsx`（全面重写）、`frontend/src/components/chat/MessageList.jsx`（加 AnimatePresence + we-chat-area + isChapterFirstAssistant）、`frontend/src/main.jsx`（加 chat.css import）
- **注意**：消息气泡已完全去除（bg-ivory/rounded-2xl 全部移除），文字直接落于羊皮纸面；用户消息改为左侧 amber 竖线标注样式；操作按钮改为 Cormorant Garamond italic 小字，hover 变朱砂色；旧类名 `we-chat-message`/`we-chat-bubble` 已废弃，迁移到 `we-message-row`/`we-message-content` 等稳定锚点（见 DESIGN §10.2）——用户自定义 CSS 若依赖旧类名需更新

## T61 — feat: 顶部导航栏 TopBar + 路由挂载 ✅
- **对外接口**：新增 `TopBar` 组件 `frontend/src/components/book/TopBar.jsx`；所有页面共享，挂载于 App 根
- **涉及文件**：`TopBar.jsx`（新建）、`frontend/src/App.jsx`（根容器改为 `h-screen flex-col bg-book-bg`，挂载 TopBar）、`frontend/src/components/book/BookSpread.jsx`（去掉大 padding，改为 `height:100%` 铺满 Routes 区域，侧边仅保留 12px 细边）
- **注意**：TopBar 从 pathname 派生 worldId/characterId（正则匹配），不依赖 store——聊天页 URL 不含 worldId，故"选择世界"在聊天页显示占位（设计限制，T61 约束内）；ChatPage 内原有设置/收起按钮保留（T62 会清理）；BookSpread 书本顶部 border-radius 改为 `0 0 2px 2px`（顶部与 TopBar 齐平，无圆角）

## T60 — feat: 双页书本骨架：BookSpread / PageLeft / PageRight / 噪点 / 书签 ✅
- **对外接口**：新增 `BookSpread` `PageLeft` `PageRight` `ParchmentTexture` `Bookmark` 五个组件，路径 `frontend/src/components/book/`
- **涉及文件**：上述五个新建组件；`frontend/src/pages/ChatPage.jsx`（外层容器改为 BookSpread + PageLeft + PageRight，Sidebar 移入 PageLeft，对话区 + 记忆面板移入 PageRight）
- **注意**：PageRight 默认 padding `44px 52px 28px 60px`（书页内边距），ChatPage 用 `className="!p-0"` 覆盖——内部 we-main / MessageList / InputBox 已有自己的 padding，不能双层叠加；书脊阴影用独立绝对定位 div 实现（非 CSS 伪元素）；ParchmentTexture 渲染在书本最顶层（z-index:20）且 pointer-events:none

## T59 — refactor: CSS 变量 + 字体 + 动效 token 基础设施 ✅
- **对外接口**：`MOTION`、`INK_RISE` 从 `frontend/src/utils/motion.js` 导出；`--we-*` CSS 变量全局注入
- **涉及文件**：`frontend/src/styles/tokens.css`（新建）、`frontend/src/styles/fonts.css`（新建）、`frontend/src/utils/motion.js`（新建）、`frontend/src/main.jsx`（新增两行 import）、`frontend/index.html`（Google Fonts）、`frontend/package.json`（framer-motion ^11）
- **注意**：本任务不改变任何页面外观；tokens.css 同时含字号变量（`--we-text-*`、`--we-leading-*`），fonts.css 只含字族变量；framer-motion 打包后约 1.2MB（未 tree-shake），后续按需 import 动态组件可缩减体积

## T59A — refactor: 状态默认值/运行时值解耦 + 会话页清理 + 摘要篇幅收紧 ✅
- **对外接口**：`GET /api/worlds/:worldId/state-values`、`GET /api/characters/:characterId/state-values`、`GET /api/worlds/:worldId/persona-state-values` 现在统一返回 `default_value_json`、`runtime_value_json`、`effective_value_json`；新增 `PATCH /api/worlds/:worldId/state-values/:fieldKey`；三个 `POST .../state-values/reset` 语义改为“清空 runtime 并回退默认值显示”
- **涉及文件**：`backend/db/schema.js`、`backend/db/queries/*state-values.js`、`backend/services/state-values.js`、`backend/memory/combined-state-updater.js`、`backend/memory/recall.js`、`backend/memory/summarizer.js`、`backend/memory/turn-summarizer.js`、`backend/services/import-export.js`；`frontend/src/pages/WorldEditPage.jsx`、`CharacterEditPage.jsx`、`PersonaEditPage.jsx`、`ChatPage.jsx`、`frontend/src/components/memory/MemoryPanel.jsx`、`MultiCharacterMemoryPanel.jsx`、`frontend/src/api/worldStateValues.js`；`SCHEMA.md`、`ARCHITECTURE.md`
- **注意**：值表里的 `default_value_json` 才是编辑页保存的实体默认值，字段定义表 `default_value` 退回“模板初值/新对象种子”；LLM 只写 `runtime_value_json`，不会再覆盖默认值；导出卡只导出默认值层，不带运行时值；切换角色时聊天页会主动清掉跨角色残留 session，删除当前会话后中栏立即清空或切到剩余首项

## T58 — refactor: 配置探测安全校验 + 导入卡验证 + 流式辅助收敛 + 最小测试基线 ✅
- **对外接口**：`PUT /api/config` 现在会校验 `base_url`；本地 provider 仅允许 localhost/127.0.0.1，远程 provider 自定义 `base_url` 必须是 https 且不能指向本机/私网；`/api/config/models` 与 `/embedding-models` 也走同样约束
- **涉及文件**：`backend/utils/network-safety.js`（新增 `validateModelFetchBaseUrl`）、`backend/routes/config.js`（配置写入与模型探测共用校验）、`backend/services/import-export-validation.js` 与 `backend/services/import-export.js`、`backend/routes/import-export.js`（导入卡结构/大小/头像体积验证）、`backend/routes/stream-helpers.js`、`backend/routes/chat.js`、`backend/routes/writing.js`（抽取共用 SSE / stream session / continue 消息拼装）、`backend/tests/*.test.js`、`backend/package.json`
- **注意**：这轮只做“保功能不变”的代码收敛，没有改变 chat / writing 现有对外行为；新增测试是 `node:test` 纯单元测试，当前只覆盖安全校验、导入卡验证和状态值纯函数，不含端到端路由测试

## T57 — bugfix: 收紧本机访问边界 + 状态值写入收口 + 设置字段修正 ✅
- **对外接口**：新增受本机访问限制的文件读取路径 `GET /api/uploads/*`，前端头像/附件改走该接口；`/api` 全部请求仅允许本机来源访问，默认监听地址改为 `127.0.0.1`
- **涉及文件**：`backend/server.js`（本机访问限制、CORS 收紧、上传文件改为受控路由）、`backend/services/state-values.js`（新增状态值校验/重置业务层）、`backend/routes/world-state-values.js`、`backend/routes/character-state-values.js`、`backend/routes/persona-state-values.js`（不再在路由层直接写 DB）、`backend/routes/writing.js`（写作模式 `/continue` 补跑 `updateAllStates`）、`frontend/src/pages/SettingsPage.jsx`（统一使用 `context_history_rounds`）、`frontend/src/utils/avatar.js`、`frontend/src/components/chat/MessageItem.jsx`、`frontend/vite.config.js`
- **注意**：这次**没有**改动“自定义 CSS / 正则规则可写”这一设计；上传文件现在不再公开挂载整个 `/uploads` 目录，若后续新增图片/附件展示入口，统一使用 `/api/uploads/...`；状态值写入现在会校验 JSON、字段存在性和类型约束，不合法输入会直接 400

## T56 — bugfix: 修复状态空值自动补全的初始化语义 + 历史数据迁移 ✅
- **对外接口**：无新增接口；启动时 `initSchema(db)` 会一次性执行历史状态值清洗迁移
- **涉及文件**：`backend/services/worlds.js`、`backend/services/characters.js`、`backend/services/persona-state-fields.js`（无 `default_value` 时不再自动写入类型占位值）；`backend/routes/chat.js`（`edit-assistant` 编辑最后一条 AI 消息时补跑 `updateAllStates`）；`backend/db/schema.js`（新增 `internal_meta` 表并执行一次性迁移）
- **注意**：T54 的“空值自动补全”判定依赖状态值为 `NULL`；旧逻辑会把无默认值字段初始化成 `""/0/false/[]`，导致首轮对话不被视为“未设置”。本次迁移只清理与旧占位默认值完全一致、且时间戳接近创建时刻的历史值，避免误清用户后来手动设置的值；枚举首项因无法可靠区分“占位”与“真实选择”，本次不自动迁移

## T55 — bugfix: 修复编辑消息重新生成时状态栏泄漏到气泡 ✅
- **对外接口**：无新增接口
- **涉及文件**：`backend/routes/chat.js`（`/regenerate` 路由改用 `deleteTurnRecordsAfterRound`）、`backend/prompt/assembler.js`（[14] 新增 `stripAsstContext` 剥除 asst_context 中 "AI：" 前缀和状态块）
- **注意**：两处 bug：① `/regenerate` 原来只调 `deleteLastTurnRecord`，编辑旧消息时会留下多余 turn records；现改为按剩余 user 消息数计算当前轮号 R，调 `deleteTurnRecordsAfterRound(sessionId, R-1)`；② [14] turn record 的 `asst_context` 含 "AI：" 前缀 + 状态块，LLM 模仿格式输出状态，现在渲染前统一剥除；`stripAsstContext` 也兼容旧格式历史记录；`/continue` 路由的 pop 逻辑不受影响

## T54 — feat: 气泡复制按钮 + 用户消息编辑移到下方 + AI消息编辑 + 状态空值自动补全 ✅
- **对外接口**：新增后端路由 `POST /api/sessions/:sessionId/edit-assistant`（body: `{messageId, content}`）；新增前端 `editAssistantMessage(sessionId, messageId, content)` in `api/chat.js`；`MessageItem` 新增 `onEditAssistant` prop
- **涉及文件**：`backend/routes/chat.js`（新增 edit-assistant 路由）、`backend/memory/combined-state-updater.js`（修改 prompt 指令）、`frontend/src/api/chat.js`、`frontend/src/pages/ChatPage.jsx`、`frontend/src/components/chat/MessageList.jsx`、`frontend/src/components/chat/MessageItem.jsx`
- **注意**：edit-assistant 路由只更新消息内容 + 以 `isUpdate:true` 重新入队 turn-record（覆盖最后一条），不重新跑状态更新；空值自动补全只在 `update_mode=llm_auto` + 非 `manual_only` 触发模式的字段生效；用户消息编辑按钮从气泡上方移至下方悬停区（与复制同排）；AI 消息编辑进入 textarea 模式，保存后不重新生成 AI 回复

## T53 — bugfix: 修复 /continue 气泡仍显示"..."+ 角色状态栏不更新 ✅
- **问题 1**：`MessageList.jsx` 的续写消息项未传 `streamingText` prop，导致 `MessageItem` 判断 `isStreaming && !streamingText` 后始终显示"..."打点动画
- **问题 2**：`combined-state-updater.js` 用角色名作为 JSON 顶层 key（如 `"小绿": {...}`），LLM 经常用别名/不精确名称，导致 `patch[char.name]` 永远找不到，静默跳过，状态栏无法更新
- **修复前端**：`MessageList.jsx` 续写 `MessageItem` 加 `streamingText={isContinuing ? displayMsg.content : undefined}`，续写期间直接展示原内容+新增内容并带光标
- **修复后端**：`combined-state-updater.js` 改用索引 key `"char_0"`, `"char_1"` 代替角色名；prompt 中明确标注每个角色对应的 key；示例也随之更新

## T52 — bugfix: 修复 /continue 气泡闪烁 + 状态信息泄露 ✅
- **问题 1**：续写结束时 `finalizeStream` 先清 `continuingText`→消息回到原始内容，再调 `refreshMessages` 重挂载 MessageList 重拉数据，中间有闪烁
- **问题 2**：`/continue` 用 `buildContext`（末尾是 [16] user 消息）调 LLM，LLM 相当于"重新回答"而非续写；且 [14] turn record 的 `asst_context` 含 `"AI："前缀 + 角色状态后缀`，LLM 会模仿此格式在输出中带入状态信息
- **修复前端**：`ChatPage.jsx` 加 `continuingMessageIdRef`/`continuingTextRef`，`finalizeStream` 续写时原地合并消息内容（`MessageList.updateMessages`），不调 `refreshMessages()`
- **修复后端**：`chat.js` + `writing.js` 的 `/continue` 路由，在 `buildContext` 后：① pop 末尾所有 user 消息；② 若有 turn record，pop `asst_context(K)` 和 `user_context(K)`；③ push 裸 user 消息；④ push `originalContent` 作为 assistant prefill
- **注意**：prefill（以 assistant 结尾）在 Anthropic、Gemini、多数 OpenAI-compatible 均支持；若某 provider 不支持会在 catch 中报错

## T51c — bugfix: 补全 [{{char}}人设] 抬头 ✅
- **问题**：角色 system_prompt（[6] 段）裸文本推入，无标签；而人设有 `[{{user}}人设]` 标签，不对称，AI 容易混淆玩家与角色
- **修改**：`buildPrompt` [6] 改为 `tv('[{{char}}人设]\n' + system_prompt)`；写作模式 `[角色：${name}]` 统一改为 `tvChar('[{{char}}人设]\n' + system_prompt)` 格式

## T51b — bugfix: 模板变量补丁：状态区块头 + assembler 修复 ✅
- **对外接口**：无新增接口，补全 T51 遗漏的替换点
- **涉及文件**：`backend/memory/recall.js`（`[玩家状态]`/`[世界状态]`/`[角色状态]` 改为 `[{{user}}状态]`/`[{{world}}状态]`/`[{{char}}状态]`）；`backend/prompt/assembler.js`（`[用户人设]` 改为 `[{{user}}人设]`，写作模式 `charStateText` 从 `tv()` 改为 `tvChar()` 以使用角色作用域替换）
- **注意**：T51 原 commit 漏提交 recall.js，且 assembler.js 人设区块头和写作模式角色状态未做替换；本补丁补全这两处

## T51 — feat: 模板变量 {{user}} / {{char}} / {{world}} ✅
- **对外接口**：新增 `applyTemplateVars(text, ctx)` 工具函数（`backend/utils/template-vars.js`）；ctx = `{ user, char, world }`，大小写不敏感（`gi` flag），null/undefined 原样返回
- **涉及文件**：`backend/utils/template-vars.js`（新建）；`backend/prompt/assembler.js`（`buildPrompt` 和 `buildWritingPrompt` 均在 systemParts 注入前应用替换）；`backend/memory/recall.js`（状态区块抬头改用 `{{world}}状态`/`{{user}}状态`/`{{char}}状态` 占位符，由 assembler.js 的 tv() 统一替换）
- **注意**：替换仅在提示词组装时发生，不修改数据库原始文本。[14] 历史消息和 [16] 当前用户消息**不替换**（对话内容非配置模板）。写作模式多角色场景：共享段（[1]-[5][8-11][15]）用首个激活角色名作为 `{{char}}` fallback；[6-7] per-character 段用各自角色名；写作模式角色状态抬头（`[{{char}}状态]`）用 `tvChar()` 替换，保证每个角色用自己的名字

## T50 — feat: 写作模式支持 turn_records ✅
- **对外接口**：无新增接口；`createTurnRecord` 现在同时支持 chat 和 writing session
- **涉及文件**：`backend/memory/turn-summarizer.js`（从 `session.world_id` 兜底取世界；写作模式 charStateText 拼接所有激活角色状态）；`backend/prompt/assembler.js`（`buildWritingPrompt` [14] 改为与 `buildPrompt` 相同的 turn records + 降级逻辑）；`backend/routes/writing.js`（`/generate` P3 入队 `createTurnRecord`；`/continue` P3 入队 `createTurnRecord(isUpdate:true)`）
- **注意**：写作模式 generate 不强依赖 user 消息（用户可不输入就生成），`createTurnRecord` 内部若无 user/assistant 消息对会静默跳过，不报错

## T49 — refactor: Per-turn 摘要系统重构 ✅
- **对外接口**：新增 `createTurnRecord(sessionId, { isUpdate? })` 用于每轮结束后创建/更新 turn record；`generateTimelineEntry(sessionId)` 替代旧 `maybeCompress`（被 `/api/sessions/:id/summary` 路由调用）；`deleteLastTurnRecord(sessionId)` 被 `/regenerate` 路由调用；`recall.js` 的 `searchRecalledSummaries` 现在返回 turn_record 粒度的召回结果
- **涉及文件**：
  - **新增**：`backend/db/queries/turn-records.js`、`backend/utils/turn-summary-vector-store.js`、`backend/memory/turn-summarizer.js`
  - **修改**：`backend/db/schema.js`（新增 turn_records 表）、`backend/utils/constants.js`（新增 `MEMORY_RECALL_SAME_SESSION_THRESHOLD`）、`backend/services/config.js`（`context_compress_rounds` → `context_history_rounds`）、`backend/memory/recall.js`（改用 turn-summary-vector-store，双阈值召回）、`backend/memory/summary-expander.js`（`renderExpandedSessions` → `renderExpandedTurnRecords`，读 turn record 原文而非 session messages）、`backend/prompt/assembler.js`（完整 16 段新组装顺序）、`backend/memory/context-compressor.js`（移除 `maybeCompress`，改为 `generateTimelineEntry`）、`backend/routes/chat.js`（队列变更：移除 P1 compress，P3 新增 `createTurnRecord`；/regenerate 加 `deleteLastTurnRecord`；/continue 加 `isUpdate:true`）、`backend/services/cleanup-registrations.js`（注册 turn_summaries 向量清理钩子）
- **注意**：
  - turn record 在 P3 末尾入队，确保所有 P2（char/persona 状态）和 P3（world 状态）更新完毕后才创建，捕获本轮**结果状态**
  - `/continue` 续写后调用 `createTurnRecord(sessionId, { isUpdate: true })`，通过 UPSERT 覆盖同 round_index 的旧记录（不增加新轮次）
  - 旧 session（无 turn records）自动降级：assembler.js [14] 检测 `turnRecords.length === 0` 时用 `getUncompressedMessagesBySessionId` 路径，向后兼容
  - `session_summaries` 表保留（存档旧数据），T35 起不再写入
  - `turn_records` 表的级联删除由 SQLite `ON DELETE CASCADE` 自动处理，无需业务代码
  - 配置键 `context_compress_rounds` 已重命名为 `context_history_rounds`，现有 config.json 需手动迁移（或重置后自动初始化）

## T48 — feat: 记忆面板状态栏重置按钮 ✅
- **对外接口**：新增三个 POST 路由：`POST /api/worlds/:worldId/state-values/reset`、`POST /api/characters/:characterId/state-values/reset`、`POST /api/worlds/:worldId/persona-state-values/reset`；各返回重置后的状态值数组（同各自的 GET 返回格式）
- **涉及文件**：`backend/routes/world-state-values.js`（新增 reset 端点）；`backend/routes/character-state-values.js`（新增 reset 端点，新增 `getCharacterById` 和 `getCharacterStateFieldsByWorldId` import）；`backend/routes/persona-state-values.js`（新增 reset 端点，新增 `getPersonaStateFieldsByWorldId` import）；`frontend/src/api/worldStateValues.js`、`characterStateValues.js`、`personaStateValues.js`（各新增 reset 函数）；`frontend/src/components/memory/MemoryPanel.jsx` 和 `MultiCharacterMemoryPanel.jsx`（Section 组件加 onReset/resetting prop，三个状态栏各加重置按钮）
- **注意**：重置使用 `field.default_value`（用户在字段编辑器填写的值），若 default_value 为 null 则清空该字段（设为 null）；重置成功后直接用接口返回值更新前端 state，无需再发 GET；hover 样式用 `hover:bg-accent/10 hover:text-accent`（Tailwind v4 主题色）；世界时间线 Section 不加重置按钮

## T47 — bugfix: 修复状态更新器混淆玩家与角色身份 ✅
- **对外接口**：无新增接口；仅修改两个状态更新器内部 prompt
- **涉及文件**：`backend/memory/character-state-updater.js`（对话标签从"用户"改为"玩家"；prompt 加入边界说明，明确只追踪角色自身变化）；`backend/memory/persona-state-updater.js`（新增从 session 查角色名；对话标签从泛称"角色"改为具体角色名；prompt 加入对称边界说明，明确只追踪玩家自身变化）
- **注意**：根本原因是两个更新器的 prompt 均未告知 LLM"另一方有独立状态系统"，导致 LLM 对共享字段名（coin/identity/items 等）同时用玩家事件更新双方；writing session 无 character_id 时 characterName 回退为"角色"（泛称），不影响写作模式

## T46 — refactor: 设置页加宽 + 所有编辑页操作按钮固定顶栏 ✅
- **对外接口**：无新增接口；纯 UI 重构
- **涉及文件**：`frontend/src/pages/SettingsPage.jsx`（`max-w-2xl` → `max-w-[56rem]`；新增 `sticky top-0 z-40` 顶栏含返回+保存；移除 "通用配置" section 内联保存按钮）；`frontend/src/pages/WorldEditPage.jsx`（外层容器重构为顶栏+内容区两段；顶栏含返回/设置/导出世界卡/保存；移除底部按钮行）；`frontend/src/pages/CharacterEditPage.jsx`（同世界编辑页结构；顶栏含导出角色卡+保存；saveError 保留在表单原位置）；`frontend/src/pages/PersonaEditPage.jsx`（顶栏含导出为角色卡+保存；移除底部按钮行）
- **注意**：顶栏采用 `sticky top-0 z-40 bg-canvas border-b border-border`（不用 `fixed`，避免需要 body padding 补偿）；"设置"导航链接与操作按钮组之间加 `<span className="border-l border-border h-4" />` 竖线分隔；SettingsPage 顶栏"保存"只作用于 `handleSaveGeneral`（通用配置字段），LLM/Embedding 各字段仍逐字段自动保存，行为不变

## T45A — docs: 新增 ARCHITECTURE.md + 精简 CLAUDE.md ✅
- **对外接口**：无代码改动；新增 `ARCHITECTURE.md` 作为架构快照（覆盖式维护，15 节，447 行）
- **涉及文件**：新增 `ARCHITECTURE.md`；修改 `CLAUDE.md`（213 行，从 269 行精简，"关键设计速查"节从 ~70 行压缩至 ~12 行，架构描述迁移至 ARCHITECTURE.md）
- **注意**：CLAUDE.md 只保留约束与规则；ARCHITECTURE.md 描述当前系统现状，每次大特性完成后覆盖式更新对应节；两文件职责不重叠——SCHEMA.md 管字段，CLAUDE.md 管规则，ARCHITECTURE.md 管运行时行为

## T45 — refactor: Prompt 编辑框可调高度 + 创建/编辑页面宽度扩展 ✅
- **对外接口**：无新增接口；`MarkdownEditor` prop `minHeight` 含义变化：原为 CSS `min-height`（自动拉伸），现为初始固定 `height`（用户可拖动调整）
- **涉及文件**：`frontend/src/components/ui/MarkdownEditor.jsx`（`style={{ minHeight }}` → `style={{ height: minHeight }}`）；`frontend/src/index.css`（`.we-md-content` 加 `overflow-y: auto / resize: vertical / min-height: 60px / border-bottom-radius: 7px`，追加 webkit 滚动条样式）；5 个页面 `max-w-2xl` → `max-w-[56rem]`：`WorldCreatePage` / `WorldEditPage` / `CharacterCreatePage` / `CharacterEditPage` / `PersonaEditPage`
- **注意**：`minHeight` prop 传入的 px 值既是初始高度也是 `min-height: inherit` 给 ProseMirror 的参照，ProseMirror 仍会填满可见区；滚动条宽 6px，`.we-md-editor` 不需要 `overflow: hidden`，底部圆角由 `.we-md-content` 的 `border-bottom-*-radius: 7px` 收束

## T44 — bugfix: 创建页面对齐编辑页面 + 世界级模型参数下线 + Provider 切换 Bug 修复 ✅
- **对外接口**：新增路由 `/worlds/new` → `WorldCreatePage`；`/worlds/:worldId/characters/new` → `CharacterCreatePage`；两个创建页创建完成后用 `navigate(url, { replace: true })` 跳到编辑页（创建页不留在历史栈中，返回键直达列表）
- **涉及文件**：新增 `frontend/src/pages/WorldCreatePage.jsx`、`frontend/src/pages/CharacterCreatePage.jsx`；修改 `App.jsx`（注册两条新路由，`/worlds/new` 放在 `/worlds/:worldId` 之前）；修改 `WorldsPage.jsx`（删除 WorldFormModal，创建按钮改 navigate）；修改 `CharactersPage.jsx`（删除 CreateCharacterModal，创建按钮改 navigate）；修改 `WorldEditPage.jsx`（删除 temperature/maxTokens state 和 UI，保存时始终发 `temperature: null, max_tokens: null` 清除 DB 中旧值）；修改 `SettingsPage.jsx`（LLM 卡片追加 Temperature 滑块和 Max Tokens 输入；handleLlmChange/handleEmbeddingChange 切 provider 时同步清空 model；ModelSelector.load() 加载完成后若 value 为空或不在列表中自动选第一个模型）
- **注意**：worlds 表仍有 temperature/max_tokens 列，不删除 schema；现有世界中旧的非 null 值在下次保存时会被清为 null（assembler.js 已有 `world.temperature ?? config.llm.temperature` fallback，行为正确）；ModelSelector 自动选模型会触发 onChange→handleLlmChange('model')→patchConfig 保存，属预期行为；embedding provider 切换同样修复了相同 bug

## T43 — refactor: 编辑界面统一全屏+加宽 ✅
- **对外接口**：新增路由 `/worlds/:worldId/edit` → `WorldEditPage`，`/worlds/:worldId/persona` → `PersonaEditPage`
- **涉及文件**：新增 `frontend/src/pages/WorldEditPage.jsx`、`frontend/src/pages/PersonaEditPage.jsx`；修改 `App.jsx`（注册路由）、`WorldsPage.jsx`（WorldFormModal 简化为纯创建，编辑按钮改为 navigate）、`CharactersPage.jsx`（移除 PersonaEditModal 和 StateValueField，玩家编辑改为 navigate）、`CharacterEditPage.jsx`（max-w-lg → max-w-2xl）
- **注意**：创建世界仍用 Modal（WorldFormModal），编辑世界才走全屏页；PersonaCard 返回后自动刷新（React Router 重新挂载 CharactersPage），不再需要 personaRefreshKey；WorldFormModal 已移除 `initial` prop，不再支持编辑模式

## T42 — feat: 无会话时发送消息自动建会话 ✅
- **对外接口**：无新增接口；复用 `createSession(characterId)` from `api/sessions.js`
- **涉及文件**：`frontend/src/pages/ChatPage.jsx`（`handleSend` 改为 async，guard 拆分，新增自动建会话逻辑）、`frontend/src/components/chat/Sidebar.jsx`（新增 `Sidebar.addSession` 静态方法，与 `Sidebar.updateTitle` 同模式）
- **注意**：`enterSession` 内部会调用 `setMessageListKey(k+1)` 重置消息列表，乐观 user 消息会随之丢失（新会话为空，可接受）；流式内容通过 `streamingText` state 正常展示；`Sidebar.addSession` 在同帧注册，React 批量更新后即可感知新会话

## T41 — bugfix: 角色卡跨世界导入兼容性校验 ✅
- **对外接口**：无新增接口；复用 `listCharacterStateFields(worldId)`
- **涉及文件**：`frontend/src/pages/CharactersPage.jsx`（`handleImportCharFile` 中插入校验逻辑；新增 `listCharacterStateFields` import）
- **注意**：`character_state_values` 为空或长度 0 时跳过校验直接导入；目标世界无字段但角色卡有状态值时同样视为不兼容报错；错误提示用原有 `alert()`，与页面风格一致；后端的静默跳过逻辑保留作为保底

## T40 — feat: 记忆面板实时更新感知 ✅
- **对外接口**：无新增接口；复用 `getPersonaStateValues` / `getWorldStateValues` / `getCharacterStateValues` / `getWorldTimeline` 轮询
- **涉及文件**：`frontend/src/store/index.js`（新增 `memoryRefreshTick` + `triggerMemoryRefresh`）、`frontend/src/pages/ChatPage.jsx`（`finalizeStream` 末尾调用 `triggerMemoryRefresh`，移除右栏外部标题头）、`frontend/src/components/memory/MemoryPanel.jsx`（内置标题头含脉冲指示、`tick` 订阅、3s 轮询 + 20s 超时）
- **注意**：轮询以 JSON.stringify 对比快照判断数据是否变化；轮询失败直接 setIsPolling(false) 静默停止；`tick === 0` 时不启动轮询（挂载时不触发）；标题头从 ChatPage 移入 MemoryPanel 以便内联展示指示

## T35A — refactor: MarkdownEditor 改为 tiptap 真正 WYSIWYG ✅
- **问题**：原 T35 用 `@uiw/react-md-editor`（preview=live），渲染为左右分栏，不是所见即所得
- **修改**：移除 `@uiw/react-md-editor`，改用 `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-placeholder` + `tiptap-markdown`；`MarkdownEditor.jsx` 重写为 tiptap WYSIWYG，内容直接以富文本形式渲染（无分栏、无可见 markdown 符号）
- **涉及文件**：`frontend/src/components/ui/MarkdownEditor.jsx`（重写）、`frontend/src/index.css`（去掉旧 `.we-md-editor` 块，换成 tiptap `.ProseMirror` 样式）、`frontend/package.json`
- **注意**：组件 API（value/onChange/placeholder/minHeight/className）保持不变，调用方零改动；光标同步用 `useEffect` 比对当前 markdown 与 prop，仅外部变更时才调用 `setContent`

## T38 — feat: 玩家卡导出为角色卡 ✅
- **对外接口**：`GET /api/worlds/:worldId/persona/export` → 返回 worldengine-character-v1 格式 JSON
- **涉及文件**：`backend/services/import-export.js`（新增 `exportPersona`）、`backend/routes/import-export.js`（新增路由）、`frontend/src/api/importExport.js`（新增 `exportPersona`/`downloadPersonaCard`）、`frontend/src/pages/CharactersPage.jsx`（PersonaEditModal 底部加「导出为角色卡」按钮）
- **注意**：personas 表无 first_message/post_prompt 列，导出时固定填空字符串；底部操作区由 `justify-end` 改为 `justify-between`，左侧放导出按钮，右侧保留取消/保存

## T37 — feat: 对话消息 CSS+HTML 渲染支持 ✅
- **对外接口**：无新增接口
- **涉及文件**：`frontend/src/components/chat/MessageItem.jsx`、`frontend/package.json`
- **注意**：仅 assistant 消息的 ReactMarkdown 加了 `rehypePlugins={[rehypeRaw, rehypeSanitize]}`；流式状态仍用 whitespace-pre-wrap 纯文本，不走 ReactMarkdown，未改动；sanitize 使用 rehype-sanitize 默认规则（允许常规 HTML 标签，过滤 script/on* 等危险属性）

## T36 — bugfix: 状态字段表单逻辑修正 ✅
- **对外接口**：无新增接口
- **涉及文件**：`frontend/src/components/state/StateFieldEditor.jsx`、`backend/db/queries/world-state-fields.js`、`backend/db/queries/character-state-fields.js`、`backend/db/queries/persona-state-fields.js`
- **注意**：allow_empty 控件已从前端移除，handleSave 中硬编码为 `allow_empty: 1`（后端字段保留）；当 update_mode==='manual' 时，trigger_mode 整块（含关键词 tag 区域）不渲染；三个 queries 文件中新建字段的默认值已改为 `llm_auto` / `every_turn`

## T35 — feat: Prompt 编辑框 WYSIWYG + 体验优化 ✅
- **对外接口**：新增 `frontend/src/components/ui/MarkdownEditor.jsx`，Props: `value`, `onChange(v: string)`, `placeholder`, `minHeight`, `className`
- **涉及文件**：`frontend/src/components/ui/MarkdownEditor.jsx`（新建）、`frontend/src/components/ui/Textarea.jsx`（resize-y）、`frontend/src/index.css`（MDEditor 样式覆盖）、`frontend/src/pages/SettingsPage.jsx`、`frontend/src/pages/WorldsPage.jsx`、`frontend/src/pages/CharacterEditPage.jsx`、`frontend/src/pages/CharactersPage.jsx`、`frontend/src/components/prompt/EntryEditor.jsx`
- **注意**：`MarkdownEditor` 的 `onChange` 接收字符串值（非 event 对象），与普通 textarea 不同——替换时需将 `(e) => setState(e.target.value)` 改为 `(v) => setState(v)` 或直接传 `setState`；`data-color-mode="light"` 强制浅色主题；`hideToolbar={false}` 仅保留 5 个工具按钮；`StateFieldEditor` 的 description/update_instruction 仍为纯 textarea，不受影响

## T39 — refactor: 状态字段编辑入口重构 ✅
- **对外接口**：新增 `PATCH /api/characters/:characterId/state-values/:fieldKey` 和 `PATCH /api/worlds/:worldId/persona-state-values/:fieldKey`；前端新增 `updateCharacterStateValue` / `updatePersonaStateValue`
- **涉及文件**：`backend/routes/character-state-values.js`、`backend/routes/persona-state-values.js`、`backend/db/queries/character-state-values.js`（getCharacterStateValuesWithFields 加 enum_options）、`backend/db/queries/persona-state-values.js`（同上）、`frontend/src/api/characterStateValues.js`、`frontend/src/api/personaStateValues.js`、`frontend/src/pages/WorldsPage.jsx`（世界编辑弹窗追加角色/玩家状态字段两个 StateFieldList）、`frontend/src/pages/CharacterEditPage.jsx`（移除 StateFieldList，改为状态值编辑面板）、`frontend/src/pages/CharactersPage.jsx`（PersonaEditModal 同步）
- **注意**：各页面内嵌了 `StateValueField` 组件（未提取为独立文件）；boolean/enum 即时保存（onChange），text/number/list 失焦保存（onBlur）；list 类型展示为逗号分隔字符串，保存时 split 转 JSON 数组；enum 渲染需要 enum_options，故两个联表查询均已补充该字段

## T34A — chore: 规划 T35-T42 ✅
- **内容**：基于试用反馈规划了 8 个新任务，已追加到 ROADMAP.md 阶段 5
- **任务列表**：T35（Prompt编辑框WYSIWYG）、T36（状态字段表单修正）、T37（消息HTML渲染）、T38（玩家卡导出）、T39（状态字段入口重构，依赖T36）、T40（记忆面板实时刷新，建议T39后）、T41（角色卡导入兼容性校验）、T42（无会话自动建会话）
- **注意**：T35 需安装 @uiw/react-md-editor；T37 需安装 rehype-raw + rehype-sanitize；T39 必须在 T36 后执行

## T34 — feat: 写作空间 ✅
- **入口**：角色选择页右上角 "写作空间" 按钮 → `/worlds/:worldId/writing`
- **路由（后端）**：`/api/worlds/:worldId/writing-sessions` 及子路由，注册在 `server.js` 的 `app.use('/api/worlds', writingRoutes)`
- **DB 迁移**：`sessions` 表通过 table-recreation 将 `character_id NOT NULL` 改为可空，同时新增 `world_id`（FK→worlds）和 `mode TEXT DEFAULT 'chat'`；新增 `writing_session_characters` 联结表（session_id, character_id UNIQUE）；迁移逻辑在 `initSchema` 末尾，先检测 `PRAGMA table_info(sessions)` 中 `charCol.notnull === 1` 再执行
- **对外接口**：`buildWritingPrompt(sessionId, options?)` 追加在 `assembler.js` 末尾，不修改 `buildPrompt`；写作路由在 `routes/writing.js`；写作 service 在 `services/writing-sessions.js`；DB 查询在 `db/queries/writing-sessions.js`
- **激活角色**：通过 `writing_session_characters` 表动态管理，可在会话中随时增删；`buildWritingPrompt` 循环所有激活角色注入 [4][5][6]
- **状态更新**：生成完成后并行 enqueue 所有激活角色的 `updateCharacterState`（优先级 2）+ persona 状态 + 世界状态
- **前端组件**：`WritingSpacePage`（主页）、`WritingSidebar`（会话列表）、`WritingMessageList/Item`（散文展示，无气泡）、`MultiCharacterMemoryPanel`（含激活角色选择器）、`ActiveCharactersPicker`；API 封装在 `api/writingSessions.js`
- **注意**：写作会话 `character_id = NULL`，`mode = 'writing'`；旧 chat 会话自动补 `mode = 'chat'`；`getWritingSessionById` 查询条件含 `mode = 'writing'` 防误用普通会话 id

## T33 — feat: 状态字段 list 类型 ✅
- **新增类型**：状态字段（世界/角色/玩家）支持 `list`（字符串列表）类型，适用于装备列表、物品列表等场景
- **存储**：`value_json` 存 JSON 数组字符串（`["条目1","条目2"]`），无需改动数据库 schema
- **LLM 更新策略**：替换整个列表（LLM 返回完整新数组）；容错：LLM 返回逗号/顿号字符串时自动 split 转换
- **渲染**：`recall.js` 和 `MemoryPanel.jsx` 中用顿号（`、`）拼接条目，注入格式为 `- 背包：长剑、圆盾`
- **前端编辑器**：`StateFieldEditor.jsx` 新增"默认条目"tag-input（type=list 时替换普通默认值输入框）
- **涉及文件**：`SCHEMA.md`、`recall.js`、`character/world/persona-state-updater.js`（fieldsDesc + validateValue）、`services/characters.js`、`services/worlds.js`、`StateFieldEditor.jsx`、`StateFieldList.jsx`、`MemoryPanel.jsx`

## T29B — refactor: 组件样式重构 ✅
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

## T29A — refactor: 设计令牌落地 & 视觉基线审计 ✅
- **对外接口**：无新路由；仅 CSS 变量层，所有 `--we-*` 变量通过 `:root` 定义，并通过 `@theme` 暴露为 Tailwind v4 工具类
- **涉及文件**：
  - `frontend/src/index.css` — 重写：删除 `prefers-color-scheme: dark` 块及旧变量（`--text`/`--bg`/`--accent` 等）；新增 26 个 `--we-*` 变量（画布/表面/品牌/文字/边框/阴影/字体/圆角）；新增 `@theme` 块映射 Tailwind 工具类；`body` 背景改 `var(--we-canvas)`；`typing-dot` 背景色改 `var(--we-text-tertiary)`；全局 `font-size` 从 15px 改 16px；字体栈改 `var(--we-sans)`
  - `frontend/DESIGN_AUDIT.md` — 新建，临时审计产物（T29B 完成后删除）：设计令牌清单、钩子类名清单（25 个）、字体回退策略、组件变更清单、T24A 兼容约定
- **注意**：
  - 本任务 0 行组件改动，组件 className 未动，T29B 按 DESIGN_AUDIT.md 施工
  - 旧紫色 `--accent: #7c3aed` 已删除；新陶土色 `--we-accent: #c96442` 作为品牌色
  - Tailwind v4 `@theme` 里的 `--color-*` 是框架约定必须写；用户层变量统一 `--we-*` 前缀避免冲突

## T32 — refactor: 会话上下文轮次压缩（Context Compression） ✅
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

## T31 — feat: 后置提示词 + 组装顺序调整 ✅
- **对外接口**：后置提示词在 assembler.js 内部拼接，无新路由；存储透传现有 PUT /api/worlds/:id 和 PUT /api/characters/:id
- **涉及文件**：`backend/prompt/assembler.js`、`backend/db/schema.js`、`backend/db/queries/worlds.js`、`backend/db/queries/characters.js`、`backend/services/config.js`、`frontend/src/pages/SettingsPage.jsx`、`frontend/src/pages/WorldsPage.jsx`、`frontend/src/pages/CharacterEditPage.jsx`、`SCHEMA.md`、`CLAUDE.md`
- **注意**：[2][3] 顺序已对调（世界 SP 现在在 Persona 前）；后置提示词为三层叠加（全局→世界→角色），全为空时不追加任何消息；现有 DB 通过 ALTER TABLE 迁移，无需重置

## T30A — feat: 副作用资源生命周期自动维护 ✅
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

## T30 — feat: 玩家头像 + 斜杠命令去重 ✅
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

## T29C — bugfix: 错误气泡 / 设置入口 ✅
- **对外接口**：无新接口，纯前端
- **涉及文件**：
  - `frontend/src/pages/ChatPage.jsx` — 新增 `errorBubble` state、`streamingTextRef` ref、`handleRetryAfterError()`；`onError` 回调现在捕获部分内容并设置 errorBubble（不再丢失流中内容）；顶栏加设置齿轮按钮；发送/切换会话时清除 errorBubble
  - `frontend/src/pages/CharactersPage.jsx` — 页头加"设置"按钮
  - `frontend/src/pages/CharacterEditPage.jsx` — 导航栏加"设置"链接
- **注意**：
  - 错误气泡渲染在 `MessageList` 和 `InputBox` 之间（ChatPage 内），而非 MessageList 内部，避免破坏 MessageList 的 key/刷新逻辑
  - `streamingTextRef` 与 `streamingText` state 同步更新，用于在 `onError` 闭包（可能有 stale state）中正确取到部分内容
  - 编辑消息 → 自动重新生成已在 T28 前实现（`handleEditMessage` 调用 `editAndRegenerate`），本次未改变逻辑，仅补充了 `setErrorBubble(null)` 和 `streamingTextRef.current = ''` 的重置

## T28 — feat: 渐进式展开原文 ✅
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

## T27 — feat: 跨 Session Summary 召回 ✅
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

## T26D — bugfix: UI 归位后续调整 ✅
- **变更**：玩家人设编辑从 WorldFormModal 移出，改为 CharactersPage 的 PersonaCard 上的编辑按钮（PersonaEditModal，含玩家状态字段 StateFieldList）；角色状态字段从 WorldFormModal 移到 CharacterEditPage；WorldFormModal 仅保留世界状态字段；记忆面板顺序改为世界→玩家→角色→时间线
- **涉及文件**：`frontend/src/pages/WorldsPage.jsx`（移除 PersonaEditor、角色字段、玩家字段）、`frontend/src/pages/CharactersPage.jsx`（内联 PersonaCard + PersonaEditModal 替代旧组件）、`frontend/src/pages/CharacterEditPage.jsx`（加角色状态字段 StateFieldList）、`frontend/src/components/memory/MemoryPanel.jsx`（顺序调整）；删除 `PersonaCard.jsx`、`PersonaEditor.jsx` 独立组件文件
- **注意**：PersonaCard 编辑按钮 hover 显示（`group-hover:opacity-100`）；PersonaEditModal 保存按钮统一提交 name + system_prompt；CharacterEditPage 的 StateFieldList 用 `character.world_id` 作为 worldId

## T26C — feat: Persona 作为 World 下的一等对象 ✅
- **对外接口**：`GET/PATCH /api/worlds/:worldId/persona`；`GET/POST/PUT/DELETE /api/worlds/:worldId/persona-state-fields`、`PUT /api/worlds/:worldId/persona-state-fields/reorder`、`PUT/DELETE /api/persona-state-fields/:id`；`GET /api/worlds/:worldId/persona-state-values`
- **涉及文件**：
  - 修改：`backend/db/schema.js`（worlds 表删 persona_name/persona_prompt，新增 personas/persona_state_fields/persona_state_values 三表及索引）、`backend/db/queries/worlds.js`（移除 persona 字段）、`backend/services/worlds.js`（createWorld 时 upsert persona + 初始化 persona_state_values）、`backend/prompt/assembler.js`（[2] 改读 personas 表，[6] 新增 personaStateText 排最前）、`backend/memory/recall.js`（新增 renderPersonaState）、`backend/routes/chat.js`（runStream + /continue 两处任务链各加 persona state 更新，/impersonate 改读 personas 表）、`backend/services/import-export.js`（导出/导入新增 persona / persona_state_fields / persona_state_values 块，兼容旧格式）、`backend/server.js`（注册 3 个新路由）、`frontend/src/pages/WorldsPage.jsx`（移除旧 persona 表单字段，改为 PersonaEditor 组件，新增玩家状态字段 StateFieldList）、`frontend/src/pages/CharactersPage.jsx`（加入 PersonaCard）、`frontend/src/components/memory/MemoryPanel.jsx`（加入玩家状态区块）、`frontend/src/components/state/StateFieldList.jsx`（支持 scope='persona' 显示正确标签）
  - 新增：`backend/db/queries/personas.js`、`backend/db/queries/persona-state-fields.js`、`backend/db/queries/persona-state-values.js`、`backend/services/personas.js`、`backend/services/persona-state-fields.js`、`backend/routes/personas.js`、`backend/routes/persona-state-fields.js`、`backend/routes/persona-state-values.js`、`backend/memory/persona-state-updater.js`、`frontend/src/api/personas.js`、`frontend/src/api/personaStateFields.js`、`frontend/src/api/personaStateValues.js`、`frontend/src/components/persona/PersonaEditor.jsx`、`frontend/src/components/persona/PersonaCard.jsx`
- **注意**：persona_state_values 以 (world_id, field_key) 为主键，不绑 persona_id（每世界一 persona，world_id 已唯一）；PersonaEditor 在 WorldFormModal 内采用 onBlur 自动保存（独立 PATCH 请求）而不随世界表单一起 submit；导入世界卡时兼容旧格式（data.world.persona_name / persona_prompt），优先读 data.persona；数据库有变更需执行 `npm run db:reset`

## T26B — feat: 世界 Prompt 条目迁移到编辑世界弹窗 ✅
- **对外接口**：无（纯 UI 迁移，后端 API 不变）
- **涉及文件**：`frontend/src/pages/CharactersPage.jsx`（删除 EntryList 区块和 import）、`frontend/src/pages/WorldsPage.jsx`（新增 EntryList import，在 StateFieldList 之上插入 EntryList 区块）
- **注意**：EntryList 在 WorldsPage 放在 `initial?.id &&` 条件块内，新建世界时不显示；位置在两个 StateFieldList 之上、`error` 信息之下

## T26A — bugfix: 修复对话气泡 hover 抖动 ✅
- **对外接口**：无（纯 UI 修复）
- **涉及文件**：`frontend/src/components/chat/MessageItem.jsx`
- **注意**：删除了 `hovered` state 和 onMouseEnter/onMouseLeave 绑定；外层容器加 `group` 类；三处原 `{hovered && ...}` 条件渲染改为始终渲染 DOM，用 `opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto` 控制可见性；user 气泡时间戳用 `group-hover:opacity-40` 而非 `group-hover:opacity-100` 以匹配原视觉效果

## T25 — feat: Slash 命令系统 ✅
- **对外接口**：`POST /api/sessions/:id/continue`（SSE 续写）、`POST /api/sessions/:id/impersonate`（返回 `{content}`）、`DELETE /api/sessions/:id/messages`（返回 `{success, firstMessage}`）、`POST /api/sessions/:id/summary`（返回 `{success}`）；前端新增 `continueGeneration`、`impersonate`、`clearMessages`、`triggerSummary` 在 `frontend/src/api/chat.js`
- **涉及文件**：修改 `backend/routes/chat.js`（+4 个端点）、`backend/services/sessions.js`（+deleteAllMessagesBySessionId、+updateMessageContent 导出）、`backend/db/queries/messages.js`（+deleteAllMessagesBySessionId）；修改 `frontend/src/api/chat.js`（实现4个占位函数）、`frontend/src/pages/ChatPage.jsx`（+续写/代入/重试/清空/摘要 handlers + toast + fillText）、`frontend/src/components/chat/InputBox.jsx`（+Slash命令浮层 + 激活 Continue/Impersonate 按钮）、`frontend/src/components/chat/MessageList.jsx`（+continuingMessageId/continuingText props）
- **注意**：`/continue` 后端不走 `runStream()`，单独实现 `runContinueStream` 逻辑；ai_output 规则只作用于新生成部分，再拼接原内容写库；续写期间 `generating=true` 但 `continuingMessageId` 非空，MessageList 不渲染新的 `__streaming__` 气泡，而是在原消息上追加 `continuingText`；`/impersonate` 当前从 `worlds.persona_name/persona_prompt` 读取（T26C 实现后需改从 personas 表读）；`/clear` 使用 `window.confirm()` 做二次确认；`/summary` 手动调用直接执行，不入异步队列

## T24B — feat: 正则替换规则系统 ✅
- **对外接口**：`GET/POST /api/regex-rules`、`PUT /api/regex-rules/reorder`、`GET/PUT/DELETE /api/regex-rules/:id`（支持 `?scope=xxx&worldId=xxx` 过滤）；后端 `applyRules(text, scope, worldId)` 在 `backend/utils/regex-runner.js`；前端 `applyRules(text, scope, worldId)` + `loadRules()` + `invalidateCache()` 在 `frontend/src/utils/regex-runner.js`
- **涉及文件**：新增 `backend/db/queries/regex-rules.js`、`backend/services/regex-rules.js`、`backend/routes/regex-rules.js`、`backend/utils/regex-runner.js`、`frontend/src/api/regexRules.js`、`frontend/src/utils/regex-runner.js`、`frontend/src/components/settings/RegexRulesManager.jsx`、`frontend/src/components/settings/RegexRuleEditor.jsx`；修改 `backend/db/schema.js`（+regex_rules 表和索引）、`backend/server.js`（+1 路由）、`backend/routes/chat.js`（ai_output scope 接入 + 提前查询 session/character/world）、`backend/prompt/assembler.js`（[7] 历史消息 prompt_only scope 接入）、`frontend/src/pages/SettingsPage.jsx`（+正则替换分区）、`frontend/src/pages/ChatPage.jsx`（+loadRules 初始化 + worldId 传递）、`frontend/src/components/chat/MessageList.jsx`（+worldId prop）、`frontend/src/components/chat/InputBox.jsx`（user_input scope 接入）、`frontend/src/components/chat/MessageItem.jsx`（display_only scope 接入）
- **注意**：前端用模块级缓存（`_cachedRules`），ChatPage 挂载时调用 `loadRules()` 填充，RegexRulesManager 每次变更后调用 `invalidateCache()` + `loadRules()` 刷新；ai_output 规则仅对非 aborted（正常完成）内容生效，已中断的内容跳过处理，直接存原始内容（含 [已中断] 标记）；`world_id IS NULL` 表示全局规则，查询时用 `(world_id IS NULL OR world_id = ?)` 覆盖两类；chat.js 中 session/character/world 查询提前到 ai_output 处理之前，供后续异步任务复用，无重复查库

## T24D — bugfix: Provider 设置页追加修复 ✅
- **Embedding openai_compatible**：后端 `fetchModels` 新增对 `openai_compatible` provider 的支持（使用自定义 base_url 拉取模型列表）；前端对该 provider 显示 Base URL 输入框，切换时不清除已填写的 base_url
- **UI 整合**：全局 Prompt 条目（EntryList）移入通用配置卡片，置于全局 System Prompt 下方，不再单独成卡
- **涉及文件**：`backend/routes/config.js`、`frontend/src/pages/SettingsPage.jsx`

## T24C — bugfix: Provider 设置页两个 Bug 修复 ✅
- **Bug 1（API Key 无已配置提示）**：后端 `stripApiKeys()` 改为保留 `has_key: !!api_key` 布尔字段；前端 `ProviderSection` 据此显示 `••••••••（已配置，输入新密钥可覆盖）` placeholder，保存后通过 `onApiKeySaved` 回调同步本地 state
- **Bug 2（切换 Provider 后拉取的仍是旧模型）**：竞态条件——旧代码先 `setLlm` 触发 ModelSelector 重挂载，再 await 保存；改为 `field === 'provider'` 时先 await patchConfig 写入后端，再更新 state，确保后端 config 已更新再发起 `/models` 请求
- **涉及文件**：`backend/routes/config.js`（stripApiKeys）、`frontend/src/pages/SettingsPage.jsx`（ProviderSection + handleLlmChange + handleEmbeddingChange）

## T24A — feat: 自定义 CSS 片段管理 ✅
- **对外接口**：`GET/POST /api/custom-css-snippets`、`PUT /api/custom-css-snippets/reorder`（body: `{items:[{id,sort_order}]}`）、`GET/PUT/DELETE /api/custom-css-snippets/:id`（PUT 白名单：name/enabled/content）；前端 `refreshCustomCss()` 在 `frontend/src/api/customCssSnippets.js`，拉取所有 enabled=1 条目拼接后写入 `<style id="we-custom-css">`
- **涉及文件**：新增 `backend/db/queries/custom-css-snippets.js`、`backend/services/custom-css-snippets.js`、`backend/routes/custom-css-snippets.js`、`frontend/src/api/customCssSnippets.js`、`frontend/src/components/settings/CustomCssManager.jsx`；修改 `backend/db/schema.js`（+custom_css_snippets 表和索引）、`backend/server.js`（+1 路由）、`frontend/src/pages/SettingsPage.jsx`（+自定义样式分区）、`frontend/src/App.jsx`（+useEffect 启动时 refreshCustomCss）
- **注意**：reorder 路由用 `{items:[{id,sort_order}]}` 格式（与 T10 characters reorder 一致，非 state-fields 的 orderedIds 格式）；enabled 字段前端发送 0/1 整数而非 boolean；refreshCustomCss() 在增/删/改/排序/启用切换后均需主动调用（CustomCssManager 内部已调用），无需 localStorage 缓存；CSS 注入完全客户端运行，不影响后端

## T23 — feat: 角色卡 / 世界卡导入导出 ✅
- **对外接口**：`GET /api/characters/:id/export`、`POST /api/worlds/:worldId/import-character`、`GET /api/worlds/:id/export`、`POST /api/worlds/import`；前端 `downloadCharacterCard(id, filename)`、`importCharacter(worldId, data)`、`downloadWorldCard(id, filename)`、`importWorld(data)` 在 `frontend/src/api/importExport.js`
- **涉及文件**：新增 `backend/services/import-export.js`、`backend/routes/import-export.js`、`frontend/src/api/importExport.js`；修改 `backend/server.js`（+1 路由）、`frontend/src/pages/CharacterEditPage.jsx`（导出按钮）、`frontend/src/pages/CharactersPage.jsx`（导入角色卡按钮）、`frontend/src/pages/WorldsPage.jsx`（导出按钮 + 导入世界卡按钮）
- **注意**：导出含头像时使用 `avatar_base64` + `avatar_mime` 字段（非 SCHEMA 示例中的简单 null），导入时解码写文件到 `/data/uploads/avatars/`；导入角色卡时 character_state_values 中 field_key 不在目标世界 character_state_fields 中的条目会被静默跳过；导入世界卡时 world_state_values 中 field_key 不在本次导入的 world_state_fields 中的条目同样跳过；整个导入操作在同一 better-sqlite3 transaction 内执行，任何步骤失败自动回滚；服务层直接用 `db.prepare()` 而未走 queries 层封装（因为批量 insert 操作不在现有 queries 函数中）

## T22 — feat: 前端记忆面板 ✅
- **对外接口**：`GET /api/worlds/:worldId/state-values`、`GET /api/characters/:characterId/state-values`、`GET /api/worlds/:worldId/timeline?limit=50`
- **涉及文件**：新增 `backend/db/queries/world-state-values.js`（`getWorldStateValuesWithFields`）、`character-state-values.js`（`getCharacterStateValuesWithFields`）；新增路由 `backend/routes/world-state-values.js`、`character-state-values.js`、`world-timeline.js`；新增前端 `api/worldStateValues.js`、`characterStateValues.js`、`worldTimeline.js`、`components/memory/MemoryPanel.jsx`；修改 `backend/server.js`（+3 路由）、`frontend/src/pages/ChatPage.jsx`（嵌入 MemoryPanel）
- **注意**：MemoryPanel 接收 `worldId`（来自 `character.world_id`）和 `characterId` 两个 prop，仅当 `character` 已加载时渲染；三块数据各自独立 loading/error 状态；`value_json` 为 null 时显示破折号不崩溃；boolean 类型转"是"/"否"；is_compressed=1 的时间线条目以灰色斜体「早期历史」前缀展示

## T21 — feat: 记忆召回与状态注入 ✅
- **对外接口**：`renderWorldState(worldId)`、`renderCharacterState(characterId)`、`renderTimeline(worldId, limit)` —— 均在 `backend/memory/recall.js`
- **涉及文件**：新增 `backend/memory/recall.js`；修改 `backend/prompt/assembler.js`（[6] 位置填入）
- **注意**：用原始 SQL JOIN 查询（world_state_fields LEFT JOIN world_state_values，character_state_fields LEFT JOIN character_state_values），不走各自的 queries 封装，避免二次遍历；value_json 经 JSON.parse 后转 String 展示，null 值行跳过（不渲染）；时间线取最近 WORLD_TIMELINE_RECENT_LIMIT 条（seq DESC LIMIT），rows.reverse() 后正序展示；全部为空时 [6] 不向 systemParts 追加任何内容

## T20 — feat: 对话后异步追加世界时间线 ✅
- **对外接口**：`appendWorldTimeline(sessionId)`（优先级 4，可丢弃）
- **涉及文件**：新增 `backend/db/queries/world-timeline.js`、`backend/memory/world-timeline.js`；修改 `backend/routes/chat.js`（+import `appendWorldTimeline`、`clearPending`，runStream 加优先级 4 入队，regenerate 加 `clearPending(sessionId, 4)`）
- **注意**：读取 session summary（`getSummaryBySessionId`），summary 为空则直接返回不调用 LLM；LLM 返回 JSON 数组，过滤非字符串/空字符串后批量插入；seq 在事务内取 `MAX(seq)+1` 原子递增，保证全局单调；压缩触发条件：插入后总条数 > `WORLD_TIMELINE_MAX_ENTRIES`（200）；压缩取最早 `WORLD_TIMELINE_COMPRESS_THRESHOLD`（50）条，LLM 生成摘要后以 `is_compressed=1`、`minSeq` 替换；regenerate 时调用 `clearPending(sessionId, 4)` 丢弃尚未开始的时间线任务

## T19D — feat: 对话后按配置异步更新世界状态与角色状态 ✅
- **对外接口**：`updateCharacterState(characterId, sessionId)`（优先级 2，不可丢弃）；`updateWorldState(worldId, sessionId)`（优先级 3，不可丢弃）
- **涉及文件**：新增 `backend/memory/character-state-updater.js`、`backend/memory/world-state-updater.js`；修改 `backend/routes/chat.js`（+imports，runStream 任务链扩展）
- **注意**：只处理 `update_mode=llm_auto` 字段；trigger_mode 过滤：manual_only 跳过，every_turn 每轮，keyword_based 近 `PROMPT_ENTRY_SCAN_WINDOW` 条消息内命中关键词才参与；LLM 返回 JSON patch（只含变化字段），空对象 `{}` 表示无变化；类型校验：number 允许字符串转换，boolean 支持字符串 "true"/"false"，enum 必须精确匹配 enum_options；`null` 值以 SQL NULL 写入（不做 JSON.stringify）；角色状态在 title 之后入队（同优先级 2，先入先出），世界状态优先级 3 在二者之后；state updater 内部查库获取 character/world 信息，不依赖调用方传入

## T19C — feat: 新建世界/角色时自动初始化状态值 ✅
- **对外接口**：无新增接口；`services/worlds.createWorld()` 和 `services/characters.createCharacter()` 内部自动触发初始化
- **涉及文件**：修改 `backend/services/worlds.js`、`backend/services/characters.js`
- **注意**：`getInitialValueJson` 逻辑：优先用 `field.default_value`（已是 JSON 字符串）；为 null 时按 type 给默认值（text→`""`，number→`0`，boolean→`false`，enum→第一项或 null）；新建空世界时 world_state_fields 通常为空，初始化为 no-op；主要应用场景是"先建字段模板再建角色"，角色创建时自动按字段模板初始化所有 character_state_values

## T19B — feat: 世界设置页状态字段模板配置 ✅
- **对外接口**：`GET/POST /api/worlds/:worldId/world-state-fields`、`PUT /api/worlds/:worldId/world-state-fields/reorder`、`PUT/DELETE /api/world-state-fields/:id`；角色状态字段同上（world-state-fields → character-state-fields）
- **涉及文件**：新增 `backend/services/world-state-fields.js`、`backend/services/character-state-fields.js`、`backend/routes/state-fields.js`；新增 `frontend/src/api/worldStateFields.js`、`characterStateFields.js`、`frontend/src/components/state/StateFieldEditor.jsx`、`StateFieldList.jsx`；修改 `backend/server.js`（+stateFieldsRoutes）、`frontend/src/pages/WorldsPage.jsx`（编辑世界弹窗底部嵌入两个 StateFieldList）
- **注意**：状态字段配置仅在**编辑**现有世界时显示（通过 `initial?.id` 判断），新建世界时不显示（无 worldId）；StateFieldEditor 弹窗 z-index 为 60（高于世界编辑弹窗的 50）；field_key 编辑时自动替换空格为下划线，且编辑模式下禁用（不允许修改 key）；reorder 路由必须在 `:id` 路由前注册（state-fields.js 中已保证顺序）；两套字段（world/character）共用同一组组件，通过 props 注入不同的 API 函数

## T19A — feat: 世界/角色状态字段与状态值 queries ✅
- **对外接口**：`world-state-fields.js`（createWorldStateField/getWorldStateFieldById/getWorldStateFieldsByWorldId/updateWorldStateField/deleteWorldStateField/reorderWorldStateFields）；`character-state-fields.js`（同上，前缀 Character）；`world-state-values.js`（upsertWorldStateValue/getWorldStateValue/getAllWorldStateValues/deleteWorldStateValue）；`character-state-values.js`（同上，前缀 Character，key 为 characterId）
- **涉及文件**：新增 `backend/db/queries/world-state-fields.js`、`character-state-fields.js`、`world-state-values.js`、`character-state-values.js`；`schema.js` 和 `index.js` 无需修改（建表 SQL 早已存在）
- **注意**：`trigger_keywords`、`enum_options` 在 queries 层自动 JSON parse/stringify，调用方透明；`default_value`、`value_json` 保持原始 JSON 字符串，调用方按字段 type 自行解析；`character_state_fields` 归属于 world（不是 character），sort_order 按 world_id 分组取 MAX+1；删除 state_field 不会级联删除 state_value（两表外键指向不同父表），需业务层手动清理孤立值

## T18 — feat: Session Summary 异步生成 ✅
- **对外接口**：新增 `backend/db/queries/session-summaries.js`（upsertSummary/getSummaryBySessionId）；新增 `backend/memory/summarizer.js`（generateSummary/generateTitle）
- **涉及文件**：新增 `backend/db/queries/session-summaries.js`、`backend/memory/summarizer.js`；修改 `backend/routes/chat.js`、`backend/services/sessions.js`（删除占位 generateSessionTitle）
- **注意**：summary（优先级1）和 title（优先级2）通过 async-queue 串行，summary 先跑完才出标题；SSE 连接保持到 generateTitle 完成后才 end（与 T11 约定一致）；title 仅当 session.title 为 NULL 时才入队；summary fire-and-forget（catch 静默）；title 生成后通过 sseSend 推送 `{type:"title_updated",title}`，若连接已关闭则跳过，前端下次读接口可得到更新的 title

## T17 — feat: 前端：Prompt 条目管理界面 ✅
- **对外接口**：新增 `frontend/src/api/prompt-entries.js`（listGlobalEntries/listWorldEntries/listCharacterEntries/createGlobalEntry/createWorldEntry/createCharacterEntry/updateEntry/deleteEntry/reorderEntries）、`frontend/src/api/config.js`（getConfig/updateConfig/updateApiKey/updateEmbeddingApiKey/fetchModels/fetchEmbeddingModels/testConnection）
- **涉及文件**：新增 `frontend/src/components/prompt/EntryEditor.jsx`、`EntryList.jsx`、`frontend/src/pages/SettingsPage.jsx`；修改 `CharacterEditPage.jsx`（底部嵌入 character 级 EntryList）、`CharactersPage.jsx`（底部嵌入 world 级 EntryList）、`App.jsx`（+/settings 路由）、`WorldsPage.jsx`（+设置按钮）
- **注意**：keywords 字段后端返回已解析 JSON 数组（queries 层处理），前端直接使用数组；EntryList 使用原生 HTML5 draggable 拖拽排序，无额外依赖；ModelSelector 在 mount 时自动调用 loadModels，provider 或 base_url 变更时通过 key prop 强制重置；API Key 独立保存（PUT /api/config/apikey），不随其他配置一起提交；SettingsPage 中 llm/embedding 配置每项变更后立即 patch 到服务器（无"保存"按钮），通用配置（context_compress_rounds / global_system_prompt）需手动点保存

## T16 — feat: 组装器接入对话流程 ✅
- **对外接口**：`buildContext(sessionId)` 变为 async，返回 `{ messages, overrides: { temperature, maxTokens } }`，接口形态不变
- **涉及文件**：修改 `backend/services/chat.js`（移除旧 buildContext 逻辑，改为调用 assembler）、`backend/routes/chat.js`（加 `await`）
- **注意**：services/chat.js 删掉了 getSessionById/getCharacterById/getWorldById/getMessagesBySessionId 的导入（已被 assembler 内部处理）；`readAttachmentAsDataUrl` 和 `formatMessageForLLM` 也随 buildContext 一起移出，附件处理（saveAttachments）仍保留；overrides 现在始终包含 temperature 和 maxTokens（resolved 值），不再是仅当 world 有非 null 值时才填充

## T15 — feat: 提示词组装器 ✅
- **对外接口**：`import { buildPrompt } from './prompt/assembler.js'`（返回 `{ messages, temperature, maxTokens }`）；`import { matchEntries } from './prompt/entry-matcher.js'`（返回 `Set<entryId>`）
- **涉及文件**：新增 `backend/prompt/assembler.js`、`backend/prompt/entry-matcher.js`
- **注意**：`buildPrompt` 不含 [8] 当前用户消息，由调用方追加；[6] 为 TODO T21 占位注释；系统消息 [1-6] 合并为单个 role:system；向量匹配使用 `search(queryVector, Math.max(entries.length*3, 100))` 避免因 topK 过小漏掉目标条目，再过滤 source_id 归属；keyword 匹配为大小写不敏感子串匹配，OR 逻辑；embed 抛出时降级到关键词匹配不抛出；生成参数 `world.temperature ?? config.llm.temperature`（max_tokens 同理）

## T14 — feat: Prompt 条目自动向量化 ✅
- **对外接口**：无新增对外接口；`prompt-entries.js` 的 create/update/delete 函数内部自动触发向量化/删除
- **涉及文件**：修改 `backend/services/prompt-entries.js`
- **注意**：create/update 后异步调用 `embed(title + ' ' + summary)`，embed 返回 null（未配置）时静默跳过；embedding_id 复用旧值做 upsert，首次创建时 `crypto.randomUUID()` 生成；embedding_id 写回数据库用直接 SQL（三张表通用），不改动 queries 层；delete 操作同步（先读 embedding_id 再删 DB 再删向量），三种条目（global/world/character）均保持一致

## T13 — feat: Embedding 服务 ✅
- **对外接口**：`import { embed } from './llm/embedding.js'`（返回 `number[] | null`）；`import { loadStore, upsertEntry, deleteEntry, search } from './utils/vector-store.js'`
- **涉及文件**：新增 `backend/llm/embedding.js`、`backend/utils/vector-store.js`
- **注意**：embedding provider 支持 `openai`（官方）、`openai_compatible`（兼容接口，走同一套 OpenAI embeddings API，适用于 OpenRouter/硅基流动/Qwen 等）、`ollama`（本地，endpoint `/api/embeddings`）；provider 为 null 或未配置时 embed() 返回 null 不报错；向量文件不存在时自动初始化空结构；search() 跳过维度不一致条目，空库返回 []；deleteEntry 对不存在 id 静默忽略；每次 upsert/delete 都立即写回文件（同步 I/O，因 better-sqlite3 本身也是同步风格）

## T12 — feat: Prompt 条目的增删改查（后端） ✅
- **对外接口**：`GET/POST /api/global-entries`、`GET/POST /api/worlds/:worldId/entries`、`GET/POST /api/characters/:characterId/entries`、`GET/PUT/DELETE /api/entries/:type/:id`（type=global/world/character）、`PUT /api/entries/:type/reorder`；Service 层 `import { createGlobalPromptEntry, listGlobalPromptEntries, ... } from './services/prompt-entries.js'`
- **涉及文件**：新增 `backend/db/queries/prompt-entries.js`、`backend/services/prompt-entries.js`、`backend/routes/prompt-entries.js`；修改 `backend/server.js`
- **注意**：reorder 路由必须在 `/entries/:type/:id` 前注册，否则被 :id 捕获；keywords 字段在 queries 层自动 JSON.stringify/parse，service 和路由层透明；sort_order 默认取同父级 MAX(sort_order)+1，首条为 0；reorder 时 orderedIds 第一个 sort_order=0 依次递增；world/character reorder 时 SQL 同时校验归属（WHERE id=? AND world_id=?），避免跨域误改

## T11 — feat: 前端：对话界面 ✅
- **对外接口**：新增 `frontend/src/api/sessions.js`（getSessions/getSession/createSession/deleteSession/renameSession/getMessages/editMessage）、`frontend/src/api/chat.js`（sendMessage/stopGeneration/regenerate/editAndRegenerate/continueGeneration占位/impersonate占位）；所有 SSE 流式接口统一解析 delta/done/aborted/error/title_updated/memory_recall_start/memory_recall_done，额外增加 **onStreamEnd** 回调（流连接实际关闭时触发，晚于 done 因为 title_updated 在 done 后异步推送）
- **涉及文件**：新增 `frontend/src/components/chat/Sidebar.jsx`、`SessionItem.jsx`、`MessageList.jsx`、`MessageItem.jsx`、`InputBox.jsx`；修改 `frontend/src/pages/ChatPage.jsx`（完整三栏实现）、`frontend/src/index.css`（+typing-dot 动画）、`backend/server.js`（express.json limit 20mb）
- **注意**：SSE 流不可在 onDone 时终结——需等 onStreamEnd（流连接关闭），因为 title_updated 在 done 之后到达；MessageList/Sidebar 通过静态方法属性（appendMessage/updateMessages/updateTitle）供 ChatPage 命令式操作内部状态；MessageList 使用 `key` prop 切换会话/流结束后完整重载；react-markdown + remark-gfm 渲染 assistant 消息，代码块含复制按钮；角色头像 fallback 逻辑复用 utils/avatar.js；右栏记忆面板为 T22 占位；T25 占位按钮（续写/代入）已预留；continueGeneration/impersonate 已作占位导出

## T10 — feat: 前端世界/角色管理页面 + 角色卡编辑页 ✅
- **对外接口**：新增后端 `PUT /api/characters/reorder`（body: `{items:[{id,sort_order}]}`）、`POST /api/characters/:id/avatar`（multipart/form-data, 字段名 avatar）；前端路由 `/` / `/worlds/:worldId` / `/characters/:characterId/edit` / `/characters/:characterId/chat`（占位）
- **涉及文件**：新增 `frontend/src/api/worlds.js`、`api/characters.js`、`store/index.js`、`utils/avatar.js`、`pages/WorldsPage.jsx`、`pages/CharactersPage.jsx`、`pages/CharacterEditPage.jsx`、`pages/ChatPage.jsx`（T11 占位）；修改 `backend/routes/characters.js`（+reorder+avatar）、`backend/services/characters.js`、`backend/db/queries/characters.js`、`backend/server.js`（+静态文件 /uploads）、`frontend/src/App.jsx`、`frontend/src/main.jsx`、`frontend/src/index.css`、`frontend/vite.config.js`（+proxy）
- **注意**：头像 avatar_path 存相对路径（如 `avatars/abc123.png`），前端拼接为 `/uploads/avatars/abc123.png`，Vite dev proxy 转发到后端；reorder 路由必须在 `/characters/:id` 前注册，否则被 :id 捕获；multer 存储目标 `/data/uploads/avatars/{characterId}.{ext}`；角色列表拖拽排序用原生 HTML5 draggable API，无额外依赖；`store/index.js` 已创建，今后锁定（CLAUDE.md 约束）

## T09 — feat: 对话流式接口（后端） ✅
- **对外接口**：`POST /api/sessions/:sessionId/chat`（SSE）、`POST /api/sessions/:sessionId/stop`、`POST /api/sessions/:sessionId/regenerate`（SSE）
- **涉及文件**：新增 `backend/services/chat.js`、`backend/routes/chat.js`；修改 `backend/db/queries/messages.js`（+updateMessageAttachments）、`backend/services/sessions.js`（+deleteMessagesAfter）、`backend/server.js`
- **注意**：chat 路由挂载在 `/api/sessions`；SSE 事件格式：`{delta}` / `{done:true}` / `{aborted:true}` / `{type:'error',error}` / `{type:'title_updated',title}`；aborted 时在已输出内容末尾追加 `\n\n[已中断]`；buildContext 为简化版（仅拼接 world+character system_prompt + 历史消息），后续 assembler.js 接管；saveAttachments 写磁盘后自动调用 updateMessageAttachments 更新 DB，路由层无需手动更新；activeStreams Map 在 services/chat.js 维护，同一 session 新请求会 abort 旧请求；req.on('close') 监听客户端断开并触发 abort；title_updated 通过同一 SSE 连接推送（T18 实现具体生成逻辑）

## T08 — feat: 会话和消息的增删改查（后端） ✅
- **对外接口**：`GET/POST /api/characters/:characterId/sessions`、`GET/DELETE /api/sessions/:id`、`PUT /api/sessions/:id/title`、`GET /api/sessions/:id/messages`、`POST /api/sessions/:id/messages`、`PUT /api/messages/:id`；Service 层 `import { createSession, getSessionById, ... } from './services/sessions.js'`
- **涉及文件**：新增 `backend/db/queries/sessions.js`、`backend/db/queries/messages.js`、`backend/services/sessions.js`、`backend/routes/sessions.js`；修改 `backend/server.js`
- **注意**：POST 创建会话时自动查询角色 first_message，非空则插入 role=assistant 的开场白（created_at 与会话相同）；PUT /api/messages/:id 编辑消息后自动调用 deleteMessagesAfter 删除后续消息；消息 attachments 字段在 queries 层自动 JSON.parse；touchSession 在创建消息时自动更新会话 updated_at；generateSessionTitle 已占位（T18 实现）

## T07 — feat: 角色的增删改查（后端） ✅
- **对外接口**：`GET /api/worlds/:worldId/characters`、`POST /api/worlds/:worldId/characters`、`GET /api/characters/:id`、`PUT /api/characters/:id`、`DELETE /api/characters/:id`；Service 层 `import { createCharacter, getCharacterById, getCharactersByWorldId, updateCharacter, deleteCharacter } from './services/characters.js'`
- **涉及文件**：新增 `backend/db/queries/characters.js`、`backend/services/characters.js`、`backend/routes/characters.js`；修改 `backend/server.js`
- **注意**：createCharacter 的 sort_order 自动取当前 world 下 MAX(sort_order)+1，首个角色为 0；列表按 sort_order ASC, created_at ASC 排序；characters 路由挂载在 `/api` 下（因混合路径 `/worlds/:worldId/characters` 和 `/characters/:id`）；删除世界时角色被 SQLite 外键级联删除

## T06 — feat: 世界的增删改查（后端） ✅
- **对外接口**：`GET /api/worlds`、`POST /api/worlds`、`GET /api/worlds/:id`、`PUT /api/worlds/:id`、`DELETE /api/worlds/:id`；Service 层 `import { createWorld, getWorldById, getAllWorlds, updateWorld, deleteWorld } from './services/worlds.js'`
- **涉及文件**：新增 `backend/db/queries/worlds.js`、`backend/services/worlds.js`、`backend/routes/worlds.js`；修改 `backend/server.js`
- **注意**：POST 创建时 name 必填，temperature 和 max_tokens 不传则默认 NULL；PUT 为部分更新（只更新传入的字段），自动刷新 updated_at；DELETE 返回 204，SQLite 外键级联自动清理子数据；updateWorld 白名单字段 name/system_prompt/persona_name/persona_prompt/temperature/max_tokens

## T05 — feat: LLM 接入层 ✅
- **对外接口**：`import { chat, complete } from './llm/index.js'`；`chat(messages, options)` 返回 AsyncGenerator（流式），`complete(messages, options)` 返回 string（非流式）；options 可传 `{ temperature, maxTokens, model, signal }`
- **涉及文件**：新增 `backend/llm/index.js`、`backend/llm/providers/openai.js`、`backend/llm/providers/ollama.js`；修改 `backend/routes/config.js`、`SCHEMA.md`
- **注意**：provider 分三类 API 风格——OpenAI-compatible（openai/openrouter/glm/kimi/minimax/deepseek/grok/siliconflow）、Anthropic 原生 Messages API、Gemini 原生 generateContent API；本地 provider（ollama/lmstudio）走 OpenAI-compatible；重试逻辑在 index.js 统一处理，AbortError 和 4xx（非 429）不重试，流式已输出内容后不重试；消息格式转换（多模态图片等）在 provider 内部完成，上层无需感知；routes/config.js 的 fetchModels 已补齐所有新 provider 支持

## T04 — feat: 全局配置读写 ✅
- **对外接口**：`import { getConfig, updateConfig } from './services/config.js'`；路由 `GET/PUT /api/config`、`PUT /api/config/apikey`、`PUT /api/config/embedding-apikey`、`GET /api/config/models`、`GET /api/config/embedding-models`、`GET /api/config/test-connection`
- **涉及文件**：新增 `backend/services/config.js`、`backend/routes/config.js`；修改 `backend/server.js`
- **注意**：GET/PUT /api/config 响应中自动剥离 `llm.api_key` 和 `embedding.api_key`，api_key 只能通过专用 PUT 接口更新；config.json 不存在时自动初始化默认结构；updateConfig 做深度合并而非整体替换；Anthropic 模型列表为硬编码；test-connection 始终返回 HTTP 200（前端判断 success 字段），models 拉取失败返回 HTTP 502

## T03 — feat: 基础工具文件 ✅
- **对外接口**：`import { XXX } from './utils/constants.js'`；`import { enqueue, clearPending } from './utils/async-queue.js'`；`import { countTokens, countMessages } from './utils/token-counter.js'`
- **涉及文件**：新增 `backend/utils/constants.js`、`backend/utils/async-queue.js`、`backend/utils/token-counter.js`
- **注意**：constants.js 是所有硬性数值的唯一来源（CLAUDE.md 锁定文件），其他模块禁止硬编码数字；async-queue 按 sessionId 分组串行，`clearPending(sessionId, minPriority)` 可批量丢弃低优先级待处理任务；token-counter 是纯估算（中文 0.5、其他 0.25），无外部依赖

## T02 — feat: 数据库建表 ✅
- **对外接口**：`import db from './db/index.js'` 获取 better-sqlite3 实例；`import { initSchema } from './db/schema.js'` 执行建表
- **涉及文件**：新增 `backend/db/index.js`、`backend/db/schema.js`；修改 `backend/server.js`
- **注意**：`db/index.js` 打开 `/data/worldengine.db` 并执行 `PRAGMA foreign_keys = ON`；`schema.js` 此文件后续不得随意修改（CLAUDE.md 锁定文件）；server.js 启动时自动调用 `initSchema(db)`

## T01 — feat: 项目骨架初始化 ✅
- **对外接口**：前端 `cd frontend && npm run dev`（:5173）；后端 `cd backend && npm run dev`（:3000）
- **涉及文件**：`frontend/`（Vite + React + TailwindCSS）、`backend/`（Express + ES Modules + better-sqlite3）、`data/`（uploads/avatars、uploads/attachments、vectors）、`.gitignore`
- **注意**：后端 `server.js` 启动时自动 `mkdirSync` 创建 `/data/` 子目录；`data/.gitignore` 只跟踪 `.gitkeep` 占位文件；后端 `package.json` 设 `"type": "module"` 使用 ES Modules
