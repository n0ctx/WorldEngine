# WorldEngine · 设计规格 v2

> 权威来源：本文件描述视觉/交互规格。架构见 `ARCHITECTURE.md`，数据库见 `SCHEMA.md`，约束见 `CLAUDE.md`。
> 最后更新：2026-04-17

---

## §1 核心概念

**"一本正在被书写的博物志手稿"**

不是"带羊皮纸背景的聊天软件"——用户是在翻阅并共创一本古籍。每一次对话都是在手稿上落笔，每一段记忆都是页边批注，每一个角色都有自己的朱砂印章。

### 1.1 风格定位

| 维度 | 定义 |
|---|---|
| 大类风格 | MUD / 文字冒险 |
| 美术分支 | 羊皮纸古籍派（Parchment Tome） |
| 参照原型 | 中世纪博物志手稿、武侠秘籍、西方奇幻日志 |
| 核心体验 | 仪式感、沉浸、克制的装饰、"书写中"的临场感 |

### 1.2 区别于俗套奇幻 UI 的三件事

1. **不做 HUD**：没有浮动血条、技能图标、经验值条——状态以古籍批注样式呈现
2. **不做高饱和棕金**：朱砂 + 铁胆墨 + 褪色纸是主调，金色仅作克制点缀
3. **真正的古籍排版**：章节分隔（Fleuron）、首字下沉（Drop Cap）、页边批注（Marginalia）、朱砂闲章（Seal）

---

## §2 CSS 变量体系

所有视觉 token 以 `--we-*` 前缀统一管理。实现于 `/frontend/src/styles/tokens.css`，全局注入。

### 2.1 纸基三层

```css
--we-paper-base:    #ede3d0;   /* 新纸·右页底色 */
--we-paper-aged:    #d9ccb0;   /* 旧化·左页底色 */
--we-paper-shadow:  #c8b99a;   /* 页脚/折叠阴影 */
--we-paper-deep:    #b8a882;   /* 最深纸面层（折角/装饰） */
--we-book-bg:       #4a3728;   /* 书本外部背景（木桌色） */
```

### 2.2 墨水色系

```css
--we-ink-primary:    #2a1f17;   /* 深铁胆墨·主文字 */
--we-ink-secondary:  #534236;   /* 灰烬墨·次级文字 */
--we-ink-faded:      #8a7663;   /* 褪色墨·标签/说明文字 */
```

### 2.3 朱砂系（主强调色）

```css
--we-vermilion:       #a23b2e;   /* 朱砂·印章/强调 */
--we-vermilion-deep:  #7c2a20;   /* 干涸朱砂·悬停/按下 */
--we-vermilion-bg:    rgba(162,59,46,0.08);  /* 朱砂浅底 */
```

### 2.4 金箔系（装饰专用，克制使用）

```css
--we-gold-leaf:  #a0833f;   /* 金箔·分隔线/印章边框 */
--we-gold-pale:  #c9a85a;   /* 淡金·悬停高亮 */
```

### 2.5 功能色（融入风格，非原生 red/green）

```css
--we-moss:   #5c6b3a;   /* 苔藓绿·生命/正常状态 */
--we-amber:  #8b5a1f;   /* 琥珀棕·警示/用户消息边线 */
--we-slate:  #4a5568;   /* 石板灰·禁用/不活跃 */
```

### 2.6 UI 功能变量

```css
--we-border:         1px solid var(--we-paper-shadow);
--we-border-faint:   1px solid rgba(200,185,154,0.5);
--we-radius-sm:      2px;
--we-radius-md:      4px;
--we-radius-none:    1px;   /* 古籍风：几乎无圆角 */
--we-spine-shadow:   linear-gradient(to right,
    rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.06) 12%,
    transparent 25%, transparent 75%,
    rgba(0,0,0,0.06) 88%, rgba(0,0,0,0.22) 100%);
```

---

## §3 字体系统

### 3.1 字体选型

| 用途 | 中文字体 | 英文/数字字体 | 来源 |
|---|---|---|---|
| **正文/对话** | 思源宋体 Source Han Serif | EB Garamond | Google Fonts |
| **标题/章节** | 霞鹜文楷 LXGW WenKai | Cormorant Garamond | Google Fonts |
| **印章/角色名** | ZCOOL XiaoWei | Cormorant Garamond Italic | Google Fonts |
| **状态数字/等宽** | JetBrains Mono | JetBrains Mono | Google Fonts |

**禁止**：Inter、Roboto、Arial、系统默认无衬线字体、Noto Sans（太现代）。

### 3.2 字号体系

