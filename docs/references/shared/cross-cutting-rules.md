# Cross Cutting Rules

执行任务时对整仓都生效的硬约束。

## 回执要求

任务结束时至少包含：

- 修改文件
- 验证方式
- 同步文档
- 锁定文件
- 残留风险

## 锁定文件

- `CLAUDE.md`
- `backend/db/schema.js`
- `backend/utils/constants.js`
- `backend/prompts/assembler.js`
- `frontend/src/core/state/index.js`
- `backend/server.js`

## 跨端硬约束

- 数据库查询只能写在 `backend/db/queries/`
- 后端多步工作流放 `backend/app/` 或 `backend/services/`，不要塞进 `routes/`
- 前端网络请求只能经 `frontend/src/core/api/`
- 写卡助手前端接入只能经 `frontend/src/core/features/assistant/`
- 主题层只覆写 token，不写组件选择器
- 测试临时文件统一放 `/.temp/` 并在任务结束后清理

## 通用实现约束

- 主键全部用 `crypto.randomUUID()`
- 时间戳用 `Date.now()`
- 获取数据库连接后立即执行 `PRAGMA foreign_keys = ON`
- 组件不得直接 import toast 实现，统一经现有通知出口
- 新增硬编码数值前，先判断是否应收口到 `backend/utils/constants.js` 或共享常量模块

## 文档与验证约束

- 改 `docs/references/`、`CLAUDE.md`、`assistant/knowledge/`、仓内 README 时，至少跑 `npm run check:docs`
- 改代码真源时，必须同步对应主轴文档；不要只改 changelog

## 相关代码文件

- `backend/db/schema.js`
- `backend/utils/constants.js`
- `frontend/src/core/api/`
- `frontend/src/core/features/assistant/`
