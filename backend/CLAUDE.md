# WorldEngine 后端 — Agent 规则

本文件承接根目录 `CLAUDE.md`，只写后端架构、分层、调用链和验证规则；通用规则见 `../CLAUDE.md`。

## 目录导航

- `routes/` — HTTP 接口和参数转换，不写业务逻辑
- `app/` — 对话、写作、继续、重新生成等流程编排
- `services/` — 业务规则和写库入口，含校验、日志、连带清理
- `memory/` — 状态记忆、摘要、召回和回滚
- `prompts/` — 提示词加载与组装
- `llm/` — provider、工具循环、重试、上下文限制
- `db/queries/` — 数据库访问，所有查询集中在此
- `utils/` — 工具函数（日志、数据目录、常量等）
- `middleware/` — Express 中间件
- `tests/` — 测试文件

## 分层边界（必须保持）

- 数据库查询只能放在 `backend/db/queries/`
- 下层不能反向依赖 `routes/` 或 `app/`
- 写库优先经过 service，确保校验、日志和连带清理
- `assistant/server/task-store.js` 直接管理任务表是明确例外
- 前后端不直接互相导入代码，只通过 HTTP 通信

## 关键调用链

- chat/writing route → turn/app 流程 → LLM → 流式输出、post-gen、回滚
- 状态记忆、提示词组装和 provider 修改时，应沿调用链确认影响范围
- 提示词快照、路由快照和 LLM provider 测试是行为依据

## 验证命令

- `npm run lint:backend` — 代码规范
- `npm run test:backend` — 单元测试
- `npm run test:e2e` — 端到端测试
- 根据改动范围运行 `tests/routes`、`tests/llm`、`tests/memory`、`tests/services` 等目录

## 修改原则

- 先找现有 owner、调用链和测试
- 优先修改现有 service/query/app，不新增平行实现
- 涉及 assistant 使用的 backend 接口时，同时检查 assistant 测试
- 改前先看现状：修改任何文件前，先读相关代码、调用链和现有测试