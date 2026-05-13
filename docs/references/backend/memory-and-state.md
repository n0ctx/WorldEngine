# Backend Memory And State

记忆召回、长期记忆、状态字段/状态值和相关写回链路。

## 记忆组成

- `turn_records`：逐轮摘要真源
- `data/vectors/turn_summaries.json`：turn record 摘要向量索引
- `backend/memory/`：摘要生成、召回、展开、压缩、状态更新
- `data/long_term_memory/` 与 `data/daily/`：长期记忆与日记正文

## 召回链路

1. 用户发消息后，后端先基于 turn records 做向量召回。
2. 命中的摘要再由 LLM 判断是否需要展开原文。
3. 展开的内容与当前 prompt 一起送入主生成。
4. 回复结束后异步写回 turn record、状态更新、长期记忆、日记等后处理。

## 状态系统

- 世界、角色、persona 各有字段定义表与状态值表
- 默认值与运行时值分离；会话运行时状态互相隔离
- `llm_auto` 状态在 AI 回复后异步更新；`manual` 只能手动编辑
- 写作模式还有 `session_nearby_characters` / `session_nearby_character_state_values` 维护附近角色状态

## 相关真源

- recall / expand / compress：`backend/memory/`
- 状态服务：`backend/services/state-values.js`
- 状态字段 query：`backend/db/queries/*state-fields*.js`
- 回滚：`backend/app/shared/rollback/`

## 相关代码文件

- `backend/memory/recall.js`
- `backend/memory/combined-state-updater.js`
- `backend/services/long-term-memory.js`
- `backend/app/shared/rollback/rollback-chat-session.js`
