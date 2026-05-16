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

### writing 流式 preflight / recall 事件

`backend/prompts/assembler.js` 写作分支在组装 system prompt 时通过 `onRecallEvent(name, payload)` 透出阶段事件：

- `memory_recall_done` `{ hit }` — [9] 摘要向量召回完成
- `memory_expand_start` `{ candidates }` — [10] 进入"展开判定"，含候选 turn record 列表
- `memory_expand_done` `{ expanded }` — [10] 展开判定完成，含被展开的 ids
- `saved_recall_done` `{ hit, ids, mode }` — [10.5] saved nearby 召回完成；`ids` 为本轮被注入 `<recalled_characters>` 的 saved 角色 id 列表；`mode='judge'` 走 aux LLM 判定，`mode='all-in'` 表示 saved 池子过小（默认 `< 4`，由 `SAVED_RECALL_PREFLIGHT_MIN` 常量控制）直接全量注入跳过 judge

writing 系统 prompt 主要分段（与事件相关）：

- `<nearby_characters>` — [7]：含 transient 完整块 + saved 索引（仅 name + 底层人设）
- `<recalled_memories>` / `<expanded_dialogues>` — [9] / [10]：摘要召回与展开
- `<recalled_characters>` — [10.5]：本轮 preflight 命中的 saved 角色完整块（含 state），未命中则整段不注入

开关：`config.writing.saved_nearby_recall_enabled`（默认 `true`）。关掉时跳过 preflight，[7] 仅留 saved 索引清单，不再有 `<recalled_characters>` 段。开启时，saved 池子 `< SAVED_RECALL_PREFLIGHT_MIN`（默认 4）走 `all-in` 全量注入分支（省去 aux 判定的固定开销），`>=` 阈值才调 aux LLM 判定。

## 相关代码文件

- `backend/routes/chat.js`
- `backend/routes/writing.js`
- `backend/routes/stream-helpers.js`
- `assistant/server/routes.js`
