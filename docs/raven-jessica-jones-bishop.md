# Plan: 更新前端架构审计报告 — 三层架构迁移完整性

## 背景

用户抽离了 core / shell / themes 三层架构，但发现"看起来有点乱"。初步审计已发现 12 项问题，但进一步深入后发现：**这不是"架构设计有问题"，而是"迁移执行不完整"**——设计文档（CLAUDE.md、DESIGN.md、ARCHITECTURE.md）中已经明确定义了各层的职责边界，但大量代码仍然停留在旧架构模式中，没有迁移到新三层模型里。

## 发现的关键事实

### 1. 页面布局迁移完成度：22%

9 个路由页面中：
- **已迁移（2/9）**：ChatPage、WritingSpacePage —— 使用 `core/layout/PageLayout`
- **半迁移（3/9）**：WorldEditPage、CharacterEditPage、PersonaEditPage —— 使用 `EditPageShell`，但壳放在 `components/edit/` 而非 `core/layout/`
- **未迁移（4/9）**：WorldsPage、CharactersPage、SettingsPage、WorldConfigPage —— 全部手写 `div + className` 布局

设计文档规定："Page 层只做组合与数据绑定，禁止写 CSS、内联 style 或新建视觉组件。"但 4 个页面直接违反。CharactersPage 还在页面文件内嵌定义了 `PersonaCard`、`CharacterCard`、`EntryOrderPanel` 三个视觉组件。

### 2. index.css 组件样式拆分完成度：0%

- `index.css` 2369 行，其中 **2159 行（91%）是组件样式**，全部滞留未迁移到 `styles/*.css`
- 包含约 15 个逻辑分段：MarkdownEditor、TopBar、CodeMirror、ModelCombobox、Range、StatePanel、ChapterDivider、PageFooter、SessionList、CastPanel、MakeCardModal、NearbyPanel、PanelCard 等
- 约 **279 处旧变量引用**（`--we-paper-*`、`--we-ink-*`、`--we-vermilion` 等）
- 与 `styles/chat.css` 存在重复定义（`.we-chapter-header*`、`.we-fleuron*` 等）
- `styles/` 下已有 `ui.css`(1609行)、`pages.css`(2643行)、`chat.css`(1824行)、`tokens.css`(317行) —— 说明新体系已经搭好，但旧内容没搬进去

### 3. 组件目录归属错误

- `EditPageShell` 放在 `components/edit/` —— 它是页面布局壳，应属 `core/layout/`
- `AvatarUpload` 放在 `components/edit/` —— 通用图片上传组件，应属 `components/ui/`

### 4. 跨层反向依赖

- `store/appMode.js` → `components/settings/SettingsConstants`
- `api/import-export.js` → `components/settings/SettingsConstants`
- `hooks/useSettingsConfig.js` → `components/settings/SettingsConstants`

Components 层成了被下层依赖的基础设施。

### 5. 其他已确认问题（保留）

- TopBar 316 行职责混合（UI + 路由 + 数据 + 状态 + 导航）
- ChatPage / WritingSpacePage ~800 行重复流式逻辑
- AppRoot 和 TopBar 各自维护 overlay 路由白名单（8 vs 6 条，已不同步）
- `selectShell.js` 硬编码，伪插件化
- Assistant 客户端硬编码在 core 和 shell 中
- `recall` slot 未在 PageLayout API 中声明
- dead code：`core/layout/index.js`、`components/index.js`、`layoutSlots.js`

## 执行计划

### 步骤 1：重写审计报告

将 `docs/frontend-architecture-audit.md` 替换为包含"迁移完整性"视角的新版本：

**新报告结构**：
1. **架构设计目标** — 引用 CLAUDE.md / DESIGN.md 中对 core / shell / themes 的定义
2. **迁移完成度量表** — 各维度（页面布局、样式拆分、组件归属、跨层依赖、pages CSS 合规）的百分比
3. **未迁移代码清单** — 按维度列出具体文件、行号、代码片段
4. **优化建议** — 平铺，不按阶段分组（用户明确要求）
5. **诊断命令** — 保留

### 步骤 2：内容组织

优化建议平铺如下（不按优先级/阶段分组，每条独立）：

- 将 `SettingsConstants.js` 中的纯常量迁移到 `frontend/src/constants/` 或 `shared/`，切断 store/api/hooks 的反向依赖
- 在 `frontend/src/constants/routes.js` 中定义 `OVERLAY_ROUTES`，让 AppRoot 和 TopBar 共用
- 删除 `core/layout/index.js`、`components/index.js`、`core/layout/layoutSlots.js` 等 dead code
- 将 `EditPageShell` 从 `components/edit/` 迁移到 `core/layout/`，同步修改 3 个 edit 页面的 import 路径
- 将 `AvatarUpload` 从 `components/edit/` 迁移到 `components/ui/`
- 提取共享流式 Hook `hooks/useStreamingSession.js`，覆盖 ChatPage 和 WritingSpacePage 重复的流式逻辑
- 拆分 TopBar 为 `TopBarShell.jsx`（纯 UI）+ `useTopBarState.js`（数据逻辑）
- 将 `MessageList`、`InputBox` 从 `components/chat/` 上提到 `components/session/` 或 `components/messaging/`
- 将 WorldsPage、CharactersPage、SettingsPage、WorldConfigPage 迁移到使用统一的布局壳（PageLayout slots 或扩展的 EditPageShell）
- 将 CharactersPage 内嵌的 `PersonaCard`、`CharacterCard`、`EntryOrderPanel` 提取到 `components/state/` 或 `components/ui/`
- 消除 pages 中的内联 style（`cursor: 'not-allowed'`、flex 布局等）
- 将 `index.css` 中的 `:root` 旧版 token（32 个）合并到 `styles/tokens.css`
- 将 `index.css` 中的组件样式（~2159 行）按域拆分迁移到 `styles/ui.css`、`styles/pages.css`、`styles/chat.css` 等
- 统一 `index.css` 和 `chat.css` 中重复的 `.we-chapter-*` / `.we-fleuron-*` 定义
- 将 `index.css` 中大量 `var(--we-vermilion)` 等旧别名替换为语义化 `var(--we-color-accent)` 等
- 修复 `@theme` 中引用的缺失 `--we-radius-sm`
- 让 `index.css` 最终只保留 Tailwind 入口、@theme、结构基线（目标 < 150 行）
- 在 `PageLayout.jsx` JSDoc 中补充扩展 slot 说明（如 `recall`）
- 将 `selectShell.js` 的硬编码 `SHELLS` 改为配置化注入
- 将 Assistant 客户端引用从 core/app 和 shell 中抽出，改为插件注册机制
- 将 ChatPage / WritingSpacePage 的 SSE 连接管理、消息状态机提取到 `services/chatEngine.js` / `services/writingEngine.js`