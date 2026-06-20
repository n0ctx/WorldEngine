# 动效与动画（Motion & Animation）

WorldEngine 动效体系真源。任何改动效 token、缓动曲线、入场/离场行为、关键帧之前先读本页。
落地背景与分阶段规划见 [`docs/motion-system-plan.md`](../../motion-system-plan.md)。

---

## 1. 架构：一个真源 → 两个消费面

- **真源**：`frontend/src/core/utils/motion.js`（`DURATION` / `EASE` / `STAGGER` / `BLUR` / `variants` / `transitions`）。
- **消费面 A — framer-motion**：组件入场/离场/存在性、列表 stagger、Modal/Toast，直接 import `variants`/`transitions`，并经 `useMotion()`（`core/hooks/useMotion.js`）做 reduced-motion 降级。
- **消费面 B — CSS transition**：hover/active/focus 微交互，消费 `tokens.css` 的 `--we-duration-*` / `--we-easing-*` token。
- **防漂移闸门**：`scripts/check-motion.mjs`（`npm run check:motion`，已并入 `npm run lint`）断言 CSS token 与 `motion.js` 按 §3 语义映射一致。**不能合并成单一系统**——项目硬约束要求 CSS 消费 `--we-*`、framer 需裸 JS 数值。

## 2. Token 定义（真源 = motion.js）

### 2.1 时长 DURATION（秒）
| key | 值 | 用途 |
|---|---|---|
| `instant` | 0 | 无动画 |
| `micro` | 0.10 | 极短反馈 |
| `quick` | 0.18 | hover 色变、工具提示 |
| `base` | 0.30 | 局部反馈、落笔确认 |
| `medium` | 0.38 | 组件入场、Modal 内容 |
| `slow` | 0.50 | 章节标题、场景分隔慢显 |
| `crawl` | 0.75 | 大幅度装饰过渡 |
| `ambient` | 2.00 | 氛围循环（光标、呼吸） |

### 2.2 缓动 EASE
| key | cubic-bezier | 隐喻 / 用途 |
|---|---|---|
| `ink` | (.22, 1, .36, 1) | 墨水浸润：主入场 |
| `page` | (.65, 0, .35, 1) | 翻页：路由/壳切换 |
| `quill` | (.40, 0, .20, 1) | 落笔：盖印、点击确认 |
| `sharp` | (.25, .46, .45, .94) | 利落：hover 色变、工具提示 |
| `retract` | (.55, 0, 1, .45) | 收回：离场、折叠 |
| `linear` | linear | 流式文字匀速渐入 |

### 2.3 STAGGER：`list 0.05 / panel 0.06 / character 0.08`
### 2.4 BLUR：`entry 1.5px / edit 2px / overlay 0px`

## 3. CSS ↔ JS 语义映射（check-motion 守护）

CSS 只暴露 4 个时长槽给主题，按**语义**（非标签）对齐 JS：

| CSS token | 值 | ↔ JS DURATION | 语义 |
|---|---|---|---|
| `--we-duration-fast` | 180ms | `quick` (0.18) | hover 色变 |
| `--we-duration-normal` | 300ms | `base` (0.30) | 局部反馈 |
| `--we-duration-slow` | 380ms | `medium` (0.38) | 组件入场 |
| `--we-duration-extended` | 500ms | `slow` (0.50) | 慢显 |

缓动 token `--we-easing-{ink,sharp,page,quill,retract}` 与 `EASE` 同名一一对应。`--we-easing-standard` 为 deprecated 兼容项。

> 主题包（`themes/<id>/theme.css`）**可覆写** `--we-duration-*` 取值（如 edu-clay 略放慢），不受 check-motion 约束——闸门只校验内核 `tokens.css`。

## 4. 动效分层职责

| 层级 | 用什么 | 隐喻 | 例子 |
|---|---|---|---|
| 微交互 | CSS transition + `--we-duration-fast` + `--we-easing-sharp` | — | 按钮 hover、tab、chip 选中 |
| 入场/离场 | framer `variants.inkRise` / `staggerList` / `overlayBackdrop` | 墨水浮现 | 消息气泡、面板项、Modal |
| 路由/壳切换 | framer `AnimatePresence` + `EASE.page` | 翻页 | 列表↔编辑↔聊天（**与页内 Pager 切片解耦**） |
| 氛围/装饰 | 局部 `@keyframes`（命名 `we-<kebab>`） | 落印/呼吸 | StreamingCursor、SealStamp |

## 5. 硬约束

- **每屏关键动效 ≤ 1-2 个**，不要"全员乱动"。
- 只动 `transform` / `opacity` / `filter`，禁止动 `width/height/top/left`（触发重排）。
- 入场用 ease-out 系（ink/sharp），离场用 retract；禁止线性 UI 过渡（流式文字除外）。
- **必须支持 `prefers-reduced-motion`**：CSS 侧 `tokens.css` 媒体查询把 duration→0、easing→linear；JS 侧用 `useMotion()`。
- `@keyframes` 命名统一 `we-<kebab>`；装饰性循环动画须受 reduced-motion 控制。
- 路由级 `PageTransition` 与页内 `Pager` 切片冲突，默认 `ENABLED=false`；改动前先隔离验证。

## 6. 同步触发器

| 变更 | 必须同步 |
|---|---|
| 改 `motion.js` 的 DURATION/EASE/variants | 本页 §2/§3 + 跑 `npm run check:motion` |
| 改 `tokens.css` 动效 token | 本页 §3 + `check:motion` + 必要时主题包 |
| 新增/改 `@keyframes` 或入场行为 | 本页 §4 |