```css
--we-text-xs:    11px;   /* 批注/日期/页边小字 */
--we-text-sm:    13px;   /* 标签/状态值 */
--we-text-base:  16.5px; /* 对话正文 */
--we-text-md:    18px;   /* 章节副标题 */
--we-text-lg:    22px;   /* 章节主标题 */
--we-text-xl:    28px;   /* 页面大标题 */

--we-leading-tight:   1.3;
--we-leading-normal:  1.75;
--we-leading-loose:   1.95;  /* 对话正文行高 */
```

### 3.3 字体使用规则

- 对话正文：EB Garamond / 思源宋体，`--we-text-base`，`--we-leading-loose`
- 角色发言人标签：Cormorant Garamond，`--we-text-xs`，全大写，letter-spacing 0.28em
- 章节标题：Cormorant Garamond Italic，`--we-text-lg`，font-weight 300
- 状态数值：JetBrains Mono，`--we-text-sm`
- 印章文字：ZCOOL XiaoWei，按印章尺寸

---

## §4 配色使用规则

### 正文内容区
- 背景：`--we-paper-base`
- 主文字：`--we-ink-primary`
- 次级文字：`--we-ink-secondary`
- 标签/说明：`--we-ink-faded`

### 左侧面板
- 背景：`--we-paper-aged`（比右页略深，营造左页旧化感）
- 印章：`--we-vermilion`
- 状态批注：`--we-ink-faded`（键）+ `--we-ink-secondary`（值）
- 记忆召回批注：`--we-vermilion`（细竖线 + 日期文字）

### 强调 / 交互
- 主按钮：`--we-vermilion` 背景，`--we-paper-base` 文字
- 次级按钮：`--we-paper-shadow` 背景，`--we-ink-secondary` 文字
- 用户消息边线：`--we-amber`
- 金箔装饰：仅在分隔线、印章边框、章节标题下线使用

### 功能色使用
- 进度条（生命/资源）：`--we-moss`（绿）或 `--we-amber`（橙），由状态字段配置决定
- 警示状态：`--we-amber`
- 禁用元素：`--we-slate`，透明度 0.5

---

## §5 整体布局结构

### 5.1 层级结构

```
[TopBar]        全局导航：世界选择 | 写作 | 设置
[BookSpread]    三栏书本展开
  ├─ [PageLeft]      左页 260px：会话列表
  ├─ [PageRight]     中页 flex:1：章节头 + 对话区 + 输入区
  └─ [StatePanel]    档案侧页 280px：角色档案 + 状态 + 时间线 + 召回批注
```

### 5.2 TopBar

**高度**：40px  
**背景**：`#3d2e22`（深于书本背景，形成地基感）  
**边框底部**：`1px solid rgba(255,255,255,0.06)`

**元素排列（左→右）**：
- `[世界选择器]`：当前世界名，点击展开世界列表下拉；首次无世界时显示「新建世界」
- `·` 分隔
- `[会话模式]` / `[写作]`：切换当前页面模式（仅在进入世界后可见）
- **右侧**：`[玩家人设]` 图标 | `[设置]` 齿轮图标

字体：Cormorant Garamond Italic，`--we-text-sm`，颜色 `rgba(255,255,255,0.5)`，active 时 `--we-gold-pale`

### 5.3 PageLeft（左页）

**宽度**：260px（固定），可折叠至 40px（书脊模式）  
**背景**：`--we-paper-aged`  
**右侧书脊阴影**：`--we-spine-shadow` 右侧部分

左页仅包含会话列表，**无 Tab 切换**。

**内容（顺序）**：

1. `[新建会话]` 按钮（朱砂文字 + 虚线边框，仿"加盖印章"样式）
   - width 100%，padding 9px，border 1px dashed `--we-vermilion`
   - color `--we-vermilion`，background transparent
   - hover: background `--we-vermilion-bg`
2. 会话列表（可滚动，flex:1）：
   - 每条：角色头像（24px 印章圆形）+ 会话标题（截断，EB Garamond 13.5px）+ 最近时间戳（10px italic ink-faded）
   - Active 会话：左侧 2px `--we-vermilion` 竖线 + `--we-paper-shadow` 透明度 0.35 淡底色
   - Hover：`--we-paper-shadow` 透明度 0.25 淡底
   - 悬浮图标：重命名（铅笔 SVG）+ 删除（垃圾桶 SVG）+ 二次确认

折叠状态（书脊模式，Tablet）：左侧 40px 书脊，显示印章缩略，点击弹出 overlay 悬浮面板。

### 5.4 PageRight（中页·对话区）

**背景**：`--we-paper-base`  
**左侧书脊阴影**：`--we-spine-shadow` 左侧部分  
**Padding**：上 44px，左 60px，右 52px，下 28px

**内部结构（纵向）**：

```
[章节标题区]         章节号 + 标题 + 花饰分隔线
[对话区]             flex:1，可滚动，会话消息列表
[输入区]             textarea + 操作按钮行
[页脚]               第N章 · 第N页 · 世界名
```

