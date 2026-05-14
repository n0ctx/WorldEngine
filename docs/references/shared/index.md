# Shared References

跨端规则、共享模块和文档治理入口。

## 什么时候读

- 改共享常量、跨端模块、执行规则、回执要求
- 判断某条事实该写进哪份文档
- 做文档重构、入口治理、README 导航收口

本主轴承接的高频跨模块任务片段：

- 跨模块任务里需要统一遵守的硬约束、共享常量和 repo 级脚本
- `CLAUDE.md`、各主轴索引、README 的路由关系与文档治理
- 无法判断事实应落前端 / 后端 / assistant 哪一侧时的归档规则

## 先读哪几页

1. [`cross-cutting-rules.md`](cross-cutting-rules.md)：所有任务都受哪些硬约束
2. [`constants-and-shared-modules.md`](constants-and-shared-modules.md)：单一来源常量与共享模块真源
3. [`repo-tooling-and-hooks.md`](repo-tooling-and-hooks.md)：根脚本、用户 hooks、自定义 ESLint 规则
4. [`docs-governance.md`](docs-governance.md)：文档树结构、harness、写法阈值

## 高频任务快速分流

- 想确认锁定文件、SQL / fetch / 主题层硬约束：读 [`cross-cutting-rules.md`](cross-cutting-rules.md)
- 想知道版本号、共享章节常量、主题 token 单一来源：读 [`constants-and-shared-modules.md`](constants-and-shared-modules.md)
- 想改 `scripts/`、`hooks/`、`eslint-rules/`：读 [`repo-tooling-and-hooks.md`](repo-tooling-and-hooks.md)
- 想调整 `CLAUDE.md`、主轴索引、README 导航、文档结构：读 [`docs-governance.md`](docs-governance.md)

## 真源与非真源

- 真源：`shared/*.mjs`、`backend/utils/constants.js`、本主轴文档
- 非真源：产品 README、历史 changelog 中的旧路径描述

## 何时同步

- 执行规则、锁定文件、共享模块或文档结构变化时
