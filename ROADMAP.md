# WorldEngine — 开发路线图

## 使用方法

1. 按顺序找到第一个状态为 `⬜ 未开始` 的任务
2. 把该任务的"Claude Code 指令"原文复制给 Claude Code
3. Claude Code 完成后，按"验证方法"检查是否正常
4. 没问题就执行 `git commit`，CHANGELOG.md 追加一条记录，把本任务 ROADMAP.md 中的状态改为 `✅ 完成`，继续下一个任务
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

## 阶段 6：前端羊皮纸化 · 地基（PARCHMENT-FOUNDATION）

> 目标：CSS 变量、字体、动效 token 全部就位，书本双页骨架能打开正常对话。完成后 ChatPage 外观焕然一新，功能零回归。

### T59 ⬜ 未开始 建立 CSS 变量、字体与动效 token 基础设施

**这个任务做什么**：按 DESIGN §2/§3/§9.1 建立 `--we-*` CSS 变量、Google Fonts 字体族、framer-motion 动效常量；不改变任何页面外观（只加载 token，组件未使用）。

**涉及文件**：
- `frontend/package.json` — 新增 `framer-motion` 依赖
- `frontend/index.html` — `<head>` 加 Google Fonts link（preconnect + 字体集合）
- `frontend/src/styles/tokens.css` — 新建，`:root` 内定义所有 `--we-*` 变量
- `frontend/src/styles/fonts.css` — 新建，定义 `--we-font-*` 字体族组合变量
- `frontend/src/utils/motion.js` — 新建，导出 `MOTION` 常量对象
- `frontend/src/main.jsx` — 在 App import 之前 import 新样式

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §2/§3/§9.1 @frontend/src/main.jsx @frontend/index.html @frontend/package.json 的现有内容。

目标：建立视觉 token 基础设施，不改变当前页面外观。

1) frontend/package.json
   - 在 dependencies 新增 "framer-motion": "^11.x"（用最新稳定版）
   - 其他字段保持不变

2) frontend/index.html
   - <head> 内、现有 <link rel="icon"> 附近加入：
     <link rel="preconnect" href="https://fonts.googleapis.com">
     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
     <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=ZCOOL+XiaoWei&family=LXGW+WenKai+TC&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
   - 不动其他 head 内容

3) frontend/src/styles/tokens.css（新建）
   - 将 DESIGN §2.1–§2.6 列出的所有 CSS 变量完整拷贝到 :root 选择器内
   - 必须含 --we-paper-base/aged/shadow/deep、--we-book-bg、--we-ink-primary/secondary/faded、--we-vermilion/vermilion-deep/vermilion-bg、--we-gold-leaf/gold-pale、--we-moss/amber/slate、--we-border/border-faint、--we-radius-sm/md/none、--we-spine-shadow
   - 文件头加一行注释 "/* WorldEngine 视觉 token — 权威定义见 DESIGN.md §2 */"

4) frontend/src/styles/fonts.css（新建）
   - :root 选择器内定义字体族变量：
     --we-font-serif: 'EB Garamond', 'Source Han Serif SC', 'Source Han Serif', serif;
     --we-font-display: 'Cormorant Garamond', 'LXGW WenKai TC', serif;
     --we-font-seal: 'ZCOOL XiaoWei', 'LXGW WenKai TC', serif;
     --we-font-mono: 'JetBrains Mono', ui-monospace, monospace;
   - 文件头加注释 "/* WorldEngine 字体族 — 权威定义见 DESIGN.md §3 */"

5) frontend/src/utils/motion.js（新建）
   - 导出 MOTION 常量对象，字段完全按 DESIGN §9.1：
     duration: { quick: 0.18, base: 0.32, slow: 0.50, crawl: 0.80 }
     ease: { ink: [0.22,1,0.36,1], page: [0.65,0,0.35,1], quill: [0.40,0,0.20,1], sharp: [0.25,0.46,0.45,0.94] }
     stagger: 0.05
   - 同时导出 INK_RISE 预设对象：{ initial, animate, transition }，对应 DESIGN §9.2 inkRise 规格

6) frontend/src/main.jsx
   - 在现有 import './index.css' 之前依次 import './styles/tokens.css' 与 './styles/fonts.css'
   - 不改其他内容

7) 运行 npm install 安装新依赖

约束：
- 不改现有任何组件/页面代码
- 不改 tailwind.config.js（如存在）
- 不动 @frontend/src/store/index.js（锁定）
- 所有新文件必须含对应 DESIGN.md 章节的来源注释
- 完成后 npm run build 必须成功
```

**验证方法**：
1. `cd frontend && npm install && npm run build` 成功
2. `npm run dev` 启动，浏览器打开页面，devtools → Elements → :root → Computed，能看到 `--we-paper-base: #ede3d0` 等变量
3. Network 面板能看到 Google Fonts CSS 成功加载（200 状态）
4. 肉眼对比：ChatPage / WorldsPage / SettingsPage 外观与改动前**完全一致**
5. `import { MOTION, INK_RISE } from './utils/motion'` 能正常解构

---

### T60 ✅ 完成 双页书本骨架：BookSpread / PageLeft / PageRight / 噪点 / 书签

**这个任务做什么**：按 DESIGN §5/§8.1/§8.2 实现书本外壳（双页 + 书脊阴影 + 羊皮纸噪点 + 书签丝带），ChatPage 用新骨架包裹旧内容，保持功能零回归。

**涉及文件**：
- `frontend/src/components/book/BookSpread.jsx` — 新建，最外层容器（木桌背景 + 书本阴影）
- `frontend/src/components/book/PageLeft.jsx` — 新建，左页容器（aged 底 + 右侧书脊阴影）
- `frontend/src/components/book/PageRight.jsx` — 新建，右页容器（base 底 + 左侧书脊阴影）
- `frontend/src/components/book/ParchmentTexture.jsx` — 新建，可复用的 SVG 噪点覆盖层
- `frontend/src/components/book/Bookmark.jsx` — 新建，朱砂书签丝带
- `frontend/src/pages/ChatPage.jsx` — 用新容器包裹现有 Sidebar 与对话区

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §5/§7.7/§8.1/§8.2 @frontend/src/pages/ChatPage.jsx @frontend/src/components/chat/Sidebar.jsx 的现有内容。

目标：建立双页书本骨架，ChatPage 外观变为羊皮纸风格，功能零回归。

1) frontend/src/components/book/ParchmentTexture.jsx（新建）
   - 函数组件，接受 props: { opacity = 0.7, blendMode = 'multiply', zIndex = 20 }
   - 渲染一个绝对定位 inset:0 的 div，pointer-events:none
   - background-image 用 inline data URL SVG，内容为 DESIGN §8.1 的 feTurbulence 噪点配方
   - 参考值：baseFrequency=0.85, numOctaves=4, feColorMatrix matrix 按 DESIGN §8.1

2) frontend/src/components/book/Bookmark.jsx（新建）
   - 无 props
   - 绝对定位 top:-4px right:72px
   - width:16px height:52px
   - background: var(--we-vermilion)
   - clip-path: polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%)
   - box-shadow: -1px 2px 6px rgba(0,0,0,0.3)
   - z-index: 15

3) frontend/src/components/book/BookSpread.jsx（新建）
   - Props: { children, className }
   - 最外层 div：min-height:100vh，padding 32px 24px，background: var(--we-book-bg)，noise 背景
   - 内层容器（书本本体）：display:flex，max-width:1120px，min-height:700px，margin auto，position:relative，box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35)
   - 内层最后 render <ParchmentTexture />（书本整体纹理覆盖）
   - 内层首个子元素 render <Bookmark />
   - children 紧随 Bookmark 之后

4) frontend/src/components/book/PageLeft.jsx（新建）
   - Props: { children, className }
   - div：width:260px flex-shrink:0，background: var(--we-paper-aged)，padding 44px 28px 32px 36px，display:flex flex-direction:column gap:22px，position:relative，border-radius: var(--we-radius-sm) 0 0 var(--we-radius-sm)
   - ::after 伪元素 / 或内部绝对定位 div：right:0 top:0 bottom:0 width:24px，background: var(--we-spine-shadow)，pointer-events:none，z-index:2
   - 响应式：max-width 1023px 时宽度降到 0（保留组件但隐藏，为 P7 预留书脊模式可后续扩展）；mobile <768px 默认隐藏

