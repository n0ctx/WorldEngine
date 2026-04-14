# WorldEngine — 开发路线图

## 使用方法

1. 按顺序找到第一个状态为 `⬜ 未开始` 的任务
2. 把该任务的"Claude Code 指令"原文复制给 Claude Code
3. Claude Code 完成后，按"验证方法"检查是否正常
4. 没问题就执行 `git commit`，CHANGELOG.md追加一条记录，把本任务ROADMAP.md中的状态改为 `✅ 完成`，继续下一个任务
5. 出问题就执行 `git checkout .` 回滚，开新对话重试

**原则：每个任务做完才开始下一个，不要跳着做。**

---

## 阶段 0：骨架（M0）DONE!

> 目标：项目能跑起来，目录结构正确，数据库能建表。还没有任何功能。

---

## 阶段 1：能对话（M1）DONE!

> 目标：可以创建世界、角色，然后和角色对话，消息能保存。这是整个系统最核心的功能。

---

## 阶段 2：提示词系统（M2）DONE!

> 目标：三层提示词生效，Prompt 条目能自动触发。

---

## 阶段 3：记忆系统（M3）DONE!

> 目标：三层记忆系统全部上线，AI 能记住跨 session 的历史。

---

## 阶段 4：完善（M4）

> 目标：补全剩余功能，达到可发布状态。

---

### T25 ✅ Slash 命令系统

  

**这个任务做什么**：实现输入框的 Slash 命令，并补全 T11 预留的 Continue 和 Impersonate 接口及按钮功能。

  

**涉及文件**：

- `/backend/routes/chat.js` — 新增 /continue 和 /impersonate 接口

- `/frontend/src/components/chat/InputBox.jsx` — 命令列表浮层 + 快捷按钮激活

- `/frontend/src/api/chat.js` — continueGeneration 和 impersonate 占位已在 T11 创建，此处实现

  

**Claude Code 指令**：

```

任务：实现 Slash 命令系统，并完善 Continue / Impersonate 功能。

后端新增两个接口（在 /backend/routes/chat.js 中添加）：

POST /api/sessions/:sessionId/continue

- 取当前 session 最后一条 assistant 消息
- 若不存在则返回 400
- 以流式方式续写，delta 内容追加到该消息的 content（不新增消息行）
- 数据库更新：流结束后用完整拼接内容（原内容 + 新生成内容）更新该消息的 content
- 同样监听 req.on('close') 处理中断；中断时保存已生成部分并追加 "[已中断]"
- SSE 格式与 /chat 接口相同

POST /api/sessions/:sessionId/impersonate

- 读取 session 所属角色的世界 persona_name 和 persona_prompt
- 使用以下固定 prompt（不暴露给用户修改）调用 llm.complete()：
"你正在扮演用户「{persona_name}」。根据当前对话情境，以第一人称写一条用户接下来可能说的话。只输出这条话本身，不加任何解释或引号。"
若 persona_name 为空，则用"用户"替代
- 返回 { content: "..." }，不写入数据库

前端修改 InputBox.jsx：

1. Slash 命令列表：

输入框内容以 / 开头时，在输入框上方弹出命令浮层（绝对定位），支持键盘上下键选择，Enter 执行，Escape 关闭。
支持的命令列表（显示命令名 + 一行说明）：

- /continue 续写上一条 AI 回复
- /impersonate AI 替你写一条消息
- /retry 删除最后一条 AI 回复并重新生成
- /regen 重新生成最后一条 AI 回复（同 /retry）
- /clear 清空当前会话所有消息（二次确认）
- /summary 手动触发生成当前会话摘要

2. 激活 T11 预留的两个快捷图标按钮：

- Continue 按钮：调用 continueGeneration(sessionId, callbacks)，流式 delta 追加到最后一条 assistant 消息
- Impersonate 按钮：调用 impersonate(sessionId)，返回内容填入输入框（不自动发送）
  

3. 各命令的前端执行逻辑：

- /continue：同 Continue 按钮
- /impersonate：同 Impersonate 按钮
- /retry：取最后一条 assistant 消息，调用 regenerate，afterMessageId 为其前一条消息的 id
- /regen：同 /retry
- /clear：弹出二次确认弹窗；确认后调用 DELETE /api/sessions/:id/messages（新接口，见下）；
若角色有 first_message，清空后前端重新插入该消息到消息列表（不需要重新请求后端）
- /summary：调用 POST /api/sessions/:id/summary（新接口，见下）；完成后 toast 提示"摘要已生成"

后端新增两个辅助接口：

DELETE /api/sessions/:sessionId/messages

- 物理删除该 session 下所有消息
- 若角色有 first_message，重新插入一条 role='assistant' 的首条消息
- 返回 { success: true, firstMessage: "..." | null }

POST /api/sessions/:sessionId/summary

- 手动触发当前 session 的摘要生成（对标 T18 自动生成逻辑，走同一函数）
- 内部调用 backend/memory/summarizer.js 的 generateSummary(sessionId)；成功后返回 { success: true }
- 若 session 不存在返回 404；若 session 没有任何 user 消息返回 400 + { error: '当前会话尚无用户消息，无法生成摘要' }
- 非流式，前端拿到 success 即可 toast 提示，实际 summary 内容由记忆面板读取

约束：
- 不改任何锁定文件
- /continue 接口服用 services/chat.js 中现有的 activeStreams Map 和流控逻辑，不新建一套
- /impersonate 读取 persona 基础信息：T26C 完成前从 worlds.persona_name / persona_prompt 读；T26C 完成后从 personas 表读（getPersonaByWorldId）。本任务按当前 schema 现状实现即可，T26C 会一并改写此处
- /clear 二次确认弹窗样式复用现有弹窗组件，不新增 UI 依赖
- /summary 不要和 T18 的自动入队重复触发：手动接口直接调用 generateSummary 同步执行即可，不走 async-queue
```

**验证方法**：
1. 输入框输入 `/co`，命令浮层出现 `/continue` 一项；键盘上下键切换，Enter 触发续写；Escape 关闭浮层
2. 输入框右侧 Continue 按钮点击后最后一条 assistant 消息继续流式追加，中断能正确保存并追加「[已中断]」
3. Impersonate 按钮点击后输入框自动填入 AI 代拟的用户消息，不自动发送，可继续编辑
4. `/retry` 和 `/regen` 删除最后一条 assistant 消息并对其前一条用户消息重新生成
5. `/clear` 弹出二次确认，确认后消息列表清空；若角色有 first_message，清空后立即在列表里出现一条首条消息
6. `/summary` 触发后前端 toast「摘要已生成」，记忆面板刷新能看到新 summary
7. `/summary` 在没有 user 消息的会话上执行返回 400 错误，前端 toast 提示「当前会话尚无用户消息」

---

### T26A ✅ 修复对话气泡 hover 抖动

**这个任务做什么**：修复消息气泡在鼠标悬停时因为编辑按钮和时间戳条件渲染导致的上下跳动。

  

**涉及文件**：

- `/frontend/src/components/chat/MessageItem.jsx`

  

**Claude Code 指令**：

```

请先阅读 @CHANGELOG.md 与 /frontend/src/components/chat/MessageItem.jsx 的现有内容。

  

任务：修复消息气泡 hover 时的布局抖动。

  

当前实现的问题：MessageItem.jsx 里三处 `{hovered && ...}` 条件渲染（user 气泡下的编辑按钮区、user 气泡下的时间戳、assistant 气泡下的时间戳+操作按钮区）在鼠标进出时把元素从 DOM 中插入/移除，导致气泡上下跳动。

  

修复要求：

1. 删除 `const [hovered, setHovered] = useState(false);` 及 onMouseEnter/onMouseLeave 绑定

2. 在消息外层容器加上 Tailwind `group` 类

3. 原来三处 `{hovered && (...)}` 改为始终渲染该 DOM，用 `opacity-0 group-hover:opacity-100 transition-opacity` 控制可见性

4. 不可见态下要加 `pointer-events-none`，hover 后改 `group-hover:pointer-events-auto`，避免透明区域仍能点击

5. 编辑状态（editing=true）期间这些区域应当保持可点击/可见（编辑按钮会切到保存/取消按钮），维持现有逻辑，只改 hover 相关部分

  

其他所有逻辑（startEdit/confirmEdit/cancelEdit/onRegenerate 等）不动。

  

约束：

- 只改 MessageItem.jsx 这一个文件

- 不改任何锁定文件

- 不使用任何第三方动画库

```

  

**验证方法**：

1. 在对话页面鼠标从屏幕顶部滑到底部经过多条消息，每条气泡位置**完全静止**，不上下跳动

2. 编辑按钮、时间戳平滑淡入淡出

3. 鼠标移出后按钮和时间戳消失且不响应点击（点击透明区不触发任何操作）

4. 点击编辑按钮进入编辑态后保存/取消按钮始终可见

  

---

  

### T26B ✅ 世界 Prompt 条目迁移到编辑世界弹窗

  

**这个任务做什么**：把世界级 Prompt 条目管理区从「角色列表页底部」挪到「编辑世界弹窗内」，避免与角色级 Prompt 条目混淆。

  

**涉及文件**：

- `/frontend/src/pages/CharactersPage.jsx`（删除世界级 EntryList）

- `/frontend/src/pages/WorldsPage.jsx`（编辑世界弹窗内新增世界级 EntryList）

  

**Claude Code 指令**：

