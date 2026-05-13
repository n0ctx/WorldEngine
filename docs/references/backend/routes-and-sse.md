# Backend Routes And SSE

HTTP 路由、SSE 接口和流式阶段边界。

## 路由层分工

- `backend/server.js` 统一注册 `/api/*`
- `backend/routes/` 负责参数校验、请求解析、响应组装
- chat / writing 的多步流式逻辑下沉到 `backend/app/`
- 数据库读写仍经 `backend/db/queries/`

## 重点接口面

- chat：`backend/routes/chat.js` + `backend/app/chat/`
- writing：`backend/routes/writing.js` + `backend/app/writing/`
- import/export：`backend/routes/import-export.js`
- assistant SSE：`assistant/server/routes.js`（独立于主后端 chat / writing SSE）

## SSE 规则

- 事件名、阶段顺序、错误恢复语义变化都要同步文档
- 流式恢复、断点续传、任务快照相关行为变化时，同时检查 assistant 文档
- 新流式端点如复用公共 helper，优先落在 `backend/routes/stream-helpers.js` 或 `backend/app/shared/stream/`

## 相关代码文件

- `backend/routes/chat.js`
- `backend/routes/writing.js`
- `backend/routes/stream-helpers.js`
- `assistant/server/routes.js`
