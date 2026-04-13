# WorldEngine — 开发路线图

## 使用方法

1. 按顺序找到第一个状态为 `⬜ 未开始` 的任务
2. 把该任务的"Claude Code 指令"原文复制给 Claude Code
3. Claude Code 完成后，按"验证方法"检查是否正常
4. 没问题就执行 `git commit`，CHANGELOG.md追加一条记录，把本任务ROADMAP.md中的状态改为 `✅ 完成`，继续下一个任务
5. 出问题就执行 `git checkout .` 回滚，开新对话重试

**原则：每个任务做完才开始下一个，不要跳着做。**

---

## 阶段 0：骨架（M0）

> 目标：项目能跑起来，目录结构正确，数据库能建表。还没有任何功能。

---

### T01 ✅ 完成 初始化项目结构

**这个任务做什么**：创建前后端的所有文件夹和基础配置文件，初始化 git 仓库。这是整个项目的地基，后续所有任务都在这个结构里工作。

**涉及文件**：
- `/frontend/` — 前端项目根目录，用 Vite 初始化
- `/backend/` — 后端项目根目录，用 npm 初始化
- `/frontend/src/components/` 下的子文件夹 — 按模块分好，但都是空的
- `/backend/routes/`、`/backend/services/`、`/backend/db/`、`/backend/memory/`、`/backend/prompt/`、`/backend/llm/`、`/backend/utils/` — 同上，空文件夹
- `.gitignore` — 告诉 git 忽略 node_modules、.env 等文件
- `README.md` — 简单说明项目是什么

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：初始化 WorldEngine 项目骨架。
1. 在 /frontend 目录用 Vite 初始化 React + TailwindCSS 项目
2. 在 /backend 目录初始化 Node.js + Express 项目，安装 express、better-sqlite3、cors、uuid 依赖
3. 按照 CLAUDE.md 的目录结构创建所有子文件夹（内容为空，放一个 .gitkeep 占位文件）
4. 创建根目录的 .gitignore（忽略 node_modules、dist、.env、*.db、data/）
4.5 在后端根目录同级创建 /data/ 目录及子目录：
  /data/uploads/avatars/（放 .gitkeep）
  /data/uploads/attachments/（放 .gitkeep）
  /data/vectors/（放 .gitkeep）
  /data/ 目录加入 .gitignore（*.db、data/ 已在其中）。
  同时在 backend/server.js 启动时加入自动创建逻辑（fs.mkdirSync + recursive:true），确保部署时目录不存在也能自动生成。
5. 初始化 git 仓库，执行第一次 commit，message 为 "init: 项目骨架"
不要实现任何业务逻辑。
```

**验证方法**：
- 运行 `cd frontend && npm run dev`，浏览器能打开 Vite 默认页面
- 运行 `cd backend && node server.js`，终端没有报错
- 运行 `git log`，能看到第一条 commit 记录

---

### T02 ✅ 完成 创建数据库建表文件

**这个任务做什么**：把 SCHEMA.md 里定义的所有表，翻译成真正能执行的 JavaScript 建表代码。以后每次启动后端，这个文件会自动把表建好（如果表不存在的话）。

**涉及文件**：
- `/backend/db/schema.js` — 核心文件，包含所有 CREATE TABLE 语句和索引。**此文件后续不得随意修改**
- `/backend/db/index.js` — 数据库连接文件，负责打开 SQLite 文件、开启外键约束、执行建表

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：创建数据库建表文件。
1. 创建 /backend/db/index.js：
   - 使用 better-sqlite3 打开 /data/worldengine.db
   - 连接后立即执行 PRAGMA foreign_keys = ON
   - 导出 db 实例供其他模块使用
2. 创建 /backend/db/schema.js：
   - 包含 SCHEMA.md 中所有表的 CREATE TABLE IF NOT EXISTS 语句
   - 包含所有索引的 CREATE INDEX IF NOT EXISTS 语句
   - 导出一个 initSchema(db) 函数，执行所有建表语句
3. 在 server.js 中引入并调用 initSchema，确保启动时自动建表
不要实现任何其他逻辑。
```

**验证方法**：
- 运行 `cd backend && node server.js`
- 检查 `/data/` 目录下是否生成了 `worldengine.db` 文件
- 用任意 SQLite 查看工具（如 DB Browser for SQLite）打开数据库，确认所有表都存在

---

### T03 ✅ 完成 创建基础工具文件

**这个任务做什么**：创建两个所有模块都会用到的工具文件——数值常量和异步队列。这两个文件在开发其他模块之前必须存在。

**涉及文件**：
- `/backend/utils/constants.js` — 存所有魔法数字（比如"记忆最多召回3条"），其他文件只能引用这里的常量，不能自己写数字
- `/backend/utils/async-queue.js` — 异步队列，让记忆更新操作串行执行，避免并发写入冲突

**Claude Code 指令**：
```

任务：创建基础工具文件。
1. 创建 /backend/utils/constants.js，使用 ES Module export，至少包含以下常量名：
   - LLM_RETRY_MAX
   - LLM_RETRY_DELAY_MS
   - ASYNC_QUEUE_MAX_SIZE
   - CONTEXT_MIN_HISTORY_ROUNDS
   - PROMPT_ENTRY_SCAN_WINDOW
   - PROMPT_ENTRY_SIMILARITY_THRESHOLD
   - PROMPT_ENTRY_TOP_K
   - MEMORY_RECALL_MAX_SESSIONS
   - MEMORY_RECALL_CONTEXT_WINDOW
   - MEMORY_RECALL_MAX_TOKENS
   - WORLD_TIMELINE_RECENT_LIMIT
   - WORLD_TIMELINE_COMPRESS_THRESHOLD
   - WORLD_TIMELINE_MAX_ENTRIES
   - MAX_ATTACHMENTS_PER_MESSAGE
   - MAX_ATTACHMENT_SIZE_MB
   以上常量的具体取值由本任务一次性写入 constants.js，后续其他模块只能引用，不得硬编码。
2. 创建 /backend/utils/async-queue.js，实现一个按 sessionId 分组的串行队列：
   - 同一 sessionId 的任务严格串行执行
   - 不同 sessionId 的任务互不干扰
   - 支持任务优先级（数字越小优先级越高）
   - 导出 enqueue(sessionId, taskFn, priority) 函数
   - 队列长度超过 ASYNC_QUEUE_MAX_SIZE 时，丢弃同 sessionId 中优先级最低的任务
不要实现任何业务逻辑。
3. 创建 /backend/utils/token-counter.js：
   - 导出 countTokens(text) 函数
   - 中文字符按 1字符=0.5 token 估算，其他字符按 1字符=0.25 token 估算
   - 导出 countMessages(messages) 函数，对 messages 数组中每条消息调用 countTokens 并求和
   - 不引入任何外部依赖
```

**验证方法**：
- 在 Node.js 中 `import { MEMORY_RECALL_MAX_SESSIONS } from './utils/constants.js'`，能正确打印值
- 写一个简单测试：往队列里塞 3 个 sleep 任务，确认它们是串行执行的（不是同时执行）

---

## 阶段 1：能对话（M1）

> 目标：可以创建世界、角色，然后和角色对话，消息能保存。这是整个系统最核心的功能。

---

### T04 ✅ 完成 全局配置读写

**这个任务做什么**：实现读取和保存 config.json 的功能。后续所有需要用到 API Key、模型名称的地方都从这里读。同时实现模型列表拉取接口，供设置页面的模型下拉框使用。

**涉及文件**：
- `/backend/services/config.js` — 读写 config.json 的逻辑，包括初始化默认配置
- `/backend/routes/config.js` — 配置读写接口 + 模型列表拉取接口
- `/backend/server.js` — 注册新路由

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现全局配置读写，以及各 provider 的模型列表拉取接口。
1. 创建 /backend/services/config.js：
   - 读取 /data/config.json，不存在则用 SCHEMA.md 中定义的默认结构初始化
   - 导出 getConfig() 和 updateConfig(patch) 函数
   - updateConfig 只做字段合并，不整体替换