```

请先阅读 @CHANGELOG.md、CharactersPage.jsx 和 WorldsPage.jsx 的现有内容。

  

任务：把世界级 Prompt 条目管理从角色列表页迁移到编辑世界弹窗内。

  

具体步骤：

1. 在 CharactersPage.jsx 中，删除「世界 Prompt 条目」区块（包含注释 `{/* 世界 Prompt 条目 */}` 和 `<EntryList type="world" scopeId={worldId} />` 那段）及相关包裹容器和标题；若 `import EntryList` 在此文件中不再被其它地方引用，把 import 也一并删除

2. 在 WorldsPage.jsx 的编辑世界弹窗底部（当前 T19B 挂载两个 StateFieldList 的位置）**之上**插入一块 `<EntryList type="world" scopeId={initial.id} />` 区域，仅当 `initial?.id` 存在（即编辑现有世界而非新建）时渲染；添加配套的分区标题「世界 Prompt 条目」

3. 同时在 WorldsPage.jsx 顶部 import EntryList，import 路径参照 CharacterEditPage.jsx 的写法

  

约束：

- 后端 API 不变，/frontend/src/api/prompt-entries.js 不动

- 组件 EntryList.jsx 和 EntryEditor.jsx 不动

- 不触及状态字段模板的两块 StateFieldList，保留它们原有位置

- 不改任何锁定文件

```

  

**验证方法**：

1. 打开角色列表页，页面底部**不再**有「世界 Prompt 条目」区块

2. 打开编辑世界弹窗（点击世界卡上的编辑图标），弹窗底部能看到「世界 Prompt 条目」区域，新增 / 编辑 / 删除 / 拖拽排序均正常

3. 新建世界（initial.id 不存在）时弹窗内不显示世界 Prompt 条目区域，只显示基础字段

  

---

  

### T26C ✅ 玩家（Persona）独立为世界下的一级对象

  

**这个任务做什么**：把原本挂在 worlds 表的 persona_name / persona_prompt 拆成独立的 `personas` 表，并新增一套玩家状态字段模板和状态值，实现玩家状态的对话后异步更新和 [6] 位置 LLM 注入。

  

**涉及文件**：

  

后端：

- `/backend/db/schema.js`（删除 worlds 表 persona_name/persona_prompt 两列；新增 personas / persona_state_fields / persona_state_values 三张表建表 SQL）

- `/backend/db/queries/worlds.js`（移除 persona_* 字段的读写和白名单）

- `/backend/db/queries/personas.js`（新建）

- `/backend/db/queries/persona-state-fields.js`（新建）

- `/backend/db/queries/persona-state-values.js`（新建）

- `/backend/services/personas.js`（新建）

- `/backend/services/persona-state-fields.js`（新建）

- `/backend/services/worlds.js`（创建世界时自动 upsert persona 行和 persona_state_values 初值）

- `/backend/routes/personas.js`（新建）

- `/backend/routes/persona-state-fields.js`（新建）

- `/backend/routes/persona-state-values.js`（新建，仅暴露 GET 用于前端记忆面板读取）

- `/backend/server.js`（注册新路由）

- `/backend/prompt/assembler.js`（[2] 位置改从 personas 表读；[6] 位置调用串追加 `renderPersonaState` —— T21 [6] 例外的自然扩展，不新增新例外）

- `/backend/memory/recall.js`（新增 `renderPersonaState(worldId)` 并更新 [6] 的拼接顺序为「玩家 → 角色 → 世界 → 时间线」）

- `/backend/memory/persona-state-updater.js`（新建，参照 character-state-updater.js）

- `/backend/routes/chat.js`（runStream 任务链新增 `updatePersonaState`，优先级 2，紧跟角色状态之后入队）

- `/backend/services/import-export.js`（世界卡导入导出：去掉 world.persona_name/prompt，新增 persona 块 + persona_state_fields + persona_state_values 的读写）

  

前端：

- `/frontend/src/api/personas.js`（新建）

- `/frontend/src/api/personaStateFields.js`（新建）

- `/frontend/src/api/personaStateValues.js`（新建）

- `/frontend/src/components/persona/PersonaEditor.jsx`（新建，弹窗仅编辑 name / system_prompt）

- `/frontend/src/components/persona/PersonaCard.jsx`（新建，角色列表页顶部的卡片，点击打开 PersonaEditor）

- `/frontend/src/pages/WorldsPage.jsx`（编辑世界弹窗：删除 persona_name / persona_prompt 两个输入框，新增「玩家状态字段」StateFieldList 区域）

- `/frontend/src/pages/CharactersPage.jsx`（角色列表**顶部**新增独立一块 `<PersonaCard worldId={worldId} />`）

- `/frontend/src/components/memory/MemoryPanel.jsx`（新增「玩家状态」区块，放在「角色状态」之上）

  

**Claude Code 指令**：

```

请先阅读 @SCHEMA.md（personas / persona_state_fields / persona_state_values 表定义，worlds 表字段变更，以及 .weworld.json 中 persona 块的格式）、@CLAUDE.md（异步任务链优先级、assembler.js [2] 和 [6] 位置、状态系统说明）、@CHANGELOG.md（T18-T24 已完成任务的接入约定）。

  

任务：把玩家（Persona）拆成世界下一对一的一级对象，带状态字段、状态值、对话后异步更新、[6] 位置 LLM 注入。

  

一、数据模型（修改锁定文件 schema.js，本任务明确允许）

1. schema.js 中 worlds 表删除 persona_name、persona_prompt 两列

2. schema.js 中新增三张表：personas、persona_state_fields、persona_state_values；字段和索引完全按 SCHEMA.md 示例

3. 由于开发期 db:reset 即可，不写迁移脚本

  

二、后端 CRUD

4. queries/personas.js：createPersona / getPersonaByWorldId / updatePersona（白名单 name / system_prompt）；createPersona 传入 world_id 时如已存在则 REPLACE

5. queries/persona-state-fields.js 和 queries/persona-state-values.js：完全照搬 character-state-fields.js 和 world-state-values.js（注意：persona_state_values 的 UNIQUE 键是 world_id + field_key，不是 persona_id——因为 persona 与 world 一对一，以 world_id 作键对齐 world_state_values 的语义）

6. services/personas.js：getOrCreatePersona(worldId)、updatePersona(worldId, patch)；updatePersona 刷新 updated_at

7. services/persona-state-fields.js：CRUD + reorder（照搬 character-state-fields.js）

8. services/worlds.createWorld：创建 world 后立即 upsert 一条空 persona 行（id 用 randomUUID），并按当前 persona_state_fields 模板（新建世界时通常为空）初始化 persona_state_values（复用 T19C 的 getInitialValueJson）

9. 路由：

- GET /api/worlds/:worldId/persona 返回该 world 的 persona，若不存在则自动创建

- PUT /api/worlds/:worldId/persona 更新 name / system_prompt

- GET/POST /api/worlds/:worldId/persona-state-fields

- PUT /api/worlds/:worldId/persona-state-fields/reorder

- PUT/DELETE /api/persona-state-fields/:id

- GET /api/worlds/:worldId/persona-state-values 返回该 world 的 persona 状态值（供记忆面板读取）

reorder 路由必须在 :id 路由前注册

10. server.js 挂载新路由

  

三、assembler.js 改造（修改锁定文件，属于 T21 [6] 例外的自然扩展与 [2] 位置的明确替换）

11. [2] 位置：原来读 world.persona_name / world.persona_prompt，改为 `services/personas.getOrCreatePersona(worldId)` 取 name 和 system_prompt；若两者均为空则整段跳过（原逻辑保持）

12. [6] 位置：在现有的 `renderWorldState + renderCharacterState + renderTimeline` 串中插入 `renderPersonaState`，最终顺序为「玩家 → 角色 → 世界 → 时间线」

13. 不改其他位置，不改 [1]、[3]-[5]、[7]、[8]

  

四、recall.js 新增

14. 新增 `renderPersonaState(worldId)`：原始 SQL JOIN 查询 persona_state_fields LEFT JOIN persona_state_values（按 world_id），渲染格式与 renderWorldState 对齐，标题使用「【玩家状态】」；value_json null 行跳过；全部空时返回空串不输出标题

  

五、对话后异步更新（T26C 核心）

15. 新建 backend/memory/persona-state-updater.js，对外 `updatePersonaState(worldId, sessionId)`，实现完全参照 character-state-updater.js：

- 只处理 update_mode=llm_auto 字段

- trigger_mode 过滤：manual_only 跳过、every_turn 每轮、keyword_based 近 PROMPT_ENTRY_SCAN_WINDOW 条消息命中关键词才参与

- LLM 返回 JSON patch（只含变化字段），空对象 {} 表示无变化

- 类型校验同 T19D：number 允许字符串转换、boolean 允许字符串 "true"/"false"、enum 必须精确匹配 enum_options

- null 值以 SQL NULL 写入

16. routes/chat.js 的 runStream 任务链入队 `updatePersonaState(worldId, sessionId)`，优先级 2，紧跟 updateCharacterState 之后；regenerate 不需要 clearPending（优先级 2 不可丢弃）

  

六、导入导出（修改 T23 已完成的 import-export.js）

17. 导出世界卡：不再导出 world.persona_name/prompt；新增顶层 `persona`（对象 {name, system_prompt}）、`persona_state_fields`（数组，同 character_state_fields 的裁剪规则）、`persona_state_values`（数组，同 character_state_values 的裁剪规则）

18. 导入世界卡：读取 persona 块时先 getOrCreatePersona(newWorldId)，随后 updatePersona 写入 name / system_prompt；persona_state_fields 和 persona_state_values 逐条插入，全部重新生成 UUID 和时间戳

19. 老格式（world.persona_name/prompt 非空、缺少 persona 块）**不做兼容**（用户确认没有已导出的旧卡）

  

七、前端

20. 新增 api/personas.js（getPersona/updatePersona）、personaStateFields.js（照抄 characterStateFields.js）、personaStateValues.js（仅 listPersonaStateValues(worldId)）

21. 新建 components/persona/PersonaEditor.jsx：受控弹窗，字段 name / system_prompt，onSave 回调；UI 风格参照 CharacterEditPage.jsx 中的基础字段表单，简洁版

22. 新建 components/persona/PersonaCard.jsx：接收 worldId，内部 getPersona 加载并展示当前 name（空则显示「未命名玩家」）+ 一个编辑按钮，点击打开 PersonaEditor

23. 改造 WorldsPage.jsx 编辑弹窗：

- 删除 form.persona_name / form.persona_prompt 两处 input 和对应 state / 回填 / 提交逻辑

- 在现有 StateFieldList×2 旁边新增第三个 StateFieldList，注入 persona 版 API（listFields=api/personaStateFields.* 等），标题「玩家状态字段」

- 仅当 initial?.id 存在时渲染三块 StateFieldList（与现有逻辑一致）

24. 改造 CharactersPage.jsx：在角色列表（现有网格）**上方**新增一块独立区域 `<PersonaCard worldId={worldId} />`，配标题「玩家」；与角色列表用分割线隔开

25. 改造 MemoryPanel.jsx：在「世界状态」「角色状态」两块之前新增「玩家状态」一块，数据源 api/personaStateValues.listPersonaStateValues(worldId)，无数据时不渲染整块

  

八、范围与约束

- 锁定文件的例外：schema.js（表结构变更，T26C 明确）、assembler.js（[2] 位置替换 + [6] 位置追加 renderPersonaState，T21 [6] 例外的自然扩展）、constants.js（不动）、store/index.js（不动）、server.js（仅挂载新路由算例外）

- 不新增任何异步任务优先级档位，玩家状态共用优先级 2

- 不做 persona 的 Prompt 条目（persona 本身没有此概念）

- 老的 worlds.persona_name / persona_prompt 字段从 services/worlds 的白名单、queries/worlds.js 的读写、路由响应、前端 api/worlds.js 中彻底去除

```

  

