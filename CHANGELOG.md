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