2. 创建 /backend/routes/config.js，实现：
   - GET /api/config：返回当前配置，去掉 llm.api_key 和 embedding.api_key 字段
   - PUT /api/config：接收部分字段更新配置，返回更新后配置（同样去掉 key 字段）
   - PUT /api/config/apikey：只更新 llm.api_key，不在响应中返回
   - PUT /api/config/embedding-apikey：只更新 embedding.api_key，不在响应中返回
   - GET /api/config/models：根据当前 config 的 llm.provider 和 llm.api_key 拉取可用模型列表
     * OpenAI：GET https://api.openai.com/v1/models，Header: Authorization: Bearer {api_key}，返回 data[].id 列表
     * Anthropic：返回硬编码列表 ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-0", "claude-sonnet-4-0"]
     * Gemini：GET https://generativelanguage.googleapis.com/v1beta/models?key={api_key}，返回 models[].name 列表
     * Ollama：GET {base_url}/api/tags，返回 models[].name 列表
     * LM Studio：GET {base_url}/v1/models，返回 data[].id 列表
     * 拉取失败返回 HTTP 502，body: { error: "无法获取模型列表，请检查 API Key 和网络连接" }
   - GET /api/config/embedding-models：同上逻辑，用 embedding.provider 和 embedding.api_key 拉取
   - GET /api/config/test-connection：用当前 config 的 llm.provider 和 llm.api_key 发送最小请求验证连通性
     * OpenAI / Anthropic / Gemini：调用对应的模型列表接口（同 /models 逻辑），成功返回 { success: true }
     * Ollama / LM Studio：调用 {base_url}/api/tags 或 /v1/models，成功返回 { success: true }
     * 失败返回 { success: false, error: "..." }，HTTP 状态码仍为 200（让前端自己判断 success 字段）
3. 在 server.js 中注册路由
```

**验证方法**：
- 启动后端，用浏览器或 curl 访问 `GET http://localhost:3000/api/config`，能返回 JSON
- 用 curl 发送 `PUT http://localhost:3000/api/config`，修改 ui.theme，再 GET 确认已变更
- 检查 `/data/config.json` 文件是否被正确创建和更新

---

### T05 ⬜ LLM 接入层

**这个任务做什么**：封装所有和 LLM 通信的逻辑。不管用 OpenAI、Anthropic、Gemini，还是 OpenRouter、GLM、Kimi、MiniMax、DeepSeek、Grok、硅基流动、本地 Ollama / LM Studio，其他模块都用同样的方式调用，不需要关心底层差异。同时补齐 T04 已完成但尚未覆盖的新 provider 的模型列表和连通性检测逻辑。

**涉及文件**：
- `/backend/llm/index.js` — 对外暴露两个函数：`chat(messages, options)`（流式，返回 AsyncGenerator）和 `complete(messages, options)`（非流式，返回文本）
- `/backend/llm/providers/openai.js` — 云端 provider 适配：OpenAI / Anthropic / Gemini / OpenRouter / GLM / Kimi / MiniMax / DeepSeek / Grok / 硅基流动
- `/backend/llm/providers/ollama.js` — 本地 provider 适配：Ollama / LM Studio
- `/backend/services/config.js` — 如有需要，补充 provider 相关默认值/校验
- `/backend/routes/config.js` — **补充** T04 中 `/api/config/models` 与 `/api/config/test-connection` 对新增 provider 的支持

**Claude Code 指令**：
```

任务：实现 LLM 接入层，并补充 T04 已完成但尚未覆盖的新 provider 配置接口逻辑。

1. 创建 /backend/llm/providers/openai.js：

   * 支持以下云端 provider：

     * OpenAI
     * Anthropic
     * Gemini
     * OpenRouter
     * GLM
     * Kimi
     * MiniMax
     * DeepSeek
     * Grok
     * 硅基流动（SiliconFlow）
   * 不要把所有 provider 都强行转换成 OpenAI-compatible；应按各 provider 的真实接口格式发请求：

     * OpenAI / OpenRouter / GLM / Kimi / DeepSeek / Grok / 硅基流动：使用 OpenAI 风格 chat completions 接口
     * Anthropic：使用原生 Messages API（不是 OpenAI-compatible）
     * Gemini：使用原生 generateContent / streamGenerateContent 接口（不是 OpenAI-compatible）
     * MiniMax：按其实际 chat/completions 接口格式组装请求
   * 实现 `streamChat(messages, config)`，返回 AsyncGenerator，逐步 yield 文本片段
   * 实现 `complete(messages, config)`，返回完整字符串
   * provider 选择依据 `config.provider`
   * 支持传入 `config.api_key`、`config.base_url`、`config.model`、`config.temperature`、`config.max_tokens`
   * 若调用方传入 `options.temperature` / `options.maxTokens`，优先使用调用方值；否则回退 config 中的默认值
   * 兼容消息中的多段 content：

     * 纯文本消息：正常透传
     * 含图片附件的消息：转换为各 provider 支持的多模态格式
   * 统一将输入 messages 视为内部标准格式：

     * `[{ role: 'system'|'user'|'assistant', content: string | Array<part> }]`
     * part 至少支持：

       * `{ type: 'text', text: '...' }`
       * `{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }`
   * 在 provider 内部做格式转换，不要要求上层感知差异
   * 要支持 AbortSignal，中断时抛出可识别的 AbortError

2. 创建 /backend/llm/providers/ollama.js：

   * 支持 Ollama、LM Studio
   * 这两个 provider 均使用 OpenAI-compatible 接口
   * 实现 `streamChat(messages, config)`，返回 AsyncGenerator
   * 实现 `complete(messages, config)`，返回字符串
   * 默认请求地址：

     * Ollama：`{base_url}/v1/chat/completions`
     * LM Studio：`{base_url}/v1/chat/completions`
   * 同样支持 `config.model`、`config.temperature`、`config.max_tokens`
   * 同样支持 AbortSignal
   * 流式按 SSE / chunk 中的 delta 文本逐步 yield

3. 创建 /backend/llm/index.js：

   * 读取当前 config.json（通过已有 `getConfig()`）
   * 根据 `config.llm.provider` 自动选择 provider：

     * `openai`
     * `anthropic`
     * `gemini`
     * `openrouter`
     * `glm`
     * `kimi`
     * `minimax`
     * `deepseek`
     * `grok`
     * `siliconflow`
     * `ollama`
     * `lmstudio`
   * 导出：

     * `chat(messages, options = {})`
     * `complete(messages, options = {})`
   * `chat()`：

     * 用于对话生成
     * 调用对应 provider 的 `streamChat`
     * 返回 AsyncGenerator
   * `complete()`：

     * 用于记忆更新、summary、状态栏、时间线等非流式场景
     * 调用对应 provider 的 `complete`
     * 返回字符串
   * 统一处理重试逻辑：

     * 最多重试 `LLM_RETRY_MAX` 次
     * 每次间隔 `LLM_RETRY_DELAY_MS`
     * AbortError 不重试，立即抛出
     * 4xx 中鉴权/参数错误不重试，直接抛出
     * 网络错误、5xx、429 可重试
   * 统一错误对象格式，至少包含：

     * `message`
     * `provider`
     * `status`（若有）
     * `code`（若有）

4. 补充修改 /backend/routes/config.js（虽然 T04 已完成，但本任务需补齐新增 provider 的支持）：

   * 扩展 `GET /api/config/models`，根据当前 `config.llm.provider` 和 `config.llm.api_key` 拉取可用模型列表，新增支持：

     * OpenRouter
     * GLM
     * Kimi
     * MiniMax
     * DeepSeek
     * Grok
     * 硅基流动（SiliconFlow）
   * 扩展 `GET /api/config/test-connection`，对上述新增 provider 执行最小可行连通性检测
   * 保持 T04 原有行为不变：

     * 拉取失败时 `/api/config/models` 返回 HTTP 502，body: `{ error: "无法获取模型列表，请检查 API Key 和网络连接" }`
     * `/api/config/test-connection` 无论成功失败都返回 HTTP 200，由 `success` 字段判断
   * 不要新增任何新的配置路由，只补充现有逻辑

5. 如有需要，补充 /backend/services/config.js：

   * 确保默认配置和 provider 校验逻辑兼容新增 provider
   * 不改变 T04 已有接口行为，不重构原有结构

6. 实现要求补充：

   * 使用 ES Modules
   * 不引入重量级 SDK，优先使用原生 `fetch`
   * provider 文件只负责协议适配和结果解析，不要混入业务逻辑
   * 不要在 provider 内写死具体模型名；模型名全部从 config 或 options 读取
   * 对外暴露的文本流必须是纯文本 delta，上层不应感知各家 SSE 事件差异
   * 不要创建任何路由

7. `SCHEMA.md` 里 `config.json.llm.provider` 的枚举目前还是旧集合，补一次，实现和 schema 描述会一致。
```

**验证方法**：
- 在 config.json 中分别填入不同 provider 的真实配置，调用 `complete([{ role:'user', content:'说你好' }])`，应返回字符串
- 调用 `chat([{ role:'user', content:'说你好' }])`，应返回 AsyncGenerator，迭代时可逐步拿到文本片段
- 切换 `config.llm.provider` 为不同 provider 后，上层调用代码无需改动
- 调用 `GET /api/config/models`，新增 provider 也能返回模型列表
- 调用 `GET /api/config/test-connection`，新增 provider 也能返回 `{ success: true/false }`
- 人为触发 abort，中断后应立即停止生成，且不会进入重试
- 人为填错 API Key，应返回清晰错误，且 401/403 不应重试