5) frontend/src/components/book/PageRight.jsx（新建）
   - Props: { children, className }
   - div：flex:1，background: var(--we-paper-base)，padding 44px 52px 28px 60px，display:flex flex-direction:column，position:relative，overflow:hidden，border-radius: 0 var(--we-radius-sm) var(--we-radius-sm) 0
   - 左侧内部绝对定位 div：left:0 top:0 bottom:0 width:24px，background 用 linear-gradient 镜像 DESIGN §2.6 spine-shadow 的左侧半部分，pointer-events:none，z-index:1

6) frontend/src/pages/ChatPage.jsx
   - 在最外层用 <BookSpread> 包裹现有 JSX
   - 原 Sidebar 移到 <PageLeft> 内（Sidebar 保持原样，不动内部实现）
   - 原对话区（MessageList + InputBox 等）移到 <PageRight> 内
   - 若 Sidebar 有硬编码宽度样式导致在 260px 内溢出，临时添加 className 让它 width:100% 填充 PageLeft（不改 Sidebar 组件本身）
   - 顶部导航若现有在 ChatPage 内则保留其位置（TopBar 在 T61 处理）

约束：
- 不改 @frontend/src/components/chat/Sidebar.jsx 内部实现（只改挂载位置）
- 不改 @frontend/src/components/chat/MessageList.jsx @frontend/src/components/chat/MessageItem.jsx @frontend/src/components/chat/InputBox.jsx 内部（T62 处理）
- 不改 @frontend/src/store/index.js（锁定）
- 不改后端任何文件
- 所有颜色/字体/间距必须走 CSS 变量，禁止硬编码
- 所有新组件用函数组件 + hooks；TailwindCSS 工具类与 style={{}} 变量引用并存均可，但优先内联 style 走 CSS 变量
- 所有新组件必须含对应 DESIGN.md 章节来源注释
```

**验证方法**：
1. `npm run dev` 启动 ChatPage：背景为深棕木桌色 + 噪点，中央显示书本双页，右上角朱砂书签丝带可见
2. 左页背景色略深于右页，页中间有书脊阴影过渡
3. 左侧 Sidebar 所有功能正常：切换会话、新建会话、删除会话
4. 右侧对话区可正常发送消息并接收流式响应
5. 响应式：1280px 下完整双页；800px 下左页隐藏（或降至 0 宽）右页完整；375px 下布局不崩
6. `npm run build` 成功

---

### T61 ✅ 完成 顶部导航栏 TopBar + 路由挂载

**这个任务做什么**：按 DESIGN §5.2 建立 TopBar（世界选择 / 模式切换 / 人设 / 设置入口），挂在 App 根，替代当前分散的导航元素。

**涉及文件**：
- `frontend/src/components/book/TopBar.jsx` — 新建
- `frontend/src/App.jsx` — 在路由容器外层挂载 TopBar
- `frontend/src/components/book/BookSpread.jsx` — 调整外层 padding 为 TopBar 预留 40px

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §5.2 @frontend/src/App.jsx @frontend/src/api/worlds.js @frontend/src/store/index.js 的现有内容。

目标：建立全局 TopBar，提供世界选择 / 模式切换 / 人设 / 设置入口。

1) frontend/src/components/book/TopBar.jsx（新建）
   - 高度 40px 固定，position:sticky top:0 z-index:50
   - 背景 #3d2e22，底部 border-bottom: 1px solid rgba(255,255,255,0.06)
   - 左侧区（从左到右，间距 8px，字体 --we-font-display，font-style:italic，font-size:12px，letter-spacing:0.1em）：
     a. 世界选择器：显示当前世界名；未选世界时显示"选择世界"；点击展开下拉菜单列出所有世界 + 末尾"前往世界列表 →"。使用 getWorlds() API
     b. 分隔点 "·"，rgba(255,255,255,0.2)
     c. "对话" 模式按钮（对应 /characters/:characterId/chat；需从 pathname 匹配 /characters/(\w+)/chat 提取 characterId，无法识别时禁用/隐藏）
     d. 分隔点
     e. "写作空间" 按钮（对应 /worlds/:worldId/writing；需从 pathname 匹配 /worlds/(\w+) 提取 worldId，无法识别时禁用/隐藏）
   - 右侧区：
     f. "玩家人设" 文字按钮 → 导航至 /worlds/:worldId/persona（worldId 同上从 pathname 提取；无 worldId 时不可点击）
     g. "设置" 齿轮 SVG 图标 → /settings
   - 配色：default rgba(255,255,255,0.5)；active/current 使用 var(--we-gold-pale) 文字 + 细下划线或边框 rgba(201,168,90,0.3)
   - 数据来源：全部从 react-router 的 useLocation().pathname 用正则派生，不依赖 store.currentWorldId（currentWorldId 仅由 WorldsPage 写入，刷新或深链接时为 null）；世界选择器高亮同理用 pathname 判断

2) frontend/src/App.jsx
   - 在路由 <Routes> 外层最顶端挂载 <TopBar />
   - 确保 TopBar 和 Routes 的根容器 flex-direction:column 让 sticky 生效

3) frontend/src/components/book/BookSpread.jsx
   - 最外层容器的 min-height 改为 calc(100vh - 40px)
   - padding-top 减少 16px（因为顶部已有 TopBar）

约束：
- 不实现世界选择/人设/写作空间的业务逻辑本身；TopBar 只负责导航跳转和 dropdown 展示
- 不改路由定义文件；只改跳转触发器
- 不改任何页面内部
- 不改 @frontend/src/store/index.js @frontend/src/pages/SettingsPage.jsx @frontend/src/pages/PersonaEditPage.jsx 等目标页面
- dropdown 样式先用 TailwindCSS 简单实现，P5 会统一 Modal/Drawer 动画
```

**验证方法**：
1. 页面顶部有 40px 高深色导航条
2. 世界选择器能下拉展开并显示所有世界；点击某世界，URL 变为 /worlds/:worldId（角色列表页）
3. 模式切换：在 /characters/:characterId/chat 页时"对话"按钮高亮；跳转"写作空间"时 URL 变为 /worlds/:worldId/writing
4. "设置" 图标点击跳转 /settings
5. 未选世界时，世界选择器显示占位文字且不阻塞其他导航
6. 路由切换时 TopBar 不重新挂载（不闪烁）

---

## 阶段 7：前端羊皮纸化 · 对话主区（PARCHMENT-CHAT）

> 目标：消息气泡、三栏布局（左页会话列表 + 右侧档案页 StatePanel）、章节分组、路由/模态动画、SSE 召回指示全部就位。完成后对话主场景完全呈现羊皮纸古籍派的沉浸体验。

### T62 ✅ 完成 消息组件重构：稳定类名 + inkRise + Drop Cap + 流式光标

**这个任务做什么**：按 DESIGN §7.1 重写 MessageItem：注入稳定锚点类名、应用 inkRise 动画、章节首条助手消息含 Drop Cap、流式末尾挂 ▊ 光标。

**涉及文件**：
- `frontend/src/components/chat/MessageItem.jsx` — 重写样式与动画
- `frontend/src/components/chat/MessageList.jsx` — 外层加 `.we-chat-area` 类与滚动条样式
- `frontend/src/components/chat/StreamingCursor.jsx` — 新建
- `frontend/src/styles/chat.css` — 新建，羊皮纸对话区样式（Drop Cap、滚动条、Drop Cap 专用选择器）

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §7.1/§9.2/§10.2 @frontend/src/components/chat/MessageItem.jsx @frontend/src/components/chat/MessageList.jsx 的现有内容。

目标：消息气泡应用古籍风格，注入稳定类名供用户 CSS/正则依赖。

1) frontend/src/components/chat/StreamingCursor.jsx（新建）
   - 无 props
   - 返回一个 <span className="we-cursor" /> 空元素
   - 样式通过 chat.css 定义：display:inline-block width:1.5px height:0.85em background:var(--we-ink-secondary) margin-left:2px vertical-align:text-bottom animation: weCursorBlink 0.65s steps(1) infinite

