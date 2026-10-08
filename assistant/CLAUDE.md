# WorldEngine 写卡助手 — Agent 规则

- 服务端入口与任务状态在 `server/routes.js`、`server/agent.js`、`server/task-store.js`；工作区读写在 `server/workspace/`；前端面板在 `client/`，页面通过 `frontend/src/core/features/assistant/` 接入。修改交互时，同时核对任务恢复、取消及 SSE 事件消费。
- 恢复或续连任务时保持 `worldId`、`characterId` 上下文一致；取消、断线或重启后的状态未确认前，不重复执行可能已开始的任务。
- 写入世界数据时复用现有 workspace 校验、批量执行或 `backend/services/` 的业务函数；不要从助手服务端绕过校验直接调用数据库写函数。助手任务表由 `server/task-store.js` 管理，是现有边界的例外。
- 用根目录 `npm run test:assistant` 验证助手行为；改动前端面板时还要运行相关 frontend 测试，改动后端业务函数时还要运行相关 backend 测试。`npm run check:assistant` 只检查语法，不能代替行为测试。
