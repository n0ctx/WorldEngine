# WorldEngine — Agent 入口

本文件保留跨端的协作与执行规则；前端的视觉、动效、主题规则在 `frontend/CLAUDE.md`。需要项目上下文时，从代码、调用链和测试判断，不以旧文档为准。

## 分区规则

- 改 `frontend/`、`themes/`（含主题、动效、视觉设计）前，先读 `frontend/CLAUDE.md`；主题包的字段、token 白名单、草稿流程见 `themes/README.md`。

## 工作原则

- 改前先看现状：修改任何文件前，先读相关代码、调用链和现有测试。
- 复杂任务先规划：超过 3 个步骤的任务先列简短计划；用户已经给定边界时不要重复确认。
- 优先代码真相：不要依赖旧文档推断行为；接口、schema、状态流、样式规则以代码和测试为准。
- 自动验证：按改动范围自行判断并执行必要测试；测试完成后清理本次产生的 `/.temp/` 临时文件。
- 保护用户改动：工作区可能有未提交改动，不能回滚未明确属于本次任务的文件。

## 高频硬约束

- 数据库查询只能放在 `backend/db/queries/`。
- 前端 `fetch` 只能经 `frontend/src/core/api/`。
- 写卡助手前端接入只允许经 `frontend/src/core/features/assistant/`。

## 验证口径

- 前端改动：优先跑相关 frontend lint/test/build。
- 后端改动：优先跑相关 backend lint/test。
- assistant 改动：优先跑 assistant 相关测试。
- 文案或纯注释改动：可只做静态检查或说明无需运行测试。
- 源码守卫共 9 个（体量、复杂度、重复、死代码、测试形态、运行形态、硬编码字面量、循环依赖、架构边界），另有无基线的主题对齐检查 `check:themes`（模板漏列核心 token、主题覆盖不存在的 token 即失败）；统一用 `npm run check:guards` 全部跑完并汇总结果；单个用 `npm run check:<名字>`，守卫自身的测试是 `npm run test:guards`。基线在 `scripts/*-baseline.json`，只许降不许升：新增违规要修掉；报「基线虚挂」说明问题已改善，用对应脚本的 `--update-baseline` 刷新基线并一起提交。不要为凑指标拆分内聚代码。检测器分不清的有意写法（前后端镜像、一次性迁移、验证重复初始化等）在代码上一行写 `// guard-allow(<守卫名>): <理由>`（CSS 里写成紧贴上一行的块注释），只支持 dead-code / duplication / perf-shape / tests / literals；规则见 `scripts/guard-common.mjs` 头部，不要拿它绕过真问题。
