# WorldEngine — 开发路线图

## 使用方法

1. 按顺序找到第一个状态为 `⬜ 未开始` 的任务
2. 把该任务的"Claude Code 指令"原文复制给 Claude Code
3. Claude Code 完成后，按"验证方法"检查是否正常
4. 没问题就执行 `git commit`，并把本任务 ROADMAP.md 中的状态改为 `✅ 完成`。
5. 出问题就执行 `git checkout .` 回滚，开新对话重试

**原则：每个任务做完才开始下一个，不要跳着做。**

---

## 格式说明（新增任务时照此写）

### 阶段块

```
## 阶段 N：标题（里程碑代号）

> 目标：一句话说明这个阶段完成后系统能做什么。
```

### 任务块

每个任务独占一个三级标题块，格式固定如下：

````
### T{编号} {状态} {任务标题}

**这个任务做什么**：一两句话说明目的，不写实现细节。

**涉及文件**：
- `路径/文件.js` — 改动说明
- `路径/文件.jsx` — 改动说明

**Claude Code 指令**：

```
（给 Claude Code 的完整、可直接执行的指令。
写法要求：
- 先说"请先阅读 @CHANGELOG.md 与 <涉及文件> 的现有内容"
- 再说任务目标
- 列出每个文件的具体改动要求，要精确到函数/字段/行为，不留歧义
- 末尾加"约束"小节，列出不能动的文件和边界条件）
```

**验证方法**：
1. 可操作的步骤，描述预期结果
2. 覆盖正常路径和边界情况
````

### 状态符号

| 符号 | 含义 |
|---|---|
| `⬜ 未开始` | 尚未执行 |
| `🚧 进行中` | 当前正在做 |
| `✅ 完成` | 已验证通过并 commit |
| `❌ 搁置` | 暂时跳过，注明原因 |

### 任务编号规则

- 编号全局唯一，格式 `T{数字}`，从上一个已有编号顺延
- 同一阶段内按实现顺序排列，有依赖关系的任务必须前置

---

## 阶段 9：前端羊皮纸化 · 收尾（PARCHMENT-POLISH）

> 目标：写作空间适配书本布局；inline marginalia、羽毛笔、盖印动画、减少动效开关全部就位。完成后整个前端改造收尾。

### T71 ⬜ 未开始 写作空间三面板重构

**这个任务做什么**：将 WritingSpacePage 改造为与 ChatPage 对称的三面板书本布局（左侧写作会话列表 + 中间消息区 + 右侧「角色台」CastPanel），复用 ChatPage 现有组件，移除旧写作组件。

**涉及文件**：
- `frontend/src/pages/WritingSpacePage.jsx` — 重写
- `frontend/src/components/book/WritingPageLeft.jsx` — 新建，左侧写作会话列表面板
- `frontend/src/components/book/WritingSessionList.jsx` — 新建，会话管理组件（对接 writingSessions API）
- `frontend/src/components/book/CastPanel.jsx` — 新建，右侧角色台
- `frontend/src/index.css` — 追加 `.we-cast-*` CSS 锚点样式
- `frontend/src/components/writing/WritingSidebar.jsx` — 删除
- `frontend/src/components/writing/MultiCharacterMemoryPanel.jsx` — 删除
- `frontend/src/components/writing/ActiveCharactersPicker.jsx` — 删除
- `frontend/src/components/writing/WritingMessageList.jsx` — 删除
- `frontend/src/components/writing/WritingMessageItem.jsx` — 删除

**Claude Code 指令**：

````
请先阅读 @CHANGELOG.md @DESIGN.md §5.3/§5.5/§6.7 @frontend/src/pages/WritingSpacePage.jsx @frontend/src/pages/ChatPage.jsx @frontend/src/api/writingSessions.js @frontend/src/components/book/PageLeft.jsx @frontend/src/components/book/StatePanel.jsx @frontend/src/components/book/StatusSection.jsx @frontend/src/components/book/CharacterSeal.jsx @frontend/src/components/book/SessionListPanel.jsx @frontend/src/components/writing/WritingSidebar.jsx @frontend/src/components/writing/ActiveCharactersPicker.jsx @frontend/src/api/characterStateValues.js @frontend/src/api/characters.js @frontend/src/utils/avatar.js 的现有内容。

