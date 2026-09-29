# WorldEngine — Agent 入口

本文件只保留协作与执行规则，不维护文档路由。需要项目上下文时，从代码、调用链和测试判断，不以旧文档为准。

## 工作原则

- 改前先看现状：修改任何文件前，先读相关代码、调用链和现有测试。
- 复杂任务先规划：超过 3 个步骤的任务先列简短计划；用户已经给定边界时不要重复确认。
- 优先代码真相：不要依赖旧文档推断行为；接口、schema、状态流、样式规则以代码和测试为准。
- 页面截图位于 `docs/images/`；除 `bookshelf.png` 外均为本地私密文件，不得提交；完成视觉改动后，用当前页面的新截图覆盖对应文件。
- 自动验证：按改动范围自行判断并执行必要测试；测试完成后清理本次产生的 `/.temp/` 临时文件。
- 保护用户改动：工作区可能有未提交改动，不能回滚未明确属于本次任务的文件。

## 视觉设计流程

- 动效和主题的设计一律先在 `/dev/design` 出样，由用户在浏览器里做视觉验证；用户同意前，不改正式组件、动效包、主题包和全局样式。
- 出样期间新增内容只放在 `frontend/src/pages/DesignLabPage/`，用户同意后再落地到正式代码。
- 视觉验证由用户做，不要用 agent-browser 或截图代替。

### 出样约定

- 出样放 `DesignLabPage/sketch/`，用 `Compare` 做「现在 / 出样 · 未落地」左右对照；界面文案叫「出样」，不叫「提案」。
- 出样样式的选择器挂在 `.we-sketch-*` 下，不能影响「现在」一侧；优先复用动效包已有的关键帧和 `--ink-*`、`--we-cut` 等变量，不重写。
- 实验室路由只在开发环境存在，生产构建不含出样样式，不能用 build 通过来证明出样没问题。
- 新增受动效控制的位置，先在 `slots.js` 登记：走动效包的必须有演示，还没接入的标 `blind`；测试会核对动效包的每个接口都有动效位引用。

### 动效设计标准

- 每个包有一个签名动作：墨流是「洇」（湿墨色和光晕从触点扩散，再干成常态色），信号锁定是「锁」（括号分拍收紧、落定，不用扫描线；错位撕裂只在事件瞬间爆一次）。设计前先说明新动效服务于哪个签名动作，不要各套一遍「缩放弹跳」或「透明度闪烁」。
- 每个动效位只放一个被记住的动作，其余克制；同一个位置在不同包下功能一致、手感不同。
- 不缩放会含文字的元素（文字会抖）；大面板不加模糊、不横向抖动；时长和缓动优先用 `--we-duration-*`、`--we-easing-*`。
- 出样必须遵守「减少动态效果」：CSS 出样在媒体查询下静止，JS 走 `useMotion` 的 `reduced`。

### 落地清单

用户同意出样后，落地到正式代码时依次做：

1. 改动效包和 `themes/motion/<id>.css`；JS 与 CSS 有意镜像的部分（如信号的 `variants.enter` 与 `we-signal-in`、`SURFACE` 曲线）两边同步改。
2. 更新 `slots.js`：`blind` 改 `pack`，补 `api` 与 `note`；出样对照改成正式演示，清掉对应出样文件。
3. 动效值不写字面量：用时长和缓动 token，动效包自己的材质有意写字面量时加 `guard-allow(literals)` 并写理由；改了时长 token 要同步 `check:motion`。
4. 跑 `npm run check:guards`、`npm run check:motion`，以及 frontend 的 `tests/motion`、`tests/components/motion` 和 `DesignLabPage` 测试。

### 新增动效包

- 包文件提供完整接口与 `traits`（组件依赖包身份的行为都写在 `traits` 里，组件不按包 id 判断），在注册表登记，并提供同名样式文件 `themes/motion/<id>.css`（按目录自动引入）。
- 后端 `services/config.js` 的 `MOTION_PACK_IDS` 也要加，否则用户选了新包会被静默改回默认包。
- 漏接由 `tests/motion/` 下的测试和动效位清单测试报错，照报错补齐，不要绕过。

