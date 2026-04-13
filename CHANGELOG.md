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