2) frontend/src/styles/chat.css（新建）
   - 定义 @keyframes weCursorBlink { 0%,100% {opacity:1} 50% {opacity:0} }
   - 定义 @keyframes weInkRise { from {opacity:0; transform:translateY(8px); filter:blur(1.5px)} to {opacity:1; transform:translateY(0); filter:blur(0)} }
   - .we-message-row { animation: weInkRise var(--we-dur-base, 0.32s) ease-out both; }
   - .we-message-content { font-family: var(--we-font-serif); font-size:16.5px; line-height:1.9; color:var(--we-ink-primary); }
   - .we-message-content p + p { margin-top: 0.5em; }
   - .we-message-label { font-family: var(--we-font-display); font-size:10px; font-weight:600; letter-spacing:0.28em; text-transform:uppercase; margin-bottom:6px; }
   - .we-message-user .we-message-label { color: var(--we-amber); }
   - .we-message-assistant .we-message-label { color: var(--we-ink-faded); }
   - .we-message-user .we-message-body { border-left:2px solid var(--we-amber); padding-left:16px; }
   - .we-chapter-first-assistant .we-message-content p:first-child::first-letter { font-family: var(--we-font-display); font-size:3.4em; font-weight:300; float:left; line-height:0.78; margin:0.04em 0.09em 0 0; color:var(--we-ink-primary); }
   - .we-chat-area { scrollbar-width: thin; scrollbar-color: var(--we-paper-shadow) transparent; }
   - .we-chat-area::-webkit-scrollbar { width:4px; }
   - .we-chat-area::-webkit-scrollbar-thumb { background: var(--we-paper-shadow); }
   - .we-message-actions { /* hover 浮出的操作行样式 */ }
   - 在 main.jsx 中按 tokens.css → fonts.css → chat.css → index.css 的顺序 import

3) frontend/src/components/chat/MessageItem.jsx
   - 外层 motion.div（从 framer-motion 引入）：className 组合含 "we-message-row" + role-specific 类（"we-message-user" 或 "we-message-assistant"）+ 若 props.isChapterFirstAssistant 则追加 "we-chapter-first-assistant"
   - initial/animate/transition 用 @frontend/src/utils/motion.js 的 INK_RISE
   - 内部结构（按此层次）：
     <div className="we-message-body">
       <div className="we-message-label">{发言人名}</div>
       <div className="we-message-content">{渲染后的 content，经现有 display_only 正则处理}</div>
       {isStreaming && <StreamingCursor />}
       <div className="we-message-actions">{现有操作按钮}</div>
     </div>
   - 保留所有现有功能：编辑、重新生成、复制、继续、删除、附件渲染
   - props 新增 isChapterFirstAssistant?: boolean（P4 之前 MessageList 传 false，或简化为列表首条）
   - 保留所有现有的 Markdown 渲染/正则替换管线
   - 移除旧的气泡背景色/圆角样式，全面改用类名驱动

4) frontend/src/components/chat/MessageList.jsx
   - 外层容器加 className="we-chat-area"
   - 若当前实现是简单 map，临时给列表第一条 assistant 消息传 isChapterFirstAssistant={true}（P4 会替换为章节分组判定）
   - 用 framer-motion 的 <AnimatePresence> 包裹消息列表，mode="popLayout"，保证编辑/删除时动画正常

约束：
- 不改任何 API 文件
- 不改正则执行逻辑（只是类名迁移）
- 不改 @frontend/src/store/index.js @frontend/src/components/chat/InputBox.jsx @frontend/src/components/chat/Sidebar.jsx
- display_only 正则必须继续作用于 .we-message-content 内部文本
- 用户自定义 CSS 若当前依赖旧类名（grep 现有 CustomCssSnippets 样例），在 CHANGELOG.md 标注"P2 类名重构"并建议用户迁移到 .we-message-* 稳定锚点
- 稳定类名（见 DESIGN §10.2）必须全部注入且保持命名一致
```

**验证方法**：
1. 打开 ChatPage，消息浮现有 inkRise（透明度 + 上移 + 模糊→清晰）
2. devtools Elements 检查 DOM，能看到 `.we-message-row.we-message-assistant`、`.we-message-content`、`.we-message-label` 等类名
3. 第一条助手消息首字明显大号下沉（Drop Cap）
4. 发送一条消息，流式响应时末尾有 ▊ 光标闪烁，完成后光标消失
5. 用户消息左侧有 2px 琥珀色竖线
6. 现有 display_only 正则规则对新消息仍生效
7. 编辑/重新生成/删除消息功能正常

---

### T63 ✅ 已完成 左页会话列表（无 Tab）+ 三栏布局接入

**这个任务做什么**：按 DESIGN §5.3 将 Sidebar 会话列表迁移为 SessionListPanel，直接嵌入 PageLeft（无 Tab），完成三栏布局接入（T64 将新增右侧 StatePanel）。

> **注**：`PageLeftTabs.jsx` 和 `SessionListPanel.jsx` 已在任务探索阶段创建，T63 只需接线和弃用旧组件。

**涉及文件**：
- `frontend/src/components/book/PageLeft.jsx` — 移除 children 透传，直接接收 props 并渲染 `<SessionListPanel>`
- `frontend/src/components/book/SessionListPanel.jsx` — 已存在，接收 5 个 props
- `frontend/src/pages/ChatPage.jsx` — 移除 `<Sidebar>`，向 `<PageLeft>` 传 props；`Sidebar.updateTitle/addSession` → `SessionListPanel.updateTitle/addSession`
- `frontend/src/components/chat/Sidebar.jsx` — 添加弃用注释，不删除
- `frontend/src/components/book/PageLeftTabs.jsx` — 添加弃用注释，不删除（Tab 方案废弃）

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §5.3 @frontend/src/components/book/PageLeft.jsx @frontend/src/components/book/SessionListPanel.jsx @frontend/src/pages/ChatPage.jsx @frontend/src/components/chat/Sidebar.jsx 的现有内容。

目标：左页直接显示会话列表（无 Tab），完成三栏布局第一步。

1) frontend/src/components/book/PageLeft.jsx
   - 接受 props: { character, currentSessionId, onSessionSelect, onSessionCreate, onSessionDelete }
   - 移除 children 透传
   - 内部直接 render:
     <SessionListPanel
       character={character}
       currentSessionId={currentSessionId}
       onSessionSelect={onSessionSelect}
       onSessionCreate={onSessionCreate}
       onSessionDelete={onSessionDelete}
     />
   - 保留原有右侧书脊阴影 div（position:absolute right 0 渐变）

2) frontend/src/pages/ChatPage.jsx
   - 移除 `import Sidebar from '../components/chat/Sidebar.jsx'`
   - 添加（若未有）`import SessionListPanel from '../components/book/SessionListPanel.jsx'`
   - 将 `<PageLeft><Sidebar .../></PageLeft>` 替换为：
     <PageLeft
       character={character}
       currentSessionId={currentSessionId}
       onSessionSelect={handleSessionSelect}
       onSessionCreate={handleSessionCreate}
       onSessionDelete={handleSessionDelete}
     />
   - `Sidebar.updateTitle(...)` → `SessionListPanel.updateTitle(...)`
   - `Sidebar.addSession(...)` → `SessionListPanel.addSession(...)`

3) frontend/src/components/chat/Sidebar.jsx
   - 文件顶部第一行添加注释：
     /* 已迁移至 components/book/SessionListPanel.jsx，待 P8 清理 */

4) frontend/src/components/book/PageLeftTabs.jsx
   - 文件顶部第一行注释改为：
     /* Tab 方案已废弃（布局调整为三栏，无 Tab 切换），待 P8 清理 */

约束：
- 不改 @frontend/src/api/sessions.js
- 不改 @frontend/src/store/index.js
- 不改 SessionListPanel.jsx 内部逻辑
- 所有会话功能必须保留：切换、新建、删除、重命名、SSE title 同步
```

**验证方法**：
1. 打开 ChatPage，左页直接显示会话列表（无 Tab 标签行）
2. 顶部"新建会话"虚线按钮可用；点击创建新会话，左页列表正确追加
3. 点击某个会话，右侧对话区切换并显示对应消息历史
4. 删除 / 重命名会话功能正常
5. AI 回复完成后，左页列表中当前会话标题自动更新（SSE title_updated 同步）

---

### T64 ✅ 已完成 右侧档案页 StatePanel：印章 + 全层状态 + 时间线 + 召回批注

**这个任务做什么**：按 DESIGN §5.5 / §7.2 / §7.3 / §7.6 / §8.3 新建右侧 StatePanel 档案页，取代现有 MemoryPanel，完成三栏布局第二步。StatePanel 显示角色档案头（印章）、角色/玩家/世界三层状态、世界时间线、召回记忆批注。

