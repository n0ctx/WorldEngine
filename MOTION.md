# WorldEngine · 动态设计规范 v1

> 权威来源：本文件描述所有交互动效、过渡行为和动态 token。
> 静态视觉规格见 `DESIGN.md`，约束见 `CLAUDE.md`。
> **与 DESIGN.md §9 的关系**：本文件完整覆盖并取代 DESIGN.md §9 的动画系统描述，token 数值以本文件为准。
> 最后更新：2026-04-21

---

## §1 核心原则

**隐喻：墨水落在羊皮纸上**

所有动效服务于"一本正在被书写的手稿"的感受。运动不是装饰，是世界的物理法则。

### 1.1 三条设计律

| 律 | 表述 | 典型反例（禁止） |
|---|---|---|
| **连续律** | 状态切换有中间过程，不允许跳切 | 内容瞬间出现/消失 |
| **物理律** | 运动符合物质直觉：有重量感、无弹跳、有衰减 | Spring bounce、overshoot、橡皮筋弹回 |
| **克制律** | 同一时刻屏幕上不超过 2 个独立动画并行；装饰动效不抢注意力 | 全屏到处在动 |

### 1.2 统一的运动语感

- **入场**：先慢后快（ease-out 系），墨水渗开的感觉
- **离场**：先快后慢（ease-in 系），纸张轻轻翻过
- **状态过渡**：对称 ease-in-out，平稳无棱角
- **绝不出现**：弹性（bounce）、过冲（overshoot）、摆动（wobble）

---

## §2 Motion Token 体系

### 2.1 时长 Token

```js
// /frontend/src/utils/motion.js
export const DURATION = {
  instant:  0,       // 无障碍模式覆盖目标值
  micro:    0.10,    // 极小反馈：focus ring、checkbox 勾选
  quick:    0.18,    // 按钮 hover 色变、tooltip 出现
  base:     0.30,    // 消息浮现、模态框、下拉菜单（取代 DESIGN.md §9 的 0.32）
  medium:   0.38,    // 面板展开/折叠、表单切换
  slow:     0.50,    // 页面切换、章节分隔线绘制
  crawl:    0.75,    // 蜡烛摇曳、印章淡出
  ambient:  2.00,    // 环境循环动效（蜡烛持续摇摆周期）
};
```

### 2.2 缓动函数 Token

```js
export const EASE = {
  // 墨水浸润：快速展开、柔和收尾 — 主要入场曲线
  ink:     [0.22, 1.00, 0.36, 1.00],

  // 翻页：匀速起步、柔和结束 — 页面级过渡
  page:    [0.65, 0.00, 0.35, 1.00],

  // 落笔：微微加速再收 — 盖印、点击确认
  quill:   [0.40, 0.00, 0.20, 1.00],

  // 利落：快进快出 — 工具提示、hover 色变
  sharp:   [0.25, 0.46, 0.45, 0.94],

  // 收回：先快后慢 — 离场、折叠
  retract: [0.55, 0.00, 1.00, 0.45],

  // 匀速：流式文字渐入
  linear:  'linear',
};
```

### 2.3 间距 Token（Stagger）

```js
export const STAGGER = {
  list:      0.05,   // 列表条目依次入场（与 DESIGN.md §9 对齐）
  panel:     0.06,   // 状态区块依次浮现
  character: 0.08,   // 世界卡片依次出现
};
```

### 2.4 模糊半径 Token

```js
export const BLUR = {
  entry:    '1.5px',  // inkRise 入场初始模糊
  edit:     '2px',    // 消息编辑遮罩模糊
  overlay:  '0px',    // 最终清晰值（不允许停在模糊态）
};
```

### 2.5 CSS 自定义属性（供纯 CSS 动画引用）

以下变量注入 `:root`（在 `tokens.css` 末尾追加，与 `--we-*` 体系共存）：