目标：WritingSpacePage 重构为三面板布局（会话列表 + 消息区 + 角色台），复用 ChatPage 组件，彻底移除旧写作组件。

布局结构：
WritingSpacePage（flex row, h-screen, background --we-book-bg, overflow:hidden）
├── WritingPageLeft（260px 固定）  ← 写作会话列表
├── PageRight 中面板（flex:1）     ← 章节+消息+输入（完全复用 ChatPage 结构）
└── CastPanel（280px 固定）        ← 角色台（右侧）

---

1) frontend/src/components/book/WritingPageLeft.jsx（新建）
   - Props: { worldId, currentSessionId, onSessionSelect, onSessionCreate, onSessionDelete }
   - 样式同 PageLeft：width 260px，flex-shrink:0，background:var(--we-paper-aged)，border-right:1px solid var(--we-paper-shadow)，右侧书脊阴影（见 PageLeft.jsx 现有实现）
   - 内部直接渲染 <WritingSessionList>，透传所有 props

2) frontend/src/components/book/WritingSessionList.jsx（新建）
   - 参考 SessionListPanel.jsx 的结构和风格，对接 writingSessions API
   - 顶部"新建写作会话"按钮：样式同 SessionListPanel 新建按钮（朱砂虚线边框，hover --we-vermilion-bg）
   - 会话列表（flex:1，overflow-y:auto）：加载 listWritingSessions(worldId)
     - 每条：会话标题（截断，EB Garamond 13.5px）+ 时间戳（10px italic ink-faded）
     - Active：左侧 2px --we-vermilion 竖线 + --we-paper-shadow 0.35 底色
     - hover：--we-paper-shadow 0.25 底色
     - 悬浮显示删除按钮（二次确认），双击标题可重命名（同 SessionItem 模式）
   - 暴露静态接口：
     WritingSessionList.updateTitle = (sessionId, title) => {...}
     WritingSessionList.addSession = (session) => {...}

3) frontend/src/components/book/CastPanel.jsx（新建）
   - Props: { worldId, sessionId, activeCharacters, onActiveCharactersChange }
   - 整体：width 280px，flex-shrink:0，display:flex，flex-direction:column，background:var(--we-paper-aged)，border-left:1px solid var(--we-paper-shadow)，overflow-y:auto
   - 左侧书脊渐变（12px）：position:absolute; left:0; top:0; bottom:0; width:12px；linear-gradient(to right, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.04) 40%, transparent 100%)；pointer-events:none；z-index:2
   - padding: 14px（整体内边距）

   顶部激活角色区（.we-cast-header）：
   - 区块标题「CAST」：font-family:var(--we-font-display)；font-size:11px；letter-spacing:0.28em；text-transform:uppercase；color:var(--we-ink-faded)；border-bottom:1px solid var(--we-paper-shadow)；padding-bottom:6px；margin-bottom:10px
   - 印章行（display:flex；flex-wrap:wrap；gap:8px；align-items:flex-start）：
     每个激活角色：position:relative 容器（display:flex；flex-direction:column；align-items:center）
       <CharacterSeal character={char} size={44} />
       角色名（font-size:8px；font-style:italic；color:var(--we-ink-faded)；max-width:44px；overflow:hidden；text-overflow:ellipsis；white-space:nowrap；text-align:center；margin-top:3px）
       朱砂 ✕ 移除按钮（absolute top:-2px right:-4px；font-size:9px；color:var(--we-ink-faded)；cursor:pointer；hover:color:var(--we-vermilion)；点击调用 deactivateCharacter(worldId, sessionId, char.id) 然后 onActiveCharactersChange）
     [＋ 添加] 按钮（width/height:44px；1px dashed var(--we-vermilion)；border-radius:var(--we-radius-sm)；display:flex；align-items:center；justify-content:center；font-size:18px；color:var(--we-vermilion)；cursor:pointer；hover:background:var(--we-vermilion-bg)；点击打开 addModalOpen=true）

   AddCharacterModal（CastPanel 内 useState addModalOpen 控制）：
   - 使用现有 Modal 组件（直接复用，不重写）
   - 加载 listCharacters(worldId)，过滤掉 activeCharacters 中已有的 id
   - 每行：CharacterSeal(32) + 角色名 + 「添加」朱砂虚线按钮
   - 点击「添加」：activateCharacter(worldId, sessionId, charId) → 成功后 onActiveCharactersChange 追加该角色，关闭 Modal

   1px var(--we-gold-leaf) 分隔线（margin:12px -14px；即横跨全宽）

   中部逐角色状态区（.we-cast-characters；flex:1；overflow-y:auto）：
   对 activeCharacters 渲染逐角色折叠块（.we-cast-character-block）：
     - .we-cast-char-title（display:flex；align-items:center；gap:6px；padding:9px 0；cursor:pointer；点击切换 expanded 状态）：
       - .we-cast-char-dot（width:4px；height:4px；border-radius:50%；background:getAvatarColor(char.id) 对应色；flex-shrink:0）
       - .we-cast-char-name（font-family:var(--we-font-display)；font-size:11px；letter-spacing:0.18em；text-transform:uppercase；color:var(--we-ink-secondary)；flex:1）
       - 折叠箭头 SVG（transform:rotate(0deg) 折叠 / rotate(90deg) 展开；transition:180ms）
       - .we-cast-char-remove（hover 父元素时才显示；同上方 ✕ 按钮功能）
     - .we-cast-char-body（仅 expanded 时显示）：
       - 拉取 getCharacterStateValues(char.id)（useEffect([char.id])）
       - <StatusSection title="" rows={charStateValues} pinnedName={null}（不渲染区块大标题，只渲染字段列表）/>
   - 默认第一个角色 expanded=true，其余 false
   - activeCharacters 变化时重置 expanded 状态（useEffect([activeCharacters.length])）

