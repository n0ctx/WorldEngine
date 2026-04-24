# WorldEngine — Agent 入口镜像

`AGENTS.md` 是给通用 AI agent 的入口镜像，唯一正文来源是 `CLAUDE.md`。

## 使用规则

- 进入仓库后，先阅读 `CLAUDE.md`
- 如需数据库字段、运行时架构、历史决策，按 `CLAUDE.md` 中的文档导航继续下钻
- 不要把 `AGENTS.md` 和 `CLAUDE.md` 视为两份独立规范

## 同步规则

- `CLAUDE.md` 是唯一入口正文
- 更新入口规范时，只编辑 `CLAUDE.md`
- `AGENTS.md` 只保留镜像说明，不承载独立规则

> 如果 `AGENTS.md` 与 `CLAUDE.md` 出现冲突，以 `CLAUDE.md` 为准。


<claude-mem-context>
# Memory Context

# [WorldEngine] recent context, 2026-04-25 1:31am GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 33 obs (8,903t read) | 388,249t work | 98% savings

### Apr 25, 2026
2 12:03a 🔵 uiux-vibe skill Q&A lacks multi-option decision framework
3 12:05a ✅ uiux-vibe skill Q&A 流程优化需求记录
4 " ✅ uiux-vibe skill Q&A 流程优化需求
S3 uiux-vibe skill Q&A 流程优化需求 (Apr 25 at 12:05 AM)
6 12:21a 🔵 uiux-vibe skill spec template has 4 high-priority design gaps identified
7 12:22a 🟣 uiux-vibe spec template expanded with 4 design constraint sections
S7 uiux-vibe spec template expanded with 4 design constraint sections (Apr 25 at 12:22 AM)
8 12:31a 🔵 uiux-vibe skill 文件结构与 token 消耗审查启动
9 12:32a 🔵 uiux-vibe skill token audit — 文件大小与 token 分布
10 " 🔵 uiux-vibe skill token 消耗分析——场景加载估算与内容重复检测
11 " 🔵 DESIGN.md 与 deprecated 文件的引用关系确认
12 12:37a ✅ uiux-vibe skill 文件结构重组——移除高 token 参考文件
13 12:38a ✅ uiux-vibe skill 文件重组完成确认——三目录结构落地
14 " ✅ uiux-vibe SKILL.md 被删除
15 " 🔄 uiux-vibe SKILL.md 重写为按需加载路由架构
16 " 🔄 task-executor.md 重写为胶囊优先的精简合约
17 12:39a 🔄 uiux-vibe 全部 agent 合约与 phase 文件精简重写完成
18 " 🔄 uiux-vibe execution-phase.md 重写——全部 phase 合约精简重写完成
19 12:41a 🔵 uiux-vibe skill 重构后 token 消耗基线测量
20 12:45a 🔵 WorldEngine 仓库结构审查——AI agent 误读风险点识别
21 12:48a 🔵 WorldEngine 项目文档架构——AGENTS.md 镜像设计
22 " 🔵 WorldEngine CHANGELOG 近期重大变更汇总（2026-04-24）
23 12:49a ✅ WorldEngine 文档入口降噪——收口 agent 规范入口并降低误读风险
24 12:50a ✅ WorldEngine 文档入口降噪——6 个根目录文件成功修改并验证
25 1:11a 🔵 写卡助手核心功能存在严重缺陷——不会写卡、预览格式过期
26 " 🔵 写卡助手架构现状审查——agent 提示词、预览工具与前端编辑器全链路
27 1:12a 🔵 WorldEngine 条目匹配器与 Prompt 条目数据层架构探查
28 1:13a ⚖️ 写卡助手修复范围与编辑模式决策
29 1:14a 🔵 写卡助手架构现状调查——主代理提示词与前端预览卡组件
30 " 🔵 world-card.md 子代理提示词仍引用已废弃的 position 字段——写卡错误根因之一
31 1:15a 🔵 normalizeProposal 服务端守卫机制——拦截子代理常见错误输出
32 1:16a 🔵 world-card.md 输出 Schema 模板仍包含废弃的 position 字段——子代理被直接教导输出错误格式
33 1:17a 🟣 normalizeEntryOps 新增 state 条目条件智能解析——operator 语义转换 + target_field 模糊匹配
34 " 🔴 card-preview.js 修复：state 类型条目现在附带 conditions 数组返回给子代理
35 " 🔴 main-agent.js 修复：世界上下文注入从 system_prompt/post_prompt 改为温度参数和架构说明

Access 388k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>