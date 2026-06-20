# 动效构建方案（Motion System Plan）

> 目标：把当前"漂移、半休眠、无真源"的动效现状，收敛为一套**单一真源 + 双消费面 + 防漂移闸门**的动效体系，并按交互类别（而非逐文件）补齐覆盖。
> 本文件是**方案**，不是最终真源；真源已落在 [`docs/references/frontend/motion-and-animation.md`](references/frontend/motion-and-animation.md)。
>
> **落地状态（2026-06-20）：Phase 1–5 全部完成。** 验证：`check:motion`/`check:tokens`/`check:themes`/`check:docs` 全绿，前端 eslint 干净，build 通过，214 测试通过（1 个 `EntrySection` 快照失败为既有漂移，与本次无关）。Phase 4 经判断维持 `PageTransition` `ENABLED=false`（与页内 Pager 切片冲突），决策已写入代码注释与本文 §决策 D。

---

## 0. 一句话结论

**这不是"没有动效体系"，而是"一套体系裂成了两半、丢了规格、还被关掉了一部分"。** 因此本方案的动作是**整合 + 立规格 + 扩覆盖**，而不是从零设计——这样改动更小，也尊重已有的、贴合"书卷/墨水"主题的动效词汇。

---

## 1. 现状诊断（基于代码证据）

| 维度 | 现状 | 证据 |
|---|---|---|
| 动效原语**已存在且有主题性** | `ink/page/quill/sharp/retract` 缓动 + `inkRise/staggerList/pageTransition` variants | `frontend/src/core/utils/motion.js` |
| **两套 token 漂移未对齐** | CSS：`fast=120 / normal=200 / slow=320 / extended=500`；JS：`micro=100 / quick=180 / base=300 / medium=380 / slow=500`。**数值与命名都对不上** | `tokens.css:147-155` vs `motion.js:4-29` |
| **真源文档缺失** | `motion.js` 顶注"权威定义见 MOTION.md §2"，但 **MOTION.md 全仓不存在** | `find -iname MOTION.md` 无结果 |
| 覆盖不全 | framer-motion 仅接入 **22 / 104** 个 jsx，集中在 chat/ui，settings/state/world/persona 等基本无动效 | `grep -rln framer-motion src` |
| **路由级过渡被硬关** | `PageTransition` 顶部 `const ENABLED = false`，直接返回静态容器 | `PageTransition.jsx:6` |
| 关键帧命名混乱 | 17 个 `@keyframes` 三种风格混用：`weInkRise`（camel）/ `we-ink-rise`（kebab）/ `typing-dot`（无前缀），且 `weInkRise` 与 `we-ink-rise` 疑似重复 | `grep @keyframes *.css` |
| reduced-motion 已覆盖（半） | CSS 媒体查询把 4 个 duration 归零；JS 侧 `useMotion()` 同样处理 | `tokens.css:394`、`useMotion.js` |

**根因**：动效原语先在 CSS 落地、后又在 JS 重做一遍，两次之间没有"单一真源 + 对齐闸门"，于是各自演化、命名分叉、规格文档丢失，路由动效因与页内 `Pager` 切片机制冲突而被注释关闭。

---

## 2. 设计决策（方案的脊梁）

### 决策 A：`motion.js` 为唯一真源，`tokens.css` 动效块由它派生对齐
- 不能合并成单一系统：项目硬约束要求 CSS transition 消费 `--we-*` token，而 framer-motion 需要裸 JS 数值。所以是**一个真源 → 两个消费面**。
- `motion.js` 的 JS scale 更丰富、更贴主题，**封它为 canonical**。`tokens.css` 的 `--we-duration-*` / `--we-easing-*` 改为与 JS scale 一一对应（见 §3 映射表）。
- **不重造新 scale**：ink/page/quill/retract 曲线本身没问题，正是"线性显得机械、入场用 ease-out"所要的，保留。

