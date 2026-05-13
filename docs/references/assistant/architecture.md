# Assistant Architecture

写卡助手的前后端边界、父/子代理结构与任务态真源。

## 结构

```text
assistant/
  knowledge/   # CONTRACT + 资源知识文件
  prompts/     # parent-agent / sub-agent system prompt
  server/      # routes / parent-agent / sub-agent / task-store / tools
  client/      # AssistantPanel 等前端包源码
  tests/       # assistant 专属测试
```

## 核心职责

- `assistant/server/routes.js`：assistant HTTP / SSE 入口
- `assistant/server/parent-agent.js`：父代理，负责计划、工具循环、proposal 总编排
- `assistant/server/sub-agent.js`：子代理，负责更细的资源级执行
- `assistant/server/task-store.js`：任务态真源，持久化到 `assistant_tasks`
- `assistant/server/tools/`：preview、list、read_file、meta 工具
- `assistant/client/AssistantPanel.jsx`：面板 UI 与前端状态恢复

## 关键边界

- frontend 侧只允许经 `frontend/src/core/features/assistant/` 接入
- 父代理决定“直接执行 / 写 plan / 派发子代理 / 回复用户”
- 子代理只做单资源或窄范围执行，不拥有全局任务编排权
- assistant 后端独立于主 chat / writing SSE，但共用同一仓库真源与 DB

## 相关代码文件

- `assistant/server/routes.js`
- `assistant/server/parent-agent.js`
- `assistant/server/sub-agent.js`
- `assistant/server/task-store.js`
- `assistant/client/AssistantPanel.jsx`