**边注（inline marginalia）布局约束**：  
`.we-chat-area`（对话区）需设 `overflow-y: auto` 以支持滚动，但浏览器会同时裁剪水平溢出，导致绝对定位的边注被截断。  
实现方式：消息列表容器（`.we-messages-list`）设 `overflow: visible`，由其**祖先** `.we-page-right`（非滚动容器，`overflow: visible`）负责边注的定位基准；滚动容器单独包裹消息列表内部，不作为边注的 `offsetParent`。具体来说：

```
.we-page-right           overflow: visible（边注定位基准）
  └─ .we-chat-area       overflow-y: auto（滚动容器）
       └─ .we-messages-list   position: static（边注 absolute 向上冒泡到 .we-page-right）
            └─ .we-message    position: relative
                 └─ .we-marginalia   position: absolute; right: -180px（溢出到页面空白处）
```

Mobile（< 768px）下 inline marginalia 不显示（`display: none`），改为折叠标签展示。

**书签丝带**：绝对定位在右页右上角，朱砂色，标记当前章节。

### 5.5 StatePanel（档案侧页）

**宽度**：280px（固定），右侧可折叠（点击把手收起至 0）  
**背景**：`--we-paper-aged`（与左页同色，形成"前后封面"对称感）  
**左边框**：`1px solid var(--we-paper-shadow)`  
**左侧书脊阴影**：`--we-spine-shadow` 左侧渐变（12px）

**内部结构（纵向，整体可滚动）**：

```
┌────────────────────────────┐
│  [CharacterSeal 72px]      │  ← 印章或头像圆（见 §7.6）
│  角色名（ZCOOL XiaoWei 16px center，ink-primary）
│  世界名（10px italic ink-faded，center）
├────────────────────────────┤  ← 1px --we-gold-leaf 横线
│  CURRENT STATE  ━━━━━━━   │  ← 区块标题（见下方规范）
│  字段名 italic    值 normal │  ← .we-status-field 行
│  ▓▓▓▓░░ [进度条 3px]      │  ← number 类型
│                      [重置]│  ← .we-state-section-reset
├────────────────────────────┤
│  PLAYER  ━━━━━━━━━━━━━━━  │  ← 玩家状态
│  ...                       │
│                      [重置]│
├────────────────────────────┤
│  WORLD  ━━━━━━━━━━━━━━━━  │  ← 世界状态
│  ...                       │
│                      [重置]│
├────────────────────────────┤
│  TIMELINE  ━━━━━━━━━━━━━  │  ← 世界时间线（最近 5 条）
│  · 会话摘要（ink-secondary）│
│  · 旧史条目（opacity 0.5） │
├────────────────────────────┤
│  RECALLED  ━━━━━━━━━━━━━  │  ← 召回记忆批注（SSE 驱动）
│  │ 日期/来源（vermilion xs）│  ← 左侧 1.5px 朱砂竖线
│  │ 摘要（ink-faded xs）    │
└────────────────────────────┘
```

**区块标题样式（统一规范）**：
- font-family: `--we-font-display`，font-size: `--we-text-xs`（11px）
- letter-spacing: 0.28em，text-transform: uppercase，color: `--we-ink-faded`
- 下方跟 `1px solid var(--we-paper-shadow)` 横线，margin-bottom 8px

**重置按钮样式**：
- font-family: `--we-font-display`，font-style: italic，font-size: 10px
- color: `--we-ink-faded`，background: none，border: none，cursor: pointer
- hover: color `--we-vermilion`

**时间线条目格式**：
- 普通条目：`--we-ink-secondary`，13px，leading 1.6
- `is_compressed=1` 条目：前缀「旧史·」灰色小字，整体 opacity 0.5
- 最多显示 5 条

**召回记忆批注**（初始空，T66 接入 SSE）：格式同 §7.3 Marginalia 规范。

**折叠把手**：右边缘 12px 宽竖条（`--we-paper-deep` 背景），  
竖排文字「档案」（`--we-font-display`，10px，letter-spacing 0.3em，`--we-ink-faded`），  
点击后 StatePanel 以 180ms ease 收起至 0，把手保持悬浮在右边缘。

**CSS 锚点**：
```
.we-state-panel          档案侧页容器
.we-state-panel-header   印章 + 角色名头部
.we-state-section        每个状态区块（含标题+内容）
.we-state-section-title  区块标题
.we-state-section-reset  重置按钮
.we-timeline             时间线区块
```

---

## §6 页面规格

### 6.1 ChatPage（对话主页）

参见 §5 整体布局。额外规格：