---

### T06 ⬜ 世界的增删改查（后端）

**这个任务做什么**：实现世界的创建、读取、修改、删除接口。前端还没有，先把后端 API 做好测通。

**涉及文件**：
- `/backend/db/queries/worlds.js` — 所有操作 worlds 表的 SQL 函数（增删改查）
- `/backend/services/worlds.js` — 业务逻辑，调用 db/queries，处理级联删除等
- `/backend/routes/worlds.js` — HTTP 接口，调用 services

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现世界的后端增删改查。
1. 创建 /backend/db/queries/worlds.js，包含以下函数：
   - createWorld(data) → 插入一条记录，返回新记录
   - getWorldById(id)
   - getAllWorlds() → 按 created_at 升序返回所有世界
   - updateWorld(id, patch)
   - deleteWorld(id) → 硬删除，SQLite 外键级联会自动处理子数据
2. 创建 /backend/services/worlds.js，封装业务逻辑，调用 queries
3. 创建 /backend/routes/worlds.js，实现：
   - GET /api/worlds
   - POST /api/worlds
   - GET /api/worlds/:id
   - PUT /api/worlds/:id
   - DELETE /api/worlds/:id
4. 在 server.js 注册路由
所有字段名以 SCHEMA.md 为准，注意 worlds 表含 persona_name、persona_prompt、temperature、max_tokens 字段，temperature 和 max_tokens 允许为 NULL，创建时不传则默认 NULL。
注意：characters 表含 sort_order 字段，createCharacter 时取当前 world 下最大 sort_order + 1 作为默认值。
新增接口：PUT /api/characters/reorder，接收 { worldId, orderedIds: ["id1","id2",...] }，批量更新 sort_order。
```

**验证方法**：
- `POST /api/worlds` 创建一个世界，返回包含 id 的对象
- `GET /api/worlds` 返回刚创建的世界列表
- `DELETE /api/worlds/:id` 删除后，`GET /api/worlds` 不再包含该世界

---

### T07 ⬜ 角色的增删改查（后端）

**这个任务做什么**：和 T06 一样，但对象是角色。角色属于某个世界，删世界时角色会被级联删除。

**涉及文件**：
- `/backend/db/queries/characters.js`
- `/backend/services/characters.js`
- `/backend/routes/characters.js`

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现角色的后端增删改查，参考 T06 世界模块的结构。
1. 创建 /backend/db/queries/characters.js：
   - createCharacter(data) — data 包含 world_id、name、system_prompt，first_message 和 avatar_path有默认值；sort_order 默认取当前 world 下最大 sort_order + 1
   - getCharacterById(id)
   - getCharactersByWorldId(worldId) → 按 created_at 升序
   - updateCharacter(id, patch)
   - deleteCharacter(id)
2. 创建 /backend/services/characters.js
3. 创建 /backend/routes/characters.js，实现：
   - GET /api/worlds/:worldId/characters
   - POST /api/worlds/:worldId/characters
   - GET /api/characters/:id
   - PUT /api/characters/:id
   - DELETE /api/characters/:id
4. 在 server.js 注册路由
所有字段名以 SCHEMA.md 为准，注意 characters 表含 first_message 字段（TEXT，默认空字符串）。
```

**验证方法**：
- `POST /api/worlds/:worldId/characters` 创建角色，返回包含 id 的对象
- `GET /api/worlds/:worldId/characters` 返回该世界下的角色列表
- 删除世界后，其下角色也消失（验证级联删除）

---

### T08 ⬜ 会话和消息的增删改查（后端）

**这个任务做什么**：实现会话（一次对话记录）和消息（每条聊天内容）的接口。这是存储对话历史的基础。

**涉及文件**：
- `/backend/db/queries/sessions.js`
- `/backend/db/queries/messages.js`
- `/backend/services/sessions.js`
- `/backend/routes/sessions.js`

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现会话和消息的后端增删改查。
1. 创建 /backend/db/queries/sessions.js：
   - createSession(characterId) → 创建新会话，title 默认 NULL
   - getSessionById(id)
   - getSessionsByCharacterId(characterId, limit, offset) → 按 updated_at 降序，支持分页
   - updateSessionTitle(id, title)
   - deleteSession(id)
2. 创建 /backend/db/queries/messages.js：
   - createMessage(data) → data 包含 session_id、role、content，attachments 默认 NULL
   - getMessagesBySessionId(sessionId, limit, offset) → 按 created_at 升序，支持分页，attachments 字段自动 JSON.parse
   - deleteMessage(id)
   - deleteMessagesAfter(messageId) → 物理删除指定消息之后的所有消息（不含该消息本身）
3. 创建 /backend/services/sessions.js，封装业务逻辑
4. 创建 /backend/routes/sessions.js，实现：
   - GET /api/characters/:characterId/sessions?limit=20&offset=0
     * 按 updated_at 降序
     * 默认 limit=20、offset=0
     * 返回数组，不额外返回 total；前端以返回数量是否小于 limit 判断是否已全部加载
   - POST /api/characters/:characterId/sessions：
     * 创建新会话
     * 查询该角色的 first_message 字段，若不为空，立即插入一条 role='assistant'、content=first_message 的消息，created_at 与会话 created_at 相同
     * 返回会话对象
   - GET /api/sessions/:id — 返回单个会话对象（含 title），前端进入 session 时调用以刷新标题
   - GET /api/sessions/:id/messages?limit=20&offset=0 — 支持分页，默认最新20条
   - DELETE /api/sessions/:id
   - PUT /api/sessions/:id/title — 手动修改会话标题，接收 { title }
   - PUT /api/messages/:id — 更新单条消息的 content，同时调用 deleteMessagesAfter 删除该消息之后的所有消息
5. 在 server.js 注册路由，并在配置中注册以下异步任务入口（T18 会实现具体逻辑，这里只占位）：
   - generateSessionTitle(sessionId)：对话结束后异步调用 LLM 生成标题，生成完成后更新 sessions 表的 title 字段；若该 session 当前仍有活跃的 chat SSE 连接，则通过原 SSE 连接推送：
     data: {"type": "title_updated", "title": "..."}\n\n
所有字段名以 SCHEMA.md 为准。
```

**验证方法**：
- 创建会话，在该会话下创建几条消息（role 分别为 user 和 assistant）
- `GET /api/sessions/:id/messages` 返回按时间排序的消息列表
- 删除会话后，消息也消失

---

### T09 ⬜ 对话接口（流式输出）

**这个任务做什么**：实现最核心的一个接口——用户发一条消息，后端把消息存数据库，然后调用 LLM，把回复以流式方式实时返回给前端，最后把 AI 的回复也存数据库。同时实现停止生成和重新生成接口。

**涉及文件**：
- `/backend/routes/chat.js` — 对话、停止、重新生成三个接口
- `/backend/services/chat.js` — 组装上下文，管理进行中的请求

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现对话流式接口、停止生成接口、重新生成接口（暂不包含记忆和提示词系统，后续任务加入）。

1. 创建 /backend/services/chat.js：
   - buildContext(sessionId) → 读取角色信息和历史消息，组装 messages 数组
     格式：[{role:'system', content: 角色system_prompt}, ...历史消息]
     含附件的消息，content 转换为 OpenAI vision 数组格式（读取附件文件转 base64 内嵌）
   - 用一个 Map 维护进行中的请求：activeStreams = Map<sessionId, AbortController>

2. 创建 /backend/routes/chat.js，实现以下接口，并在 server.js 注册：

   POST /api/sessions/:sessionId/chat
   - 接收 { content, attachments }
     attachments 格式：[{ type: "image", data: "base64...", mimeType: "image/jpeg" }]，可为空数组
   - 若该 sessionId 已有进行中的请求，先 abort 掉
   - 将用户消息存入 messages 表；若 attachments 不为空，将文件解码保存到
     /data/uploads/attachments/{messageId}_{index}.{ext}，相对路径数组写入 attachments 字段
   - 创建 AbortController，存入 activeStreams
   - 监听 req.on('close')：触发时 abort 对应 stream（处理页面刷新/关闭场景）
   - 调用 llm.chat() 获取流式响应
   - SSE 事件格式（CLAUDE.md 第8节）：
     * 流式片段：data: {"delta": "..."}\n\n
     * 记忆召回事件（T21 实现后才会真正推送，此处不要实现，只在代码中留注释占位）：// TODO T21: memory_recall_start / memory_recall_done
     * 流正常结束：将完整 AI 回复存入 messages 表，更新 session 的 updated_at，
       推送 data: {"done": true}\n\n，从 activeStreams 删除该条目
     * 会话标题异步生成完成后，若当前 SSE 连接仍存在，额外推送：
       data: {"type": "title_updated", "title": "..."}\n\n
       用于前端实时更新左侧会话标题；若连接已关闭，则仅更新数据库，不强制补发
     * 流被 abort：将已输出的部分内容存入 messages 表，
       content 末尾追加 "\n\n[已中断]" 标记，
       推送 data: {"aborted": true}\n\n（若连接已关闭则跳过推送），从 activeStreams 删除该条目

   POST /api/sessions/:sessionId/stop
   - 若该 sessionId 有进行中的请求，调用 abort()
   - 返回 { success: true }，不等待流真正结束

   POST /api/sessions/:sessionId/regenerate
   - 接收 { afterMessageId }
   - afterMessageId 语义：保留该消息本身，删除该消息之后的所有消息（调用 deleteMessagesAfter）
   - 重新调用流式生成，逻辑与 /chat 接口相同，但不插入新的用户消息
   - 同样监听 req.on('close') 处理中断
   - 返回 SSE 流
   - `title_updated` 必须通过原 chat SSE 回流；前端进入 session 时再调用 GET /api/sessions/:id 做兜底刷新
```