### 决策 B：新增 `check:motion` 闸门，防止两面再漂移
- 仿照已有的 `npm run check:themes` 机制（而非 build-time 代码生成，保持与仓库现有做法一致）。
- 脚本读取 `motion.js` 的 `DURATION`/`EASE`，断言 `tokens.css` 的对应 `--we-*` token 数值一致；不一致则 CI 失败。

### 决策 C：动效职责按"层"划分到两个消费面
| 层级 | 用什么 | 例子 |
|---|---|---|
| **微交互**（hover/active/focus、色变、阴影、chip 选中） | **纯 CSS transition** 消费 `--we-duration-fast` + `--we-easing-sharp` | 按钮 hover、翻页键下压、tab 切换 |
| **入场/离场/存在性**（条目出现、面板展开、Modal、Toast、列表 stagger） | **framer-motion** variants（`inkRise`/`staggerList`/`overlayBackdrop`） | 消息气泡、状态面板项、确认弹窗 |
| **路由/壳切换**（世界列表 → 聊天 → 写作） | framer-motion `AnimatePresence`，但**与页内 `Pager` 切片解耦**（见决策 D） | 进入/退出 book-spread shell |
| **氛围/装饰**（流式光标、思考点、盖印） | 局部 `@keyframes`，命名规范化 | StreamingCursor、SealStamp |

### 决策 D：澄清"翻页"语义，路由过渡不踩回旧坑
- `PageTransition` 被关，是因为本应用的"翻页"是**页内 `Pager` 切片切换**（changelog 第 110-114 行），路由级过渡会与之打架。
- 方案**不盲目 `ENABLED=true`**。路由动效只用于**真正的壳/页面切换**（列表 ↔ 编辑 ↔ 聊天），且 overlay 路由（已有 `backgroundLocation` 判定）不触发。先在隔离分支验证无双挂载/闪烁，再决定是否启用。

### 决策 E：反蔓延原则——"每屏 1-2 个关键动效"
- 引自动效最佳实践（"Animate 1-2 key elements per view maximum"）。覆盖阶段按**交互类别**补，不是"凡是能动的都动"。
- 每个动效绑定书卷隐喻，避免炫技：**翻页=路由/壳切换、墨水浮现=内容入场、落印=提交确认、收回=离场/折叠**。

---

## 3. Token 对齐映射（决策 A 落地表）

| 语义 | JS（真源 `motion.js`） | CSS token（需改 `tokens.css`） | 当前 CSS（待废弃） |
|---|---|---|---|
| 微交互/hover | `quick = 0.18` | `--we-duration-fast: 180ms` | `120ms` ❌ |
| 局部反馈 | `base = 0.30` | `--we-duration-normal: 300ms` | `200ms` ❌ |
| 组件入场 | `medium = 0.38` | `--we-duration-slow: 380ms` | `320ms` ❌ |
| 慢显/章节 | `slow = 0.50` | `--we-duration-extended: 500ms` | `500ms` ✅ |
| 主入场曲线 | `EASE.ink` | `--we-easing-ink`（已一致）✅ | — |
| 利落 hover | `EASE.sharp` | `--we-easing-sharp`（已一致）✅ | — |
| 翻页/路由 | `EASE.page` | **新增** `--we-easing-page` | 缺 |
| 落印/确认 | `EASE.quill` | **新增** `--we-easing-quill` | 缺 |
| 收回/离场 | `EASE.retract` | **新增** `--we-easing-retract` | 缺 |

> `--we-easing-standard`（兼容保留）标记 deprecated，下一轮清理。
> 新增 token 须同步 `_template/theme.css` 与各内置主题（`npm run check:themes`）。

---

## 4. 命名规范化（关键帧）

- 统一前缀与风格：全部 `@keyframes we-<name>`（kebab，`we-` 前缀），与 CSS 类命名规范一致。
- 合并疑似重复：`weInkRise` / `we-ink-rise` 二选一；`typing-dot` → `we-typing-dot`。
- 装饰性 `@keyframes` 一律包在 `@media (prefers-reduced-motion: no-preference)` 内或受 reduced-motion token 控制，避免无障碍下持续动画。

