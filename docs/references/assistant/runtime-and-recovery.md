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
- `plan rejected by user` 必须停在 `paused`
- harness 可恢复暂停与计划拒绝是两种不同 pause 语义，前端不能混淆
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

## 相关代码文件

- `assistant/server/task-store.js`
- `assistant/server/routes.js`
- `assistant/client/useAssistantStore.js`
- `assistant/client/AssistantPanel.jsx`