**验证方法**：
- curl 发送 chat 请求，能看到流式输出
- 流输出过程中发送 stop 请求，输出停止，数据库消息内容末尾有"[已中断]"
- 发送 regenerate 请求，数据库中旧的 AI 回复被删除，新的回复写入

---

### T10 ⬜ 前端：世界、角色管理页面和角色卡编辑页

**这个任务做什么**：做出让用户能看到、创建、编辑、删除世界和角色的界面，包括头像上传。这是进入对话前的必经之路。

**涉及文件**：
- `/frontend/src/api/worlds.js` — 封装世界接口
- `/frontend/src/api/characters.js` — 封装角色接口，包含头像上传
- `/frontend/src/pages/WorldsPage.jsx` — 世界列表页面
- `/frontend/src/pages/CharactersPage.jsx` — 某世界下的角色列表页面
- `/frontend/src/pages/CharacterEditPage.jsx` — 角色卡编辑页（含头像上传）
- `/frontend/src/store/index.js` — Zustand 全局状态

**Claude Code 指令**：
```

任务：实现前端世界和角色管理页面，以及角色卡编辑页，后端接口已就绪。

1. 创建 /frontend/src/api/worlds.js 和 characters.js，封装 fetch 调用，统一处理错误
   - characters.js 额外包含 uploadAvatar(characterId, file) → POST /api/characters/:id/avatar

2. 创建 /frontend/src/store/index.js，用 Zustand 管理：
   - currentWorldId、currentCharacterId、currentSessionId

3. 创建 WorldsPage.jsx：
   - 展示世界列表（卡片形式）
   - 支持创建世界（弹窗表单：名称 + system prompt）
   - 支持编辑世界（弹窗表单，含以下所有字段）
   - 支持删除世界（二次确认弹窗，提示"将同时删除其下所有角色和会话"）
   - 点击世界卡片进入 CharactersPage
   - 世界编辑表单字段：
     * 名称（必填）
     * System Prompt（大文本框）
     * 用户人设 - 名字（单行文本，可为空，placeholder："你在这个世界里的名字"）
     * 用户人设 - 描述（多行文本，可为空，placeholder："你的身份、背景等"）
     * Temperature（滑块，范围 0.1-2.0，步进 0.1，右侧显示当前数值；
       旁边有"使用全局默认"复选框，勾选时滑块禁用，值存为 null）
     * Max Tokens（数字输入框，同样有"使用全局默认"复选框，勾选时输入框禁用，值存为 null）

4. 创建 CharactersPage.jsx：
   - 展示该世界下的角色列表（卡片形式，按 sort_order 升序，显示头像缩略图和角色名）
   - 支持拖拽排序（拖拽结束后调用 PUT /api/characters/reorder 持久化顺序）
   - 支持创建角色（弹窗表单：名称 + system prompt）
   - 支持删除角色（二次确认）
   - 点击角色卡片进入对话页（T11 实现）
   - 点击角色卡片右上角编辑图标进入 CharacterEditPage

5. 创建 CharacterEditPage.jsx：
   - 顶部显示头像（圆形），点击头像触发文件选择（accept="image/*"）
   - 选择图片后立即上传并预览，上传中显示 loading 覆盖层
   - 表单字段：
     * 名称（必填）
     * System Prompt（大文本框）
     * 首条消息（大文本框，placeholder："角色在对话开始时主动说的第一句话，留空则由用户先开口"）
   - 底部"保存"按钮，保存后返回 CharactersPage
   - 头像上传和表单保存是独立操作，不需要同时提交

6. 后端补充头像上传接口（在 /backend/routes/characters.js 中添加）：
   - POST /api/characters/:id/avatar
   - 接收 multipart/form-data，文件字段名为 avatar
   - 保存到 /data/uploads/avatars/{characterId}.{ext}
   - 更新 characters 表的 avatar_path 字段
   - 返回 { avatar_path: "..." }
   - 安装 multer 处理文件上传

7. 配置前端路由（react-router-dom）：
   - / → WorldsPage
   - /worlds/:worldId → CharactersPage
   - /characters/:characterId/edit → CharacterEditPage
   - /characters/:characterId/chat → ChatPage（T11 实现）

使用 TailwindCSS，深色风格，简洁现代。
```

**验证方法**：
- 能创建世界和角色，删除世界时弹出含警告文字的二次确认
- 进入角色编辑页，点击头像区域弹出文件选择，选择图片后头像更新
- 角色列表卡片显示刚上传的头像缩略图

---

### T11 ⬜ 前端：对话界面

**这个任务做什么**：实现完整的对话主界面，包括三栏布局、左侧会话列表、中间对话区、右侧记忆面板，以及所有消息操作交互。

**涉及文件**：
- `/frontend/src/pages/ChatPage.jsx` — 三栏布局主页面
- `/frontend/src/components/chat/Sidebar.jsx` — 左侧会话列表栏
- `/frontend/src/components/chat/SessionItem.jsx` — 单条会话列表项
- `/frontend/src/components/chat/MessageList.jsx` — 消息列表
- `/frontend/src/components/chat/MessageItem.jsx` — 单条消息
- `/frontend/src/components/chat/InputBox.jsx` — 输入框
- `/frontend/src/api/chat.js` — 流式请求、停止、重新生成封装
- `/frontend/src/api/sessions.js` — 会话增删改查封装

**Claude Code 指令(a)**：
```

任务：实现完整对话界面，后端所有接口已就绪。

布局规范（三栏，无顶部导航）：
- 整体占满视口高度，无顶部栏
- 左栏固定宽度 260px，不可拖拽
- 中栏弹性占满剩余宽度，内容最大宽度 800px 居中，两侧留白
- 右栏固定宽度 300px，可整体收起（收起后宽度为 0，中栏自动扩展）

1. 创建 /frontend/src/api/sessions.js：
   - getSessions(characterId)
   - getSession(id) → GET /api/sessions/:id，返回单个会话对象（含最新 title）
   - createSession(characterId)
   - deleteSession(id)
   - renameSession(id, title)
   - getMessages(sessionId, limit, offset) — 支持分页

2. 创建 /frontend/src/api/chat.js：
   封装所有 SSE 流式接口，统一解析以下事件类型：
   - delta：追加文字片段
   - memory_recall_start / memory_recall_done：记忆检索状态（回调 onMemoryRecallStart / onMemoryRecallDone）
   - done：流正常结束（回调 onDone）
   - aborted：流被中断（回调 onAborted）
   - type=title_updated：标题更新（回调 onTitleUpdated(title)）

   导出以下函数：
   - sendMessage(sessionId, content, attachments, callbacks)
     attachments 为对象数组：[{ type:"image", data:"base64...", mimeType:"image/jpeg" }]
     发送前对每张图片做前端校验：单张不超过 5MB，超出则提示用户拒绝发送
     用 FileReader 读取为 base64 后放入 attachments
   - stopGeneration(sessionId) → POST /api/sessions/:id/stop
   - regenerate(sessionId, afterMessageId, callbacks)
     → POST /api/sessions/:id/regenerate，解析 SSE 流
   - editAndRegenerate(sessionId, messageId, newContent, callbacks)
     → 先 PUT /api/messages/:id 更新消息内容，再调用 regenerate
   - continueGeneration(sessionId, callbacks)
     → POST /api/sessions/:id/continue，解析 SSE 流（T25 实现接口，此处占位）
   - impersonate(sessionId) → POST /api/sessions/:id/impersonate，返回 { content }（T25 实现接口，此处占位）

3. 创建 Sidebar.jsx（左栏）：
   - 顶部：当前角色头像 + 角色名，旁边有"切换"按钮（跳转回 CharactersPage）
   - 顶部下方：固定"+ 新对话"按钮，点击创建新 session 并立即进入
   - 会话列表：按 updated_at 倒序排列，初始加载最近 20 条，向上滚动到顶部时自动加载更多（每次 20 条），全部加载完后不再触发；每项显示标题和日期
   - 会话标题：title 为 NULL 时显示 created_at 的日期（如"2024-01-15"）作占位
     * 若后端通过原 chat SSE 推送 `title_updated`，则实时更新标题；若未收到，则进入会话时以 GET /api/sessions/:id 返回值为准
   - 单击会话名进入该会话；进入时调用 getSession(id) 刷新 title（处理 title_updated 已错过的情况）
   - 单击会话名文字处可内联重命名：文字变为输入框，Enter 确认，Escape 取消
   - 悬停会话项时右侧出现删除按钮（垃圾桶图标），点击弹出二次确认后删除
   - 删除当前会话后自动切换到列表中第一个会话，无会话时显示空状态
   - 收到 onTitleUpdated 回调时，更新对应会话项的标题显示

使用 TailwindCSS，深色风格，简洁现代。
```