```css
/* /frontend/src/styles/tokens.css — 追加到文件末尾 */
:root {
  /* Duration */
  --we-dur-micro:    0.10s;
  --we-dur-quick:    0.18s;
  --we-dur-base:     0.30s;
  --we-dur-medium:   0.38s;
  --we-dur-slow:     0.50s;
  --we-dur-crawl:    0.75s;
  --we-dur-ambient:  2.00s;

  /* Easing（CSS 不支持变量直接用于 cubic-bezier，此处仅供注释参考） */
  /* ink:     cubic-bezier(0.22, 1, 0.36, 1)   */
  /* page:    cubic-bezier(0.65, 0, 0.35, 1)   */
  /* quill:   cubic-bezier(0.40, 0, 0.20, 1)   */
  /* sharp:   cubic-bezier(0.25, 0.46, 0.45, 0.94) */
  /* retract: cubic-bezier(0.55, 0, 1, 0.45)   */
}
```

> CSS 不支持将 `cubic-bezier` 值存入变量后再传给 `transition`，只能硬写。用注释标注来源即可，不要试图用变量替代。

### 2.6 完整 `motion.js` 导出结构

```js
// /frontend/src/utils/motion.js
// ── 以下为该文件完整导出，新建时照此结构 ──

export const DURATION = { /* 见 §2.1 */ };
export const EASE     = { /* 见 §2.2 */ };
export const STAGGER  = { /* 见 §2.3 */ };
export const BLUR     = { /* 见 §2.4 */ };

// 预组合原语（framer-motion variants 对象，直接展开使用）
export const variants = {
  inkRise: {
    hidden:  { opacity: 0, y: 8,  filter: 'blur(1.5px)' },
    visible: { opacity: 1, y: 0,  filter: 'blur(0px)'   },
  },
  inkFade: {
    visible: { opacity: 1, y: 0,  filter: 'blur(0px)' },
    hidden:  { opacity: 0, y: -6, filter: 'blur(1px)'  },
  },
  staggerList: {
    hidden:  {},
    visible: { transition: { staggerChildren: STAGGER.list } },
  },
  staggerPanel: {
    hidden:  {},
    visible: { transition: { staggerChildren: STAGGER.panel } },
  },
};

// transition 预设（配合 variants 使用）
export const transitions = {
  ink:     { duration: DURATION.base,   ease: EASE.ink     },
  quick:   { duration: DURATION.quick,  ease: EASE.sharp   },
  medium:  { duration: DURATION.medium, ease: EASE.ink     },
  slow:    { duration: DURATION.slow,   ease: EASE.page    },
  quill:   { duration: DURATION.base,   ease: EASE.quill   },
  retract: { duration: DURATION.quick,  ease: EASE.retract },
};
```

---

## §3 缓动函数详解

| 名称 | cubic-bezier | 适用场景 | 感受描述 |
|---|---|---|---|
| `ink` | (0.22, 1, 0.36, 1) | 入场、浮现、展开 | 快速渗开、柔和停止，如墨汁落纸 |
| `page` | (0.65, 0, 0.35, 1) | 页面切换、大面积过渡 | 慢启快中慢止，如书页翻动 |
| `quill` | (0.40, 0, 0.20, 1) | 盖印、提交确认 | 有力落下、精准停止 |
| `sharp` | (0.25, 0.46, 0.45, 0.94) | hover 色变、tooltip | 迅速响应、无拖尾 |
| `retract` | (0.55, 0, 1, 0.45) | 离场、折叠收起 | 快出门、慢关门 |

**判断原则**：
- 元素**进入**视野 → `ink`（展开）
- 元素**离开**视野 → `retract`（收回）
- **大块页面**切换 → `page`
- **即时反馈**（hover、toggle）→ `sharp`
- **仪式感操作**（保存、盖印）→ `quill`

---

## §4 动画原语（Primitives）

以下是所有组件应复用的基础动画片段。不得绕过原语直接写一次性动画参数。

### 4.1 `inkRise` — 墨水浮现（全局入场基础）

```js
// framer-motion 写法
const inkRise = {
  initial:    { opacity: 0, y: 8, filter: 'blur(1.5px)' },
  animate:    { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: DURATION.base, ease: EASE.ink },
};
```