**章节分组逻辑**：每 N 条消息（或超过一定时间间隔）自动分组为新"章节"，章节起始处绘制章节标题 + 花饰分隔线。N 默认 20，不可配置（视觉决定，非业务逻辑）。

**章节标题**：
- 章节号：Cormorant Garamond，`--we-text-xs`，letter-spacing 0.5em，全大写，`--we-ink-faded`
- 标题文字：Cormorant Garamond Italic，`--we-text-lg`，font-weight 300（若 `session.title` 存在则用之，否则"会话进行中"）
- 花饰：`❦`，`--we-gold-leaf`，两侧金色渐变横线

**SSE 状态指示**（不用 spinner，用古籍风格）：

| SSE 事件 | 视觉表现 |
|---|---|
| `memory_recall_start` | 右页左上角出现小蜡烛火焰 SVG 微动（"正在检索记忆"） |
| `memory_recall_done` | 火焰消失；若 hit>0，右侧 StatePanel 召回批注区（RECALLED 区块）以 inkRise 淡入新批注 |
| `memory_expand_start/done` | 无额外视觉，在 StatePanel 召回区显示最终结果 |
| `title_updated` | 章节标题区以 inkRise 动画更新 |
| `delta` | 流式文字 + 羽毛笔光标 |
| `done` | 光标消失；若 regenerate 可用则显示操作菜单 |
| `aborted` | 消息气泡尾部显示 `[已中断]` 小字 |

**消息操作菜单**（hover 右上角浮出，古籍风格小图标行）：
- 复制 | 重新生成 | 编辑（用户消息）| 继续（assistant 最后一条）| 朗读（可选）

### 6.2 WorldsPage（世界列表）

**布局**：卷轴/书架隐喻

- 背景：`--we-book-bg` + 噪点纹理
- 世界卡片：纸页样式，有轻微下方阴影（像叠放的书页）
  - 卡片内：世界名（大）+ 描述（小）+ 角色数量 + 最近对话时间
  - 右上角有该世界专属的印章颜色点
  - Hover：轻微 `y: -3px` 上浮 + 阴影加深
- 右下角浮动"新建世界"按钮：印章圆形样式，朱砂色
- 无世界时：显示空白羊皮纸 + 居中文字「尚无世界记录」+ 新建按钮

### 6.3 WorldEditPage / WorldCreatePage

**布局**：全屏羊皮纸面板（不用弹窗，用整页，体现编辑的"郑重感"）

**分区（标签式）**：

| 标签 | 内容 |
|---|---|
| **基础设定** | 世界名、描述、System Prompt、Post Prompt |
| **LLM 参数** | temperature、max_tokens（覆盖全局） |
| **状态模板** | 世界状态字段 / 角色状态模板字段 / 玩家状态字段（StateFieldList + StateFieldEditor） |
| **Prompt 条目** | 世界级 Prompt 条目（EntryList + EntryEditor） |
| **世界时间线** | 只读展示 + 手动添加 / 删除条目 |
| **导入导出** | 导出世界卡 `.weworld.json` / 导入 |

每个标签分区头部有花饰分隔线。表单样式：标签用 `--we-text-xs` 全大写，输入框羊皮纸底色，`--we-border`。

### 6.4 CharacterEditPage / CharacterCreatePage

**布局**：同 WorldEditPage，整页

**分区**：

| 标签 | 内容 |
|---|---|
| **角色设定** | 头像（印章样式圆形）、角色名、System Prompt、Post Prompt |
| **状态初始值** | character_state_values（基于世界模板，StateFieldEditor） |
| **Prompt 条目** | 角色级 Prompt 条目 |
| **导入导出** | 导出角色卡 `.wechar.json` / 导入 |

头像区：点击上传，上传后显示头像圆图；无头像时显示基于 id 的纯色印章圆（`getAvatarColor`）+ 首字。

### 6.5 PersonaEditPage（玩家人设）

**布局**：轻量侧边滑入面板（不需要整页，玩家设定相对简单）

内容：
- 玩家名（`persona.name`，对应 `{{user}}` 占位符）
- System Prompt（`persona.system_prompt`）
- 玩家状态字段定义（`persona_state_fields`）+ 当前状态值（`persona_state_values`）
- 头像上传（同角色头像样式）

### 6.6 SettingsPage（设置页）

**布局**：双列，左侧分类导航 + 右侧内容区

**分类**：

| 分类 | 内容 |
|---|---|
| **LLM 配置** | Provider（OpenAI/Ollama）、API Key、Base URL、全局 temperature/max_tokens |
| **全局提示词** | global_system_prompt、global_post_prompt |
| **自定义 CSS** | CustomCssManager（启用/禁用、编辑代码片段，参见 §10） |
| **正则规则** | RegexRulesManager（增删改查，scope 选择，排序，参见 §10） |
| **全局提示词 条目** | 全局级 Prompt 条目 |
| **关于** | 版本号、重置数据库 |

