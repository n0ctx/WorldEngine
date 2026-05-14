# Backend Async Jobs And Hooks

异步后处理优先级、删除钩子与副作用清理边界。

## 异步队列

- 优先级 2：角色状态 / persona 状态 / 标题等高相关后处理
- 优先级 3：世界状态、`createTurnRecord(sessionId)` 等核心写回
- 优先级 4/5：可丢弃或可重建的后处理任务
- 编辑消息、删除后续消息、重新生成时，清空该 session 未开始的 4/5 级任务
- keep-alive 的后处理任务（如标题、状态整理）若其内部 aux LLM 非流式调用超时，会以失败事件结束 SSE，避免前端永久卡在“记录记忆/整理中”；状态整理走 `state_update_failed`，其他 keep-alive 任务走 `postprocess_failed`

## 删除钩子

- 带磁盘文件、向量索引、长期记忆目录等副作用的资源，只在 `backend/services/cleanup-registrations.js` 注册
- 通过 `registerOnDelete(entity, async id => {})` 注册
- 钩子失败只 `warn`，不阻塞 DB DELETE
- 依赖 SQLite 级联删除但仍需副作用清理的场景，要在 service 层预先显式删除

## 相关真源

- 队列与 runner：`backend/utils/async-queue.js`、`backend/utils/post-gen-runner.js`
- 删除清理：`backend/services/cleanup-registrations.js`、`backend/utils/cleanup-hooks.js`

## 相关代码文件

- `backend/utils/async-queue.js`
- `backend/utils/post-gen-runner.js`
- `backend/services/cleanup-registrations.js`
- `backend/utils/cleanup-hooks.js`