**验证方法**：

1. `cd backend && npm run db:reset && npm run dev`，创建一个新世界，SQLite 里能看到 personas 表多一行（world_id 与新世界匹配），name 和 system_prompt 为空

2. 打开编辑世界弹窗：没有 persona 姓名和 persona prompt 两个输入框；底部有三块 StateFieldList（世界 / 角色 / 玩家）；世界级 Prompt 条目区块（T26B 实现）仍在底部

3. 在「玩家状态字段」下配置一个字段 `stamina / 体力 / text / update_mode=llm_auto / trigger_mode=every_turn`；保存后 persona_state_fields 表有新行，persona_state_values 表对应 world_id 多一行

4. 打开角色列表页：顶部有「玩家」卡片，点击打开 PersonaEditor 弹窗，填写 name 和 system_prompt，保存后 PersonaCard 上显示新 name

5. 点击某角色进入对话，发一轮消息，后端日志里 runStream 任务链触发 updatePersonaState；LLM 返回 patch 后 persona_state_values 里 stamina 字段被更新

6. 对话过程中观察 assembler 的 [2] 位置（日志里打印的 system messages）正确带入玩家 name 和 system_prompt；[6] 位置开头为「玩家状态」段

7. 打开记忆面板：「玩家状态」区块在最上方，展示当前 persona 状态值

8. 导出世界卡 `.weworld.json`：顶层有 persona 对象、persona_state_fields 和 persona_state_values 数组；world 对象下没有 persona_name / persona_prompt；重新导入后全部还原

---

### T27 ✅ 跨 Session Summary 召回（补齐"层一 原始 Session"召回）

**这个任务做什么**：实现 PROJECT.md 中"层一 原始 Session"的 embedding 召回部分——在对话组装时，根据当前上下文从历史 `session_summaries` 中基于 embedding 相似度检索相关摘要，注入到 assembler.js 的 [6] 位置末尾。召回范围覆盖同一 world 下所有历史 session（跨角色），排除当前 session 自身。**不做渐进式展开原文**（AI 主动召回原始 messages 全文）—— 留给未来任务。

**涉及文件**：

后端：
- `/backend/utils/constants.js`（新增 `MEMORY_RECALL_SIMILARITY_THRESHOLD` 常量；不改已有常量）
- `/backend/utils/session-summary-vector-store.js`（新建，复刻 `vector-store.js` 模式，独立文件 `data/vectors/session_summaries.json`）
- `/backend/db/queries/session-summaries.js`（新增 `getSummaryWithMetaById(id)`、`listSummariesByWorldId(worldId, excludeSessionId)` 两个查询）
- `/backend/memory/summary-embedder.js`（新建，`embedSessionSummary(sessionId)`：读 summary 文本 → 调 `llm.embed()` → upsert 到向量库；embedding 未配置则静默跳过）
- `/backend/memory/recall.js`（新增 `renderRecalledSummaries(worldId, sessionId)` 并更新 [6] 位置拼接顺序为「玩家 → 角色 → 世界 → 时间线 → 召回摘要」）
- `/backend/prompt/assembler.js`（[6] 位置在现有 `renderWorldState/Character/Timeline` 串之后 `await renderRecalledSummaries(worldId, sessionId)`）
- `/backend/routes/chat.js`（runStream 任务链新增 `embedSessionSummary(sessionId)`，优先级 5，紧跟 `generateSummary` 之后入队；regenerate/编辑消息时需要随优先级 4/5 一起被 `clearPending` 清空）

**Claude Code 指令**：

```
请先阅读 @SCHEMA.md（session_summaries 表结构保持不变）、@CLAUDE.md（异步队列优先级、assembler.js [6] 例外、向量调用分工）、@CHANGELOG.md（T13/T14 向量化模式、T18 summary 生成、T21 [6] 位置约定、T26C [6] 新例外）、@PROJECT.md（层一 原始 Session 的召回说明）。

任务：在不改 SCHEMA.md、不改 schema.js、不改 constants.js 已有常量的前提下，实现跨 session 的 summary 向量召回和 [6] 位置注入。

一、向量存储（独立于 prompt_entries 向量库）
1. 新建 /backend/utils/session-summary-vector-store.js：
   - 文件路径 data/vectors/session_summaries.json（不存在时自动创建目录）
   - 结构 { version: 1, entries: [{ summary_id, session_id, world_id, vector, updated_at }] }
   - 对外暴露 loadStore / upsertEntry(summaryId, sessionId, worldId, vector) / deleteBySessionId(sessionId) / search(queryVector, { worldId, excludeSessionId, topK })
   - search 实现：加载全量 entries → 过滤 worldId 和 excludeSessionId → 计算余弦相似度 → 过滤 >= MEMORY_RECALL_SIMILARITY_THRESHOLD → 按相似度倒序取 topK → 返回 [{ summary_id, session_id, score }]
   - 不新增依赖，相似度计算直接写内联工具函数

二、常量与查询层
2. constants.js 新增 `export const MEMORY_RECALL_SIMILARITY_THRESHOLD = 0.68;`（单独的召回阈值，摘要通常更长语义更宽，阈值比 PROMPT_ENTRY_SIMILARITY_THRESHOLD 略低）。其他 MEMORY_RECALL_* 已存在，不要动
3. queries/session-summaries.js 新增：
   - `getSummaryWithMetaById(summaryId)` → 返回 { id, session_id, content, session_title, session_created_at, world_id, character_id }，通过 JOIN sessions + characters 拿到 world_id
   - `listSummariesByWorldId(worldId, excludeSessionId)` → 同上字段，供前端/调试使用（本任务 LLM 注入不直接调用它；search 通过向量库过滤更高效）

三、向量化（写侧）
4. 新建 /backend/memory/summary-embedder.js，导出 `embedSessionSummary(sessionId)`：
   - 读 summary（getSummaryBySessionId）+ session meta（world_id 需经 session → character → world）
   - 调 llm.embed(summary.content)；返回 null（未配置 embedding）→ 静默退出，不报错
   - 向量成功 → upsertEntry(summaryId, sessionId, worldId, vector)
   - 任何异常 catch 后记 console.warn，不抛出（队列中本就是 priority 5 可丢弃）
5. routes/chat.js 的 runStream 任务链：
   - 在现有 `enqueue(sessionId, () => generateSummary(sessionId), 1)` 之后，追加 `enqueue(sessionId, () => embedSessionSummary(sessionId), 5).catch(() => {})`
   - 两处任务链（done 与 aborted-with-user-message 两个分支）都要加
   - regenerate / 编辑消息的 clearPending 原本清空优先级 4/5 未开始任务——本项属优先级 5，继承现有清理策略，无需新增逻辑

四、召回（读侧）
6. recall.js 新增 `async renderRecalledSummaries(worldId, sessionId)`：
   - 从当前 session 取最近 MEMORY_RECALL_CONTEXT_WINDOW 条 user+assistant 消息，拼接 `用户：xxx\nAI：xxx\n...`
   - 拼接结果为空 → 返回空字符串
   - 调 llm.embed(joined)；返回 null（embedding 未配置）→ 返回空字符串（静默降级，不报错）
   - 调 sessionSummaryVectorStore.search(queryVec, { worldId, excludeSessionId: sessionId, topK: MEMORY_RECALL_MAX_SESSIONS })
   - 命中为空 → 返回空字符串
   - 用 getSummaryWithMetaById 取每条的 content + session_title + session_created_at
   - 按 MEMORY_RECALL_MAX_TOKENS 软截断：按相似度倒序累加 token（用 token-counter.js 的 estimateTokens），超出阈值则丢弃剩余条目
   - 渲染格式：
     标题行 `[历史记忆召回]`
     每条 `- 【{YYYY-MM-DD} · {session_title 或 "未命名会话"}】{content}`
   - 若最终至少有一条 → 返回完整文本；否则返回空串

五、assembler.js 接入（修改锁定文件，属 T21 [6] 例外的自然扩展）
7. [6] 位置现有的 `[worldStateText, characterStateText, timelineText, personaStateText]`（T26C 已扩展）末尾追加 `await renderRecalledSummaries(world.id, sessionId)`；最终拼接顺序：玩家 → 角色 → 世界 → 时间线 → 召回摘要
8. 因 renderRecalledSummaries 是 async，确认 buildPrompt 内改为 await；保持其他位置（[1]-[5]、[7]、[8]）不动
9. 在代码里保留一条 TODO 注释：「未来 T28：渐进式展开——AI 通过 preflight 决策触发读取历史 session 原始 messages」，替换现有第 149 行的旧 TODO

六、SSE 事件（落地 T21 遗留的 memory_recall 事件约定）
10. chat.js 的 runStream 中，现有 `// TODO T21: memory_recall_start / memory_recall_done` 注释替换为真实实现：
    - 在调用 `buildPrompt(sessionId)` **之前** emit `event: type:memory_recall_start\ndata: {}`
    - 在 `buildPrompt` 返回后（无论命中与否）emit `event: type:memory_recall_done\ndata: {"hit": <number>}`，`hit` 为最终注入的召回条数（0 表示未命中）
    - 若 buildPrompt 抛错，不 emit recall_done，按现有 error 分支处理
    - 为了拿到 hit 数，buildPrompt 可通过 options 回调或返回值透传（建议 `buildPrompt` 签名扩展为返回 `{ messages, temperature, maxTokens, recallHitCount }`，向后兼容，旧调用忽略新字段即可）
