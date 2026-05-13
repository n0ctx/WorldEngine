# Backend Architecture

后端目录职责、启动装配与调用链边界。

## 核心入口

- `backend/server.js`：创建 Express app、挂中间件、初始化 schema、注册全部路由
- `backend/db/schema.js`：DDL 与迁移真源
- `backend/db/index.js`：SQLite 连接与 `PRAGMA foreign_keys = ON`

## 目录职责

```text
backend/
  routes/       # 参数校验、HTTP/SSE 接线、调用 app/service
  app/          # chat / writing 流式生命周期编排
  services/     # 领域服务、事务、副作用、导入导出、清理
  db/queries/   # SQL 唯一落点
  prompts/      # prompt 组装、条目命中、模板加载
  llm/          # provider 适配、tool loop 控制、chat/complete 封装
  memory/       # 摘要、召回、状态更新、长期记忆、展开原文
  utils/        # 常量、日志、异步队列、清理钩子、向量存储等基础设施
  tests/        # routes / services / db / memory / e2e 分层测试
```

## 运行时调用链

1. `server.js` 挂路由并初始化 schema、cleanup hooks、user hooks。
2. `routes/` 解析请求、做参数校验、选择 `app/` 或 `services/`。
3. `app/chat/*` 与 `app/writing/*` 负责 stream、continue、regenerate、rollback 的多步编排。
4. `services/` 负责事务与跨模块协作。
5. `db/queries/` 完成 SQL 读写。

## 分层硬边界

- `routes/` 不直接写 SQL，不内嵌多步工作流
- `app/` 负责 SSE 生命周期、stream 拼接、continue/regenerate/rollback 编排
- `services/` 负责事务边界、删除清理、跨 query 协作
- `db/queries/` 是 SQL 唯一落点
- `llm/` 对上层只暴露流式 `chat()` 与非流式 `complete()`

## 相关真源

- 路由装配：`backend/server.js`
- chat/write 编排：`backend/app/chat/`、`backend/app/writing/`
- 删除副作用：`backend/services/cleanup-registrations.js`
- 测试入口：`backend/tests/`

## 相关代码文件

- `backend/server.js`
- `backend/app/chat/run-chat-stream.js`
- `backend/app/writing/run-writing-stream.js`
- `backend/services/cleanup-registrations.js`