**使用场景**：消息气泡、批注浮现、章节标题、模态框内容区、状态栏区块初次加载

### 4.2 `inkFade` — 墨迹消散（离场）

```js
const inkFade = {
  exit: { opacity: 0, y: -6, filter: 'blur(1px)' },
  transition: { duration: DURATION.quick, ease: EASE.retract },
};
```

**使用场景**：消息删除、批注消失、通知条消失

### 4.3 `pageTransition` — 路由切换

```js
const pageTransition = {
  initial:    { opacity: 0, y: 12, scale: 0.985 },
  animate:    { opacity: 1, y: 0,  scale: 1.000 },
  exit:       { opacity: 0, y: -8, scale: 0.990 },
  transition: { duration: DURATION.slow, ease: EASE.page },
};
```

### 4.4 `sealStamp` — 朱砂盖印（仪式感确认）

```js
// 第一阶段：落下
const sealIn = {
  initial:    { scale: 1.25, opacity: 0, rotate: -4 },
  animate:    { scale: 1.00, opacity: 1, rotate: 0 },
  transition: { duration: DURATION.base, ease: EASE.quill },
};
// 第二阶段：650ms 后淡出（用 setTimeout 或 AnimatePresence delay）
const sealOut = {
  exit: { opacity: 0, scale: 0.92 },
  transition: { duration: DURATION.medium, ease: EASE.retract, delay: 0.65 },
};
```

**使用场景**：世界/角色保存成功、导入完成

### 4.5 `panelSlide` — 面板滑入滑出

```js
// 方向由组件 props 决定，以左侧面板为例
const panelSlide = {
  initial:    { x: '-100%', opacity: 0.6 },
  animate:    { x: '0%',    opacity: 1   },
  exit:       { x: '-100%', opacity: 0.6 },
  transition: { duration: DURATION.medium, ease: EASE.ink },
};
```

### 4.6 `drawLine` — 横线绘制（SVG stroke-dashoffset）

```css
/* 进入视口后由 IntersectionObserver 触发 */
.we-divider-line {
  stroke-dasharray: var(--line-length);
  stroke-dashoffset: var(--line-length);
  transition: stroke-dashoffset 0.50s cubic-bezier(0.22, 1, 0.36, 1);
}
.we-divider-line.is-visible {
  stroke-dashoffset: 0;
}
```

### 4.7 `progressFill` — 进度条填充

```css
.we-status-bar-fill {
  transition: width 0.75s cubic-bezier(0.22, 1, 0.36, 1);
}
```

**重要**：初始渲染时不播放动画（加 `data-initial` 跳过）；仅在数值**变化**时触发过渡。

---

## §5 交互状态规范

### 5.1 Hover（悬停）

**原则**：hover 反馈必须在 `DURATION.quick`（0.18s）以内响应，不能有延迟感。

| 元素 | Hover 变化 | 过渡 |
|---|---|---|
| 主按钮（朱砂） | background: `--we-vermilion-deep`，轻微 `scale: 1.01` | `0.18s sharp` |
| 次级按钮 | background 加深 8%，无 scale | `0.18s sharp` |
| 会话列表条目 | background `--we-paper-shadow` 0.25 透明度 | `0.15s sharp` |
| 消息行 | 操作菜单以 inkRise 浮出（opacity 0→1，y 4→0） | `0.18s ink` |
| 重置按钮 | color: `--we-vermilion` | `0.15s sharp` |
| 世界卡片 | `translateY(-3px)`，box-shadow 加深 | `0.22s ink` |
| 折叠把手 | background 略亮，文字 `--we-ink-secondary` | `0.18s sharp` |
| 时间线条目 | `--we-ink-primary`（从 secondary） | `0.15s sharp` |

**禁止**：hover 时 scale > 1.03；hover 延迟（不加 transition-delay）；hover 期间触发无关元素动画。

### 5.2 Active / Press（按下）

**原则**：按下必须有即时的「受力感」——比 hover 状态再沉一点，不是反弹。