**Claude Code 指令(b)**：
```

1. 创建 SessionItem.jsx：
   - 封装单条会话项的展示、内联重命名、悬停删除按钮逻辑

2. 创建 MessageList.jsx：
   - 进入会话时加载最近 20 条消息（GET /messages?limit=20&offset=0）
   - 向上滚动到顶部时自动加载更多（offset 递增），显示 loading 指示器
   - 所有消息加载完毕后不再触发
   - 新消息到来时自动滚动到底部（加载历史时不自动滚动）
   - 记忆检索期间在消息列表顶部显示"正在检索记忆…"提示条，检索完成后消失

3. 创建 MessageItem.jsx：
   - user 消息右对齐，assistant 消息左对齐
   - assistant 消息左侧显示角色小头像（圆形，24px），消息气泡上方显示角色 name
   - 支持 Markdown 渲染（react-markdown）
   - 代码块（``` 包裹）右上角显示"复制"按钮，点击将代码写入剪贴板，按钮文字短暂变为"已复制"后恢复
   - 支持图片附件缩略图显示（点击可放大查看）
   - content 含 "[已中断]" 时，去除该文字，显示橙色"已中断"小标签
   - 悬停时消息右上角出现操作按钮：
     * user 消息："编辑"按钮
     * assistant 消息："重新生成"按钮
   - 悬停时消息下方显示时间戳（格式：HH:mm）
   - 内联编辑（user 消息点击"编辑"）：
     * 消息就地替换为多行文本框，自动聚焦，底部有"确认"和"取消"
     * 确认：调用 editAndRegenerate；afterMessageId 传入被编辑消息的 id；
       该消息之后所有消息从列表移除，追加空 assistant 消息流式填充
     * 取消 / Escape：恢复原文，不触发任何请求
   - 重新生成（assistant 消息点击"重新生成"）：
     * afterMessageId 传入被删除 assistant 消息的前一条消息 id
     * 从列表中移除该 assistant 消息及之后所有消息，追加空 assistant 消息流式填充
   - AI 回复占位：收到第一个 delta 之前，消息气泡内显示三点打点动画（CSS 动画，三个点依次亮起）；收到第一个 delta 后动画消失，替换为实际文字内容开始流式追加

4. 创建 InputBox.jsx：
   - Shift+Enter 换行，Enter 发送
   - 输入框为空时按 Up 键，将上一条已发送的 user 消息内容填入输入框（仅页面内存，刷新不保留）
   - 最多上传 3 张图片，选择后前端校验（>5MB 则提示并跳过），通过则显示缩略图，点击缩略图移除
   - 生成中：输入框禁用，发送按钮变为"停止"按钮，点击调用 stopGeneration
   - 空闲时：正常发送按钮
   - 输入框右上角预留两个快捷图标按钮（T25 实现具体功能，此处渲染占位按钮即可）：
     * Continue 按钮（续写图标）
     * Impersonate 按钮（角色扮演图标）
   - 输入 / 时弹出命令列表浮层（T25 实现，此处只预留 onSlashCommand 回调接口）

5. 创建 ChatPage.jsx 组合以上组件，右栏嵌入 MemoryPanel（T22 实现，这里预留位置和收起按钮）

使用 TailwindCSS，深色风格，简洁现代。
```

**验证方法**：
- 三栏正常显示，右栏收起按钮可折叠右侧面板
- 左侧"+ 新对话"创建会话，若角色有 first_message 则直接显示开场白
- 点击会话项切换，进入时重新拉取 session 刷新标题
- 向上滚动到顶部自动加载更多历史消息
- 悬停会话项显示删除按钮，单击标题可内联重命名
- 发送消息后 AI 流式回复，assistant 消息左侧有小头像，上方显示角色名
- 代码块右上角有复制按钮，点击后文字变"已复制"
- 输入框为空时按 Up 键，填入上一条发送内容
- 停止生成后出现橙色"已中断"标签
- 切换角色按钮跳转回角色选择页

---

## 阶段 2：提示词系统（M2）

> 目标：三层提示词生效，Prompt 条目能自动触发。

---

### T12 ⬜ Prompt 条目的增删改查（后端）

**这个任务做什么**：实现三张 Prompt 条目表（全局/世界/角色）的接口。用户可以在界面上管理这些条目。

**涉及文件**：
- `/backend/db/queries/prompt-entries.js` — 三张表的 SQL 操作
- `/backend/services/prompt-entries.js`
- `/backend/routes/prompt-entries.js`

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现三层 Prompt 条目的后端增删改查。
1. 创建 /backend/db/queries/prompt-entries.js，为三张表（global/world/character）各实现：
   - create、getById、getAll（按所属 ID 查询）、update、delete
   - keywords 字段存取时自动 JSON.stringify / JSON.parse
   - 各表额外实现 reorder 函数，按 orderedIds 批量更新 sort_order
2. 创建 /backend/services/prompt-entries.js
3. 创建 /backend/routes/prompt-entries.js，实现：
   - GET/POST /api/global-entries
   - GET/POST /api/worlds/:worldId/entries
   - GET/POST /api/characters/:characterId/entries
   - GET/PUT/DELETE /api/entries/:type/:id（type 为 global/world/character）
   - PUT /api/entries/:type/reorder
     * type 为 global/world/character
     * 接收：
       - global: { orderedIds: ["id1","id2",...] }
       - world: { worldId, orderedIds: ["id1","id2",...] }
      - character: { characterId, orderedIds: ["id1","id2",...] }
     * 批量更新 sort_order，orderedIds 中第一个为 0，依次递增
4. 在 server.js 注册路由
```

**验证方法**：
- 能为某个角色创建一个 Prompt 条目，包含 title、summary、content、keywords
- 查询该角色的条目列表，能看到刚创建的条目
- keywords 字段返回的是数组而不是字符串

---

### T13 ⬜ Embedding 服务

**这个任务做什么**：实现把文字转成向量数字的功能，以及管理向量文件（读、写、搜索）。Prompt 条目的自动触发依赖这个。

**涉及文件**：
- `/backend/llm/embedding.js` — 调用 OpenAI 或 Ollama 的 embedding 接口
- `/backend/utils/vector-store.js` — 读写 `/data/vectors/prompt_entries.json`，实现相似度搜索

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现 Embedding 服务和向量文件管理。
1. 创建 /backend/llm/embedding.js：
   - 根据 config.json 中的 embedding.provider 选择 OpenAI 或 Ollama
   - 导出 embed(text) → 返回 float 数组
   - embedding 未配置时（provider 为 null）返回 null，不报错
2. 创建 /backend/utils/vector-store.js，管理 /data/vectors/prompt_entries.json：
   - loadStore() → 读取文件，不存在则初始化空结构
   - upsertEntry(id, sourceId, sourceTable, vector) → 新增或更新
   - deleteEntry(id)
   - search(queryVector, topK) → 返回相似度最高的 topK 个条目（余弦相似度）
   - 所有操作后自动写回文件
```

**验证方法**：
- 调用 `embed("测试文字")`，能返回一个数字数组（长度取决于模型）
- 调用 `upsertEntry` 存入几个向量，再调用 `search`，返回最相似的条目
- embedding 未配置时，embed() 返回 null 且不报错

---

### T14 ⬜ Prompt 条目自动向量化

**这个任务做什么**：每当 Prompt 条目被创建或修改时，自动把它的"标题+简介"向量化，存入向量文件。这样后续触发时就能做相似度匹配。

**涉及文件**：
- `/backend/services/prompt-entries.js` — 在创建/修改操作后，异步触发向量化

**Claude Code 指令**：
```