11. 前端 api/chat.js 已监听两个事件，无需改动；本任务不做 UI 胶囊（留给 T28 与 expand 事件一起做）

七、约束与范围
- 不改 schema.js，不改 SCHEMA.md（session_summaries 不加字段；向量存独立文件）
- 不改 assembler.js 的 [1]-[5]、[7]、[8]，不动 constants.js 已有项
- 不改 import-export.js：session_summaries 不在导出范围（现状保留），导入时不需要重建向量
- 不做 backfill：历史已存在但未 embed 的 summary，在下次该 session 再有新消息触发 generateSummary 时顺带补上；本任务不提供一次性 backfill 接口
- embedding 未配置时整条召回链路静默跳过，不在 UI 上提示；由用户自行在设置页配置 embedding provider
- 前端本任务**不改**（记忆面板 T22 只展示结构化状态，不需要展示召回结果；召回是只对 LLM 可见的隐式注入）
```

**验证方法**：
1. `cd backend && npm run db:reset && npm run dev`，在设置页配置好 embedding provider（OpenAI / Ollama 任一）
2. 创建世界 A，建角色 X，进行 2 轮有实质内容的对话后关闭会话；观察后端日志 runStream 先打印 generateSummary 完成，再打印 embedSessionSummary 完成；`data/vectors/session_summaries.json` 多一条 entry，vector 数组非空
3. 同一世界 A 再建角色 Y，开新会话问一句和 X 之前对话主题相关的问题；后端日志打印 [6] 组装时 `renderRecalledSummaries` 命中 ≥1 条，assembler 生成的 system message 末尾出现 `[历史记忆召回]` 段并包含之前 X 的 session 摘要
4. 同一角色 X 换一个完全无关的话题开新会话；召回应**不命中**（相似度低于 0.68），[6] 位置不出现 `[历史记忆召回]` 段
5. 在不同世界 B 下建角色、对话；世界 B 的召回**不会**检索到世界 A 的摘要（世界隔离）
6. 在设置页清空 embedding provider，再发消息；后端不报错，`[历史记忆召回]` 段不出现
7. 编辑某条消息触发 regenerate；检查 async 队列的 clearPending 清空了优先级 4/5 的未开始任务，不重复 embed
8. 手动删除 `data/vectors/session_summaries.json`，再发一轮消息；后端不崩溃，新的 embedSessionSummary 重新建文件

9. assembler [1]、[3]-[5]、[7]-[8] 其他位置未受影响，老对话继续可用

---

### T28 ⬜ 渐进式展开原文（补齐"层一"召回的第二跳）

**这个任务做什么**：在 T27 已经把相关 session summary 注入 [6] 位置的基础上，增加第二跳——让 AI 主动决定是否"翻开正文"。实现方式为**两阶段 preflight 决策**：正式流式生成前，用一次低延迟的非流式 LLM 小调用，让模型针对当次召回到的 summary 集合返回一个 JSON（是否展开、展开哪几条）；命中展开的 session 的原始对话会被拼接进 [6] 位置末尾的「历史对话原文」段，再走正常流式对话。整个过程对前端流式体验不变，只在首包前增加一次小的预热延迟，且有 SSE 事件反馈进度。

**为什么用 preflight 而不是 tool call 或流中标记**：
- WorldEngine 支持 12 个 provider（包含部分不支持 tool/function call 的本地模型），preflight 走 `llm.complete()` 的纯文本 JSON 协议，所有 provider 通用
- 流中标记方案需要在 SSE 解析层检测 + 中断重启流，工程复杂且与 T11/T16 已稳定的流式管线耦合度高，回归风险大
- preflight 的代价是首包延迟增加一次小调用（maxTokens ≤ 200、temperature=0）；只在 T27 召回命中 ≥1 条时才触发，未命中时零成本

**涉及文件**：

后端：
- `/backend/utils/constants.js`（新增 `MEMORY_EXPAND_MAX_TOKENS`、`MEMORY_EXPAND_DECISION_MAX_TOKENS`、`MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS` 三个常量）
- `/backend/memory/recall.js`（将 `renderRecalledSummaries` 拆成两步：新增 `searchRecalledSummaries(worldId, sessionId)` 返回结构化命中列表 `[{ ref, session_id, session_title, created_at, content, score }, ...]`；原 render 函数改为吃结构化列表返回文本；ref 用 1 起的序号，注入文本里明示给 AI）
- `/backend/memory/summary-expander.js`（新建：`decideExpansion(sessionId, recalled, currentUserMessage)` 发 preflight；`renderExpandedSessions(sessionIds, tokenBudget)` 拉原始 messages 渲染为可读文本块）
- `/backend/db/queries/messages.js`（确认有 `getMessagesBySessionId`，无则复用现有；本任务不新增查询）
- `/backend/prompt/assembler.js`（[6] 位置在 `renderRecalledSummaries` 之后追加 expansion 流程；signature 改为 `buildPrompt(sessionId, { onRecallEvent })` 回调用于发 SSE 事件）
- `/backend/routes/chat.js`（将 onRecallEvent 回调接到 SSE 通道：新增事件 `type:memory_expand_start` / `type:memory_expand_done`；已存在 `memory_recall_start` / `memory_recall_done` 按原有规范继续发）
- `/backend/services/config.js` 与 global config（新增开关 `memory_expansion_enabled` 默认 true；关闭时整段跳过）
- `/frontend/src/components/chat/MessageStream.jsx` 或相应 SSE 事件处理组件（新增 `memory_expand_start/done` 事件的可视化提示——可简单显示「正在翻阅相关历史对话…」）
- `/frontend/src/pages/SettingsPage.jsx` 或全局配置页（新增 `memory_expansion_enabled` 开关 UI，标题「记忆原文展开」，副标题「召回历史摘要后允许 AI 读取原文，会增加首包延迟」）

**Claude Code 指令**：

```
请先阅读 @SCHEMA.md（messages / sessions / session_summaries 表结构）、@CLAUDE.md（异步队列、LLM 调用分工——chat 流式 vs complete 非流式、assembler.js [6] 例外、SSE 事件类型）、@CHANGELOG.md（T18 summary、T21 [6] 注入、T27 跨 session 召回已落地）、@PROJECT.md（层一 原始 Session 召回逻辑：embedding → summary → AI 决定展开 → 渐进式读取原文）。

任务：在 T27 的基础上加第二跳。AI 可以针对当次召回到的每一条 summary 决定「仅看摘要」还是「需要翻正文」，翻正文命中的 session 的原始对话会被拼入 [6] 末尾的「历史对话原文」段。实现使用 preflight 两阶段决策，不引入 tool/function call，不改动 SSE 流中间切换。

一、常量（constants.js）
1. 新增：
   - `MEMORY_EXPAND_MAX_TOKENS = 4096`（全部展开段加起来的上限）
   - `MEMORY_EXPAND_DECISION_MAX_TOKENS = 200`（preflight 回复的 maxTokens）
   - `MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS = 30`（单个 session 展开时取最多多少条 user+assistant 消息；超出则截取最早一段并加「…（后续对话略）」占位）
