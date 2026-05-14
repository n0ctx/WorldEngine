# Backend References

后端运行时、schema、prompt、memory、SSE 与验证入口。

## 什么时候读

- 改 `backend/` 目录下的运行时逻辑
- 查数据库字段、配置键、导入导出格式、存储目录
- 改接口、SSE、memory、state、异步链路、文件存储

本主轴承接的高频跨模块任务片段：

- chat / writing 流式链路里的路由、SSE、后处理、hooks、队列
- 恢复 / 断点续传里的后端状态写回、事件边界、任务存储
- 导入导出里的 schema、存储格式、兼容与落盘约束

## 先读哪几页

1. [`architecture.md`](architecture.md)：顶层目录职责、createApp 装配与分层边界
2. [`schema-reading-guide.md`](schema-reading-guide.md)：查字段、配置、导入导出时的最短路径
3. [`routes-and-sse.md`](routes-and-sse.md)：HTTP 路由、流式接口、SSE 事件边界
4. [`memory-and-state.md`](memory-and-state.md)：记忆召回、状态写回、回滚与 nearby
5. [`prompts-and-llm.md`](prompts-and-llm.md)：prompt 组装、provider 与 chat/complete 分工
6. [`prompt-templates.md`](prompt-templates.md)：后处理模板与命名约定
7. [`runtime-infra.md`](runtime-infra.md)：hooks、middleware、utils 基础设施
8. [`async-jobs-and-hooks.md`](async-jobs-and-hooks.md)：异步队列、副作用钩子、清理规则
9. [`testing.md`](testing.md)：后端验证入口与测试分层

## 高频任务快速分流

- 改数据库表/字段/配置/导入导出：读 [`schema-reading-guide.md`](schema-reading-guide.md)
- 改 Express 路由、SSE 事件、流式阶段：读 [`routes-and-sse.md`](routes-and-sse.md)
- 改 prompt 组装、provider、thinking、缓存：读 [`prompts-and-llm.md`](prompts-and-llm.md)
- 改 prompt `.md` 模板：读 [`prompt-templates.md`](prompt-templates.md)
- 改 hooks / middleware / logger / queue / proxy：读 [`runtime-infra.md`](runtime-infra.md)
- 改记忆召回、长期记忆、状态值、回滚：读 [`memory-and-state.md`](memory-and-state.md)
- 改异步后处理、删除钩子、任务优先级：读 [`async-jobs-and-hooks.md`](async-jobs-and-hooks.md)
- 判断跑哪些后端测试：读 [`testing.md`](testing.md)

## 真源与非真源

- 真源：`backend/db/schema.js`、`backend/db/queries/`、`backend/app/`、`backend/services/`、`backend/prompts/assembler.js`、本主轴文档
- 非真源：`README.md`、`history/changelog.md` 中的旧结构描述

## 何时同步

- 后端目录结构、接口组织、schema 真源或测试入口变化时