4) frontend/src/pages/WritingSpacePage.jsx（重写）
   - 保留所有现有状态变量和 API 调用（world / currentSession / messages / activeCharacters / generating / streamingText / stopRef / streamingTextRef / textareaRef）
   - 保留所有现有函数（enterSession / handleSessionCreate / handleSessionDelete / handleStop / handleGenerate / handleContinue / handleKeyDown）
   - 移除：所有 WritingSidebar / WritingMessageList / MultiCharacterMemoryPanel / rightOpen 引用
   - SSE title_updated 回调中额外调用 WritingSessionList.updateTitle(currentSession.id, title)
   
   新布局（JSX）：
   ```jsx
   <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--we-book-bg)' }}>
     <WritingPageLeft
       worldId={worldId}
       currentSessionId={currentSession?.id}
       onSessionSelect={enterSession}
       onSessionCreate={handleSessionCreate}
       onSessionDelete={handleSessionDelete}
     />
     {/* 中间消息区：复用 ChatPage PageRight 完整结构（章节标题区 + MessageList + 输入区） */}
     <div className="we-page-right" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--we-paper-base)', position:'relative' }}>
       {/* 章节标题区（同 ChatPage，显示 currentSession?.title） */}
       {/* MessageList（复用现有组件） */}
       <MessageList
         sessionId={currentSession?.id}
         sessionTitle={currentSession?.title}
         character={null}
         persona={persona}
         worldId={worldId}
         generating={generating}
         streamingText={streamingText}
       />
       {/* 输入区（同 ChatPage InputBox，含 handleGenerate / handleContinue / handleStop） */}
     </div>
     <CastPanel
       worldId={worldId}
       sessionId={currentSession?.id}
       activeCharacters={activeCharacters}
       onActiveCharactersChange={setActiveCharacters}
     />
   </div>
   ```

   - persona 从 store 取（同 ChatPage 中 useStore 读取方式）

5) frontend/src/index.css（追加 CastPanel CSS 锚点）
   .we-cast-panel { }
   .we-cast-header { }
   .we-cast-char-dot { width:4px; height:4px; border-radius:50%; flex-shrink:0; }
   .we-cast-char-title { display:flex; align-items:center; gap:6px; padding:9px 0; cursor:pointer; }
   .we-cast-char-name { font-family:var(--we-font-display); font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:var(--we-ink-secondary); flex:1; }
   .we-cast-char-remove { font-family:var(--we-font-display); font-style:italic; font-size:10px; color:var(--we-ink-faded); background:none; border:none; cursor:pointer; padding:0; display:none; }
   .we-cast-character-block:hover .we-cast-char-remove { display:inline; }
   .we-cast-char-remove:hover { color:var(--we-vermilion); }
   .we-cast-character-block { border-top:1px solid var(--we-paper-shadow); }
   .we-cast-char-body { padding:0 0 10px; }

