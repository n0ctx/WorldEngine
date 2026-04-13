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