**涉及文件**：
- `frontend/src/components/book/StatePanel.jsx` — 新建，整合所有状态数据
- `frontend/src/components/book/CharacterSeal.jsx` — 新建，印章 / 头像组件
- `frontend/src/components/book/StatusSection.jsx` — 新建，区块渲染（标题 + 字段 + 进度条 + 重置）
- `frontend/src/components/book/MarginaliaList.jsx` — 新建，召回批注列表
- `frontend/src/pages/ChatPage.jsx` — 移除 `<MemoryPanel>` 和 rightOpen 状态，插入 `<StatePanel>`
- `frontend/src/index.css` — 新增 `.we-state-panel*`、`.we-timeline`、`.we-marginalia*` CSS 锚点样式

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §5.5/§7.2/§7.3/§7.6/§8.3/§10.2
@frontend/src/api/worldStateValues.js
@frontend/src/api/characterStateValues.js
@frontend/src/api/characterStateFields.js
@frontend/src/api/personaStateValues.js
@frontend/src/api/worldTimeline.js
@frontend/src/api/characters.js
@frontend/src/utils/avatar.js
@frontend/src/store/index.js
@frontend/src/components/memory/MemoryPanel.jsx（参考数据拉取逻辑，不复用样式）
@frontend/src/pages/ChatPage.jsx
的现有内容。

目标：新建 StatePanel 右侧档案页，完整可用，取代 MemoryPanel。

1) frontend/src/components/book/CharacterSeal.jsx（新建）
   - Props: { character, size = 72 }
   - getAvatarColor(character?.id) 获取印章颜色
   - 有 avatar_path：圆形 img（size×size，object-fit:cover，border-radius:50%）
     + 外层 SVG 双线印章边框（viewBox 依 size 缩放）
   - 无 avatar_path：完整 SVG 印章（DESIGN §8.3 模板），文字取 character.name 前 1~2 字
   - 无 character：render null

2) frontend/src/components/book/StatusSection.jsx（新建）
   - Props: { title, rows, pinnedName, onReset, resetting, className }
   - rows 每项: { field_key, label, field_type, effective_value_json, max }
   - 区块标题 .we-state-section-title：
     font-family --we-font-display，11px，letter-spacing 0.28em，uppercase，--we-ink-faded
     右侧重置按钮 .we-state-section-reset：10px italic --we-ink-faded，hover → --we-vermilion
     标题下方 border-bottom: 1px solid var(--we-paper-shadow)；margin-bottom 10px
   - pinnedName 存在时置顶渲染"姓名"字段行
   - 字段行 .we-status-field（each row）：
     display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px
     key span .we-status-key：font-family serif，12px，italic，--we-ink-faded
     val span .we-status-value：font-family serif，13px，--we-ink-secondary
   - number 类型 + max 存在：value/max 进度条：
     .we-status-bar { height:3px; background:rgba(0,0,0,0.1); margin:2px 0 8px; }
     .we-status-bar-fill { height:100%; background:var(--we-moss); transition:width 1s ease; }
   - list 类型：JSON.parse + '、' 连接（try/catch 降级显示原字符串）
   - boolean 类型：'true'/'1'/true → '是'，其余 → '否'
   - 空数据（!rows || rows.length===0）：小字灰色占位"暂无数据"
   - 整体容器 className: `we-state-section ${className || ''}`

3) frontend/src/components/book/MarginaliaList.jsx（新建）
   - Props: { items }  items: [{ id, date, text }]
   - 容器 className="we-marginalia-list"（.we-state-section 包裹外）
   - 每项 className="we-marginalia"，含：
     div.we-marginalia-date：10px italic --we-vermilion
     div.we-marginalia-text：11.5px italic --we-ink-faded，line-height 1.6
   - 空列表：灰色小字"暂无召回记忆"（--we-ink-faded，10px，italic）

4) frontend/src/components/book/StatePanel.jsx（新建）
   - Props: { character, worldId, characterId, persona }
   - 整体：width:280px，flexShrink:0，display:flex，flexDirection:column
     background:var(--we-paper-aged)，borderLeft:'1px solid var(--we-paper-shadow)'
     overflowY:auto，scrollbarWidth:'thin'
     scrollbarColor:'var(--we-paper-shadow) transparent'
   - 左侧书脊阴影（12px）：position:absolute; left:0; top:0; bottom:0; width:12px
     background: linear-gradient(to right, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.04) 40%, transparent 100%)
     pointerEvents:none; zIndex:2

   - 头部 .we-state-panel-header（paddingTop:20px，paddingBottom:14px，paddingX:16px）：
     a. <CharacterSeal character={character} size={72} /> 水平居中
     b. 角色名：font-family 'ZCOOL XiaoWei','Cormorant Garamond',serif；16px；
        color:--we-ink-primary；textAlign:center；marginTop:10px
     c. 世界名（可选）：10px italic --we-ink-faded，textAlign:center，marginTop:3px
     d. character 为 null 时显示"尚未选择角色"占位小字（ink-faded，italic，12px）

   - 1px --we-gold-leaf 分隔线：borderTop:'1px solid var(--we-gold-leaf)'，marginX:20px

   - 内容区（paddingX:14px，paddingBottom:20px，gap:0）各 StatusSection 顺序：
     a. 角色状态区块：
        <StatusSection
          title="CURRENT STATE"
          className="we-status-character"
          rows={charState}
          pinnedName={character?.name}
          onReset={handleResetChar}
          resetting={charResetting}
        />
     b. 玩家状态区块：
        <StatusSection title="PLAYER" className="we-status-player"
          rows={personaState} pinnedName={persona?.name}
          onReset={handleResetPersona} resetting={personaResetting} />
     c. 世界状态区块：
        <StatusSection title="WORLD" className="we-status-world"
          rows={worldState} onReset={handleResetWorld} resetting={worldResetting} />
     d. 时间线区块（.we-timeline）：
        区块标题同 StatusSection 样式，title="TIMELINE"
        每条：flex row；左侧"·"（ink-faded）；正文 13px ink-secondary line-height 1.55
        is_compressed=1 的条目：前缀「旧史·」+ 整体 opacity 0.45
        最多显示 5 条（slice(0,5)）；空时"暂无记录"占位
     e. 召回批注区块（.we-state-section）：
        区块标题 title="RECALLED"
        <MarginaliaList items={recalledItems} />
        recalledItems 初始 []，T66 接入 SSE memory_recall_done 时填充

   - 数据拉取（同 MemoryPanel 逻辑，直接移植）：
     useEffect 分别拉 characterStateValues / personaStateValues / worldStateValues / worldTimeline(5)
     deps 为 [characterId] / [worldId] / [worldId] / [worldId]
     轮询：订阅 store.memoryRefreshTick，变化时重新拉取（直接复用 MemoryPanel 中的轮询逻辑）

   - 重置 handlers：handleResetChar / handleResetPersona / handleResetWorld
     （逻辑完全同 MemoryPanel，直接移植）

5) frontend/src/index.css（追加）
   /* StatePanel 状态区块 */
   .we-state-section { padding: 14px 0 10px; }
   .we-state-section + .we-state-section { border-top: 1px solid var(--we-paper-shadow); }
   .we-state-section-title { display:flex; justify-content:space-between; align-items:center;
     font-family:var(--we-font-display); font-size:11px; letter-spacing:0.28em;
     text-transform:uppercase; color:var(--we-ink-faded);
     border-bottom:1px solid var(--we-paper-shadow); padding-bottom:6px; margin-bottom:10px; }
   .we-state-section-reset { font-family:var(--we-font-display); font-style:italic;
     font-size:10px; color:var(--we-ink-faded); background:none; border:none; cursor:pointer;
     padding:0; transition:color 0.15s; }
   .we-state-section-reset:hover { color:var(--we-vermilion); }
   /* 时间线 */
   .we-timeline { padding:14px 0 10px; border-top:1px solid var(--we-paper-shadow); }
   /* 召回批注 */
   .we-marginalia-list { padding:14px 0 10px; border-top:1px solid var(--we-paper-shadow); }
   .we-marginalia { position:relative; padding-left:10px; margin-bottom:12px; }
   .we-marginalia::before { content:''; position:absolute; left:0; top:3px; bottom:3px;
     width:1.5px; background:var(--we-vermilion); opacity:0.5; }
   .we-marginalia-date { font-family:var(--we-font-serif); font-size:10px; font-style:italic;
     color:var(--we-vermilion); margin-bottom:2px; opacity:0.9; }
   .we-marginalia-text { font-family:var(--we-font-serif); font-size:11.5px; line-height:1.6;
     color:var(--we-ink-faded); font-style:italic; }

6) frontend/src/pages/ChatPage.jsx
   - 移除 `import MemoryPanel from '../components/memory/MemoryPanel.jsx'`
   - 移除 `const [rightOpen, setRightOpen] = useState(true)`
   - 移除内联顶部栏中的"收起记忆面板"按钮（svg + onClick）
   - 移除 `{rightOpen && character && (<div className="w-[300px] ..."><MemoryPanel .../></div>)}`
   - 添加 `import StatePanel from '../components/book/StatePanel.jsx'`
   - 在 `</PageRight>` 之后（`</BookSpread>` 之前）插入：
     <StatePanel
       character={character}
       worldId={character?.world_id ?? null}
       characterId={characterId}
       persona={persona}
     />