### 视觉设计标准

- 站点的视觉原则是「把颜色让给世界封面」：世界主色由封面提取、只在深色主题下覆盖强调色，全站只此一处彩色。所以主题自带的强调色要克制、低饱和，新主题不要靠大面积高饱和色出效果。
- 情绪关键词只是参考，要的是统一的高级感，同时大胆有动感，不要畏缩、不要做成模板感的默认样式。
- 改动会影响所有主题：核心样式（`ui.css` / `pages.css` / `chat.css`）和 token 的改动，要在夜航（暗）和古典羊皮纸（亮）两套主题下都看；用户验证时也要两套都交代。
- 组件样式只消费 token，不写颜色、字号、圆角、阴影、层级等字面量（`literals` 守卫会拦）；能复用已有 token 就复用，确实没有再新增。

### 视觉出样与落地

- 视觉位登记在 `DesignLabPage/visualSlots.js`：新增受主题控制的视觉，先登记并补演示，测试会核对每个核心 token 都被某个视觉位认领。
- 新主题或大改现有主题的取值，先做成草稿：复制 `themes/_template/theme.css` 到 `DesignLabPage/drafts/<名字>.css`，实验室「主题」一行会出现「草稿 · 名字」，临时预览、不写配置、热更新。用户确认后才搬进 `themes/<id>/`。
- 落地清单：搬进 `themes/<id>/` 并补 `theme.json`；新增或改名了核心 token 时，同一次提交里同步 `_template/theme.css`、给视觉位认领、按需给两个内置主题补取值；跑 `npm run check:guards`（含 `check:themes`）和 `frontend` 的 `tests/themes`。
- 新字体只能在核心 `fonts.css` 声明 `@font-face`，主题包用 `--we-font-*` 引用；中文字体体积大，先确认授权和体积再引入。
- 新的深色主题，画布不能比取色基准（`core/utils/accentBasis.js`）更亮，否则世界主色的对比度保证不成立，测试会拦。

## 高频硬约束

- 数据库查询只能放在 `backend/db/queries/`。
- 前端 `fetch` 只能经 `frontend/src/core/api/`。
- 写卡助手前端接入只允许经 `frontend/src/core/features/assistant/`。
- 核心主题层在 `frontend/src/themes/`；可切换主题包在 `themes/<theme-id>/`。
- 主题包只覆写 `--we-*` token，不写组件选择器或 `@font-face`。

## 验证口径

- 前端改动：优先跑相关 frontend lint/test/build。
- 后端改动：优先跑相关 backend lint/test。
- assistant 改动：优先跑 assistant 相关测试。
- 文案或纯注释改动：可只做静态检查或说明无需运行测试。
- 源码守卫共 9 个（体量、复杂度、重复、死代码、测试形态、运行形态、硬编码字面量、循环依赖、架构边界），另有无基线的主题对齐检查 `check:themes`（模板漏列核心 token、主题覆盖不存在的 token 即失败）；统一用 `npm run check:guards` 全部跑完并汇总结果；单个用 `npm run check:<名字>`，守卫自身的测试是 `npm run test:guards`。基线在 `scripts/*-baseline.json`，只许降不许升：新增违规要修掉；报「基线虚挂」说明问题已改善，用对应脚本的 `--update-baseline` 刷新基线并一起提交。不要为凑指标拆分内聚代码。检测器分不清的有意写法（前后端镜像、一次性迁移、验证重复初始化等）在代码上一行写 `// guard-allow(<守卫名>): <理由>`（CSS 里写成紧贴上一行的块注释），只支持 dead-code / duplication / perf-shape / tests / literals；规则见 `scripts/guard-common.mjs` 头部，不要拿它绕过真问题。