任务：在 Prompt 条目的创建和修改操作后，异步触发向量化。
修改 /backend/services/prompt-entries.js：
1. 在 create 和 update 操作完成后，异步执行（不阻塞响应）：
   a. 调用 embed(title + ' ' + summary) 获取向量
   b. 调用 vector-store 的 upsertEntry 存入向量文件
   c. 将返回的 embedding_id 写回对应的数据库表
2. embedding 服务未配置时（embed() 返回 null），跳过向量化，不报错
3. 在 delete 操作后，同步从向量文件中删除对应条目
不要修改路由文件。
```

**验证方法**：
- 创建一个 Prompt 条目，等待约 1 秒
- 查看 `/data/vectors/prompt_entries.json`，能看到新增的向量条目
- 数据库中该条目的 `embedding_id` 字段已被更新为非 NULL

---

### T15 ⬜ 提示词组装器

**这个任务做什么**：实现 assembler.js，这是整个提示词系统的核心——把三层 system prompt、触发的条目正文、记忆内容、对话历史按固定顺序拼在一起，交给 LLM。此文件一旦写好，后续**不得修改**。

**涉及文件**：
- `/backend/prompt/assembler.js` — **核心文件，写完即锁定顺序**
- `/backend/prompt/entry-matcher.js` — 判断哪些条目需要触发（embedding 相似度 + 关键词兜底）

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现提示词组装器。
1. 创建 /backend/prompt/entry-matcher.js：
   - matchEntries(sessionId, entries) → 返回需要注入正文的条目列表
   - 逻辑：
     a. 取最近 PROMPT_ENTRY_SCAN_WINDOW 条消息拼成扫描文本
     b. 调用 embed(扫描文本) 获取查询向量
     c. 对每个条目：embedding_id 存在则算余弦相似度，超过 PROMPT_ENTRY_SIMILARITY_THRESHOLD 则触发
     d. 对未触发的条目：检查 keywords 是否出现在扫描文本中，命中则触发
     e. embedding 未配置时，只走关键词匹配
   - 补充规则：
     a. keywords 匹配为大小写不敏感的普通子串匹配，不支持正则
     b. 同一条目多个 keywords 之间为 OR 关系，命中任一即可触发
     c. 同一条目一旦触发，只注入一次 content，不重复注入
     d. 未触发条目只注入 summary，不注入 content

2. 创建 /backend/prompt/assembler.js，导出 buildPrompt(sessionId)：
   严格按 CLAUDE.md 定义的 [1]~[8] 顺序组装，顺序硬编码，不得调整：
   - [1]：全局 system_prompt（来自 config.json 的 global_system_prompt）
   - [2]：用户 Persona（读取 session→character→world 的 persona_name 和 persona_prompt）
     * 两者均为空则跳过 [2]，不注入任何内容
     * 按固定模板拼接："[用户人设]\n名字：{persona_name}\n{persona_prompt}"
     * persona_name 不为空但 persona_prompt 为空时，只注入名字行
   - [3]：世界 system_prompt
   - [4]：角色 system_prompt
   - [1][2][3][4] 合并为单个 role:system 消息发送给 LLM
   - [5]：调用 entry-matcher，命中条目注入 content，未命中条目注入 summary，
     拼接后追加到 system 消息末尾（或作为独立 system 消息，以不超出单条 system 上限为准）
   - [6]：空字符串占位，此处留注释 // TODO T21: recallMemory()，T21 任务时将填入召回内容，届时是本文件唯一允许的修改
   - [7]：历史消息（含附件的消息转换为 vision 数组格式）
   - [8]：当前用户消息（调用方传入，不在 buildPrompt 内读取）
   - 返回 { messages: [...], temperature, maxTokens }
     temperature 和 maxTokens 读取逻辑：world.temperature ?? config.llm.temperature，max_tokens 同理

OOC 统一规则：
- 用户使用 (( )) 包裹的 OOC 文本原样保存到 messages.content，并正常进入对话上下文
- OOC 文本参与 Prompt 条目扫描匹配
- OOC 文本参与 session title 生成
- OOC 文本不写入角色状态栏和世界时间线；相关异步记忆任务在抽取时应忽略纯 OOC 指令性内容
```

**验证方法**：
- 调用 `buildPrompt(sessionId)`，返回的 messages 数组第一条是 role:system
- system 内容依次包含全局 prompt、Persona（若已设置）、世界 prompt、角色 prompt
- 创建一个带关键词的 Prompt 条目，发一条包含该关键词的消息，确认条目正文出现在 messages 里
- 世界设置了 temperature 时，返回值中 temperature 为世界值而非全局值

---

### T16 ⬜ 将组装器接入对话流程

**这个任务做什么**：把 T09 做的对话接口升级——不再用简单的历史消息，改用 assembler.js 组装完整上下文。

**涉及文件**：
- `/backend/services/chat.js` — 替换 buildContext，改用 assembler

**Claude Code 指令**：
```

任务：将提示词组装器接入对话流程。
修改 /backend/services/chat.js：
- 将原来的 buildContext() 替换为调用 assembler.js 的 buildPrompt(sessionId)
- buildPrompt 返回 { messages, temperature, maxTokens }
- 将 temperature 和 maxTokens 传入 llm.chat() / llm.complete() 的 options，覆盖默认值
- 其他逻辑不变
只修改这一个文件。
```

**验证方法**：
- 发一条消息，AI 的回复风格符合角色的 system prompt 设定
- 创建一个 Prompt 条目并设置关键词，发包含该关键词的消息，确认 AI 的回复体现了条目内容

---

### T17 ⬜ 前端：Prompt 条目管理界面

**这个任务做什么**：让用户能在界面上管理 Prompt 条目（增删改查），包括填写标题、简介、正文、关键词。

**涉及文件**：
- `/frontend/src/api/prompt-entries.js`
- `/frontend/src/components/prompt/EntryList.jsx`
- `/frontend/src/components/prompt/EntryEditor.jsx`
- `/frontend/src/pages/SettingsPage.jsx` — 设置页，包含全局条目管理和 API 配置

**Claude Code 指令**：
```

任务：实现 Prompt 条目管理界面和设置页面。
1. 创建 /frontend/src/api/prompt-entries.js，封装增删改查接口调用
2. 创建 /frontend/src/api/config.js，封装配置相关接口：
   - getConfig()、updateConfig(patch)、updateApiKey(key)、updateEmbeddingApiKey(key)
   - fetchModels()：调用 GET /api/config/models，返回模型列表或抛出错误
   - fetchEmbeddingModels()：调用 GET /api/config/embedding-models
3. 创建 EntryList.jsx：列表展示条目，支持拖拽排序（用 sort_order 字段）
4. 创建 EntryEditor.jsx：表单弹窗，包含：
   - 标题（必填）
   - 简介（多行文本，~50字提示）
   - 正文（大文本框）
   - 关键词（标签输入，回车添加一个关键词）
5. 在角色详情页和世界详情页各嵌入一个 EntryList
6. 创建 SettingsPage.jsx，包含：
   - 全局 Prompt 条目管理
   - LLM 配置区块：
     * Provider 下拉框（openai / anthropic / gemini / ollama / lmstudio）
     * API Key 输入框（输入后单独保存，不随其他配置一起提交）
     * Base URL 输入框（仅 ollama / lmstudio 显示）
     * 模型下拉框：页面打开时自动调用 fetchModels() 拉取列表；拉取中显示 loading；
       拉取失败显示红色报错"无法获取模型列表，请检查 API Key 和网络连接"及"重试"按钮；
       成功则渲染下拉选项，当前选中值与 config.llm.model 同步
   - 测试连接按钮：点击调用 GET /api/config/test-connection，显示"连接成功"或红色错误信息
   - 上下文保留轮次（context_compress_rounds）：数字输入框，最小值 0（0表示禁用），旁边说明文字"保留最近 N 轮对话历史发送给 AI，0 = 不限制"
   - Embedding 配置区块：结构同 LLM 配置，使用 fetchEmbeddingModels()
```

**验证方法**：
- 能在角色页面创建、编辑、删除 Prompt 条目
- 关键词输入框能添加多个标签
- 打开设置页，填入有效 API Key 后，模型下拉框自动出现可选项
- 填入无效 API Key，模型下拉框显示红色报错和重试按钮

---

## 阶段 3：记忆系统（M3）

> 目标：三层记忆系统全部上线，AI 能记住跨 session 的历史。

---