约束：
- 不改 @frontend/src/api/* 任何文件
- 不改 @frontend/src/utils/avatar.js
- 不改 @frontend/src/components/memory/MemoryPanel.jsx（保留文件，P8 清理）
- 稳定类名必须完整：we-state-panel / we-state-panel-header / we-state-section /
  we-state-section-title / we-state-section-reset / we-status-character / we-status-player /
  we-status-world / we-status-field / we-status-bar / we-status-bar-fill /
  we-timeline / we-marginalia-list / we-marginalia / we-marginalia-date / we-marginalia-text
- 召回批注 recalledItems 本任务占位为 []，T66 接入 SSE 后填充真实数据
```

**验证方法**：
1. ChatPage 右侧显示 280px 档案页（`--we-paper-aged` 底色，左侧书脊阴影）
2. 头部：印章（有头像显示圆形头像，无头像显示 SVG 印章）+ 角色名 + 世界名
3. 各层状态数据正确显示（角色 / 玩家 / 世界状态字段 + 进度条）
4. 时间线显示最近 5 条，旧史条目半透明
5. AI 回复完成后约 3 秒内状态自动轮询更新
6. 三个重置按钮正常工作
7. devtools 可见 `.we-state-panel`、`.we-status-character`、`.we-marginalia-list` 等类名
8. 无 rightOpen 按钮、无 MemoryPanel 渲染

---

### T65 ✅ 已完成 章节分组 + 花饰分隔线 + 页脚

**这个任务做什么**：按 DESIGN §6.1 / §7.5 / §7.9 / §8.4 实现消息按章节自动分组，章节头含章节号 + 标题 + 金色花饰分隔线；对话内场景分隔用 Fleuron；右页底部加页脚。

**涉及文件**：
- `frontend/src/utils/chapter-grouping.js` — 新建，纯函数 groupMessagesIntoChapters
- `frontend/src/components/book/ChapterDivider.jsx` — 新建
- `frontend/src/components/book/FleuronLine.jsx` — 新建
- `frontend/src/components/book/PageFooter.jsx` — 新建
- `frontend/src/components/chat/MessageList.jsx` — 插入章节分组渲染
- `frontend/src/components/book/PageRight.jsx` — 挂 PageFooter
- `frontend/src/utils/constants.js` — 新增章节常量

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §6.1/§7.5/§7.9/§8.4 @frontend/src/components/chat/MessageList.jsx @frontend/src/utils/constants.js 的现有内容。

目标：消息按章节分组渲染，含章节头与场景分隔线，右页有页脚。

1) frontend/src/utils/constants.js
   - 新增 CHAPTER_MESSAGE_SIZE = 20
   - 新增 CHAPTER_TIME_GAP_MS = 6 * 60 * 60 * 1000
   - 加注释说明：章节分组纯视觉决策，不影响业务逻辑

2) frontend/src/utils/chapter-grouping.js（新建）
   - export function groupMessagesIntoChapters(messages, sessionTitle)
   - 返回 [{ chapterIndex, title, messages: [] }]
   - 规则：
     - 按 created_at 升序遍历
     - 新章节触发：累计消息数达到 CHAPTER_MESSAGE_SIZE，或与前一条 created_at 间隔 > CHAPTER_TIME_GAP_MS
     - 第一章用 sessionTitle；后续章节标题为 '续章'
     - chapterIndex 从 1 开始

3) frontend/src/components/book/FleuronLine.jsx（新建）
   - Props: { symbol = '※' }
   - 结构：横线 + 中心 symbol + 横线
   - 两侧 ::before/::after 伪元素的横线用 linear-gradient(to right, transparent, var(--we-paper-shadow), transparent)
   - 中心 symbol：color var(--we-paper-deep) font-size 14px
   - 进入视口用 IntersectionObserver 触发 CSS animation: draw 0.5s cubic-bezier(.65,0,.35,1) both（clip-path inset(0 50% 0 50%) → inset(0 0 0 0) + opacity 0→1）
   - 加 className="we-chapter-divider"

4) frontend/src/components/book/ChapterDivider.jsx（新建）
   - Props: { chapterIndex, title }
   - 结构：
     <header className="we-chapter-header">
       <div className="we-chapter-num">第 {中文数字或阿拉伯} 章</div>
       <h2 className="we-chapter-title">{title}</h2>
       <div className="we-chapter-fleuron"><span>❦</span></div>
     </header>
   - chapter-num: font-family display, font-size 10px, letter-spacing 0.5em, uppercase, color ink-faded
   - chapter-title: font-family display italic, font-size 22px, weight 300, color ink-primary, margin-bottom 14px
   - chapter-fleuron: 同 FleuronLine 结构，symbol '❦'，横线用 gold-leaf 金色渐变（opacity 0.7）
   - 进入视口 inkRise 动画（inkRise 已在 motion.js）
   - 中文数字转换：前 10 章用"一二三四五六七八九十"，10 以上用阿拉伯

5) frontend/src/components/book/PageFooter.jsx（新建）
   - Props: { chapterIndex, pageIndex = 1, worldName }
   - 三列 flex：左 "第N章 · 第N页"，中 "❧" gold-leaf 15px opacity 0.65，右 worldName
   - 所有文字：font-family display italic, font-size 10.5px, letter-spacing 0.08em, color ink-faded, opacity 0.7
   - margin-top: 12px; 不加 border-top（已被输入区顶部 border 替代）

6) frontend/src/components/chat/MessageList.jsx
   - import groupMessagesIntoChapters
   - 在 render 时先分组，然后按章节渲染：
     chapters.map(chapter => (
       <div className="we-chapter" key={chapter.chapterIndex}>
         <ChapterDivider chapterIndex={chapter.chapterIndex} title={chapter.title} />
         {chapter.messages.map((msg, i) => {
           const isChapterFirstAssistant = msg.role === 'assistant' && 
             chapter.messages.findIndex(m => m.role === 'assistant') === i;
           return (
             <>
               <MessageItem key={msg.id} message={msg} isChapterFirstAssistant={isChapterFirstAssistant} />
               {/* 每对 user+assistant 后插入 FleuronLine，不在最后一条后插 */}
               {shouldInsertFleuron(chapter.messages, i) && <FleuronLine key={`fl-${msg.id}`} />}
             </>
           );
         })}
       </div>
     ))
   - shouldInsertFleuron 规则：当前是 assistant 消息 且 不是章节最后一条

7) frontend/src/components/book/PageRight.jsx
   - 在主内容区下、输入区下方挂 <PageFooter chapterIndex={currentChapter} worldName={currentWorld?.name} />
   - 从 props 或 context 取数据；简化实现时从 store 读 currentWorldId 再查本地 cache，或接受 PageRight 的 props 透传