---

## 5. 实施阶段（每阶段独立可验证）

### Phase 1 — 立真源 + 对齐 + 闸门（基础，无视觉变化）
1. 新建 `docs/references/frontend/motion-and-animation.md`，把 §2/§3/§4 固化为真源（§2.1 时长、§2.2 缓动、§2.3 stagger…），`motion.js` 顶注的 "MOTION.md" 引用改指向它。
2. 按 §3 映射表改 `tokens.css` 动效块，新增 3 个 easing token，同步主题包。
3. 新增 `scripts/check-motion.mjs` + `package.json` `check:motion`，并入 `npm run check`。
4. 同步：在 CLAUDE.md "同步触发器"表加一行"修改动效 token/曲线 → `motion-and-animation.md`"。
- **验证**：`npm run check`、`npm run check:themes`、`npm run check:motion` 全绿；视觉零变化（纯对齐）。

### Phase 2 — 微交互层补齐（CSS，体感最直接）
- 给所有可点击/可 hover 元素统一 `transition` + `cursor: pointer` + 三态（hover/active/focus-visible）。
- 重点面 settings/state/world/persona 当前几乎无过渡，逐 CSS 文件补 `--we-duration-fast` 色变/阴影过渡（**不加位移**，避免布局抖动）。
- **验证**：手动过一遍按钮/卡片/输入框/tab hover；`prefers-reduced-motion` 下应静止。

### Phase 3 — 入场/离场层扩覆盖（framer-motion）
- 按交互类别接入既有 variants（不发明新动画）：
  - 列表（会话列表、世界/角色卡、状态条目）→ `staggerList` + `listItem`。
  - Modal/Toast/确认 → 已接入的复用，补未接入的（settings 内弹窗）。
  - 面板展开/折叠 → `inkRise` / `retract`。
- 守"每屏 1-2 关键动效"，stagger 子项数量上限保护（长列表只对首屏 stagger）。
- **验证**：进入各页观察入场；长列表不卡顿（transform/opacity 而非 width/height）。

### Phase 4 — 路由/壳切换（隔离验证，谨慎）
- 在 worktree 隔离分支验证 `PageTransition` 重新启用是否与 `Pager` 切片、book-spread 双页布局冲突（双挂载/闪烁）。
- 仅对真正壳切换启用 `page` 曲线过渡；overlay 路由不触发。验证通过才合并，否则维持 `ENABLED=false` 并在真源文档记录"路由动效由页内 Pager 承担"。
- **验证**：列表↔聊天↔写作切换无闪烁、无滚动跳变。

### Phase 5 — 氛围层 + 清理
- 关键帧命名规范化（§4），删重复，统一 reduced-motion 包裹。
- 删除 `--we-easing-standard` 等 deprecated token。
- 真源文档补"氛围动效清单"。

---

## 6. 验收标准

- [ ] `motion.js` 与 `tokens.css` 动效数值由 `check:motion` 保证一致，无法再漂移。
- [ ] 动效真源文档存在并被 CLAUDE.md 同步表引用。
- [ ] 全部可交互元素有 hover/active/focus-visible 三态过渡 + `cursor: pointer`。
- [ ] 主要列表/弹窗/面板有入场动效，均复用既有 variants。
- [ ] `prefers-reduced-motion: reduce` 下所有 duration→0、装饰动画停止。
- [ ] 每屏关键动效 ≤ 1-2 个，无"全员乱动"。
- [ ] `@keyframes` 命名统一 `we-<kebab>`，无重复。

---

## 7. 风险与不做的事

- **不做**：自研动画库、滚动驱动视差/scroll-jacking（无障碍高危）、>500ms 的 UI 过渡、装饰元素无限循环动画。
- **风险**：Phase 4 路由动效与 Pager 冲突——已用隔离分支前置验证化解，失败即回退、不强推。
- **风险**：长列表 stagger 卡顿——只对首屏 stagger，子项数上限保护。