### T18 ⬜ Session Summary 异步生成

**这个任务做什么**：每次对话结束后，异步让 AI 生成这次对话的摘要，存入 session_summaries 表。这个摘要是后续记忆召回的索引。

**涉及文件**：
- `/backend/db/queries/session-summaries.js`
- `/backend/memory/summarizer.js` — 生成 summary 的逻辑
- `/backend/services/chat.js` — 对话结束后入队

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现 Session Summary 和会话标题的异步生成。
1. 创建 /backend/db/queries/session-summaries.js：
   - upsertSummary(sessionId, content) → 不存在则插入，存在则更新
   - getSummaryBySessionId(sessionId)
2. 创建 /backend/memory/summarizer.js，导出两个函数：
   - generateSummary(sessionId)：
     读取该 session 所有消息 → 调用 llm.complete() 生成摘要 → 存入 session_summaries 表
   - generateTitle(sessionId)：
     读取该 session 前几条消息 → 调用 llm.complete() 生成不超过15字的标题
     → 更新 sessions 表的 title 字段
     prompt 要求：简洁概括对话主题，不加引号，不超过15字
3. 修改 /backend/services/chat.js：
   前置条件：仅当对话流正常结束（done，非 aborted）且该 session 中存在至少 1 条 user 消息时，才入队以下任务。
   - 对话流结束后，依次将以下任务加入异步队列：
     * generateSummary(sessionId)（优先级1，不可丢弃）
     * generateTitle(sessionId)（优先级2，不可丢弃，仅当 session.title 为 NULL 时才入队）
   - title 生成完成后，通过 SSE 推送一条额外事件通知前端更新标题：
     data: {"type": "title_updated", "title": "..."}\n\n
     （在 /chat 接口的 SSE 连接关闭前发送；若连接已关闭则跳过推送，前端下次进入时从接口读取）
只修改 chat.js 中对话结束后的部分。
```

**验证方法**：
- 和 AI 对话几轮，等待约 5 秒
- 查询数据库 session_summaries 表，能看到该 session 的摘要
- 摘要内容准确反映对话内容

---

### T19A ⬜ 世界状态字段与角色状态字段的 Schema 落地

**这个任务做什么**：
把“前端可配置的世界状态栏 + 角色状态栏”正式落到数据库结构里，包括字段定义表和当前值表。

**涉及文件**：
- /backend/db/schema.js
- /backend/db/index.js
- /backend/db/queries/world-state-fields.js
- /backend/db/queries/character-state-fields.js
- /backend/db/queries/world-state-values.js
- /backend/db/queries/character-state-values.js

**Claude Code 指令**：
``` 
请读取 @SCHEMA.md。

任务：实现世界状态栏与角色状态栏的底层数据结构。
1. 按 SCHEMA.md 新增以下表的建表语句和索引：
   - world_state_fields
   - character_state_fields
   - world_state_values
   - character_state_values
2. 为以上四张表分别创建 queries 文件，封装增删改查
3. JSON 字段统一在 queries 层自动 stringify / parse
4. 所有主键使用 crypto.randomUUID()
5. 所有时间戳使用 Date.now()
不要实现路由和前端。
```

**验证方法**：
- 启动后端后，数据库中出现四张新表和对应索引
- 用简单测试脚本插入一组字段定义和状态值，能正确读回

---

### T19B ⬜ 世界设置页支持配置状态字段模板

**这个任务做什么**：
在世界编辑界面中新增两个配置模块：世界状态字段、角色状态字段。用户可在前端配置字段模板，而不是依赖系统内置。

**涉及文件**：
- /backend/routes/world-state-fields.js
- /backend/routes/character-state-fields.js
- /backend/services/world-state-fields.js
- /backend/services/character-state-fields.js
- /frontend/src/api/worldStateFields.js
- /frontend/src/api/characterStateFields.js
- /frontend/src/pages/WorldsPage.jsx 或世界编辑弹窗相关组件

**Claude Code 指令**：
```
请读取 @SCHEMA.md 和 @CLAUDE.md。

任务：实现世界状态字段与角色状态字段的前端可配置能力。
1. 后端分别实现世界状态字段、角色状态字段的增删改查和 reorder 接口
2. 前端在世界编辑界面中新增两个字段模板配置区域：
   - 世界状态字段
   - 角色状态字段
3. 每个字段支持编辑以下属性：
   - label
   - field_key
   - type(text/number/boolean/enum)
   - default_value
   - description
   - update_mode
   - trigger_mode
   - trigger_keywords
   - enum_options
   - min_value / max_value
   - allow_empty
   - update_instruction
4. 支持新增、删除、拖拽排序
5. 保持深色风格，界面简洁，不要额外重构其他页面
```

**验证方法**：
- 能在世界编辑界面新增字段模板并保存
- 刷新页面后字段模板仍存在
- 排序、删除、修改均正常

---

### T19C ⬜ 新建世界/角色时初始化状态值

**这个任务做什么**：
根据字段模板自动初始化状态值。世界创建后拥有一份世界状态；角色创建后拥有一份角色状态。

**涉及文件**：
- /backend/services/worlds.js
- /backend/services/characters.js
- /backend/db/queries/world-state-values.js
- /backend/db/queries/character-state-values.js

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现状态值自动初始化。
1. 创建世界后，根据该世界的 world_state_fields 初始化 world_state_values
2. 创建角色后，根据该角色所属世界的 character_state_fields 初始化 character_state_values
3. default_value 为空时按字段类型给出合理空值：
   - text: ""
   - number: 0
   - boolean: false
   - enum: 第一项或 null
4. 初始化逻辑放在 service 层，不写在 route 层
```

**验证方法**：
- 新建世界后，数据库中自动生成对应的 world_state_values
- 新建角色后，数据库中自动生成对应的 character_state_values

---

### T19D ⬜ 对话后按配置异步更新世界状态与角色状态

**这个任务做什么**：
在每轮对话完成后，后端根据字段模板配置判断哪些状态需要更新，并调用 LLM 生成字段 patch。

**涉及文件**：
- /backend/memory/world-state-updater.js
- /backend/memory/character-state-updater.js
- /backend/services/chat.js
- /backend/utils/async-queue.js
- /backend/llm/index.js

**Claude Code 指令**：
```
请读取 @SCHEMA.md 和 @CLAUDE.md。

任务：实现世界状态栏与角色状态栏的异步更新。
1. 对话流正常结束后，异步触发状态更新任务，不阻塞用户
2. 分别实现：
   - updateWorldState(worldId, sessionId)
   - updateCharacterState(characterId, sessionId)
3. 只处理 update_mode = llm_auto 的字段
4. trigger_mode 规则：
   - manual_only: 跳过
   - every_turn: 每轮都进入候选
   - keyword_based: 最近扫描文本命中 trigger_keywords 才进入候选
5. LLM 不重写整份状态，只返回 changed fields patch
6. 后端严格校验：
   - key 必须存在于字段模板
   - value 类型必须合法
   - enum 必须在 options 中
   - number 必须在 min/max 范围内
7. 合法 patch 才写回状态值表
8. OOC 内容参与当轮理解，但不应直接沉淀为长期状态，除非用户明确要求修改设定
9. 加入异步队列时：updateCharacterState 优先级为 2（不可丢弃），updateWorldState 优先级为 3（不可丢弃）
```

**验证方法**：
- 对话后能看到状态值按配置发生变化
- 不符合类型的 LLM 输出不会写入数据库
- manual_only 字段不会被自动更新

---

### T20 ⬜ 世界时间线异步追加

**这个任务做什么**：每次对话结束后，异步让 AI 从对话中提取世界事件，追加到 world_timeline 表。

**涉及文件**：
- `/backend/memory/world-timeline.js` — 提取和追加事件的逻辑
- `/backend/services/chat.js` — 对话结束后入队

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现世界时间线异步追加。
1. 创建 /backend/memory/world-timeline.js，导出 appendWorldTimeline(sessionId)：
   - 读取 session 所属角色的 world_id 和本次 session summary
   - 使用以下固定 Prompt 模板（变量替换后）调用 llm.complete()：

     你是编年史官，负责记录世界「{世界名}」的历史事件。
     根据刚刚发生的对话，提取值得记入历史的事件。

     规则：
     - 只记录对世界或角色有实质影响的事件，忽略日常闲聊
     - 每条事件不超过20字，格式：「谁做了什么，结果如何」
     - 若本轮对话没有值得记录的事件，返回空数组
     - 返回 JSON 数组，例：["艾伦击败了守卫，进入禁地", "古老契约正式解除"]

     本轮对话摘要：
     {session_summary}

   - 解析返回的 JSON 数组
   - 若数组为空则跳过，否则将每条事件插入 world_timeline 表
   - seq 值取当前该世界最大 seq + 1（原子操作）
   - 检查总条数是否超过 WORLD_TIMELINE_MAX_ENTRIES，超过则触发压缩
