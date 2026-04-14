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

  

### T26C ⬜ 玩家（Persona）独立为世界下的一级对象

  

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

### T27 ⬜ 跨 Session Summary 召回（补齐"层一 原始 Session"召回）

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