2. 已有 MEMORY_RECALL_* 不要动；T27 新增的 MEMORY_RECALL_SIMILARITY_THRESHOLD 也不要动

二、recall.js 重构（不改锁定文件；recall.js 非锁定）
3. 将 T27 的单一函数 `renderRecalledSummaries(worldId, sessionId)` 拆为：
   - `async searchRecalledSummaries(worldId, sessionId)` → 返回 `[{ ref, session_id, session_title, created_at, content, score }]`（按相似度倒序；ref 从 1 起，供 AI 指代）；embedding 未配置或空命中时返回空数组
   - `renderRecalledSummaries(recalled)` → 输入结构化列表，返回注入用的可读文本（保留 T27 的格式，但每条前加 `【#{ref}】` 前缀以便 AI 指代；无项时返空串）
4. assembler.js 调用方自己负责调用这两个函数的先后顺序和复用命中结果（避免 expansion 再做一次向量搜索）

三、summary-expander.js（新建，本任务核心）
5. `async decideExpansion({ sessionId, recalled, recentMessagesText })` → 返回 `string[]`（需要展开的 session_id 列表，可能为空）
   - 若 recalled 为空 → 直接返回 []
   - 构造 preflight prompt（`llm.complete`，temperature=0，maxTokens=MEMORY_EXPAND_DECISION_MAX_TOKENS）：
     system：简短说明任务，示范输出格式（严格 JSON）
     user：拼接「近 N 轮对话片段」+「召回到的摘要列表，每条带 #ref 和 session_id」+「判断要不要展开哪几条，返回 {"expand":["<session_id>",...]}，不需要任何解释文本，不需要 markdown 代码块；若都不需要返回 {"expand":[]}」
   - 解析：strip 可能的 ```json 包裹，`JSON.parse`；校验 `expand` 是字符串数组；过滤掉不在 recalled.session_id 集合中的 id；去重；截断最多 `recalled.length` 条
   - 任何异常（超时、JSON 解析失败、字段不对）→ 记 warn 后返回 []（降级为"不展开"）
6. `renderExpandedSessions(sessionIds, tokenBudget)` → 返回可读文本块
   - 对每个 sessionId：
     - 取 session meta（title / created_at）
     - 取最多 MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS 条 user+assistant 消息，按消息时间正序
     - 渲染：
       `【历史对话原文 · {YYYY-MM-DD} · {title 或 "未命名会话"}】`
       每条 `用户：...` / `AI：...`
       若命中本 session 的消息数被 MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS 截掉 → 末尾追加 `…（后续对话略）`
   - 累加各 session 文本时用 token-counter.js 的 estimateTokens 控预算 `tokenBudget`；超额则丢弃剩余 session（按 decideExpansion 返回的顺序优先保留前面的）
   - 所有段之间空行隔开；整体返回时首行再加一行 `[历史对话原文展开]` 作为大标题（若至少有一段命中）
   - 无命中 → 返回空串

四、assembler.js 接入（锁定文件例外，延续 T21/T26C/T27 的 [6] 扩展）
7. buildPrompt 签名改为 `buildPrompt(sessionId, options = {})`，其中 `options.onRecallEvent?: (name, payload) => void`；向后兼容：未传时 noop
8. [6] 位置原有调用 `renderRecalledSummaries(world.id, sessionId)` 一行改为：
   - 先 `const recalled = await searchRecalledSummaries(world.id, sessionId)`
   - `const recalledText = renderRecalledSummaries(recalled)`
   - 若 `recalled.length > 0` 且 `config.memory_expansion_enabled !== false`：
     - onRecallEvent?.('memory_expand_start', { candidates: recalled.map(r => ({ ref: r.ref, title: r.session_title })) })
     - `const toExpand = await decideExpansion({ sessionId, recalled, recentMessagesText })`（recentMessagesText 复用已有取最近消息的工具，与 recall.js 一致）
     - `const expandedText = toExpand.length ? renderExpandedSessions(toExpand, MEMORY_EXPAND_MAX_TOKENS) : ''`
     - onRecallEvent?.('memory_expand_done', { expanded: toExpand })
   - 最终 [6] 拼接顺序（T26C 基础上追加）：玩家 → 角色 → 世界 → 时间线 → recalledText → expandedText
9. 保持 [1]-[5]、[7]、[8] 不动；保持 recalledText 的格式不变（T27 产出物）

五、chat.js SSE 事件
10. runStream 调用 `buildPrompt(sessionId, { onRecallEvent: (name, payload) => res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`) })`
11. 事件语义：
    - `memory_expand_start`：candidates 列表送前端用于显示「正在判断是否翻阅…」
    - `memory_expand_done`：expanded 列表送前端显示「已翻阅 X 条历史对话」或不显示（展开列表为空）
12. `memory_recall_start` / `memory_recall_done` 事件由 T27 首次落地实现，本任务不改这两个事件的发射逻辑；expand 事件仅在 recall 命中 ≥1 且开关打开时发送

六、config 开关
13. services/config.js 扩展 global config schema：新增 boolean `memory_expansion_enabled`，默认 true
14. 关闭开关时：assembler.js 中不调用 decideExpansion 也不发 expand 事件；只保留 T27 的 summary 召回

七、前端
15. 前端 SSE 事件处理器监听 `memory_expand_start` / `memory_expand_done`：
    - start 时在消息气泡上方或底部显示淡色胶囊「正在翻阅历史对话…」
    - done 时若 `expanded.length > 0`，把胶囊换成「已翻阅 N 条历史对话」保留 3 秒后淡出；若为空则直接隐藏
    - 样式用现有 TailwindCSS 工具类 + CSS 变量，不加颜色硬编码
16. 设置页（SettingsPage.jsx 或等价位置）新增一项开关「记忆原文展开」，绑定到 `memory_expansion_enabled`；副标题「召回历史摘要后允许 AI 读取原文，会略增加首包延迟」；保存调用现有 config 更新接口

八、约束
- 仅在 T27 召回命中 ≥1 条时触发 preflight；零命中时 0 成本
- preflight 用 `llm.complete`（非流式），不破坏 CLAUDE.md 关于对话流式 / 记忆非流式的分工
- preflight 失败静默降级为"不展开"，不影响正式对话流；不做重试
- 不改 schema.js / SCHEMA.md / constants.js 已有项 / server.js / store/index.js
- 不引入 tool/function call 协议（跨 provider 兼容性代价过高）
- 不对 expansion 结果做持久化缓存（每次对话重新决策，简单；若后续发现成本高可加缓存，留给未来任务）
```

**验证方法**：
1. 前置：T27 已完成并可用；embedding provider 已配置；同一世界 A 下至少有 2 个历史 session 的 summary 已向量化，分别讨论「关于 X 的事件」和「关于 Y 的事件」
2. 在世界 A 新开会话，明确问「上次我们聊 X 的时候具体说了什么细节？」——后端日志：
   - SSE 发出 `memory_recall_start` 和 `memory_recall_done`，recall 命中至少 1 条
   - SSE 发出 `memory_expand_start`，preflight 调用返回 JSON 包含 X 的 session_id
   - SSE 发出 `memory_expand_done`，expanded 列表包含该 session_id
   - assembler 组装的 system message 末尾出现 `[历史对话原文展开]` 段并包含 X session 的 user/AI 消息原文
3. 在同世界问「今天天气真好」这种无指代意图的问题——recall 命中 0 或低质量：
   - 若 recall 为 0：不发 expand 事件，行为与 T27 一致
   - 若 recall 命中但 AI 判断无需展开：preflight 返回 `{"expand":[]}`，expand_done 事件 expanded=[] 且无展开段
4. 设置页关闭「记忆原文展开」开关 → recall 段保留，无 expand 事件、无展开段
5. 故意把 embedding provider 配置成无效值 → 整条召回链静默跳过，无 expand 段，对话正常
6. Mock preflight 返回非法 JSON（比如断网 / 超时）→ 降级为不展开，对话仍能正常流式完成，后端日志有一条 warn
7. 前端 UI：expand_start 出现「正在翻阅历史对话…」胶囊，done 后显示「已翻阅 N 条历史对话」3 秒后淡出；关闭开关时从未出现胶囊
8. expanded session 的原始消息超过 MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS → 渲染末尾有「…（后续对话略）」占位
9. assembler [1]-[5]、[7]-[8] 其他位置未受影响；T27 的 recall 行为在未命中时维持不变

---

### T29A ⬜ 设计令牌落地 & 视觉基线审计

**这个任务做什么**：将 DESIGN.md 里描述的 Claude 风格设计系统落成具体的 CSS 变量 + Tailwind v4 `@theme` 配置 + 字体栈；同时产出一份「组件 → 变更清单」的审计表给 T29B 按图施工。**本任务只改全局 token，不动任何组件的 className**。

**涉及文件**：

- `/frontend/src/index.css`（重写 `:root` 变量 + `@theme` 块；删除 `prefers-color-scheme: dark` 块）
- `/frontend/DESIGN_AUDIT.md`（新建，临时审计产物，T29B 完成后删除）

**Claude Code 指令**：

```
请先阅读 @DESIGN.md（完整设计系统说明）、@CLAUDE.md（项目约束与 T24A/T24B 的交互）、@CHANGELOG.md（T24A 自定义 CSS 已落地，注入点 <style id="we-custom-css"> 在 <head> 末尾）、以及 /frontend/src/index.css 当前内容。另外通过 ls 了解 /frontend/src/components 与 /frontend/src/pages 下的文件分布。

本项目使用 Tailwind v4（`@import "tailwindcss"` + `@theme`），没有 tailwind.config.js，theme 扩展必须写在 CSS 文件里的 `@theme { ... }` 块内。

任务：建立 Claude 风格的设计令牌层，并产出组件审计清单。不改任何组件。

一、重写 /frontend/src/index.css

1. 删除现有 `prefers-color-scheme: dark` 整块（项目明确不做深浅色主题切换，见 PROJECT.md「不做的功能」），连带删除 --text、--bg、--accent 等旧变量
2. 在 `:root` 定义完整 Claude 风格变量，全部以 `--we-` 前缀：
   - 画布与表面：--we-canvas（#f5f4ed 羊皮纸）、--we-ivory（#faf9f5）、--we-sand（#e8e6dc）、--we-white（#ffffff）、--we-surface-dark（#30302e）、--we-surface-deep（#141413）
   - 品牌与强调：--we-accent（#c96442 陶土）、--we-accent-soft（#d97757 珊瑚）、--we-error（#b53333）、--we-focus（#3898ec）
   - 文字：--we-text（#141413 正文）、--we-text-secondary（#5e5d59）、--we-text-tertiary（#87867f）、--we-text-muted（#4d4c48）、--we-text-on-dark（#b0aea5）
   - 边框：--we-border（#f0eee6）、--we-border-strong（#e8e6dc）、--we-border-dark（#30302e）
   - 环形阴影：--we-ring（#d1cfc5）、--we-ring-deep（#c2c0b6）
   - 阴影预设：--we-shadow-ring（"0 0 0 1px var(--we-ring)"）、--we-shadow-ring-deep（"0 0 0 1px var(--we-ring-deep)"）、--we-shadow-whisper（"rgba(0,0,0,0.05) 0 4px 24px"）
   - 字体栈（回退链按 DESIGN.md § 3）：
     --we-serif: "Anthropic Serif", Georgia, "Noto Serif SC", serif;
     --we-sans: "Anthropic Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
     --we-mono: "Anthropic Mono", ui-monospace, Consolas, monospace;
   - 圆角刻度：--we-radius-sharp（4px）/--we-radius-sm（6px）/--we-radius（8px）/--we-radius-md（12px）/--we-radius-lg（16px）/--we-radius-xl（24px）/--we-radius-2xl（32px）
   - 全局排版：font-family 用 var(--we-sans)；font-size 用 16px（从 15px 提到 16px，符合 DESIGN.md Body Standard）；line-height 1.60；color var(--we-text)；background var(--we-canvas)

3. 新增 `@theme` 块，把 Claude 设计 token 暴露为 Tailwind 工具类（v4 语法）：
   - `--color-canvas`、`--color-ivory`、`--color-sand`、`--color-surface-dark`、`--color-surface-deep`、`--color-accent`、`--color-accent-soft`、`--color-text`、`--color-text-secondary`、`--color-text-tertiary`、`--color-text-muted`、`--color-text-on-dark`、`--color-border`、`--color-border-strong`、`--color-border-dark`、`--color-ring-warm`、`--color-ring-warm-deep`、`--color-error`、`--color-focus`
     值全部引用 `:root` 定义的对应 `--we-*` 变量
     这样 `bg-canvas`、`text-accent`、`border-border` 等 Tailwind 工具类可用
   - 字体族：`--font-serif`、`--font-sans`、`--font-mono` 指向对应 --we-* 变量（启用 `font-serif` / `font-sans` / `font-mono` 工具类）
   - 圆角：`--radius-sharp`、`--radius-sm`、`--radius`（对应无后缀的 `rounded` 类，指向 --we-radius=8px）、`--radius-md`、`--radius-lg`、`--radius-xl`、`--radius-2xl` 指向对应 --we-radius-* 变量
   - 阴影：`--shadow-ring`、`--shadow-ring-deep`、`--shadow-whisper` 指向对应 --we-shadow-* 变量

4. 保留现有 `.line-clamp-2`、`.typing-dot`、`@keyframes typing-dot` 等工具样式，但把里面引用的旧变量名（如 `background: var(--text)`）替换为新的 `var(--we-text-tertiary)` 等对应值
5. body 的 background 改 `var(--we-canvas)`
6. `* { box-sizing: border-box; }`、`#root { min-height: 100svh; }` 等结构样式保持

二、钩子类名清单（供 T24A 用户片段稳定定位）

7. 整理一份"项目应当保留的钩子类名"清单，写入 DESIGN_AUDIT.md。必须包含至少以下稳定钩子（部分可能当前组件已有，部分待 T29B 补齐）：
   - 全局结构：`we-app`、`we-sidebar`、`we-main`、`we-modal`、`we-modal-backdrop`
   - 对话相关：`we-chat-message`、`we-chat-message-user`、`we-chat-message-ai`、`we-chat-bubble`、`we-chat-input`
   - 列表卡片：`we-character-card`、`we-world-card`、`we-session-card`、`we-persona-card`
   - 按钮：`we-btn`、`we-btn-primary`、`we-btn-secondary`、`we-btn-ghost`、`we-btn-danger`
   - 输入：`we-input`、`we-textarea`、`we-select`
   - 记忆面板：`we-memory-panel`、`we-state-field-row`
   这是约定清单，**不要在本任务里去各组件加这些 class**，只做登记

三、DESIGN_AUDIT.md（新建）

8. 文件放在 /frontend/DESIGN_AUDIT.md（前端根目录，不是 src 下），文件头注明 "临时审计产物，T29B 完成后删除"
9. 文件结构：
   a. 「设计令牌清单」：列出本任务新增的所有 --we-* 变量、它们的值、用途、对应的 Tailwind 工具类名；一张表一眼看全
   b. 「钩子类名清单」：上述第 7 步清单
   c. 「字体回退策略」：说明 Anthropic Serif/Sans/Mono 是闭源字体本项目不加载，回退到 Georgia / system-ui / Consolas；不引入任何 web font
   d. 「组件变更清单」：遍历 /frontend/src/components/**/*.jsx 和 /frontend/src/pages/**/*.jsx（用 ls 或 find 统计），按文件列出：当前用到的硬编码颜色（如 `bg-purple-*`、`text-gray-*`、`#xxx`）、圆角、阴影、字号；对照 DESIGN.md 给出目标 Tailwind 类或 CSS 变量。每个文件一小节，最多 5 行备注。如果文件太多，按目录分组汇总（不必每个文件都单列），但关键页面（ChatPage、CharactersPage、WorldsPage、SettingsPage、MessageItem、InputBox）必须单列
   e. 「与 T24A 的兼容约定」：写明 "T24A 的 `<style id=\"we-custom-css\">` 注入点在 <head> 末尾，优先级天然高于本任务定义的 :root 和 @theme；用户可覆盖 --we-* 任一变量或直接用钩子类 .we-* 定位；T29B 不得删除现有的 .we-* 钩子类"

四、约束

- 本任务 0 行组件代码改动，`git diff` 除 index.css 外只应看到 DESIGN_AUDIT.md 新增
- 不引入任何第三方 font 或 CSS 框架
- 不动锁定文件（index.css 不是锁定文件，可以改）
- 不改 tailwind 的基础预设（preflight），只扩展 theme
- 不加深浅色 mode 类、不加 media query 主题切换
- 变量名一律用 --we- 前缀，避免与 Tailwind 内置 --color-* 或用户 CSS 命名冲突（`@theme` 里的 `--color-*` 是 Tailwind v4 的约定，必须写；但 `:root` 里的用户层变量统一 --we-* 前缀）
```

**验证方法**：

1. `cd frontend && npm run dev` 启动，**所有页面视觉无崩溃**：页面背景变成羊皮纸色（#f5f4ed），body 文字颜色变成近黑（#141413），其他组件因为 className 未动所以可能仍然显示紫色/灰色/蓝色——这是预期的，T29B 才会替换
2. 浏览器 DevTools 检查 `:root` 的 computed style，所有 `--we-*` 变量都存在且值符合 DESIGN.md
3. 临时在某组件里写一个 `<div className="bg-accent text-ivory rounded-md">test</div>`，视觉上应显示陶土色底、象牙色文字、12px 圆角（如未生效说明 @theme 配置错误）；测完删除这个测试
4. `prefers-color-scheme: dark` 的块确认已删除（搜 `prefers-color-scheme` 全仓无命中）
5. DESIGN_AUDIT.md 生成，至少包含：设计令牌清单（≥25 个变量）、钩子类名清单（≥20 个类）、组件变更清单（≥6 个关键文件单列 + 其他分组）
6. T24A 的自定义 CSS 片段功能仍可用：在 SettingsPage 新建一条片段内容 `:root { --we-canvas: #ff0000 !important }`，启用后整个页面背景变红（证明用户片段能覆盖新 token）；测完删除片段

---

### T29B ⬜ 组件样式重构（按 DESIGN_AUDIT.md 执行）

**这个任务做什么**：按 T29A 产出的 DESIGN_AUDIT.md，逐组件把硬编码颜色/字体/圆角/阴影替换为 Claude 风格的 Tailwind 工具类或 CSS 变量；同时在 `/frontend/src/components/ui/` 新建若干纯视觉原语（Button / Card / Input / Badge / Modal 外壳），把散落的样式集中化；补齐 T29A 登记过的 `.we-*` 钩子类名。**不改 props / hooks / store / api / 业务逻辑**。

**涉及文件**：

- `/frontend/src/components/ui/`（新建 Button.jsx、Card.jsx、Input.jsx、Textarea.jsx、Badge.jsx、ModalShell.jsx 等，文件数由实际抽取结果决定）
- `/frontend/src/**/*.jsx`（所有组件与页面的 className 更新；禁止改 props、hooks、state、api 调用）
- `/frontend/src/index.css`（若 T29A 没包含的少量跨组件通用 class，比如 `.we-scrollbar`，可在此补充，但不再动 `:root` 或 `@theme`）
- 删除 `/frontend/DESIGN_AUDIT.md`（任务末尾）

**Claude Code 指令**：

```
请先阅读 @DESIGN.md、@/frontend/DESIGN_AUDIT.md（T29A 产出物，含组件变更清单和钩子类清单）、@CLAUDE.md、@CHANGELOG.md（特别留意 T24A / T24B / T26A / T26B / T26C 的 UI 结构约束）。然后 ls /frontend/src/components、/frontend/src/pages 了解全貌。

任务：把前端视觉按 DESIGN.md 重构到 Claude 风格。逻辑一点都不动。

一、新建 /frontend/src/components/ui/ 原语（按需拆，不追求最小集）

1. Button.jsx：props = { variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'sm'|'md'|'lg', as?: 'button'|'a', ...rest }；默认 variant='secondary'、size='md'；
   - primary：bg-accent text-ivory hover:opacity-90，圆角 rounded-md（12px），shadow-ring-deep
   - secondary：bg-sand text-text-muted hover:bg-border-strong，圆角 rounded（8px），shadow-ring
   - ghost：bg-transparent text-text-secondary hover:bg-sand
   - danger：bg-error text-white hover:opacity-90
   - 内部统一挂 className="we-btn we-btn-{variant}"（合并用户传入的 className）
2. Card.jsx：props = { elevation?: 'flat'|'contained'|'ring'|'whisper' }；默认 contained；
   - flat：bg-canvas，无边框无阴影
   - contained：bg-ivory border border-border rounded-md
   - ring：bg-ivory shadow-ring rounded-md
   - whisper：bg-ivory shadow-whisper rounded-lg
   - 挂 we-card 钩子
3. Input.jsx / Textarea.jsx：bg-white border border-border rounded-md px-3 py-2 text-text focus:border-focus focus:ring-2 focus:ring-focus/20 outline-none；挂 we-input / we-textarea
4. Badge.jsx：bg-sand text-text-muted text-xs px-2 py-0.5 rounded-full；挂 we-badge
5. ModalShell.jsx：通用遮罩 + 居中容器，bg-ivory rounded-lg shadow-whisper；挂 we-modal / we-modal-backdrop
6. 这些原语不加新 props 参数到业务层，只封装样式；业务组件可以选择性迁移，也可以直接用 Tailwind 工具类，保持渐进

二、逐组件样式替换（按 DESIGN_AUDIT.md 的组件变更清单）

7. 遍历清单里列出的每个文件，按以下原则改 className：
   - 颜色：所有 bg-purple-*, bg-blue-*, text-gray-*, border-gray-* 等 Tailwind 默认色 → 对应的 Claude 令牌（bg-canvas/ivory/sand、text-text/text-secondary、border-border 等）；任何硬编码 # 颜色（style="..." 或 className 里的 [#xxx]）全部替换
   - 字体：标题（h1/h2/h3/对话框标题/页面大标题）加 font-serif；正文和 UI 保持 font-sans（默认已是）；代码 font-mono
   - 字号：按 DESIGN.md § 3 重新分配；body 默认 16px（T29A 已改），大标题 28-36px，卡片标题 20-25px，caption 14px，label 12px；不追求像素级精确，只要层级符合
   - 圆角：所有 rounded-sm/rounded/rounded-md/rounded-lg 按 DESIGN.md § 5 重新选：小按钮 rounded-sm（6px），标准按钮/卡片 rounded（8px），主按钮/输入 rounded-md（12px），大卡片/面板 rounded-lg（16px），胶囊/标签 rounded-full
   - 阴影：drop shadow (shadow-sm/shadow/shadow-md/shadow-lg) 改 shadow-ring 或 shadow-whisper；active/pressed 状态用 shadow-ring-deep
   - hover / focus：hover 改色时走变量（如 hover:bg-sand 而非 hover:bg-gray-100）；focus 统一 focus:ring-2 focus:ring-focus/20 focus:border-focus
8. 关键组件额外要求（清单）：
   - ChatPage / MessageList：背景 bg-canvas；消息气泡 bg-ivory（AI）、bg-accent/10（user）；气泡圆角 rounded-lg；挂 we-chat-message / we-chat-bubble / we-chat-message-user|ai
   - MessageItem：T26A 的 group-hover 结构保持；文字颜色分 user/ai 分别用 text-text / text-text；时间戳 text-text-tertiary
   - InputBox：外壳 bg-ivory border-border rounded-lg；发送按钮用 Button variant="primary"
   - CharactersPage / WorldsPage / SessionListPage：列表项 bg-ivory hover:bg-sand transition；头像圆角 rounded-full
   - SettingsPage：分区标题 font-serif text-xl mb-4；输入区用 Input / Textarea 原语
   - 各种 Modal（WorldFormModal、CharacterEditPage 的弹层、RegexRuleEditor、PersonaEditModal 等）：外壳用 ModalShell，标题 font-serif text-2xl
   - MemoryPanel：分区标题 font-serif；状态字段行 we-state-field-row
9. 补齐 T29A 登记的钩子类名：每个组件的最外层/关键容器加对应的 we-* className（用 `className={"原有类 we-xxx"}` 或 clsx 合并）

三、结构性禁区（硬约束）

10. 禁止：修改任何 .jsx 的 import；修改任何 useState/useEffect/useMemo 的依赖或逻辑；改 store/index.js；改 /api/ 下任何文件；改 SSE 事件处理；改 MessageList 渲染条件；改 T25 Slash 命令激活逻辑；改 T24B regex-runner 的调用时机；改 T26A group-hover 结构；改 T26C PersonaCard 的数据流
11. 允许：拆出只承载视觉的新组件（如把 MessageItem 里重复的一段按钮组抽成 `<MessageActions>`），但拆出的组件必须 1:1 等价于原逻辑，props 透传；不允许合并多个原有组件
12. 允许：调整 Tailwind 的 spacing / padding / margin 数值以契合 DESIGN.md 的 editorial pacing，但不改 flex 方向、不改 grid 列数、不改层级嵌套

四、收尾

13. 删除 /frontend/DESIGN_AUDIT.md
14. 若发现 T29A 漏定义的 token 或钩子类，可在 index.css 的 :root / @theme 或 DESIGN_AUDIT.md 补充；但补定义要在 CHANGELOG 里写清
15. 不新增依赖（package.json 不动）

五、T24A 兼容性验证（本任务必须跑一遍）

16. 在 Settings 页用 T24A 新建一条片段：`body { font-family: "Comic Sans MS" !important; }`，启用 → 整个 UI 字体变 Comic Sans，证明用户片段仍生效；测完删片段
17. 新建一条片段：`.we-chat-bubble { background: #ffe !important; }`，启用 → 所有消息气泡变浅黄色；测完删片段
```

**验证方法**：

1. `cd frontend && npm run dev` 全页面肉眼巡检：
   - 背景是羊皮纸米色（#f5f4ed），不再是冷灰
   - 主按钮是陶土橙（#c96442），不再是紫色
   - 所有圆角柔和（≥6px），没有尖角按钮/卡片
   - 标题是衬线字体（Georgia 回退），正文是无衬线
   - 阴影是环形 halo，不是传统的模糊投影
2. 核心交互手动走一遍确认功能完全无变化：创建世界 → 建角色 → 建会话 → 发消息（流式、编辑、重试、继续写、代入）→ 打开记忆面板 → 改设置 → 导出导入 → Slash 命令 → 正则规则 → 自定义 CSS → 玩家人设编辑
3. T26A hover 稳态仍然无抖动
4. T24A 片段覆盖测试通过（见指令第 16-17 步）
5. T24B 正则规则 4 种 scope 仍正常触发（重点验 display_only 的 HTML 不被新样式破坏）
6. 无控制台 warning / error；无未使用的 CSS 变量（可忽略）
7. `npm run build` 通过，dist 产物大小无明显膨胀（±20% 可接受）
8. DESIGN_AUDIT.md 已删除
9. 所有 T29A 登记的钩子类名在对应组件的 DOM 树里都能被 querySelector 命中（抽查 3-5 个）

---

### T30 ⬜ 删除时同步清理附件 / 头像 / 向量（orphan cleanup）

**这个任务做什么**：SQLite 的 `ON DELETE CASCADE` 只负责 DB 行级联，不会回调 JS 去清磁盘文件和向量 JSON。现状是删 session / character / world 时，`/data/uploads/attachments/` 里的消息附件、`/data/uploads/avatars/` 里的角色头像、`/data/vectors/prompt_entries.json` 里的 Prompt 条目向量都会变孤儿（T27 的 `session_summaries.json` 已有 `deleteBySessionId`，但 service 层没调用）。本任务在三个 delete service 里补一道「先 SELECT 收集副作用目标 → DB DELETE → 清文件/向量」的流程，实现真正的彻底删除。

**为什么不用 SQLite 触发器或事务回滚**：

- 文件 IO 和向量 JSON 都在 JS 层，SQLite 触发器不触及
- 清理失败（比如文件被占用）不应回滚 DB——DB 删了就是删了，孤儿文件只是占盘空间，没有业务正确性风险；强行回滚反而制造"删不掉"的死状态
- 因此采用"DB 先删、副作用后清、失败只记 warn"的策略

**涉及文件**：

- `/backend/utils/file-cleanup.js`（新建，封装 `unlinkAttachmentFiles` / `unlinkAvatarFile`，统一做 path resolve + 失败静默）
- `/backend/db/queries/messages.js`（新增三个只读查询：`getAttachmentsBySessionId` / `getAttachmentsByCharacterId` / `getAttachmentsByWorldId`）
- `/backend/db/queries/characters.js`（新增 `getAvatarPathsByWorldId` / `getSessionIdsByCharacterId` / `getSessionIdsByWorldId`）
- `/backend/db/queries/prompt-entries.js`（新增 `getEmbeddingIdsByCharacterId` / `getEmbeddingIdsByWorldId`，仅返回 `embedding_id IS NOT NULL` 的条目）
- `/backend/services/sessions.js`（`deleteSession` 改造）
- `/backend/services/characters.js`（`deleteCharacter` 改造）
- `/backend/services/worlds.js`（`deleteWorld` 改造）

**Claude Code 指令**：

```
请先阅读 @SCHEMA.md（级联删除策略、attachments / avatar_path 字段格式）、@CLAUDE.md（数据库操作规范：queries 层只做 SQL、service 层做业务；range 克制原则；CHANGELOG + git commit 规范）、@CHANGELOG.md（T27 已落地 session_summary 向量，T28 没改这块；T26C 有 personas 表，但 persona 只有 name/system_prompt 无文件/无向量）、@backend/utils/vector-store.js（`deleteEntry(id)` 现有 API）、@backend/utils/session-summary-vector-store.js（`deleteBySessionId(sessionId)` 现有 API）。

任务：让 deleteSession / deleteCharacter / deleteWorld 在删 DB 行的同时，把对应的附件文件、头像文件、prompt 条目向量、session summary 向量一并清掉，不留孤儿。

一、新建 utils/file-cleanup.js

1. 导入 `fs/promises`、`path`、`fileURLToPath`
2. 常量 `UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'data', 'uploads')`（与现有上传写入路径保持一致，若现有代码有常量则复用，不要重复定义）
3. 导出 `async unlinkAttachmentFiles(relativePaths)`：入参可能为 null / 空数组 / 字符串数组；逐个 `fs.unlink(path.resolve(UPLOADS_DIR, rel))`；捕获 ENOENT 静默忽略，其它错误 `console.warn` 后继续；不抛
4. 导出 `async unlinkAvatarFile(relativePath)`：null / 空字符串 → 直接 return；否则同上规则 unlink

二、扩 db/queries/messages.js（纯只读查询，不改现有函数）

5. `getAttachmentsBySessionId(sessionId)` → `string[]`
   - `SELECT attachments FROM messages WHERE session_id = ? AND attachments IS NOT NULL`
   - 每行 `JSON.parse` 后扁平化，过滤 null / 非字符串项；返回字符串数组（可能为空）
6. `getAttachmentsByCharacterId(characterId)` → `string[]`
   - JOIN sessions：`SELECT m.attachments FROM messages m JOIN sessions s ON m.session_id = s.id WHERE s.character_id = ? AND m.attachments IS NOT NULL`
   - 同样扁平化
7. `getAttachmentsByWorldId(worldId)` → `string[]`
   - JOIN sessions + characters：`SELECT m.attachments FROM messages m JOIN sessions s ON m.session_id = s.id JOIN characters c ON s.character_id = c.id WHERE c.world_id = ? AND m.attachments IS NOT NULL`

三、扩 db/queries/characters.js

8. `getAvatarPathsByWorldId(worldId)` → `string[]`：`SELECT avatar_path FROM characters WHERE world_id = ? AND avatar_path IS NOT NULL`
9. `getSessionIdsByCharacterId(characterId)` → `string[]`：`SELECT id FROM sessions WHERE character_id = ?`
10. `getSessionIdsByWorldId(worldId)` → `string[]`：`SELECT s.id FROM sessions s JOIN characters c ON s.character_id = c.id WHERE c.world_id = ?`

四、扩 db/queries/prompt-entries.js（若无此文件则在已有 `character-prompt-entries.js` / `world-prompt-entries.js` 拆分的文件里各加一个函数）

11. `getEmbeddingIdsByCharacterId(characterId)` → `string[]`：`SELECT embedding_id FROM character_prompt_entries WHERE character_id = ? AND embedding_id IS NOT NULL`
12. `getEmbeddingIdsByWorldId(worldId)` → `string[]`：UNION ALL 两条查询——该 world 的 world_prompt_entries 的 embedding_id + 该 world 下所有 character 的 character_prompt_entries 的 embedding_id；过滤 NULL；结果去重

五、改造 services/sessions.js `deleteSession(id)`

13. 执行顺序：
    1) `const attachments = getAttachmentsBySessionId(id)`
    2) `dbDeleteSession(id)`（cascade 清 messages + session_summaries）
    3) `sessionSummaryVectorStore.deleteBySessionId(id)`（即使 summary 不存在也 no-op）
    4) `await unlinkAttachmentFiles(attachments)`