6) 删除以下文件（确认 WritingSpacePage 不再引用后删除）：
   frontend/src/components/writing/WritingSidebar.jsx
   frontend/src/components/writing/MultiCharacterMemoryPanel.jsx
   frontend/src/components/writing/ActiveCharactersPicker.jsx
   frontend/src/components/writing/WritingMessageList.jsx
   frontend/src/components/writing/WritingMessageItem.jsx

约束：
- 不改 @frontend/src/api/writingSessions.js
- 不改 @frontend/src/components/chat/MessageList.jsx 和 MessageItem.jsx
- 不改 @frontend/src/pages/ChatPage.jsx
- CharacterSeal / StatusSection / Modal 为现有组件，直接导入复用
- 颜色全部走 --we-* 变量，禁止硬编码
````

**验证方法**：
1. 写作空间三面板正常渲染：左侧会话列表 + 中间消息区（书本章节风格）+ 右侧角色台
2. 左侧：创建/切换/删除写作会话正常；SSE title_updated 自动更新列表标题
3. 右侧 CastPanel 印章行显示已激活角色；[＋ 添加] 弹出 Modal 可选择未激活角色；✕ 移除按钮正常
4. 右侧角色折叠块：点击展开/折叠状态字段；StatusSection 数据正常显示
5. 发送消息、流式生成、续写、停止全部正常
6. ChatPage 无回归（不改动 ChatPage 相关文件）

---

### T72 ⬜ 未开始 羽毛笔光标 · 盖印动画 · 减少动效开关

**这个任务做什么**：按 DESIGN §8.5 / §9.2 / §9.4 实现羽毛笔流式光标、朱砂盖印动画、减少动效开关（含 prefers-reduced-motion + localStorage 双通道）。

**涉及文件**：
- `frontend/src/components/book/QuillCursor.jsx` — 新建
- `frontend/src/components/book/SealStampAnimation.jsx` — 新建
- `frontend/src/hooks/useReducedMotion.js` — 新建
- `frontend/src/utils/motion.js` — 根据偏好返回 duration
- `frontend/src/pages/SettingsPage.jsx` — 加 toggle
- `frontend/src/components/chat/MessageItem.jsx` — 可选启用 QuillCursor 代替 StreamingCursor

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §8.5/§9.2/§9.4 @frontend/src/utils/motion.js @frontend/src/pages/SettingsPage.jsx 的现有内容。

目标：补全可选装饰 + 提供减少动效开关。

1) frontend/src/hooks/useReducedMotion.js（新建）
   - export default function useReducedMotion()
   - 读取 window.matchMedia('(prefers-reduced-motion: reduce)').matches
   - 读取 localStorage.getItem('we:reduceMotion') === 'true'
   - 返回两者 OR 的结果
   - 订阅 media query change 和 storage 变化，重渲染

2) frontend/src/utils/motion.js
   - 新增 export function useMotionPreset()
   - 内部 const reduce = useReducedMotion()
   - reduce=true 时返回 { ...INK_RISE, transition: { duration: 0 } } 等降级预设
   - 为兼容性保留原 INK_RISE / MOTION 导出

3) frontend/src/components/book/QuillCursor.jsx（新建）
   - Props: { visible }
   - 跟随文字末尾（简化实现：inline-block 绝对定位相对最后字符 container）；可先做成 inline-block，不精确跟随
   - 内嵌 DESIGN §8.5 的羽毛笔 SVG
   - 外层 opacity 0.7s steps 闪烁
   - 减少动效下不闪烁（静止）

4) frontend/src/components/book/SealStampAnimation.jsx（新建）
   - Props: { visible, text = '成' }
   - 绝对定位覆盖层（默认 right/bottom 40px 相对触发区域）
   - 内嵌印章 SVG（用 DESIGN §8.3 模板，文字为 text）
   - framer-motion：initial scale:1.3 opacity:0 rotate:-3；animate scale:1 opacity:1 rotate:0（duration 0.3 sharp）；完成后 0.5s 淡出
   - 减少动效下直接显示+淡出，无缩放

