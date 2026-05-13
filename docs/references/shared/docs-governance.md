# Docs Governance

文档树组织规则、入口约束、渐进式披露标准与 harness 使用说明。

## 根入口与主轴

- 根目录只保留 `CLAUDE.md`、`AGENTS.md`、`README.md`
- `CLAUDE.md` 是唯一 agent 入口正文；`AGENTS.md` 只做镜像跳转
- 其余内部知识统一放在 `docs/references/`

主轴分工：

- `frontend/`：页面、组件、主题、路由、状态、前端验证
- `backend/`：schema、接口、prompt、memory、SSE、异步任务、后端验证
- `assistant/`：写卡助手架构、proposal/plan、恢复、知识文件、assistant 验证
- `shared/`：跨端规则、共享模块、文档治理
- `product/`：产品说明、桌面打包、路线图、公开文档关系
- `history/`：历史决策、兼容约束、迁移坑点

## 文档契约

每个主轴 `index.md` 都必须包含：

- `## 什么时候读`
- `## 先读哪几页`
- `## 高频任务快速分流`
- `## 真源与非真源`

叶子文档统一规则：

- 打开后直接进入事实内容，不重复导航废话
- 至少给出对应代码真源路径、测试入口或运行边界
- 只覆盖完成该任务面所需的最小充分知识
- 同一事实只保留一个真源，其他文档只链接不复制

## 过薄 / 过重阈值

- 叶子文档少于 20 行：默认视为过薄，应补成可执行知识或并入更合适的叶子文档
- 叶子文档超过 260 行：默认视为过重，必须补 `## 任务分流` 或 `## 快速入口`
- 超长真源文档可以保留，但要通过“前置分流页”或文档顶部任务路由降低冷启动 token 成本

## Harness 校验

运行命令：

```bash
npm run check:docs
```

当前 harness 至少检查三类问题：

- `broken_link`：入口、索引或叶子链接不存在
- `outdated_reference`：仍引用已下线旧文档名、旧路径或失效真源路径
- `structural_imbalance`：叶子文档过薄，或超长文档缺少任务分流

失败解释：

- `broken_link` / `outdated_reference` 为错误，必须修复
- `structural_imbalance` 为结构警告，原则上在本次文档治理中一并处理

## 何时同步

- 文档树结构、主轴划分、根入口规则变化时
- 新增或删除叶子文档时
- 长文档体量变化导致需要新增任务分流时
- harness 规则、阈值或允许列表变化时