| 元素 | Active 变化 |
|---|---|
| 主按钮 | `scale: 0.97`，background `--we-vermilion-deep` | 瞬间，`0.10s quill` |
| 次级按钮 | `scale: 0.98`，background 再深 5% | 同上 |
| 会话列表条目 | background `--we-paper-shadow` 0.4，scale 无变化 | `0.10s sharp` |
| 世界卡片 | `translateY(-1px)`（比 hover 浅），回压感 | `0.10s quill` |

**释放后**：回到 hover 状态（不跳回 normal），`0.18s ink`。

### 5.3 Focus（键盘焦点）

```css
/* 统一 focus 样式：古籍风格 outline */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--we-paper-base),
              0 0 0 3.5px var(--we-vermilion);
  transition: box-shadow 0.10s ease;
}
```

**原则**：focus ring 永远可见（不允许 `outline: none` 无补偿）；color 不变，只加外框。

### 5.4 Disabled（禁用）

```css
[disabled], .is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
  /* 无过渡：禁用是即时的，不需要动画 */
}
```

### 5.5 Loading / Pending（等待）

不用旋转 spinner。使用：

```css
/* 文字按钮：字符渐隐循环（非旋转） */
.is-loading .btn-text {
  animation: ink-pulse 1.4s ease-in-out infinite;
}

@keyframes ink-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
```

或静态文字替换（「保存中……」），无旋转图标。

---

## §6 组件动效规范

### 6.1 按钮（Button）

```
状态链：normal → hover(0.18s sharp) → active(0.10s quill) → release(0.18s ink) → normal
```

- 主操作按钮（朱砂）：hover 时 scale 1.01，active 时 scale 0.97
- 次级/工具按钮：hover 仅改色，无 scale
- 危险操作按钮（删除）：hover 时 color → `--we-vermilion`，border-color 同步变化，无 scale

**不允许**：按钮有 transition 但 hover 颜色立刻跳变（要么有过渡要么没有，不能混）。

### 6.2 消息气泡（MessageItem）

#### 6.2.1 正常出现

每条新消息用 `inkRise`，无 stagger（对话是连续的，不是列表）。

#### 6.2.2 流式输出

- 文字逐 token 追加，无额外动画
- 行尾 `▊` 光标：`opacity 1→0` 循环，`0.65s steps(2, start)`（闪烁，不渐变）
- 禁止：流式过程中整个气泡做缩放或移动

#### 6.2.3 消息编辑

```
1. 原文淡化：filter blur(0→2px) + opacity(1→0.35)，0.20s sharp
2. 保持占位（高度不变）：不折叠原消息
3. 编辑完成/提交：新内容 inkRise 浮现，原文淡出 inkFade
```

#### 6.2.4 重新生成

```
1. 旧 assistant 消息：inkFade 离场（0.20s retract）
2. 新消息 bubble：inkRise 入场，立即开始流式
3. 两步之间无空白感（inkFade 结束前新消息已开始 opacity 过渡）
```

#### 6.2.5 操作菜单（MessageActions）

- 条件：hover `.we-message-row`
- 出现：opacity 0→1，y 4→0，`0.18s ink`
- 消失：opacity 1→0，y 0→2，`0.12s retract`
- 菜单内图标之间：无 stagger（整体作为一个块出现）

### 6.3 面板折叠（PageLeft / StatePanel）

#### 6.3.1 左页折叠（书脊模式）

```
展开 → 折叠：width 260px → 40px，0.38s ink
折叠 → 展开：width 40px → 260px，0.38s ink
```

- 折叠过程中内容（列表项）在 `width < 120px` 时即开始 opacity 0（不等到完全折叠）
- 展开过程：先等宽度到 120px 再以 `STAGGER.list`（0.045s）依次 inkRise 列表项

#### 6.3.2 右侧档案侧页（StatePanel）

```
展开 → 折叠：width 280px → 0，0.38s ink（把手保持可见）
折叠 → 展开：width 0 → 280px，0.38s ink，内容 stagger inkRise
```

#### 6.3.3 移动端 Bottom Sheet / 悬浮面板