5) frontend/src/pages/SettingsPage.jsx
   - "关于"分类上方新增"偏好"分类
   - 偏好内含 toggle "减少动效"
   - 写入 localStorage.setItem('we:reduceMotion', String(checked))
   - 触发 storage event（手动 dispatchEvent(new StorageEvent)）让 hook 实时更新

6) frontend/src/components/chat/MessageItem.jsx
   - 可选：流式消息 render <QuillCursor> 代替 <StreamingCursor>；通过一个全局开关或硬编码选择；本任务选择：保留 StreamingCursor 不变，只在 MessageItem 上方 margin 区域（或消息末尾）叠加 QuillCursor 作为装饰
   - 如视觉过度，可回退为仅 StreamingCursor；此时 QuillCursor 组件保留供将来使用

7) 在导出角色卡/世界卡成功回调中触发 <SealStampAnimation visible 500ms/> 一闪即过（在对应导出按钮的回调内管理 useState）

约束：
- 不改 @frontend/src/store/index.js
- 不改后端；不改 config.json schema
- 所有已接入动画的组件必须在减少动效下立即完成（无 transition）；允许未接入组件保留原动效
- QuillCursor 若视觉不达标可临时保留 StreamingCursor，确保不回归
```

**验证方法**：
1. Settings → 偏好 → "减少动效" 开关可切换
2. 开关打开：刷新页面后所有 inkRise/pageTransition 立即完成，无过渡
3. 浏览器 DevTools 模拟 prefers-reduced-motion 同样触发降级
4. 导出角色卡成功后右下角闪现朱砂印章动画 0.3s 入场 + 淡出
5. 流式消息末尾有羽毛笔光标（若启用）；减少动效时静止不闪烁

---

### T73 ⬜ 未开始 CharactersPage 羊皮纸化改造

**这个任务做什么**：将 CharactersPage（角色选择页）从旧版 Tailwind 工具类迁移到 `--we-*` 羊皮纸设计语言，风格对齐已完成的 WorldsPage，包括页面骨架、角色卡片、玩家人设卡、删除确认弹窗全部接入 CSS 变量。

**涉及文件**：
- `frontend/src/pages/CharactersPage.jsx` — 重构样式，移除 Tailwind 工具类
- `frontend/src/styles/pages.css` — 新增 `.we-characters-*` 锚点样式（紧跟 WorldsPage 样式块）

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §6.2 @frontend/src/pages/CharactersPage.jsx @frontend/src/pages/WorldsPage.jsx @frontend/src/styles/pages.css @frontend/src/components/book/CharacterSeal.jsx @frontend/src/utils/avatar.js 的现有内容。

目标：CharactersPage 完全迁移到 --we-* 设计语言，风格对齐 WorldsPage，移除所有 Tailwind 工具类。

---

页面整体结构（对照 WorldsPage 的 we-worlds-* 命名规律）：

1) frontend/src/styles/pages.css — 紧跟 .we-worlds-* 样式块末尾，新增以下锚点类：

.we-characters-canvas
  background: var(--we-book-bg); min-height: 100vh; padding: 40px 32px; position: relative;

.we-characters-header
  display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 32px;

.we-characters-title
  font-family: var(--we-font-display); font-size: 26px; font-weight: 400; font-style: italic;
  color: var(--we-ink-primary); letter-spacing: 0.03em;

.we-characters-subtitle
  font-family: var(--we-font-serif); font-size: 11px; letter-spacing: 0.35em;
  text-transform: uppercase; color: var(--we-ink-faded); margin-top: 4px;

.we-characters-header-actions
  display: flex; align-items: center; gap: 10px;

.we-characters-action-btn（次要操作按钮，对照 we-worlds-import-btn）
  font-family: var(--we-font-serif); font-size: 13px; color: var(--we-ink-secondary);
  background: none; border: 1px solid var(--we-paper-shadow); border-radius: var(--we-radius-sm);
  padding: 6px 14px; cursor: pointer; transition: color 0.15s, border-color 0.15s;
  &:hover: color: var(--we-ink-primary); border-color: var(--we-vermilion-muted);
  &:disabled: opacity: 0.5; cursor: not-allowed;

.we-characters-create-btn（主要操作按钮）
  font-family: var(--we-font-serif); font-size: 13px; color: var(--we-paper-base);
  background: var(--we-vermilion); border: none; border-radius: var(--we-radius-sm);
  padding: 6px 14px; cursor: pointer; transition: opacity 0.15s;
  &:hover: opacity: 0.88;

.we-characters-grid
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;

.we-character-card（角色卡片）
  background: var(--we-paper-base); border: 1px solid var(--we-paper-shadow);
  border-radius: var(--we-radius-md); padding: 16px; cursor: pointer;
  position: relative; transition: transform 0.15s, box-shadow 0.15s; user-select: none;
  &:hover: transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.10);

.we-character-card:hover .we-character-card-actions
  opacity: 1;

.we-character-card-body
  display: flex; align-items: center; gap: 12px;

.we-character-card-info
  flex: 1; min-width: 0;

.we-character-card-name
  font-family: var(--we-font-display); font-size: 15px; font-style: italic; font-weight: 400;
  color: var(--we-ink-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;

.we-character-card-desc
  font-family: var(--we-font-serif); font-size: 12px; color: var(--we-ink-secondary);
  margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;

.we-character-card-desc-empty
  color: var(--we-ink-faded); font-style: italic;

.we-character-card-actions
  position: absolute; top: 10px; right: 10px;
  display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s;

.we-character-card-action-btn（对照 we-world-card-action-btn）
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; background: none; border: none; cursor: pointer;
  border-radius: var(--we-radius-sm); color: var(--we-ink-faded);
  transition: color 0.12s, background 0.12s;
  &:hover: color: var(--we-ink-primary); background: var(--we-paper-shadow);

.we-character-card-action-btn.danger:hover
  color: var(--we-vermilion); background: var(--we-vermilion-bg);

玩家人设卡（.we-persona-card）：
.we-persona-section-label
  font-family: var(--we-font-serif); font-size: 10px; letter-spacing: 0.3em;
  text-transform: uppercase; color: var(--we-ink-faded); margin-bottom: 8px;

.we-persona-card-wrap（替换原有 bg-ivory border border-border 卡片容器）
  background: var(--we-paper-aged); border: 1px solid var(--we-paper-shadow);
  border-radius: var(--we-radius-md); padding: 14px 16px; position: relative; margin-bottom: 24px;

.we-persona-empty-hint
  font-family: var(--we-font-serif); font-size: 12px; font-style: italic;
  color: var(--we-ink-faded);

.we-characters-empty（无角色空态）
  text-align: center; padding: 80px 0; color: var(--we-ink-faded);

.we-characters-empty-icon
  font-size: 36px; margin-bottom: 16px; opacity: 0.4;

.we-characters-empty-text
  font-family: var(--we-font-serif); font-size: 14px;

.we-characters-loading
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  font-family: var(--we-font-serif); font-size: 14px; color: var(--we-ink-faded);

2) frontend/src/pages/CharactersPage.jsx — 重构三个组件：

PersonaCard：
  - 容器改用 className="we-persona-card-wrap"（移除所有 bg-ivory / border-border / rounded-xl 等 Tailwind 类）
  - 标签「玩家」改用 className="we-persona-section-label"
  - 空态提示改用 className="we-persona-empty-hint"
  - 编辑按钮样式改用 className="we-character-card-action-btn"（复用）
  - 头像圆保持 getAvatarColor 逻辑，移除 Tailwind 色值类，改为 style={{ backgroundColor: avatarColor }} 保留（颜色来自 util，非硬编码）

AvatarCircle：
  - 移除 Tailwind sizeClass（w-16 h-16 / w-12 h-12）
  - 改为 style={{ width: size==='lg'?64:48, height: size==='lg'?64:48 }} + 其余不变
  - 圆形保留 border-radius: '50%'（内联 style 可接受，非色值硬编码）

DeleteCharacterModal：
  - 已有部分 --we-* 变量，对照 WorldsPage DeleteConfirmModal 完整迁移
  - 移除所有 Tailwind 色值类（bg-red-500、text-red-400 等）
  - 用 style={{ color: 'var(--we-vermilion)' }} 替换红色相关类
  - 确认删除按钮改为 style={{ background: 'var(--we-vermilion)', ... }}

主页面 CharactersPage：
  - 外层容器：className="we-characters-canvas"
  - ← 所有世界 导航按钮：style + --we-* 变量，移除 Tailwind
  - 页头：className="we-characters-header"；标题区：className="we-characters-title" / "we-characters-subtitle"（副标题文字：世界名下方显示 "CHARACTER ROSTER"）
  - 操作按钮区：导入角色卡按钮 → className="we-characters-action-btn"；创建角色按钮 → className="we-characters-create-btn"
  - 角色卡：className="we-character-card"（移除 Tailwind hover/border/rounded 类）
    - 内部 body: className="we-character-card-body"
    - 名字: className="we-character-card-name"；描述: className="we-character-card-desc"（无描述加 we-character-card-desc-empty）
    - 操作按钮组: className="we-character-card-actions"；单个按钮: className="we-character-card-action-btn"（删除加 danger）
  - 空态：className="we-characters-empty"；图标 span: className="we-characters-empty-icon"；文字: className="we-characters-empty-text"
  - loading 态：className="we-characters-loading"

约束：
- 不改 @frontend/src/api/characters.js 等 API 文件
- 不改 @frontend/src/pages/ChatPage.jsx
- 不改 @frontend/src/store/index.js
- 保留所有现有功能：拖拽排序 / 导入导出 / 删除确认弹窗 / 人设编辑导航
- 颜色全部走 --we-* 变量，禁止硬编码色值（getAvatarColor 返回的色值通过 style 属性应用，可保留）
- AvatarCircle 尺寸用 style 内联数值可接受（非色值）
```

