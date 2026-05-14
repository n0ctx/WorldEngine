# Assistant Runtime And Recovery

任务状态机、SSE、静默恢复与 pause 语义。

## 任务态真源

- `assistant/server/task-store.js`
- `assistant/server/routes.js`
- `assistant/client/useAssistantStore.js`
- `assistant/client/AssistantPanel.jsx`

## 当前恢复规则

- 默认 silent auto-resume 只适用于真正的中断/暂停执行态
- `awaiting_approval` 不自动推进
- 审批状态除了 `task.status` 之外，还要看持久化 `approvalCheckpoint.status`：`pending` 表示只能改方案不能执行，`approved` 表示已进入执行态，不能再重开审批
- `plan rejected by user` 必须停在 `paused`
- harness 可恢复暂停与计划拒绝是两种不同 pause 语义，前端不能混淆
- `consecutive tool failures` 也必须停在 `paused`，等待用户介入，不能在重连时静默续跑
- 恢复、批准、哨兵类控制信息不要混入可见聊天记录；用户可见反馈优先用 toast / 专用状态区

## 状态流要点

- 可恢复任务状态主要是 `running` / `awaiting_approval` / `paused`
- `GET /api/assistant/agent/recover` 与 `GET /recoverable-tasks` 负责找回任务
- plan doc 内容持久化在 `assistant_tasks.plan_doc_content`，不是 `/.temp/assistant/*.md` 真源

## 回归重点

- 服务重启中断后的静默续跑
- `awaiting_approval` 不误自动恢复
- plan reject 后保持 paused 且输入可继续
- harness recoverable pause 只放开输入框，不误判为成功完成
- 连续工具失败暂停在刷新 / 重连后仍保持“等待用户决策”，不会被自动恢复

## 相关代码文件

- `assistant/server/task-store.js`
- `assistant/server/routes.js`
- `assistant/client/useAssistantStore.js`
- `assistant/client/AssistantPanel.jsx`
