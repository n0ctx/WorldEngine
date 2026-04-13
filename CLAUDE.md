# WorldEngine — Claude Code 工作手册

## 行动原则（最高优先级）

- **先读后写**：修改任何文件前，必须先阅读该文件现有内容
- **强制规划**：3 个步骤以上的任务，必须先列出计划并等待确认，再动手
- **强制验证**：完成任务后必须能说明如何验证，不能仅凭"看起来对"交差
- **范围克制**：每次任务只修改任务指令明确要求的文件，禁止"顺手重构"
- **及时止损**：多次尝试失败或上下文逼近极限时，主动停止并告知用户

---

## 项目概览

**WorldEngine** — 面向创意写作/角色扮演的本地 LLM 前端。核心特点：在角色之上增加"世界"层，记忆系统包含 session summary、角色状态栏、世界状态栏、世界时间线四部分，并支持按世界前端配置状态字段模板；提示词采用渐进式披露。
架构层级：`全局 → 世界 → 角色 → 会话`，每层有独立的提示词、配置和记忆，下层不可覆盖上层。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TailwindCSS + Zustand |
| 后端 | Node.js + Express + ES Modules |
| 数据库 | SQLite（better-sqlite3） |
| 向量 | OpenAI embeddings 或 Ollama embeddings（可选） |

---

## 目录结构

```
/frontend/src/
  /components/{chat,characters,worlds,settings,memory,prompt,ui}
  /pages        # 页面级组件
  /hooks        # 自定义 hooks
  /store        # Zustand 全局状态
  /api          # 所有 fetch 封装，禁止在组件内直接调用
  /utils        # 工具函数

/backend/
  /routes       # HTTP 路由，只做参数校验和调用 service
  /services     # 业务逻辑
  /db           # 数据库：schema.js + /queries/*.js
  /memory       # 记忆系统：summarizer / character-state-updater / world-state-updater / world-timeline / recall
  /prompt       # 提示词：assembler.js + entry-matcher.js
  /llm          # LLM 接入层：index.js + /providers/
  /utils        # 工具：constants.js / async-queue.js / token-counter.js
  server.js     # 入口
```

---

## 常用命令

```bash
cd frontend && npm run dev     # 前端 http://localhost:5173
cd backend  && npm run dev     # 后端 http://localhost:3000
cd frontend && npm run build   # 构建前端
cd backend  && npm run db:reset  # 重置数据库（开发用）
```

每次任务完成后，阅读 CHANGELOG.md，在最上方追加一条记录；并且git commit。

---

## 不可随意修改的文件

以下文件一旦完成即锁定，未经明确要求禁止改动：

| 文件 | 原因 |
|---|---|
| `SCHEMA.md` | 数据库字段权威来源，改字段必须同步更新此文件 |
| `/backend/db/schema.js` | 实际建表文件，结构以 SCHEMA.md 为准 |
| `/backend/utils/constants.js` | 所有硬性数值常量的唯一来源 |
| `/backend/prompt/assembler.js` | 提示词组装顺序硬编码，**唯一例外**：T21 任务填入 [6] 位置占位 |
| `/frontend/src/store/index.js` | 全局状态定义 |
| `server.js` | 入口文件 |

---

## 核心约束（执行任务时必须遵守）

**数据库**
- 所有表名、字段名以 `SCHEMA.md` 为准，禁止自行发明
- 数据库操作只能写在 `/backend/db/queries/` 里，路由层禁止直接查询
- 每次获取连接后立即执行 `PRAGMA foreign_keys = ON`
- 主键全部用 `crypto.randomUUID()`，时间戳用 `Date.now()`（毫秒）

**数值常量**
- 所有魔法数字必须引用 `/backend/utils/constants.js` 中的常量名，禁止硬编码

**LLM 调用分工**
- 对话生成 → 流式调用（`llm.chat()`）
- 记忆写操作（summary、状态栏、时间线）→ 非流式调用（`llm.complete()`）
- 两类调用严格分开，不得混用

**异步队列优先级**（数字越小越高，1/2/3 不可丢弃，4/5 可丢弃）
- 1: summary 生成 / 2: 角色状态栏更新 / 3: 世界状态栏更新 / 4: 世界时间线 / 5: Prompt 条目向量化
- 编辑消息或重新生成时，清空该 sessionId 队列中优先级 4/5 的未开始任务

**提示词组装顺序**（硬编码在 assembler.js，顺序不得改变）
```
[1] 全局 System Prompt
[2] 用户 Persona（均为空则整段跳过）
[3] 世界 System Prompt
[4] 角色 System Prompt
[5] Prompt 条目（命中→注入 content，未命中→注入 summary；全局→世界→角色顺序）
[6] 记忆召回内容（占位，T21 填入）
[7] 历史消息（轮次压缩后，最少保留 CONTEXT_MIN_HISTORY_ROUNDS 轮）
[8] 用户当前消息（调用方传入）
```

**生成参数覆盖层级**：`世界级 > 全局`，worlds 表字段为 NULL 时回退全局配置

**前端**
- 所有 fetch 调用封装在 `/frontend/src/api/`，组件内禁止直接调用
- 样式只用 TailwindCSS 工具类，不写内联 style，颜色用 CSS 变量不硬编码
- 整体深色风格，简洁现代

---

## 关键设计速查

**Session Summary 触发条件**：对话流正常结束（done）**且**该 session 至少有 1 条 user 消息。aborted 或仅有 first_message 时不触发。

**角色头像 Fallback**：`avatar_path` 为 NULL 时，显示基于角色 id hash 的纯色圆形 + 名字首字。封装在 `/frontend/src/utils/avatar.js` 的 `getAvatarColor(id)`。

**SSE 事件类型**：`delta` / `done` / `aborted` / `type:error` / `type:memory_recall_start` / `type:memory_recall_done` / `type:title_updated`。详细规范见 ROADMAP.md T09/T11 任务说明。

**图片附件**：base64 随消息发送（不单独上传接口），后端解码存 `/data/uploads/attachments/`，路径写入 `messages.attachments`（JSON 字符串）。单条最多 3 张、单张不超过 5MB，前端校验。

**角色卡/世界卡格式**：`.wechar.json`（format: worldengine-character-v1）/ `.weworld.json`（format: worldengine-world-v1），不兼容 SillyTavern 格式。

**上下文截断优先级**（绝不截断 → 最后截断）：`[1-4] System` > `[6] 记忆召回` > `[8] 当前消息` > `[5] Prompt条目` > `[7] 历史消息`

**状态系统**：
- 每个世界可配置两套状态字段模板：世界状态字段、角色状态字段
- 世界状态字段作用于 worlds，自身只有一份当前值
- 角色状态字段作用于该世界下所有角色，每个角色各持有一份当前值
- 配置权在前端，执行权在后端
- 对 LLM 注入时，结构化状态渲染为可读文本

---

## 不做的功能

多用户系统、云端同步、图片生成、TTS、Visual Novel、多角色群聊、插件市场、ST 格式兼容、Prompt 顺序自定义、消息分支(Swipe)、Author's Note、会话内搜索、自动备份。
