# WorldEngine 前端 — Agent 规则

本文件承接根目录 `CLAUDE.md`，只写前端、主题、动效、视觉设计相关规则；通用规则见 `../CLAUDE.md`。主题包字段与 token 白名单见 `src/visual/README.md`。

## 硬约束

- 核心 token 与动效包样式在 `frontend/src/themes/`（动效包样式在其 `motion/` 下）；可切换的视觉主题包在 `frontend/src/visual/<theme-id>/`，由 `core/visual/visualThemes.js` 按目录收录。
- 主题包只覆写 `--we-*` token，不写组件选择器或 `@font-face`。
- 页面截图位于 `docs/images/`；除 `bookshelf.png` 外均为本地私密文件，不得提交；完成视觉改动后，用当前页面的新截图覆盖对应文件：起好前后端后运行 `npm run shots -- <名字…>`（不带名字拍全部，`--theme <id>` 另存一套其他主题；名字与拍摄口径见 `scripts/screenshots.mjs`）。

## 视觉设计流程

- 动效和主题的设计一律先在 `/dev/design` 出样，由用户在浏览器里做视觉验证；用户同意前，不改正式组件、动效包、主题包和全局样式。
- 出样期间新增内容只放在 `frontend/src/pages/DesignLabPage/`，用户同意后再落地到正式代码。
- 视觉验证由用户做，不要用 agent-browser 或截图代替。

### 出样约定

- 出样放 `DesignLabPage/sketch/`，用 `Compare` 做「现在 / 出样 · 未落地」左右对照；界面文案叫「出样」，不叫「提案」。
- 出样样式的选择器挂在 `.we-sketch-*` 下，不能影响「现在」一侧；优先复用动效包已有的关键帧和 `--ink-*`、`--sig-*`、`--press-*` 等变量，不重写。
- 实验室路由只在开发环境存在，生产构建不含出样样式，不能用 build 通过来证明出样没问题。
- 新增受动效控制的位置，先在 `slots.js` 登记：走动效包的必须有演示，还没接入的标 `blind`；包样式直接接管的核心类记进 `hooks`。测试核对包的每个接口和接管的类都有动效位认领。

### 动效设计标准

- 每个包有一个签名动作：墨流是「洇」（湿墨色和光晕从触点扩散，再干成常态色），信号是「锁」（锁定瞬间磷光帧硬切外扩、文字双曝光撕裂，不用扫描线；错位撕裂只在事件瞬间爆一次；锁定跃迁用代码雨），活字是「印」（重物加速落下、接触时顿两帧、压过头再弹回，接触面的凹印随后平复；纸只在动的时候有厚度，静止时平印，不用墨迹扩散）。设计前先说明新动效服务于哪个签名动作，不要各套一遍「缩放弹跳」或「透明度闪烁」。
- 每个动效位只放一个被记住的动作，不叠多个效果；同一个位置在不同包下功能一致、手感不同。
- 不缩放会含文字的元素（文字会抖）；大面板不加模糊、不横向抖动。
- 普通过渡（悬停、色变、显隐、折叠、抽屉）只选动效角色：CSS 成对写 `--we-motion-<角色>-duration / -easing`，JS 用 `useMotion().role()`；错峰用 `--we-motion-stagger` / `STAGGER`。
- 角色默认值在 `core/utils/motion.js`；动效包改节奏写在包的 `rhythm`，CSS 同值写在包的 `:root[data-motion]`。
- 「减少动态效果」：`index.css` 的全局降级把动画与过渡的时长、延迟清零，动画直接落到末帧；包和组件的降级块不写 `animation / transition: none`，只写静止终态修正（悬停位移、缩放、遮罩回常态，或带 fill 的动画末帧不等于常态）。JS 走 `useMotion` 的 `reduced`。

### 落地清单

用户同意出样后，落地到正式代码时依次做：

1. 改动效包和 `frontend/src/themes/motion/<id>.css`；JS 与 CSS 有意镜像的部分（如信号的 `variants.enter` 与 `we-signal-in`、`SURFACE` 曲线）两边同步改。
2. 更新 `slots.js`：`blind` 改 `pack`，补 `api` 与 `note`；出样对照改成正式演示，清掉对应出样文件。
3. 动效值不写字面量（CSS 变量声明与 JS 的 framer 过渡也查）：核心用动效角色；包的材质时长取本包时间阶梯（墨流 `--ink-t1..t6`，信号按 `--sig-frame` 帧数与 `--sig-beat / -hold`，活字 `--press-*`，一记印按 `--press-beat` 的比例切），字面量只写在阶梯与曲线定义处并加 `guard-allow(literals)`。
4. 跑 `npm run check:guards`（含 `check:motion`）和 frontend 的 `tests/motion`、`tests/components/motion`、`DesignLabPage` 测试。