**验证方法**：
1. CharactersPage 整体呈现羊皮纸底色（`--we-book-bg`），无白色/灰色 Tailwind 背景泄露
2. 角色卡片 hover 轻微上浮 + 阴影加深，操作按钮出现
3. 玩家人设卡使用 `--we-paper-aged` 底色，样式与旧版 Tailwind 卡一致但字体/色系已对齐
4. 无角色时空态正常；加载中状态正常
5. 拖拽排序、导入角色卡、创建角色跳转均正常
6. 删除确认弹窗无红色 Tailwind 类，用朱砂变量渲染
7. ChatPage / WritingSpacePage 无回归

---

## 阶段 10：对话体验精炼（CONVERSATION-REFINE）

> 目标：ChatPage 对话区改为左右气泡布局，模拟真实对话临场感，保持羊皮纸设计语言；气泡风格是"墨迹纸页气泡"而非 Material Design 气泡。

---

### T74 ⬜ 未开始 ChatPage 左右气泡对话布局

**这个任务做什么**：将 ChatPage 消息区的单栏排版改为左右气泡布局（用户消息右侧、助手消息左侧），助手气泡左侧附小印章，同时彻底移除章节分隔和 Drop Cap（章节是小说写作场景的功能，在对话场景中破坏沉浸感）。StatePanel 和整体三栏结构不变。

