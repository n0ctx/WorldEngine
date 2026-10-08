# WorldEngine 写卡助手 — Agent 规则

本文件承接根目录 `CLAUDE.md`，只写 assistant 架构、边界和验证规则；通用规则见 `../CLAUDE.md`。

## 运行边界

- `assistant/server/` 由 backend server 挂载，不是独立 HTTP 服务
- `assistant/client/` 会被 frontend 使用；修改界面时还要读取 `../frontend/CLAUDE.md`
- assistant 服务端可以复用 backend 的 LLM、service、query 和 utils，但不应复制其逻辑

## 核心结构

- `routes.js` — SSE、取消、恢复、消息操作
- `agent.js` — 单代理工具循环
- `task-store.js` — 任务持久化、恢复、状态和 SSE 连接
- `workspace/` — 读写世界、角色、条目、字段和样式的工具
- `normalize-proposal.js`、`apply-proposal.js` — 模型提案校验和落库
- `prompts/` — 助手的系统提示词和压缩提示词

## 不能破坏的行为

- 任务重启后可以恢复，运行中任务不能被错误地重复执行
- 取消、断线、SSE attach/detach 和终态任务处理必须保持一致
- `worldId`、`characterId` 上下文不能串台
- 模型写入必须经过工具参数校验、proposal 归一化或现有业务 service
- 不要绕过 workspace 或 backend service 直接新增写库路径

## 跨目录修改规则

- 改 backend 的共享能力，先读 `../backend/CLAUDE.md` 并运行 backend 测试
- 改 `assistant/client/` 的视觉或交互，先读 frontend 规则
- 改 assistant 与 frontend 的接口时，同时检查 frontend assistant 测试

## 验证命令

- `npm run test:assistant` — 单元测试
- `npm run check:assistant` — 语法检查
- `npm run lint --prefix assistant/client` — 客户端代码规范
- 涉及共享 backend 行为时补跑对应 backend 测试