14. DB delete 成功但后续失败只记日志，函数仍返回 db delete 的 changes

六、改造 services/characters.js `deleteCharacter(id)`

15. 执行顺序：
    1) `const character = getCharacterById(id)`（拿 avatar_path）
    2) `const sessionIds = getSessionIdsByCharacterId(id)`
    3) `const attachments = getAttachmentsByCharacterId(id)`
    4) `const embeddingIds = getEmbeddingIdsByCharacterId(id)`
    5) `dbDeleteCharacter(id)`（cascade 清 sessions→messages/summaries、character_state_values、character_prompt_entries）
    6) `for (sid of sessionIds) sessionSummaryVectorStore.deleteBySessionId(sid)`
    7) `for (eid of embeddingIds) vectorStore.deleteEntry(eid)`
    8) `await unlinkAvatarFile(character?.avatar_path)`
    9) `await unlinkAttachmentFiles(attachments)`

七、改造 services/worlds.js `deleteWorld(id)`

16. 执行顺序：
    1) `const avatarPaths = getAvatarPathsByWorldId(id)`
    2) `const sessionIds = getSessionIdsByWorldId(id)`
    3) `const attachments = getAttachmentsByWorldId(id)`
    4) `const embeddingIds = getEmbeddingIdsByWorldId(id)`
    5) `dbDeleteWorld(id)`（cascade 清 characters→sessions→messages/summaries、personas、persona_state_*、world_state_*、character_state_fields、world_timeline、world_prompt_entries、world_id 绑定的 regex_rules）
    6) `for (sid of sessionIds) sessionSummaryVectorStore.deleteBySessionId(sid)`
    7) `for (eid of embeddingIds) vectorStore.deleteEntry(eid)`
    8) `for (p of avatarPaths) await unlinkAvatarFile(p)`
    9) `await unlinkAttachmentFiles(attachments)`