### 新增动效包

- 包文件提供完整接口、`traits`（依赖包身份的组件行为都写这里，组件不按包 id 判断）和 `rhythm`（不改节奏写 `{}`），在注册表登记，并提供同名样式 `frontend/src/themes/motion/<id>.css`（按目录自动引入）。
- 包样式里的 `--we-*` 只能是接口 `--we-fx-*`（核心引用的都要给）和节奏角色 `--we-motion-*`；其余变量用本包私有前缀。
- 后端 `services/config.js` 的 `MOTION_PACK_IDS` 也要加，否则用户选了新包会被静默改回默认包。
- 漏接由 `tests/motion/` 下的测试和动效位清单测试报错，照报错补齐，不要绕过。

### 视觉设计标准

- 设计方向：年轻、大胆、创新，即炫酷、动感、有游戏感；拒绝克制、保守、商务。情绪关键词只是参考，整套风格要统一，不做成模板感的默认样式。
- 世界主色由封面提取，只在深色主题下覆盖强调色；主题自带的强调色只在世界外（书架、设置等）露面。
- 改动会影响所有主题：核心样式（`themes/` 下除 `tokens.css`、`fonts.css`、`motion/` 外的样式文件）和 token 的改动，要在夜航（暗）和古典羊皮纸（亮）两套主题下都看；用户验证时也要两套都交代。
- 组件样式只消费 token，不写颜色、字号、圆角、阴影、层级等字面量（`literals` 守卫会拦）；能复用已有 token 就复用，确实没有再新增。
- 按钮只用 `Button` / `IconButton`（色调 primary / secondary / ghost / text / danger / overlay × 尺寸 sm / md / lg，高度取 `--we-control-h-*`；返回、消息与章节下方的操作、收起展开这类安静的文字操作用 text）；`components/ui/` 以外不手写 `we-btn*` 类（`literals` 守卫的 primitive-class 会拦），也不按所在容器改写按钮外观。
- 弹窗只用 `Dialog`（标准 / alert 确认两种版式 × sm / md / lg / xl 宽度；确认用 `ConfirmModal`；向导换步时后一步传 `continued` 接替前一步）：它自己挂到 body、圈住焦点、统一 Esc / 点空白 / 关闭键，忙时用 `busy` 挡住关闭；调用方用 `AnimatePresence` 包住条件渲染，嵌套弹窗直接再渲染一个，不手写遮罩或层叠包装。
- 表单与标签只用 `components/ui/` 的组件：`Badge`（静态标签，矮小、圆角 sm，按 tone 着色）、`SegmentedControl`（单选分段）、`Input` / `Select`（md 36 / sm 28，编辑器与表单行内用 sm）、`Textarea`、`TagInput`、`Checkbox`、`ToggleSwitch`（md / sm）；开关式的文字按钮用 `Button` 加 `aria-pressed`。下拉面板取共用的 `.we-menu` / `.we-menu__item` 表面，定位各自负责。
- 卡片与占位只用 `components/ui/` 的组件：`Card`（raised 浮起卡放可点的独立内容 / outlined 描边行放编辑器与设置里的一行一项 / sunken 凹陷框在面板里再分一块 × compact / default / spacious；选中一律 `selected` 强调色描边加淡底；只要类名时用 `ui/cardClassName.js`）、`ListItem`（导航与侧栏列表的一行）、`SectionTitle`（section / group / eyebrow 三级，线在下方或右侧）、`Divider`、`Skeleton`（等数据用；等 AI 用文字说明）、`EmptyState`（整页 lg、列表与面板里 sm）。标题与小标题不用斜体，斜体只留给叙事文字。
- 文字只选字体角色（`.we-type-<角色>` 类，或同一规则块写齐 `--we-type-<角色>-size / -leading / -tracking`），不单独挑字号、行高、字距。
- 半透明与混色的浓度只取透明度阶梯 `--we-alpha-1..5`；阴影只用 `--we-elevation-1..3` 与 `--we-shadow-inset`，主题调浓淡用 `--we-shadow-strength`。
- 弱化文字走文字阶梯（`--we-color-text-secondary / -tertiary / -faint`），不叠 `opacity`；`opacity` 只用于 0/1 显隐和 `--we-opacity-disabled`。直接放在深色书桌（壳层）上、不垫纸面的内容挂 `.we-on-shell`。

### 视觉出样与落地

- 视觉位登记在 `DesignLabPage/visualSlots.js`：新增受主题控制的视觉，先登记并补演示，测试会核对每个核心 token 都被某个视觉位认领。
- 新主题或大改现有主题的取值，先做成草稿，用户确认后才搬进 `visual/<id>/`；草稿流程、落地清单、新字体与深色画布限制见 `visual/README.md`。