```
出现：translateY(100%) → translateY(0)，0.38s ink
消失：translateY(0) → translateY(100%)，0.28s retract
背景蒙版：opacity 0 → 0.6，同步 0.38s
```

### 6.4 列表（会话列表、世界卡片列表）

#### 6.4.1 首次加载（整页渲染）

```js
// 父容器：无动画
// 子项：inkRise + stagger
variants: {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER.list } }
}
childVariants: inkRise
```

最大 stagger 时长不超过 `list.length * STAGGER.list`，若列表超过 20 项，stagger 封顶在 0.8s（即超出的项同时出现）。

#### 6.4.2 新增一项

单项 inkRise，其他项不动。

#### 6.4.3 删除一项

```
1. 目标项：inkFade 离场，height 同步折叠至 0（0.28s ink）
2. 其余项：translateY 补位，0.28s ink，无 stagger
```

#### 6.4.4 重新排序（拖拽）

拖拽中项目跟随指针，其余项目以 `0.22s ink` 平滑平移让位。释放后以 `0.18s quill` 落定。

### 6.5 模态框（Modal）

```
打开：
  蒙版   opacity 0 → 0.6，0.22s sharp
  内容   scale 0.96 + opacity 0 → scale 1 + opacity 1，0.28s ink

关闭：
  内容   scale 1 + opacity 1 → scale 0.96 + opacity 0，0.18s retract
  蒙版   opacity 0.6 → 0，0.22s retract（与内容离场同步）
```

**内容区内部**：若有多个区块（标题+表单+按钮行），以 `STAGGER.panel`（0.06s）依次 inkRise，仅在**打开**时触发，关闭时整体离场（不逐项）。

### 6.6 下拉菜单（Dropdown）

```
打开：
  容器   scaleY 0 → 1（transformOrigin: top），opacity 0 → 1，0.22s ink
  菜单项 依次 inkRise，stagger 0.03s

关闭：
  整体   opacity 1 → 0，scaleY 1 → 0.96，0.15s retract
  （关闭时不逐项离场）
```

### 6.7 状态栏（StatusBar）

```
初始渲染：整个区块 inkRise（带 stagger 0.06s，区块间依次出现）
          进度条 width 不播过渡动画（加 data-initial 跳过）

数值更新（SSE 驱动）：
  文字值：旧值 opacity 1→0（0.15s），新值 opacity 0→1（0.20s ink），无位移
  进度条：width 平滑过渡 0.75s ink（progressFill）
  数值若减少：进度条颜色短暂（0.3s）变 --we-amber 再还原（表示"损耗"）
```

### 6.8 召回记忆批注（Marginalia）

```
出现（SSE memory_recall_done）：
  整块：inkRise，delay 1.2s（在对应消息完成后出现，不抢先）
  左侧竖线：height 0 → 100%，0.40s ink（与内容同步开始）

消失（会话切换）：
  整块：inkFade，0.20s retract
```

**同一会话多条批注**：stagger 0.08s 依次出现，不同时浮现。

### 6.9 章节分隔线（ChapterDivider）

```
触发：进入视口（IntersectionObserver，threshold 0.3）

轻量 Fleuron（场景分隔）：
  横线：drawLine，0.50s ink，从中心向两侧扩展（两条 line 各自从 50% 起点绘出）
  中心符号：opacity 0 → 1，delay 0.30s，0.20s ink

章节起始（重量级）：
  章节号文字：inkRise，delay 0s
  标题文字：inkRise，delay 0.08s
  花饰横线：drawLine，delay 0.20s，0.50s ink
```

**限制**：已进入视口的分隔线不重复播放（IntersectionObserver disconnect 后不再触发）。

### 6.10 印章（CharacterSeal）

```
首次渲染/打开档案页：sealStamp（scale 1.25→1, rotate -4→0, opacity 0→1）
                      0.30s quill
后续驻留：静止，不循环动画
悬停：无动画（印章是身份标识，不应响应悬停）
```

### 6.11 输入框（InputBox）