**自定义 CSS 编辑器**：代码字体，`--we-paper-aged` 背景，带行号，提供"推荐选择器参考"可折叠区块（参见 §10）。

### 6.7 WritingSpacePage（写作）

**布局**：变体双页，左页改为"激活角色列表"+ Tab 切换 [角色] / [状态]

- 左页 [角色] Tab：当前激活角色头像列表，可点击添加/移除角色
- 左页 [状态] Tab：所有激活角色状态纵向排列（每角色一个折叠块）
- 右页：与 ChatPage 相同，章节/消息/输入区
- 多角色时发言人标签明确显示角色名 + 印章色点区分

---

## §7 核心组件规格

### 7.1 消息气泡（MessageItem）

**外观（无外框，直接在纸面上）**：

```
[发言人标签]    Cormorant Garamond，xs，全大写，letter-spacing 0.28em
[正文段落]      EB Garamond，base，leading-loose
```

**助手消息**：
- 无左侧边线
- 第一章第一条消息：首字下沉（Drop Cap）——首字 Cormorant Garamond，3.4em，float:left
- 段落间距 0.5em

**用户消息**：
- 左侧 2px `--we-amber` 竖线
- padding-left 16px
- 发言人标签颜色 `--we-amber`

**流式状态**：
- 行尾跟随 `▊` 光标（1.5px 宽，`--we-ink-secondary`，0.65s steps 闪烁）
- 可选：SVG 羽毛笔图标跟随（P1 实现）

**编辑状态**：原文以 `filter:blur(1px) + opacity:0.4` 过渡后，新内容以 inkRise 浮现

**操作菜单**（hover .we-message-row 时浮出）：
- 图标行，绝对定位右上方
- 图标：朱砂色，`--we-text-sm`，hover 时背景 `--we-vermilion-bg`

**CSS 稳定锚点类名（承诺向后兼容）**：

```
.we-message-row          消息行容器
.we-message-user         用户消息行
.we-message-assistant    助手消息行
.we-message-label        发言人标签
.we-message-content      消息正文（正则替换作用点）
.we-message-actions      操作菜单
```

### 7.2 状态栏（StatusBar / AnnotationSection）

批注样式，不是 HUD：

```
[SECTION TITLE]   全大写，xs，letter-spacing 0.28em，ink-faded
stat-key: italic  stat-val: normal
[进度条]          3px 高，无圆角，moss 或 amber 填充
```

**进度条**：
- 容器：`--we-paper-shadow` 底色
- 填充：动画过渡 `width 1s ease`
- 颜色由状态字段的 `field_type` + 世界配置决定（设计层不硬编码，通过 CSS 变量注入）

**CSS 锚点**：

```
.we-status-character   角色状态栏容器
.we-status-world       世界状态栏容器
.we-status-player      玩家状态栏容器
.we-status-field       单个状态字段行
.we-status-bar         进度条容器
.we-status-bar-fill    进度条填充
```

### 7.3 召回记忆批注（Marginalia）

左页批注区，也可在右页消息旁侧出现：

```
[左侧 1.5px 朱砂竖线]
[日期/来源]  xs，vermilion，italic
[摘要文字]   xs，ink-faded，italic，line-height 1.6
```

动画：inkRise（opacity + y + blur），延迟 1.2s（在消息出现后出现）

**CSS 锚点**：

```
.we-marginalia          批注容器
.we-marginalia-date     批注日期/来源标签
.we-marginalia-text     批注正文
```

### 7.4 输入区（InputBox）

```
[textarea]           羊皮纸底色，--we-border，无圆角，EB Garamond
[发送按钮]           方形，1px border，箭头 SVG，hover 朱砂
[附件按钮]           回形针图标，最多 3 张图（含附件预览缩略图行）
[操作按钮行]         /continue · /regenerate · stop（流式时）· 字数统计
```

上方分隔：`1px solid --we-paper-shadow`

placeholder 文字：`"在此落笔，续写故事……"` italic，`--we-ink-faded`

### 7.5 章节分隔线（ChapterDivider）

**Fleuron 类型**（场景分隔，轻量）：

```
━━━━━ ※ ━━━━━
```
- 横线：`--we-paper-shadow`，1px
- 中心符号：`--we-paper-deep`，14px

**章节起始类型**（新章节头，重量级）：

```
        第 七 章
   雾林深处的来客
      ━━━ ❦ ━━━
```
- 章节号：全大写，letter-spacing 0.5em，`--we-ink-faded`
- 标题：Cormorant Garamond Italic，`--we-text-lg`
- 花饰行：`❦`，`--we-gold-leaf`，两侧 1px 金色渐变横线

