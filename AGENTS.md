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

# [WorldEngine] recent context, 2026-04-25 11:42pm GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (9,436t read) | 447,799t work | 98% savings

### Apr 25, 2026
63 7:58p ✅ FeaturesConfigPanel 添加 showTokenUsage 和 onToggleShowTokenUsage 参数接收
64 7:59p 🟣 FeaturesConfigPanel 新增 Token 消耗显示切换 UI 组件
65 " ✅ SettingsPage 传递 showTokenUsage 和 onToggleShowTokenUsage 到 FeaturesConfigPanel
66 " 🟣 MessageItem.jsx 新增 token 消耗行渲染，支持 input/output/cache 展示
67 " ✅ MessageItem.jsx 订阅 showTokenUsage 全局状态，实现条件渲染 token 消耗行
68 8:00p ✅ chat.css 新增 .we-token-usage 样式，定义 token 消耗行外观
69 " 🔵 backend/routes/config.js 已有模型价格配置与拉取逻辑
70 " 🔵 ModelCombobox.jsx 已支持对象格式选项与 formatPrice 价格格式化函数
71 " 🔵 ModelCombobox.jsx 已实现模型价格显示逻辑，Phase 5 大部分工作完成
72 " 🟣 backend/routes/config.js 扩展模型价格配置，支持 cache 价格与多 provider 静态定价表
73 " 🟣 backend/routes/config.js 实现 fetchOpenAICompatibleModels 价格回源机制
74 8:01p 🟣 backend/routes/config.js Gemini 模型列表集成 KNOWN_PRICES 静态价格兜底
75 " 🟣 ModelCombobox.jsx 扩展缓存价格显示：cacheWritePrice 和 cacheReadPrice
76 8:11p 🟣 Token 消耗统计 + 模型价格展示——用户原始需求记录
77 " 🟣 Token 消耗统计 + 模型价格展示功能——用户需求记录
78 8:12p 🔵 续写（Continue）路由中 llm.chat() 调用缺少 usageRef 参数
80 " 🔴 useSettingsConfig 配置加载时状态同步不完整
81 " 🔴 chat.js 续写路由添加 usageRef 参数，修复 token 统计数据丢失
82 " 🔴 chat.js 和 writing.js 续写路由完整修复 token 消耗统计
83 " 🔴 writing.js 续写路由完成 token 消耗统计持久化和返回
S60 保存按钮交互问题修复——点击保存后状态闪烁，用户看不清"保存中"还是"已保存" (Apr 25 at 10:22 PM)
S61 PromptConfigPanel 保存按钮增加「已保存」状态反馈 (Apr 25 at 10:25 PM)
84 10:28p 🟣 新增 useSaveState Hook——统一保存按钮状态管理
85 " 🔴 WorldEditPage / CharacterEditPage / PersonaEditPage——保存失败后 saving 状态卡死修复
86 " 🔴 RegexRuleEditor / StateFieldEditor——finally 块保存状态修复（续）
87 10:29p 🔴 EntryEditor / CustomCssManager SnippetEditor——finally 块保存状态修复完成
88 " 🟣 PromptConfigPanel 保存按钮增加「已保存」状态反馈
S62 WorldEngine 前端保存按钮状态管理重构——添加「已保存」反馈 + 修复 finally 块 setState 问题 (Apr 25 at 10:29 PM)
S64 desktop/ 打包目录的 .gitignore 策略 (Apr 25 at 10:30 PM)
89 10:44p ⚖️ desktop/ 打包目录的 .gitignore 策略
S65 为 WorldEngine 项目编写 README.md 文档 (Apr 25 at 10:44 PM)
90 10:47p 🔵 WorldEngine 项目文档结构与产品定位全面梳理
S68 PROJECT.md 重写——按真实项目状态重写，删除已废弃的世界构建模块描述 (Apr 25 at 10:47 PM)
91 10:53p 🔵 PROJECT.md 与实现代码脱离：规划的 Forge/地点/势力/事件系统未实现
92 10:54p 🔵 WorldEngine 项目实际实现状态全面盘点
S82 Implement world card cover image upload feature — resolve issue where world cards cannot upload images (Apr 25 at 10:56 PM)
S85 世界卡封面图 UI 重构——全屏背景图 + 文字遮罩层完整实现 (Apr 25 at 11:03 PM)
113 11:05p 🟣 世界卡封面图改为全卡背景图模式
114 " 🟣 世界卡封面图 UI 重构——全屏背景图 + 文字遮罩层完整实现
S87 世界卡封面图 UI 重构——铺满卡片背景 + 上传入口移至保存按钮下方 (Apr 25 at 11:05 PM)
115 11:09p 🔵 WorldEngine 项目包含 Electron 桌面打包配置
116 " 🔵 WorldEngine Desktop 打包架构全面审查
117 11:10p 🔵 WorldEngine Desktop 打包架构审查
118 11:11p ⚖️ Desktop 打包修复计划——electron-builder 平台架构映射与主进程容错
119 11:13p 🔴 Desktop 打包全栈修复——多平台 Node runtime 隔离 + Windows unzip 依赖消除 + 崩溃恢复逻辑修正
120 11:14p 🔵 Desktop 打包修复补丁实际未生效——四个文件磁盘内容仍为修复前旧版本
121 " 🔴 main.js 三处修复成功落盘——分拆小补丁绕过多文件 patch 上下文匹配失败
122 11:15p 🔴 electron-builder.json artifactName 字段与 package.json extract-zip 依赖成功落盘
123 " 🔴 Desktop 打包四文件修复全部落盘验证通过——prepare-build.js 全量重写完成
124 " 🔴 Desktop 打包修复静态检查通过，prepare-build 脚本成功启动多平台 Node runtime 下载
125 " 🔴 prepare-build 多平台顺序下载运行正常——darwin-x64 完成，darwin-arm64 开始
126 11:16p 🔴 prepare-build 三平台 Node runtime 全部下载解压完成——win32-x64 zip 路径验证通过
127 " ✅ CHANGELOG.md 更新——desktop 打包链路修复完整记录
128 11:17p 🔵 node-runtime 目录存在旧版平铺结构残留——darwin 运行时新旧混存
129 " 🔴 prepare-build.js 新增旧版平铺 runtime 清理逻辑，CHANGELOG 条目顺序修正
130 " 🔴 Desktop 打包全链路修复最终验证通过——所有文件内容与 git diff 一致，无空白行警告
131 11:18p ✅ Desktop 打包审核任务五步计划全部标记完成
132 11:24p ✅ README.md 创建——完整项目文档入口
S103 README.md 创建——完整项目文档入口 (Apr 25 at 11:24 PM)
133 11:40p 🔵 Desktop 打包后 App 启动即闪退

Access 448k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>