```
聚焦（focus）：border-color → --we-vermilion，0.18s sharp
              box-shadow focus ring 出现，0.10s ease
失焦：还原，0.18s sharp

发送按钮（hover）：background 朱砂渐深，0.18s sharp
发送按钮（active）：scale 0.95，0.10s quill

附件缩略图添加：每张图 inkRise，stagger 0.04s
附件缩略图删除：inkFade，高度折叠 0.22s
```

### 6.12 Tooltip（工具提示）

```
出现：opacity 0→1，y 4→0，0.15s ink，delay 0.35s（避免扫过时乱弹）
消失：opacity 1→0，0.10s retract，无 delay
```

### 6.13 表单字段反馈（Form Validation）

**原则**：错误反馈即时出现，不延迟；修复后立刻还原，不保留红色。

```
字段验证失败：
  border-color → --we-vermilion，0.15s sharp
  错误提示文字：inkRise（y 4→0，opacity 0→1），0.20s ink
  轻微 shake（仅首次）：translateX 0→-4px→4px→-2px→0，0.30s，ease linear

字段验证通过（用户改正后）：
  border-color 还原，0.18s sharp
  错误提示文字：inkFade 消失，0.15s retract

表单整体提交失败（如网络错误）：
  不做全局 shake；在表单顶部以 inkRise 显示错误提示条（--we-vermilion-bg 背景）
```

```css
@keyframes we-field-shake {
  0%   { transform: translateX(0); }
  20%  { transform: translateX(-4px); }
  40%  { transform: translateX(4px); }
  70%  { transform: translateX(-2px); }
  100% { transform: translateX(0); }
}
/* 仅绑定一次，animation-fill-mode: forwards，结束后移除 class */
```

### 6.14 状态数值计数器（Number Ticker）

当状态字段为数字类型且数值变化时（SSE `status_update`）：

```
数值差 ≤ 5：直接文字切换（旧值 opacity 0→1，0.15s）
数值差 > 5：数字滚动计数器
  - 从旧值向新值方向数，步长 = Math.ceil(diff / 8)，每步间隔 40ms
  - 总时长不超过 400ms（超出则跳过中间值，直接落定）
  - 最终值 inkRise（opacity + blur）落定，0.15s ink
  - 减少：数字向下滚动（translateY 向负）
  - 增加：数字向上滚动（translateY 向正）
```

实现参考：用 `requestAnimationFrame` 驱动，不用 `setInterval`。

### 6.15 WritingSpacePage 多角色动效

**角色切换（左页激活角色列表）**：

```
添加激活角色：
  头像印章：sealStamp 入场（scale 1.25→1，rotate -4→0），0.30s quill
  角色名标签：inkRise，delay 0.15s

移除激活角色：
  头像印章：scale 1→0.85 + opacity 1→0，0.22s retract
  状态折叠块：height 折叠至 0，0.28s ink
```

**多角色状态 Tab（左页 [状态] Tab）**：

```
Tab 切换内容区：opacity 0→1，x ±12px→0，0.28s ink（方向跟随 Tab 左右顺序）
每个角色状态折叠块展开：height 0→auto，0.28s ink
                 折叠：height auto→0，0.22s retract
```

**多角色发言区分**（对话区消息行）：

```
角色色点（印章色）：首次出现时 scale 0→1，0.20s quill
                    不随消息 inkRise 再次动画，保持静止
```

---

## §7 SSE 驱动动效

| SSE 事件 | 动效 | 优先级 |
|---|---|---|
| `delta`（流式文字） | 文字追加，行尾光标闪烁 | 必须 |
| `memory_recall_start` | 右页左上角蜡烛 SVG 出现（inkRise 0.28s），持续摇曳 | 推荐 |
| `memory_recall_done` | 蜡烛 inkFade 消失（0.30s）；若 hit>0，召回批注 inkRise（delay 1.2s） | 推荐 |
| `title_updated` | 章节标题区旧文字 inkFade，新文字 inkRise | 推荐 |
| `status_update` | 状态栏数值过渡（progressFill + 文字切换） | 推荐 |
| `done` | 流式光标消失（opacity 0，0.15s）；操作菜单可用 | 必须 |
| `aborted` | 消息尾部 `[已中断]` 小字 inkRise | 推荐 |
| `error` | 消息气泡底部红色细线（--we-vermilion，1px）从左至右 drawLine | 推荐 |