**涉及文件**：
- `frontend/src/components/chat/MessageItem.jsx` — 重构为气泡布局，移除 isChapterFirstAssistant
- `frontend/src/index.css` — 更新 `.we-message-user` / `.we-message-assistant` 气泡样式，新增 `.we-message-bubble-*`，删除 `.we-chapter-first-assistant` Drop Cap 样式
- `frontend/src/components/chat/MessageList.jsx` — 调整 padding/overflow，移除章节分组逻辑

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §7.1/§10.2 @frontend/src/components/chat/MessageItem.jsx @frontend/src/components/chat/MessageList.jsx @frontend/src/pages/ChatPage.jsx @frontend/src/index.css @frontend/src/components/book/CharacterSeal.jsx 的现有内容。

目标：ChatPage 消息区改为左右气泡布局，羊皮纸风格气泡；彻底移除章节分隔（ChapterDivider）、FleuronLine、Drop Cap——这些属于写作空间的功能，在对话场景中破坏临场感。保留所有其他现有功能和稳定类名。

气泡设计规格：

用户气泡（右对齐）：
- .we-message-user 容器：display:flex；flex-direction:column；align-items:flex-end；padding:4px 0 12px
- .we-message-label（用户）：font-family Cormorant Garamond；font-size:11px；letter-spacing:0.28em；text-transform:uppercase；color:var(--we-amber)；text-align:right；margin-bottom:4px
- .we-message-bubble-user：max-width:65%；background:var(--we-paper-aged)；border-right:2.5px solid var(--we-amber)；padding:10px 14px；border-radius:var(--we-radius-sm)；font-family:var(--we-font-serif)；font-size:var(--we-text-base)；line-height:var(--we-leading-loose)；color:var(--we-ink-primary)

