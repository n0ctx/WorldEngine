# Changelog

> 每次任务完成后，在最上方追加一条记录。这是项目的"记忆"，给自己和 AI 看。  
> 新开对话时让 Claude Code 先读此文件，了解项目现状。

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