**绘制动画**：进入视口时 SVG stroke-dasharray 从中心向两侧展开，500ms

### 7.6 印章（Seal）

SVG，按角色 id hash 确定颜色（用 `getAvatarColor` 逻辑）：

```
外框：双线矩形（外实线 2.5px，内虚线 0.8px dash）
内容：角色名 1~2 字（ZCOOL XiaoWei），中间横线分隔
颜色：默认朱砂，可被 getAvatarColor 覆盖
```

有头像时：印章框内显示头像圆图，外框保留装饰双线。

### 7.7 书签丝带（Bookmark）

绝对定位，右页右上角：

```css
width: 16px; height: 52px;
background: --we-vermilion;
clip-path: polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%);
```

### 7.8 模态框（Modal）

背景：蒙版 `rgba(42,31,23,0.6)`（墨水感，非纯黑）  
内容：`--we-paper-base` 背景，`--we-border` 边框，`--we-radius-sm`  
动画：`scale(0.96) + opacity:0` → `scale(1) + opacity:1`，250ms  
关闭：右上角 `✕`，`--we-ink-faded`

### 7.9 页脚（PageFooter）

```
[第七章 · 第一页]    Cormorant Garamond Italic，xs，ink-faded
[❧]                  gold-leaf，居中
[幻世录]             同左，右对齐
```

---

## §8 SVG 装饰元素规格

### 8.1 羊皮纸噪点纹理

**实现**：SVG `feTurbulence` 内联 + CSS `background-image`

```html
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <filter id="parchment">
    <feTurbulence type="fractalNoise" baseFrequency="0.85"
                  numOctaves="4" stitchTiles="stitch"/>
    <feColorMatrix type="matrix"
      values="0 0 0 0 0.55  0 0 0 0 0.44  0 0 0 0 0.29  0 0 0 0.055 0"/>
  </filter>
  <rect width="256" height="256" filter="url(#parchment)"/>
</svg>
```

叠加于 `.book::after`，`mix-blend-mode: multiply`，`opacity: 0.7`，`pointer-events: none`，`z-index: 20`。

### 8.2 书脊阴影

**左页右侧 + 右页左侧**，通过 CSS 渐变实现（见 `--we-spine-shadow`）。

### 8.3 印章 SVG（通用模板）

```svg
<svg viewBox="0 0 76 76" fill="none">
  <!-- 外框实线 -->
  <rect x="4" y="4" width="68" height="68" rx="2"
        stroke="[color]" stroke-width="2.5"/>
  <!-- 内框虚线 -->
  <rect x="8.5" y="8.5" width="59" height="59" rx="1"
        stroke="[color]" stroke-width="0.8"
        stroke-dasharray="3 2" opacity="0.6"/>
  <!-- 文字行 1 -->
  <text x="38" y="31" text-anchor="middle"
        font-family="ZCOOL XiaoWei" font-size="15"
        fill="[color]">[字1]</text>
  <!-- 中间横线 -->
  <line x1="16" y1="40" x2="60" y2="40"
        stroke="[color]" stroke-width="0.7" opacity="0.45"/>
  <!-- 文字行 2 -->
  <text x="38" y="58" text-anchor="middle"
        font-family="ZCOOL XiaoWei" font-size="15"
        fill="[color]">[字2]</text>
</svg>
```

`[color]` 默认 `--we-vermilion`；角色印章由 `getAvatarColor(id)` 返回的色相替换。

### 8.4 花饰横线（Fleuron Line）SVG

章节分隔使用 SVG `stroke-dasharray` 动画实现"绘制"效果：

```svg
<line x1="0" y1="0.5" x2="100%" y2="0.5"
      stroke="[gold]" stroke-width="1"
      stroke-dasharray="[total-length]"
      stroke-dashoffset="[total-length]">
  <animate attributeName="stroke-dashoffset"
           from="[total-length]" to="0"
           dur="0.5s" fill="freeze"/>
</line>
```

配合中央符号 `❦`（金色），整体由 JS IntersectionObserver 触发，进入视口后启动。

### 8.5 流式羽毛笔光标（P1，可选）

```svg
<!-- 极简羽毛笔，跟随流式输出行尾 -->
<svg width="20" height="32" viewBox="0 0 20 32">
  <path d="M10 30 Q6 20 4 8 Q10 2 16 8 Q14 20 10 30Z"
        fill="none" stroke="[ink-faded]" stroke-width="1.2"/>
  <line x1="10" y1="30" x2="10" y2="32"
        stroke="[ink-primary]" stroke-width="1.5"/>
</svg>
```

跟随最后一个字符位置，0.7s steps 透明度闪烁。

### 8.6 蜡烛火焰（记忆召回指示）

用于 `memory_recall_start` 事件，右页左上角显示：