八、约束

- 三个 service 的 delete 方法签名不变，只是内部从同步改为 async；所有调用方（routes/*.js）已经 await 则无需改，若现有路由未 await 则同步改 `await service.deleteX()`
- 不改任何锁定文件（schema.js / constants.js / assembler.js / SCHEMA.md / server.js / store/index.js）
- 不改前端
- 不新增事务包裹——副作用清理故意放在 DB DELETE 之后、失败只记 warn，保证 DB 状态不被文件系统错误反向污染
- import-export.js 的导入流程不受影响（它走 createX 而非 deleteX）
- 任务完成后在 CHANGELOG.md 最上方追加 T30 记录，git commit
```

**验证方法**：

1. 准备：在某世界 A 下建角色 C（上传头像）、开会话 S、发带图片附件的消息若干、触发一次 summary 使其向量化、给世界和角色各建 1-2 条 Prompt 条目并等待向量化完成
2. 记录删除前基线：
   - `ls -1 data/uploads/attachments | wc -l`
   - `ls -1 data/uploads/avatars`
   - `jq '.entries | length' data/vectors/prompt_entries.json`
   - `jq '.entries | length' data/vectors/session_summaries.json`
3. 场景 1（删 session）：删除会话 S → attachments 数量减少正好为 S 下消息附件数；session_summaries.json 该 session 条目消失；avatars / prompt_entries.json 不变
4. 场景 2（删 character）：重建上述基线后，删除角色 C → 头像文件消失；C 下所有 session 的 attachments 消失；session_summaries.json 该角色下 session 条目全消失；prompt_entries.json 减少条数 = C 的 character_prompt_entries 已向量化条目数；世界级 Prompt 条目向量不受影响
5. 场景 3（删 world）：重建基线后，删除世界 A → 该世界下所有头像、所有附件、所有 session summary 向量、所有 world/character prompt 向量一并消失；其它世界资源完全不受影响
6. 故障注入：手动把某附件文件 `chmod 000`，再删 session → 后端日志 warn 一行但 DB DELETE 成功，后续读 session 返回 404，DB 里 messages 行已删
7. 故障注入：手动删掉 `data/vectors/prompt_entries.json` 文件后删 character → 走 `loadStore` 的 empty fallback，不报错
8. 删除 persona 无向量无文件需清理（persona 只有 name/system_prompt）→ 删 world 时 personas 行被 cascade 清掉即可，验证 `SELECT * FROM personas WHERE world_id = ?` 为空