**蜡烛摇曳循环**（`memory_recall_start` 持续期间）：

```css
@keyframes candle-flicker {
  0%, 100% { transform: scale(1, 1)     rotate(0deg); }
  25%       { transform: scale(1.04,0.96) rotate(1.5deg); }
  50%       { transform: scale(0.97,1.03) rotate(-1deg); }
  75%       { transform: scale(1.02,0.98) rotate(0.5deg); }
}
/* duration: 2s，ease: linear，transform-origin: center bottom */
```

---

## §8 页面级过渡

### 8.1 路由切换

所有页面切换使用 `pageTransition`（§4.3）。

**例外**：同一书卷内标签切换（WorldEditPage 内的 Tab）：
```
内容区：opacity 0→1，x ±16px→0，0.28s ink（方向跟随 Tab 方向）
标签下划线：translateX 平滑滑动，0.28s ink
```

### 8.2 世界进入

```
TopBar 世界名更新：inkRise（先 inkFade 旧名，再 inkRise 新名）
三栏布局：整体从 opacity 0 → 1，0.50s page
左页会话列表：stagger inkRise，STAGGER.list
```

### 8.3 无世界状态 → 有世界

```
空白羊皮纸：inkFade 消失，0.30s retract
新建世界表单/世界列表：pageTransition 入场
```

---

## §9 滚动行为

### 9.1 对话区自动滚动

- 流式输出期间：每次 delta 后 scroll 到底部（`behavior: 'smooth'` 当 delta 间隔 > 50ms，否则 `instant`）
- 用户手动上翻时：停止自动滚动，显示「回到底部」按钮
- 「回到底部」按钮：inkRise 出现，点击后 `scrollTo({ behavior: 'smooth' })`，到底后 inkFade 消失

### 9.2 章节分隔线触发

IntersectionObserver，threshold: 0.3，只触发一次（`once: true`）。

### 9.3 禁止

- 禁止 scroll snap（打断阅读节奏）
- 禁止使用 momentum scroll 覆盖（不改 `-webkit-overflow-scrolling`）
- 禁止 parallax 视差（背景固定的纸张纹理不随内容滚动，但不做视差效果）

---

## §10 减少动效（无障碍）

### 10.1 检测逻辑

```js
import { useReducedMotion } from 'framer-motion';
import { useSettingsStore } from '@/store';

export function useMotion() {
  const systemReducedMotion = useReducedMotion();
  const userReducedMotion   = useSettingsStore(s => s.reduceMotion);
  const reduced = systemReducedMotion || userReducedMotion;

  return {
    reduced,
    duration: (d) => reduced ? 0 : d,
    ease:     (e) => reduced ? 'linear' : e,
    blur:     (b) => reduced ? '0px' : b,
  };
}
```

### 10.2 减少动效时的规则

| 动效类型 | 减少动效时的行为 |
|---|---|
| 所有 transition duration | 改为 0（瞬间切换） |
| filter blur（inkRise、编辑遮罩） | 置 0，不做模糊 |
| transform y / scale（inkRise、pageTransition） | 置 0，只保留 opacity |
| SVG stroke-dashoffset（drawLine） | 跳过动画，直接显示 |
| 蜡烛摇曳 | 不显示蜡烛（直接跳到结果状态） |
| 流式光标闪烁 | 保留（有功能意义，指示"正在生成"） |
| 进度条 width 过渡 | duration 改为 0 |

### 10.3 Settings 控件

设置页「减少动效」开关，toggle 即时生效（不需要刷新页面）。

---

## §11 动效分级

| 级别 | 范围 | 可在「减少动效」下关闭 |
|---|---|---|
| **必须** | 流式光标、操作菜单 hover 浮出、focus ring、状态过渡标记"在进行" | 否 |
| **推荐** | inkRise 入场、面板折叠、状态栏数值过渡、章节分隔绘制、批注淡入、模态框 | 是 |
| **可选** | 蜡烛摇曳、sealStamp 盖印、羽毛笔光标、世界卡片 hover 上浮 | 是 |