2. 实现压缩逻辑：将最早的一半条目让 LLM 总结，替换为一条 is_compressed=1 的摘要行
3. 修改 /backend/services/chat.js 加入队列，优先级为 4（可丢弃）
```

**验证方法**：
- 对话中发生明显事件（如"打倒了怪物"），等待约 10 秒
- 查询 world_timeline 表，能看到新增的事件条目
- 条目数超过设定上限时，旧条目被压缩为一条摘要

---

### T21 ⬜ 记忆召回与状态注入（含 Prompt 注入）

**这个任务做什么**：
将当前世界状态、当前角色状态和世界时间线内容渲染为可读文本，注入到 assembler.js 的 [6] 占位位置，为模型提供持续状态与历史背景。（原 T19F 内容合并至本任务。）

**涉及文件**：
- `/backend/prompt/assembler.js` — 填入 [6] 位置（此文件唯一允许的修改点）
- `/backend/db/queries/world-state-values.js`
- `/backend/db/queries/character-state-values.js`
- `/backend/db/queries/world-timeline.js`
- `/backend/memory/recall.js` — 新建，实现渲染函数

**Claude Code 指令**：
```
请读取 @SCHEMA.md 和 @CLAUDE.md。

任务：实现状态文本渲染并注入 prompt 的 [6] 位置，同时保留记忆召回扩展空间。

1. 在 /backend/memory/recall.js 中实现三个渲染函数（纯数据处理，不调用 LLM）：

   renderWorldState(worldId) → 返回字符串
   - 联表查询 world_state_fields 和 world_state_values，按 sort_order 升序
   - 格式：
     [世界状态]
     - {label}：{value}
     - ...
   - 若该世界无任何状态字段，返回空字符串

   renderCharacterState(characterId) → 返回字符串
   - 联表查询 character_state_fields 和 character_state_values，按 sort_order 升序
   - 格式：
     [角色状态]
     - {label}：{value}
     - ...
   - 若该角色无任何状态字段，返回空字符串

   renderTimeline(worldId, limit) → 返回字符串
   - 取最近 limit 条 world_timeline 记录（按 seq 降序取，展示时正序排列）
   - is_compressed=1 的行前缀标注「早期历史」
   - 格式：
     [世界时间线]
     - {content}
     - 【早期历史】{content}
     - ...
   - 若无记录返回空字符串
   - limit 默认取常量 WORLD_TIMELINE_RECENT_LIMIT

2. 修改 /backend/prompt/assembler.js，填入 [6] 占位位置
   （这是 assembler.js 唯一允许的修改，不得调整其他任何顺序）：
   - 将原注释 // TODO T21: recallMemory() 替换为实际调用
   - 调用 renderWorldState、renderCharacterState、renderTimeline
   - 将三段文本拼接后注入 [6]，非空段落之间以空行分隔
   - 全部为空时 [6] 注入空字符串，不影响其余顺序

3. 保留后续扩展注释：
   // TODO 未来：embedding 搜索历史 session summary，渐进式展开原文
```

**验证方法**：
- 在世界/角色编辑页配置几个状态字段并赋值，发起对话，打印 buildPrompt 的返回值
- messages 中 [6] 位置能看到世界状态和角色状态的可读文本
- 对话中发生事件并等待时间线写入后，再次发起对话，[6] 位置能看到时间线条目
- 无状态字段时 [6] 为空字符串，不影响其余消息顺序

---

### T22 ⬜ 前端记忆面板（含状态栏展示接口）

**这个任务做什么**：
实现完整的右侧记忆面板，包括世界状态、角色状态、世界时间线三个区块的后端接口和前端展示。（原 T19D 内容合并至本任务。）

**涉及文件**：
- `/backend/routes/world-state-values.js` — 新建
- `/backend/routes/character-state-values.js` — 新建
- `/backend/routes/world-timeline.js` — 新建
- `/frontend/src/api/worldStateValues.js` — 新建
- `/frontend/src/api/characterStateValues.js` — 新建
- `/frontend/src/api/worldTimeline.js` — 新建
- `/frontend/src/components/memory/MemoryPanel.jsx` — 实现完整面板
- `/frontend/src/pages/ChatPage.jsx` — 嵌入面板

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现右侧记忆面板，包括后端读取接口和前端展示。

1. 后端新增三个只读路由，注册到 server.js：

   GET /api/worlds/:worldId/state-values
   - 联表查询 world_state_fields 和 world_state_values
   - 返回数组：[{ field_key, label, type, sort_order, value_json }]，按 sort_order 升序

   GET /api/characters/:characterId/state-values
   - 联表查询 character_state_fields 和 character_state_values
   - 返回数组：[{ field_key, label, type, sort_order, value_json }]，按 sort_order 升序

   GET /api/worlds/:worldId/timeline?limit=50
   - 返回 world_timeline 表记录，按 seq 升序，默认最多 50 条

2. 前端分别创建 api 封装文件：
   - worldStateValues.js：getWorldStateValues(worldId)
   - characterStateValues.js：getCharacterStateValues(characterId)
   - worldTimeline.js：getWorldTimeline(worldId, limit)

3. 实现 MemoryPanel.jsx，分三个可折叠区块：

   世界状态：
   - 按 sort_order 展示 label 和当前值（value_json 解析后展示）
   - 无字段时显示"暂无数据"

   角色状态：
   - 同上

   世界时间线：
   - 按 seq 升序展示
   - is_compressed=1 的行以灰色斜体「早期历史」前缀展示
   - 无记录时显示"暂无记录"

   进入聊天页时自动加载三块数据，每块独立 loading 状态，加载失败显示错误提示。
   仅做查看，不做面板内编辑。

4. 在 ChatPage.jsx 中将 MemoryPanel 嵌入右侧面板（T11 已预留位置），
   将当前会话的 worldId 和 characterId 作为 props 传入。
```

**验证方法**：
- 进入聊天页，右侧面板展开后能看到世界状态、角色状态、世界时间线三个区块
- 世界/角色有状态字段时正确显示；无字段时显示"暂无数据"
- 时间线中压缩行以灰色斜体「早期历史」前缀展示
- 折叠/展开各区块正常

---

## 阶段 4：完善（M4）

> 目标：补全剩余功能，达到可发布状态。

---

### T23 ⬜ 角色卡 / 世界卡导入导出

**这个任务做什么**：
实现 WorldEngine 自有格式的角色卡与世界卡导入导出，并包含新版状态系统所需的数据。

**涉及文件**：
- /backend/routes/import-export.js
- /backend/services/import-export.js
- /frontend/src/api/importExport.js
- /frontend/src/pages/CharacterEditPage.jsx
- /frontend/src/pages/WorldsPage.jsx

**Claude Code 指令**：
```
请读取 @SCHEMA.md。

任务：实现角色卡 / 世界卡导入导出。
1. 角色卡 `.wechar.json` 导出内容包含：
   - character
   - prompt_entries
   - character_state_values
2. 世界卡 `.weworld.json` 导出内容包含：
   - world
   - prompt_entries
   - world_state_fields
   - character_state_fields
   - world_state_values
   - characters（每个角色包含 character 基础信息、prompt_entries、character_state_values）
3. 导入时为世界、角色、字段模板、状态值、Prompt 条目重新生成 UUID 和时间戳
4. 不导入任何 API Key
5. 具体 JSON 字段结构以 SCHEMA.md 的导入导出章节示例为准（包含新增的状态字段）
```

**验证方法**：导出一个角色卡，删除该角色，重新导入，所有数据恢复。

---

### T24 ⬜ CSS 主题系统

**Claude Code 指令**：
```

任务：实现 CSS 主题系统。
1. 在 /frontend/src/styles/themes/ 下创建 dark.css 和 light.css，定义 CSS 变量（颜色、字体大小等）
2. 在 App.jsx 中根据 config 的 ui.theme 值动态切换主题 class
3. 在设置页面加入主题切换下拉框
4. 支持用户在设置页面输入自定义 CSS，实时预览（注入到 style 标签）
```

**验证方法**：切换深色/浅色主题，界面颜色立即改变，刷新后保持。

---

### T25 ⬜ Slash 命令系统

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
   - /continue  续写上一条 AI 回复
   - /impersonate  AI 替你写一条消息
   - /retry   删除最后一条 AI 回复并重新生成
   - /regen   重新生成最后一条 AI 回复（同 /retry）
   - /clear   清空当前会话所有消息（二次确认）
   - /summary  手动触发生成当前会话摘要

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

POST /api/sessi