```svg
<svg width="16" height="24" viewBox="0 0 16 24">
  <ellipse cx="8" cy="20" rx="4" ry="2" fill="[amber]" opacity="0.3"/>
  <path d="M8 18 Q4 12 6 6 Q8 2 10 6 Q12 12 8 18Z"
        fill="[gold-pale]" opacity="0.85">
    <animateTransform attributeName="transform" type="scale"
      values="1,1;1.05,0.95;0.95,1.05;1,1"
      dur="0.8s" repeatCount="indefinite" additive="sum"
      transformOrigin="8 18"/>
  </path>
</svg>
```

---

## §9 动画系统

### 9.1 Motion Token

```js
// /frontend/src/utils/motion.js
export const MOTION = {
  duration: {
    quick:  0.18,   // 按钮 hover
    base:   0.32,   // 消息浮现、模态框
    slow:   0.50,   // 页面切换、分隔线绘制
    crawl:  0.80,   // 蜡烛摆动
  },
  ease: {
    ink:    [0.22, 1,    0.36, 1],    // 墨水浸润（主要）
    page:   [0.65, 0,    0.35, 1],    // 翻页
    quill:  [0.40, 0,    0.20, 1],    // 落笔
    sharp:  [0.25, 0.46, 0.45, 0.94], // 快速进出
  },
  stagger: 0.05,  // 列表 stagger delay
};
```

### 9.2 标准动画定义

#### inkRise（墨水浮现）——所有入场动画基础

```js
// framer-motion
initial: { opacity: 0, y: 8, filter: 'blur(1.5px)' }
animate: { opacity: 1, y: 0, filter: 'blur(0px)' }
transition: { duration: MOTION.duration.base, ease: MOTION.ease.ink }
```

**使用场景**：消息气泡、批注浮现、章节标题、模态框内容

#### pageTransition（路由切换）

```js
initial: { opacity: 0, y: 12, scale: 0.98 }
animate: { opacity: 1, y: 0,  scale: 1.00 }
exit:    { opacity: 0, y: -8, scale: 0.99 }
transition: { duration: MOTION.duration.slow, ease: MOTION.ease.page }
```

#### sealStamp（朱砂盖印）——关键操作完成

```js
// 印章元素
initial: { scale: 1.3, opacity: 0, rotate: -3 }
animate: { scale: 1.0, opacity: 1, rotate: 0 }
transition: { duration: 0.3, ease: MOTION.ease.sharp }
// 然后 0.5s 后淡出
```

#### drawDivider（分隔线绘制）

CSS animation + SVG stroke-dashoffset，进入视口触发（IntersectionObserver），500ms。

### 9.3 动效分级

| 级别 | 内容 | 默认 |
|---|---|---|
| **必做** | inkRise（消息）、页面切换、模态框进出、流式光标 | 开 |
| **推荐** | 状态栏数值过渡、章节分隔绘制、批注淡入 | 开 |
| **可选** | 蜡烛火焰、羽毛笔光标、盖印动画 | 开 |

### 9.4 减少动效（无障碍）

Settings 页提供「减少动效」开关，同时读取 `prefers-reduced-motion`：

```js
const shouldReduceMotion =
  useReducedMotion() || settings.reduceMotion;

// 若启用：所有 duration → 0，所有 filter blur → 0
const transition = shouldReduceMotion
  ? { duration: 0 }
  : { duration: MOTION.duration.base, ease: MOTION.ease.ink };
```

---

## §10 自定义 CSS 兼容性规格

### 10.1 分层设计

| 层 | 类名前缀 | 稳定性承诺 | 用户可改 |
|---|---|---|---|
| 变量层 | `--we-*` | 稳定，改变量协调换肤 | 推荐 |
| 内容锚点层 | `.we-message-*`，`.we-status-*`，`.we-chapter-*` | 稳定，向后兼容 | 可放心改 |
| 装饰骨架层 | `.we-chrome-*`，`.we-book-*` | 可能随版本变化 | 改了可能翻车 |

### 10.2 稳定锚点类名（完整列表）

```
# 消息相关
.we-message-row          消息行
.we-message-user         用户消息行
.we-message-assistant    助手消息行
.we-message-label        发言人标签
.we-message-content      消息正文（正则 display_only 作用点）
.we-message-actions      操作菜单

# 章节相关
.we-chapter              章节分组容器
.we-chapter-header       章节标题区
.we-chapter-divider      轻量场景分隔线

# 状态相关
.we-status-character     角色状态栏
.we-status-world         世界状态栏
.we-status-player        玩家状态栏
.we-status-field         单个字段行
.we-status-bar           进度条容器
.we-status-bar-fill      进度条填充

# 批注相关
.we-marginalia           召回记忆批注
.we-marginalia-date      批注日期标签
.we-marginalia-text      批注正文

# 布局相关
.we-page-left            左页
.we-page-right           右页（中页对话区）
.we-chat-area            对话主区（含章节+消息列表）
.we-input-area           输入区域

# 档案侧页相关
.we-state-panel          档案侧页容器
.we-state-panel-header   印章 + 角色名头部
.we-state-section        状态区块（含标题+字段）
.we-state-section-title  区块标题
.we-state-section-reset  重置按钮
.we-timeline             时间线区块
```