助手气泡（左对齐）：
- .we-message-assistant 容器：display:flex；flex-direction:column；padding:4px 0 16px
- 内部 flex row（align-items:flex-start；gap:10px）：
  - 左侧：<CharacterSeal character={character} size={32} />（character 为 null 时渲染 32×32 空白占位 div）
  - 右侧 flex column：
    - .we-message-label（助手）：font-family Cormorant Garamond；font-size:11px；letter-spacing:0.28em；uppercase；color:var(--we-ink-faded)；margin-bottom:4px
    - .we-message-bubble-assistant：max-width:70%；background:var(--we-paper-base)；border:1px solid var(--we-paper-shadow)；padding:12px 16px；border-radius:var(--we-radius-sm)；font-family:var(--we-font-serif)；font-size:var(--we-text-base)；line-height:var(--we-leading-loose)；color:var(--we-ink-primary)

操作菜单 .we-message-actions：
- 改为绝对定位在对应气泡块（.we-message-bubble-user / .we-message-bubble-assistant）的右上角（position:relative 加在气泡块上；actions absolute top:-10px right:4px）

1) frontend/src/components/chat/MessageItem.jsx
   - 导入 CharacterSeal（已有组件，直接 import）
   - 重构 JSX 为上述气泡布局结构
   - .we-message-content 保留在气泡块内（位置不变，Markdown 渲染不变）
   - .we-message-actions 改为绝对定位在气泡块右上角
   - 移除 isChapterFirstAssistant prop 及其相关逻辑（we-chapter-first-assistant 类名）
   - 保留所有其他现有功能：isStreaming / streamingText / onEdit / onRegenerate / onEditAssistant / continuingMode / attachments
   - 稳定类名全部保留：we-message-row / we-message-user / we-message-assistant / we-message-label / we-message-content / we-message-actions（§10.2 承诺）

2) frontend/src/index.css
   - 更新 .we-message-user / .we-message-assistant 为气泡布局样式
   - 新增 .we-message-bubble-user / .we-message-bubble-assistant
   - 删除 .we-chapter-first-assistant 及其 Drop Cap 相关 CSS（::first-letter 规则）
   - 保留所有 .we-status-* / .we-marginalia* / .we-state-* 等无关锚点类不变

3) frontend/src/components/chat/MessageList.jsx
   - 移除 groupMessagesIntoChapters / ChapterDivider / FleuronLine 的导入和使用
   - 移除 onChapterChange prop 及 _lastChapterCount 逻辑
   - 移除 sessionTitle prop（仅用于章节分组，气泡布局不需要）
   - 改为直接在 AnimatePresence 内渲染扁平消息列表（不分章节组）
   - 调整 .we-chat-area 的 padding（左右各 24px，上下留边）以适配气泡布局
   - 注意：ChapterDivider.jsx / FleuronLine.jsx / chapter-grouping.js 文件本身不删除（写作空间可能复用）

约束：
- 不改 @frontend/src/pages/ChatPage.jsx
- 不改写作空间相关文件（WritingSpacePage / CastPanel / WritingPageLeft）
- 不删除 ChapterDivider.jsx / FleuronLine.jsx / chapter-grouping.js（保留供写作空间使用）
- 所有 we-message-* 稳定类名必须保留（§10.2 承诺，自定义 CSS 兼容）
- 颜色全部走 --we-* 变量，禁止硬编码
- CharacterSeal 组件直接导入复用，不重写
```

**验证方法**：
1. ChatPage 用户消息右侧气泡，琥珀右边线，最大宽度 65%
2. 助手消息左侧气泡，左侧附小印章（32px），最大宽度 70%
3. 消息列表无章节分隔线（ChapterDivider）、无花饰分割线（FleuronLine）、无 Drop Cap 首字母
4. 流式生成：气泡实时追加内容，QuillCursor 正常显示
5. hover 操作菜单（复制/编辑/重新生成）位置正确，不超出视口
6. StatePanel 三栏并排显示正常，气泡区不溢出
7. 写作空间无回归（不改动 WritingSpacePage 相关文件）