---

## §12 禁止事项（DO NOT）

| 项 | 原因 |
|---|---|
| ❌ Spring / bounce / overshoot / wobble | 破坏物理律，羊皮纸不会弹跳 |
| ❌ transition-duration > 0.80s（非环境动效） | 用户等待感 |
| ❌ 同一时刻 > 2 个独立动画并行 | 破坏克制律 |
| ❌ hover 触发位移 > 4px | 视觉跳动感 |
| ❌ scale hover > 1.03 | 元素"膨胀"感 |
| ❌ 无 exit 动画的 AnimatePresence | 元素瞬间消失破坏连续律 |
| ❌ transition 只写 enter 不写 exit | 同上 |
| ❌ 循环动效（除蜡烛/光标）用于静止 UI | 分散注意力 |
| ❌ scrollTo 期间触发布局动画 | 跳帧/卡顿 |
| ❌ 用 setTimeout 硬编码 delay 替代 stagger/variants | 难维护，和 token 脱钩 |
| ❌ 对已在视口内的元素重复触发 drawLine | 分隔线重复绘制 |

---

## §13 性能指导

### 13.1 GPU 合成层提示

只对**持续运动**的元素添加 `will-change`，不要滥用（会占用显存）：

```css
/* 适合加 will-change 的场景 */
.we-candle-flame   { will-change: transform; }      /* 持续摇曳 */
.we-stream-cursor  { will-change: opacity; }         /* 持续闪烁 */
.we-panel-collapsing { will-change: width, opacity; } /* 折叠过程中动态添加，结束后移除 */

/* 不适合加 will-change */
/* 消息气泡、模态框等一次性动画 — 动画结束后元素静止，不需要提前提升合成层 */
```

用 JS 在动画开始前设置 `will-change`，动画结束后立即移除：

```js
element.style.willChange = 'transform, opacity';
// ... 动画完成回调
element.style.willChange = 'auto';
```

### 13.2 避免触发 Layout / Reflow 的属性

**只用 transform + opacity 做动画**，不动 width/height/margin/padding（以下情况除外）：

| 允许动 | 原因 |
|---|---|
| `width`（面板折叠） | 无替代方案，已在 §6.3 规定 |
| `height`（列表删除、折叠块） | 同上，配合 `overflow:hidden` |
| `stroke-dashoffset`（SVG 线段） | 不触发 HTML layout |

面板 width 动画期间，**内部内容用 opacity 过渡而非 transform**，避免引起子元素 layout 联动。

### 13.3 framer-motion 使用规范

- 始终从 `motion/react` 导入（不用 `framer-motion` 旧路径）
- `AnimatePresence` 只在**确实需要 exit 动画**的组件处添加，不要无脑包裹所有组件
- 列表动画用 `variants` + `staggerChildren`，不用 `useEffect` + `setTimeout` 模拟
- `layout` prop 只用于**真正需要自动布局过渡**的容器（如列表删除补位），不滥用

---

## §14 实施检查清单

新增/修改组件时，逐条确认：

- [ ] 所有 duration 值使用 `DURATION.*` 常量（不硬编码 ms 数字）
- [ ] 所有 ease 值使用 `EASE.*` 常量
- [ ] 入场动效是 `inkRise` 或其变体，不是自定义 keyframe
- [ ] 离场动效存在（AnimatePresence 包裹）
- [ ] hover 响应 ≤ 0.18s
- [ ] 无 `transition-duration > 0.80s`（环境循环除外）
- [ ] 无 spring/bounce 配置（framer-motion 中无 `type: 'spring'`）
- [ ] `useMotion().reduced` 检查生效（duration 可归零）
- [ ] filter blur 动效已接受 `reduced` 覆盖
- [ ] 持续运动元素的 `will-change` 在动画结束后已移除
- [ ] 高频触发路径（流式 delta）无 framer-motion 组件重绘