### 10.3 编辑器内建引导

SettingsPage 自定义 CSS 编辑器顶部提供可折叠的"推荐选择器参考"：

```css
/* ✅ 推荐：改变量协调换肤 */
:root {
  --we-paper-base: #e8dcc8;
  --we-vermilion: #8b2e24;
}

/* ✅ 推荐：改消息样式 */
.we-message-assistant .we-message-content {
  font-size: 18px;
  line-height: 2;
}

/* ✅ 推荐：改用户消息边线颜色 */
.we-message-user { border-left-color: #4a7c8b; }

/* ⚠️  注意：骨架类名可能随版本变化 */
.we-book-spine { ... }
```

### 10.4 正则替换兼容

`display_only` scope 的正则在 `.we-message-content` 内的文本节点上执行，不影响 `.we-message-label`、`.we-status-*` 等结构节点。

---

## §11 响应式规格

### 断点

| 名称 | 宽度 | 变化 |
|---|---|---|
| Desktop | ≥ 1024px | 双页完整布局 |
| Tablet | 768–1023px | 左页收起为书脊（40px），hover/点击展开悬浮面板 |
| Mobile | < 768px | 单页，左页内容折叠为顶部抽屉，书本去双页改单列 |

### Desktop（默认）
- 双页书本，左 260px + 右 flex:1
- 右页 inline marginalia 可见

### Tablet
- 左页折叠为 40px 书脊，显示印章缩略
- 点击书脊 → 左侧滑出面板（overlay，不挤压右页）

### Mobile
- 单列，无双页概念
- 顶部：世界/角色选择 dropdown
- 左页内容 → 右上角「角色」按钮展开 bottom sheet
- 章节标题保留，Drop Cap 保留
- 右页 inline marginalia 隐藏，批注信息折入对话上方小标签

---

## §12 实施 Phase 规划

| Phase | 内容 | 验收要点 |
|---|---|---|
| **P0** | 建立 token 文件（CSS 变量 + motion.js）+ 字体引入 | 变量加载，字体渲染 |
| **P1** | 三栏布局骨架 + 书脊阴影 + 纸张噪点纹理 + 书签丝带 | 视觉比例正确，纹理可见 |
| **P2** | 消息组件重构（inkRise + Drop Cap + 稳定类名）+ 流式光标 | 动画流畅，类名存在 |
| **P3** | 左页会话列表（无 Tab）+ 右侧 StatePanel（印章 + 全层状态 + 时间线 + 召回批注占位） | 三栏正确，会话可点击，档案页数据显示 |
| **P4** | 章节分组 + 花饰分隔线绘制动画 + 页脚 | 章节分组出现，分隔线绘制 |
| **P5** | 页面路由动画 + 模态框动画 + SSE 状态指示（蜡烛 + StatePanel 召回批注接入） | 切换动画，蜡烛出现，召回批注淡入 |
| **P6** | WorldsPage / CharacterEditPage / SettingsPage 改造 | 各页面羊皮纸风格一致 |
| **P7** | WritingSpacePage 变体（左页激活角色列表 + 状态 Tab） | 写作正常 |
| **P8** | SVG 装饰完善（羽毛笔光标、盖印动画）+ 减少动效开关 + 遗留组件清理 | 可选动效可关闭，无遗留 |

每个 Phase 独立可部署、独立可回滚，完成后 commit。

---

## §13 禁止事项（Do NOT）

- ❌ 出现 emoji（用 SVG 或古籍符号 ❦ ※ ❧ §）
- ❌ 羊皮纸底色 + Material Design / Fluent Design 图标
- ❌ 状态栏做成游戏 HUD（HP 条浮在屏幕边缘）
- ❌ Spring bounce / overshoot 弹性动画
- ❌ 颜色硬编码（必须走 `--we-*` 变量）
- ❌ 内联 style（全部走 TailwindCSS 工具类或 CSS 变量）
- ❌ 正文字号低于 16px
- ❌ 破坏 §10 中承诺的稳定锚点类名
- ❌ 动态改写 `.we-chrome-*` 等骨架类名（用 CSS 变量替代）
- ❌ 引入深色/浅色主题切换（用户按需通过自定义 CSS 覆盖变量）