约束：
- 不改 @frontend/src/api/* 任何文件
- 章节分组逻辑必须是纯函数，可单测
- 不动 MessageItem 内部（只加一个 prop）
- 场景分隔线数量不能过多，每一对对话后插一条即可
- 稳定类名 we-chapter / we-chapter-header / we-chapter-divider 必须保留
```

**验证方法**：
1. ChatPage 消息列表有章节分组，第一组上方有章节头（章节号 + 标题 + 金色花饰）
2. 每对 user+assistant 消息之间有 ※ 场景分隔线
3. 滚动时 FleuronLine 进入视口有从中心展开动画
4. 每章首条 assistant 消息有 Drop Cap（验证 isChapterFirstAssistant 传值正确）
5. 页面右下有页脚：左"第N章 · 第N页" 中"❧" 右世界名
6. 消息超过 20 条后自动起新章节
7. `groupMessagesIntoChapters` 有可被单测的行为

---

### T66 ⬜ 未开始 路由/模态框动画 + SSE 召回指示（蜡烛）

**这个任务做什么**：按 DESIGN §6.1 / §7.8 / §8.6 / §9.2 实现路由切换 pageTransition 动画、ModalShell 羊皮纸化、CandleFlame SVG，接入 SSE `memory_recall_*` 事件显示召回指示。

**涉及文件**：
- `frontend/src/components/book/PageTransition.jsx` — 新建
- `frontend/src/components/book/CandleFlame.jsx` — 新建
- `frontend/src/components/ui/ModalShell.jsx` — 重写样式
- `frontend/src/App.jsx` — 包 PageTransition
- `frontend/src/pages/ChatPage.jsx` — 接入 SSE 召回事件
- `frontend/src/components/book/StatePanel.jsx`（T64 新建）— 通过 prop/context 接收 SSE 召回数据，填充 MarginaliaList

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §6.1/§7.8/§8.6/§9.2 @frontend/src/App.jsx @frontend/src/components/ui/ModalShell.jsx @frontend/src/pages/ChatPage.jsx @frontend/src/api/chat.js @ARCHITECTURE.md §7 的现有内容。

目标：实现页面切换与模态动画统一视觉语言；召回事件有视觉反馈。

1) frontend/src/components/book/PageTransition.jsx（新建）
   - Props: { children }
   - 用 framer-motion 的 <AnimatePresence mode="wait">
   - 内层 motion.div：key = useLocation().pathname
   - initial { opacity:0, y:12, scale:0.98 }，animate { opacity:1, y:0, scale:1 }，exit { opacity:0, y:-8, scale:0.99 }
   - transition duration=0.5 ease=MOTION.ease.page

2) frontend/src/components/book/CandleFlame.jsx（新建）
   - Props: { visible }
   - 绝对定位 top:16px left:16px z-index:30
   - 内部 SVG 16x24，火焰形状 path，底部光晕椭圆（按 DESIGN §8.6 代码）
   - 火焰 path 上 animateTransform scale 微抖（values="1,1;1.05,0.95;0.95,1.05;1,1" dur=0.8s repeatCount=indefinite）
   - 外层包 framer-motion AnimatePresence：visible=true 时淡入；false 时淡出 300ms

3) frontend/src/components/ui/ModalShell.jsx
   - 背景蒙版改为 rgba(42,31,23,0.6)，用 motion.div fade 入场
   - 内容容器：background var(--we-paper-base)，border var(--we-border)，border-radius var(--we-radius-sm)
   - 入场动画：motion.div initial { opacity:0, scale:0.96 }，animate { opacity:1, scale:1 }，transition duration 0.25 ease=MOTION.ease.ink
   - 关闭按钮 ✕：color var(--we-ink-faded)；hover color var(--we-ink-primary)
   - padding 内容区 32px 40px
   - 保留所有现有 props 与关闭逻辑

4) frontend/src/App.jsx
   - 在 <Routes> 外层用 <PageTransition> 包裹
   - 注意 TopBar 保持在 PageTransition 外，不参与动画

5) frontend/src/pages/ChatPage.jsx
   - 在组件内新增 useState recallVisible 与 recalledItems
   - 在 SSE 事件订阅（当前 chat 发送逻辑内部）：
     - 收到 type='memory_recall_start' → setRecallVisible(true)
     - 收到 type='memory_recall_done' 且 payload.hit > 0 → setRecalledItems(payload.items 或从 backend 返回的可读结构)；300ms 后 setRecallVisible(false)
     - 收到 type='memory_recall_done' 且 payload.hit = 0 → 直接 setRecallVisible(false)
     - memory_expand_done 后刷新 MarginaliaList 数据源
   - 在 PageRight 内（或 ChatPage 层面绝对定位）render <CandleFlame visible={recallVisible} />
   - 将 recalledItems 通过 props 传给 StatePanel（ChatPage → StatePanel → MarginaliaList）
     ChatPage 新增 prop: recalledItems={recalledItems} 传给 StatePanel
   - StatePanel 将 recalledItems 向下传给 MarginaliaList
   - 若当前 memory_recall_done payload 无完整召回内容，先以 hit 数量作为占位数据（显示 N 条召回）

6) frontend/src/components/book/StatePanel.jsx（T64 已建）
   - 新增 prop: recalledItems（默认 []）
   - 将 recalledItems 传给内部 MarginaliaList

约束：
- 不改 @frontend/src/store/index.js
- 不改后端 SSE 协议
- 不改 @frontend/src/api/chat.js 的 fetch 流程，只在订阅回调里扩展
- PageTransition 的 key 必须用 pathname，避免同页面内 state 变更触发动画
- SSE 事件种类完整参见 ARCHITECTURE.md §7，不得臆造事件
```

**验证方法**：
1. WorldsPage → ChatPage 切换有整页淡入上移动画
2. 打开任意 Modal（如新建会话对话框）：黑色墨水蒙版淡入，内容 scale 入场
3. 发送消息时右页左上角出现摇曳蜡烛火焰 SVG
4. 召回完成后蜡烛淡出；召回数据反映到右侧 StatePanel 的 RECALLED 召回批注区（inkRise 淡入）
5. 无召回命中（hit=0）时蜡烛正常淡出，不报错
6. 路由切换期间 TopBar 不重渲染（无闪烁）

---

## 阶段 8：前端羊皮纸化 · 其他页面（PARCHMENT-PAGES）

> 目标：基础 UI 组件、世界列表、世界/角色/人设编辑页、设置页全部羊皮纸化。完成后 App 无残留旧风格区域。

### T67 ⬜ 未开始 基础 UI 组件羊皮纸化：Button / Input / Textarea / Card / Badge

**这个任务做什么**：按 DESIGN §7 重构 components/ui/ 下的原子组件，统一改用 `--we-*` 变量、古籍风格（低圆角、羊皮纸底、朱砂强调）。

**涉及文件**：
- `frontend/src/components/ui/Button.jsx` — 重写样式
- `frontend/src/components/ui/Input.jsx` — 重写样式
- `frontend/src/components/ui/Textarea.jsx` — 重写样式
- `frontend/src/components/ui/Card.jsx` — 重写样式
- `frontend/src/components/ui/Badge.jsx` — 重写样式
- `frontend/src/styles/ui.css` — 新建，集中 UI 组件样式

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §7 @frontend/src/components/ui/Button.jsx @frontend/src/components/ui/Input.jsx @frontend/src/components/ui/Textarea.jsx @frontend/src/components/ui/Card.jsx @frontend/src/components/ui/Badge.jsx 的现有内容。

目标：基础 UI 组件统一羊皮纸风格；API 不变，仅样式重构。

1) frontend/src/styles/ui.css（新建）
   - 定义以下类并在 main.jsx import（顺序：tokens → fonts → chat → ui → index）
   - .we-btn（基础）：font-family var(--we-font-serif); font-size:15px; padding:8px 16px; border-radius:var(--we-radius-none); border:1px solid var(--we-paper-shadow); background:transparent; color:var(--we-ink-secondary); cursor:pointer; transition: all 0.18s;
   - .we-btn:hover { border-color: var(--we-ink-faded); background: rgba(0,0,0,0.03); }
   - .we-btn-primary：background var(--we-vermilion); color:var(--we-paper-base); border-color var(--we-vermilion); hover bg var(--we-vermilion-deep)
   - .we-btn-ghost：border:1px dashed var(--we-vermilion); color:var(--we-vermilion); bg transparent; hover bg var(--we-vermilion-bg)
   - .we-btn-danger：color var(--we-vermilion); border-color var(--we-vermilion-deep); hover bg var(--we-vermilion-bg)
   - .we-btn-icon：width:32px height:32px padding:0 display:inline-flex center
   - .we-input, .we-textarea：background rgba(0,0,0,0.035); border:1px solid var(--we-paper-shadow); border-radius var(--we-radius-none); padding 10px 14px; font-family var(--we-font-serif); font-size 15.5px; color var(--we-ink-primary); outline none; line-height 1.75; transition border-color 0.2s, background 0.2s;
   - .we-input:focus, .we-textarea:focus { border-color: var(--we-ink-faded); background: rgba(0,0,0,0.02); }
   - .we-input::placeholder, .we-textarea::placeholder { color: var(--we-ink-faded); font-style:italic; }
   - .we-card：background var(--we-paper-base); border:1px solid var(--we-paper-shadow); border-radius var(--we-radius-sm); padding 20px;
   - .we-card-aged：background var(--we-paper-aged); 其余同 we-card
   - .we-badge：display inline-flex; padding:2px 8px; font-family var(--we-font-display); font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color var(--we-ink-faded); border:1px solid var(--we-paper-shadow); border-radius var(--we-radius-none);
   - .we-badge-vermilion { color var(--we-vermilion); border-color var(--we-vermilion); background var(--we-vermilion-bg); }

2) 改写各组件：
   - Button.jsx：接受 variant=default|primary|ghost|danger|icon；根据 variant 拼接 we-btn + we-btn-*；保留所有原 props
   - Input.jsx：外层加 we-input 类；保留 ref 与所有原 props
   - Textarea.jsx：外层加 we-textarea 类
   - Card.jsx：默认 we-card；prop aged=true 时 we-card-aged
   - Badge.jsx：默认 we-badge；variant='vermilion' 时 we-badge-vermilion

约束：
- 必须保留每个组件原有的所有 props 和 API
- 不改任何使用这些组件的调用点（保持 props 约定）
- 所有 use 组件的页面不需要在本任务内修改，会在后续 T68-T70 随页面改造
- 不得引入新的 css-in-js 库
```

**验证方法**：
1. 所有使用 Button/Input/Textarea/Card/Badge 的现有页面仍可正常显示，无布局崩溃
2. 按钮出现羊皮纸底 + 朱砂 primary；输入框低圆角、羊皮纸底色
3. devtools 检查 DOM 类名含 `we-btn`、`we-input` 等
4. Variant 切换正确：`<Button variant="primary">` 显示朱砂色

---

### T68 ⬜ 未开始 WorldsPage 卷宗书架

**这个任务做什么**：按 DESIGN §6.2 把 WorldsPage 改造为"卷宗书架"卡片布局，世界卡以纸页叠放风格呈现。

**涉及文件**：
- `frontend/src/pages/WorldsPage.jsx` — 重写 JSX + 样式
- `frontend/src/styles/pages.css` — 新建，页面级样式

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §6.2 @frontend/src/pages/WorldsPage.jsx @frontend/src/api/worlds.js 的现有内容。

目标：WorldsPage 呈现为羊皮纸卷宗书架，所有现有功能保留。

1) frontend/src/styles/pages.css（新建）
   - .we-worlds-canvas：min-height calc(100vh - 40px); background var(--we-book-bg); padding 48px 24px; 加噪点背景（可引用 ParchmentTexture 组件或内联 data URL）
   - .we-worlds-grid：display grid; grid-template-columns repeat(auto-fill, minmax(280px, 1fr)); gap 24px; max-width 1200px; margin 0 auto;
   - .we-world-card：background var(--we-paper-base); border:1px solid var(--we-paper-shadow); border-radius var(--we-radius-sm); padding 24px; position:relative; box-shadow 0 4px 12px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.03) inset; cursor:pointer; transition: transform 0.2s, box-shadow 0.2s;
   - .we-world-card:hover { transform: translateY(-3px); box-shadow 0 8px 20px rgba(0,0,0,0.25); }
   - .we-world-card-name：font-family var(--we-font-display); font-size 22px; font-style italic; weight 300; color var(--we-ink-primary); margin-bottom 8px;
   - .we-world-card-desc：font-family var(--we-font-serif); font-size 14px; line-height 1.7; color var(--we-ink-secondary); 截断 3 行（line-clamp）;
   - .we-world-card-meta：font-family var(--we-font-display); font-size 10px; letter-spacing 0.2em; uppercase; color var(--we-ink-faded); margin-top 16px; display flex gap 12px;
   - .we-world-card-seal：绝对定位 top 16px right 16px；小圆 16x16，背景色用该世界的 id hash 颜色
   - .we-world-create-fab：fixed bottom 32px right 32px; width 56px height 56px border-radius 50% background var(--we-vermilion) color var(--we-paper-base); display flex center; box-shadow 0 8px 20px rgba(0,0,0,0.3); cursor pointer; transition transform 0.15s;
   - .we-world-create-fab:hover { transform: scale(1.05); }
   - .we-worlds-empty：center 显示，padding 80px 0；文字"尚无世界记录" font-display italic 18px ink-faded
   - 在 main.jsx 引入 pages.css

2) frontend/src/pages/WorldsPage.jsx
   - 外层 <div className="we-worlds-canvas">
   - 内层标题区：<h1> "博物志 · 卷宗书架" 大号 display italic
   - <div className="we-worlds-grid">
     worlds.map(w => (
       <div className="we-world-card" onClick=>跳转 /worlds/:id/chat>
         <div className="we-world-card-seal" style={{background:getAvatarColor(w.id).bg}} />
         <h3 className="we-world-card-name">{w.name}</h3>
         <p className="we-world-card-desc">{w.description}</p>
         <div className="we-world-card-meta">
           <span>{characterCount} 角色</span>
           <span>·</span>
           <span>{relativeTime(w.updated_at)}</span>
         </div>
       </div>
     ))
   - 右下角 <button className="we-world-create-fab" onClick=>跳转 create页>+</button>
   - 无世界时显示 .we-worlds-empty + 中心"新建世界"按钮
   - 保留原 API 调用（getWorlds、deleteWorld 等）；删除/编辑以右键菜单或 hover 按钮提供（用现有 Modal 实现，样式走 ModalShell）

约束：
- 不改 @frontend/src/api/worlds.js
- 所有 CRUD 功能保留：新建/编辑/删除/导出
- 不改路由定义，只改按钮跳转
- 相对时间戳函数若无公共实现，在本任务内建一个简易的（X分钟前/小时前/天前）
```

**验证方法**：
1. WorldsPage 显示为卷宗卡片网格
2. 每张卡片有世界名、描述、角色数、最近更新时间
3. Hover 卡片有上浮 + 阴影加深
4. 右下角有朱砂圆形"+"新建按钮
5. 无世界时显示空状态
6. 点击卡片进入对应世界；删除/编辑功能正常

---

### T69 ⬜ 未开始 World / Character / Persona 编辑页羊皮纸化

**这个任务做什么**：按 DESIGN §6.3 / §6.4 / §6.5 重构世界编辑、角色编辑、人设编辑页，采用整页羊皮纸 + 分区标签布局（PersonaEdit 采用侧边滑入面板）。

**涉及文件**：
- `frontend/src/pages/WorldCreatePage.jsx` / `WorldEditPage.jsx`
- `frontend/src/pages/CharacterCreatePage.jsx` / `CharacterEditPage.jsx`
- `frontend/src/pages/PersonaEditPage.jsx`
- `frontend/src/components/book/SectionTabs.jsx` — 新建，标签式分区组件

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §6.3/§6.4/§6.5 @frontend/src/pages/WorldEditPage.jsx @frontend/src/pages/CharacterEditPage.jsx @frontend/src/pages/PersonaEditPage.jsx 的现有内容。

目标：编辑页统一羊皮纸整页布局，按章节化分区组织表单。

1) frontend/src/components/book/SectionTabs.jsx（新建）
   - Props: { sections: [{ key, label, content }], defaultKey }
   - 顶部水平标签栏：每个标签 padding 10px 16px，font-display italic 13px；active 底部 1px var(--we-gold-leaf) 下划线 + color ink-primary；inactive color ink-faded
   - 标签栏下方 12px 分隔：1px 横线 + 中心 ❦ 金色（复用 FleuronLine 样式或内联）
   - 内容区：有 AnimatePresence fade 过渡

2) WorldEditPage（WorldCreatePage 同理，复用表单组件）：
   - 整体用 BookSpread 风格，但不用双页；改用单页羊皮纸面板：外层 div 背景 var(--we-book-bg)，内层面板 max-width 960px margin 32px auto background var(--we-paper-base) padding 48px
   - 顶部：面包屑 / 返回链接 + 大标题 "编辑世界 · {name}"（display italic 28px）
   - 内容用 <SectionTabs>，sections：
     - basic：世界名、描述、System Prompt、Post Prompt
     - llm：temperature、max_tokens、context_history_rounds（若有）
     - state_templates：世界状态字段 / 角色状态模板 / 玩家状态字段（沿用 StateFieldList + StateFieldEditor）
     - prompt_entries：世界级 Prompt 条目（沿用 EntryList + EntryEditor）
     - timeline：只读展示 + 手动添加/删除条目
     - export：导出世界卡 .weworld.json / 导入
   - 保留所有现有表单控件与 API 调用
   - 底部"保存"按钮：Button variant primary，右下固定或标签内部底部

3) CharacterEditPage / CharacterCreatePage：
   - 同样单页布局
   - sections：basic（头像 + 角色名 + System Prompt + Post Prompt）/ state_init（character state values，按世界模板）/ prompt_entries（角色级条目）/ export
   - 头像区：印章样式（用 CharacterSeal 或同风格圆形上传框）

4) PersonaEditPage：
   - 不做整页，改为侧边滑入抽屉
   - 从 TopBar "玩家人设"入口触发
   - 用 framer-motion 实现从右侧滑入 Drawer：宽 400px，背景 var(--we-paper-base)，内部上下排：头像 + 玩家名 + system_prompt + persona state fields/values
   - 关闭：点击遮罩或 ✕
   - 若原来是整页，保留原路由但里面的 UI 改为轻量表单，顶部加"可从 TopBar 快速打开"提示

5) 状态/Prompt 条目子编辑器（StateFieldEditor / EntryEditor 等）
   - 不大改结构，只替换 Button/Input 为 T67 改造后的版本
   - 标签、按钮文字保持原样

约束：
- 不改 @frontend/src/api/* 任何文件
- 所有 CRUD / 导入导出功能必须保留
- 不动 @frontend/src/components/state/StateFieldEditor.jsx 内部逻辑；只换 UI 原子组件
- 不动 @frontend/src/components/prompt/EntryEditor.jsx 内部逻辑
- 路由保持原样
```

**验证方法**：
1. 打开世界编辑页：整页羊皮纸面板 + 6 个分区标签
2. 每个分区内的字段/列表可正常增删改查
3. 角色编辑页同理，4 个分区
4. PersonaEdit 从 TopBar 入口可打开侧边滑入抽屉
5. 世界导出 .weworld.json / 角色导出 .wechar.json 正常工作，JSON 内容不变（只是 UI 改）
6. 保存后回到列表页数据正确

---

### T70 ⬜ 未开始 SettingsPage 双栏 + CustomCssManager 引导

**这个任务做什么**：按 DESIGN §6.6 / §10.3 重构设置页为左导航 + 右内容双栏；CustomCssManager 顶部加入"推荐选择器参考"可折叠引导。

**涉及文件**：
- `frontend/src/pages/SettingsPage.jsx`
- `frontend/src/components/settings/CustomCssManager.jsx`
- `frontend/src/components/settings/RegexRulesManager.jsx` — 仅样式随 T67 更新（本任务内顺带检查）

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §6.6/§10.3 @frontend/src/pages/SettingsPage.jsx @frontend/src/components/settings/CustomCssManager.jsx 的现有内容。

目标：设置页双栏布局，自定义 CSS 编辑器增加稳定选择器引导。

1) frontend/src/pages/SettingsPage.jsx
   - 外层单页羊皮纸面板（同 T69 单页布局）
   - 布局：display flex
   - 左栏：width 220px，padding 32px 16px，border-right 1px solid var(--we-paper-shadow)
     - 分类列表：LLM 配置 / 全局 Prompt / 自定义 CSS / 正则规则 / 全局 Prompt 条目 / 关于
     - 每项 font-display italic 14px padding 10px 14px；active 左 2px var(--we-vermilion) 竖线 + bg var(--we-vermilion-bg)；hover bg var(--we-paper-shadow) opacity 0.3
   - 右栏：flex 1 padding 32px 48px
     - useState activeSection，根据 activeSection 渲染对应子组件
   - 分类内容：
     - LLM 配置：Provider 下拉 / API Key / Base URL / temperature / max_tokens
     - 全局 Prompt：global_system_prompt / global_post_prompt Textarea
     - 自定义 CSS：<CustomCssManager />
     - 正则规则：<RegexRulesManager />
     - 全局 Prompt 条目：现有 EntryList + EntryEditor
     - 关于：版本号 / 重置数据库按钮（保留原逻辑）

2) frontend/src/components/settings/CustomCssManager.jsx
   - 顶部加入可折叠 <details> 或 framer-motion 手写折叠块："推荐选择器参考"
   - 默认折叠；展开后显示一段代码块（用 <pre> 或 Markdown），内容为 DESIGN §10.3 的示例 CSS：
     /* 推荐：改变量协调换肤 */
     :root { --we-paper-base: #e8dcc8; --we-vermilion: #8b2e24; }
     /* 推荐：改消息样式 */
     .we-message-assistant .we-message-content { font-size: 18px; }
     /* 推荐：改用户消息边线 */
     .we-message-user { border-left-color: #4a7c8b; }
   - 下方加一行简短说明："稳定锚点类名清单见 DESIGN.md §10.2，标 ⚠️ 的类名可能随版本变化请谨慎。"
   - 列表项、编辑器表单沿用现有逻辑，仅把 Button/Input/Textarea 替换为 T67 版本

3) frontend/src/components/settings/RegexRulesManager.jsx
   - 仅检查并替换 Button/Input/Textarea 为 T67 版本；不改逻辑

约束：
- 不改 @frontend/src/api/* 
- 所有现有功能保留：CRUD 规则/CSS、启用禁用、排序
- 不改后端
- 稳定类名引导必须准确反映 DESIGN §10.2 的清单
```

**验证方法**：
1. SettingsPage 左侧分类导航可切换
2. 每个分类内容正常：LLM 设置、全局 Prompt、自定义 CSS、正则规则、Prompt 条目、关于
3. CustomCssManager 顶部折叠块可展开，内含示例 CSS
4. 自定义 CSS / 正则规则 CRUD 正常
5. 重置数据库按钮仍可用

---

## 阶段 9：前端羊皮纸化 · 收尾（PARCHMENT-POLISH）

> 目标：写作空间适配书本布局；inline marginalia、羽毛笔、盖印动画、减少动效开关全部就位。完成后整个前端改造收尾。

### T71 ⬜ 未开始 写作空间变体 + Inline Marginalia

**这个任务做什么**：按 DESIGN §6.7 / §7.3 为 WritingSpacePage 实现双页变体（左页改为激活角色 / 多角色状态 Tab），右页消息支持 inline marginalia。

**涉及文件**：
- `frontend/src/pages/WritingSpacePage.jsx`
- `frontend/src/components/book/ActiveCharactersPanel.jsx` — 新建
- `frontend/src/components/book/MultiCharacterStatusPanel.jsx` — 新建
- `frontend/src/components/book/InlineMarginalia.jsx` — 新建
- `frontend/src/components/chat/MessageItem.jsx` — 支持 marginalia prop

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md @DESIGN.md §6.7/§7.3 @frontend/src/pages/WritingSpacePage.jsx @frontend/src/api/writingSessions.js @frontend/src/components/writing/ActiveCharactersPicker.jsx @frontend/src/components/writing/MultiCharacterMemoryPanel.jsx 的现有内容。

目标：写作空间适配双页书本，多角色状态清晰展示。

1) frontend/src/components/book/ActiveCharactersPanel.jsx（新建）
   - 封装 ActiveCharactersPicker 的激活角色添加/移除功能
   - 激活角色列表：每项显示 CharacterSeal 缩略 + 角色名 + 移除按钮
   - 底部"添加角色"按钮 → 弹出可选角色列表（Modal）

2) frontend/src/components/book/MultiCharacterStatusPanel.jsx（新建）
   - 多角色的 character_state_values 纵向折叠列表
   - 每个角色一个折叠块（标题 = 角色名 + 印章色点），展开显示 <StatusBar />
   - 默认全部折叠，第一个展开

3) frontend/src/components/book/InlineMarginalia.jsx（新建）
   - Props: { text, date }
   - 绝对定位 right -200px top 24px width 170px
   - font-family serif font-size 11px line-height 1.55 color var(--we-vermilion) italic
   - opacity 0；动画 inkRise delay 1.4s（只在 desktop 显示，<1024px 隐藏）

4) frontend/src/components/chat/MessageItem.jsx
   - 新增可选 prop marginalia: { text, date } | null
   - 若存在则在外层 we-message-row 内绝对定位挂 <InlineMarginalia />
   - 目前 marginalia 数据来源仅限写作模式且可由上层传入；非写作模式 MessageList 不传此 prop

5) frontend/src/pages/WritingSpacePage.jsx
   - 用 BookSpread 包裹
   - PageLeft 内 <PageLeftTabs tabs=[{角色: <ActiveCharactersPanel/>}, {状态: <MultiCharacterStatusPanel/>}]>
   - PageRight：WritingMessageList（现有组件）嵌入；如其内部已引用 MessageItem 则调整为支持章节分组与 inline marginalia（参考 T62/T65 模式）
   - 保留所有现有写作空间 API 调用

约束：
- 不改 @frontend/src/api/writingSessions.js
- 多角色发言区分：WritingMessageItem 已存在发言人标签，保持不变
- inline marginalia 数据在本任务仍以占位为主；真实数据源（如 SSE 或 turn record 中的 state delta）在后续任务对接
- <1024px 响应式隐藏 inline marginalia 不视为缺陷
```

**验证方法**：
1. 打开 WritingSpacePage，左页 Tab 切换 [角色] / [状态]
2. 激活角色可添加/移除
3. 多角色状态各自折叠展开正常
4. 发送消息 / 切换角色发言正常
5. inline marginalia 在桌面宽度显示；窗口缩窄后隐藏不报错

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
