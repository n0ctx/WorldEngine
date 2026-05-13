# Assistant References

写卡助手架构、proposal/plan、恢复链路、知识文件与验证入口。

## 什么时候读

- 改 `assistant/` 目录
- 改 proposal、plan、父/子代理、恢复链路、知识文件

## 先读哪几页

1. [`architecture.md`](architecture.md)：前后端边界、父/子代理、task store 与工具装配
2. [`planning-and-proposals.md`](planning-and-proposals.md)：plan 门槛、proposal 归一化、审批门
3. [`runtime-and-recovery.md`](runtime-and-recovery.md)：状态机、SSE、恢复与 pause 语义
4. [`contract-and-knowledge.md`](contract-and-knowledge.md)：CONTRACT 注入、知识文件路由、read_file 用法
5. [`testing.md`](testing.md)：assistant 验证入口

## 高频任务快速分流

- 改父/子代理职责、工具注册、前端挂载：读 [`architecture.md`](architecture.md)
- 改计划机制、审批门、proposal schema：读 [`planning-and-proposals.md`](planning-and-proposals.md)
- 改恢复链路、静默 resume、任务状态：读 [`runtime-and-recovery.md`](runtime-and-recovery.md)
- 改知识文件、CONTRACT、project reader：读 [`contract-and-knowledge.md`](contract-and-knowledge.md)

## 真源与非真源

- 真源：`assistant/server/`、`assistant/client/`、`assistant/prompts/`、`assistant/knowledge/`、本主轴文档
- 非真源：后端 schema 文档中的 assistant 顺带提及、历史 changelog 里的旧实现描述

## 何时同步

- assistant 目录结构、协议、恢复规则或测试入口变化时
