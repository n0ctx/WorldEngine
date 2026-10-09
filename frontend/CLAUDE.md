# WorldEngine 前端 — Agent 规则

## 视觉与动效工作流

- 设计新主题、动效或大幅调整现有视觉时，先在开发环境的 `/dev/design` 出样，让用户在浏览器中确认方向，再落地正式页面、主题或动效包。出样放 `src/pages/DesignLabPage/`；用 `Compare` 展示现状与出样，出样选择器限定在 `.we-sketch-*` 下，不能影响现状。纯缺陷修复按问题范围直接修改。
- 视觉检查由用户在浏览器中完成。正式页面的视觉改动完成后，列出用户需要检查的页面；涉及通用样式或 token 时，提醒至少检查夜航和古典羊皮纸两套主题。
- 页面截图保存在仓库根目录 `docs/images/`。除 `bookshelf.png` 外，这些截图可能包含私密内容，已被 Git 忽略。用户要求更新截图时，用根目录的 `npm run shots -- <页面名…>`；可用页面名和主题参数见 `scripts/screenshots.mjs`。

## 样式归属

- 核心 token、通用组件样式及动效包 CSS 在 `src/themes/`；主题取值在 `src/visual/<id>/`，只能覆盖允许的 `--we-*` token，不能放组件选择器或 `@font-face`。token 做不出的整套造型写成外观皮肤 `src/themes/skins/<主题 id>/`，选择器以 `:root[data-theme="<主题 id>"]` 开头。主题结构、皮肤、草稿和白名单见 `src/visual/README.md`。
- 组件优先使用 `src/components/ui/` 的现有基础件；组件样式消费 token，不在使用处重写按钮、弹窗等基础件的外观。字体、颜色、透明度、阴影和普通交互节奏优先使用现有 token 与动效角色。
- 视觉方向保持年轻、有游戏感；既有动效包各有签名动作：墨流「洇」、信号「锁」、活字「印」、掷「掷」。新增动效先匹配所在包的动作语言，避免所有包共用同一种缩放或淡入效果；不要缩放含文字的元素。
- 动效逻辑在 `src/core/motion/`，包样式在 `src/themes/motion/`。新动效位登记到 `src/pages/DesignLabPage/slots.js`；新主题控制的视觉位登记到同目录的 `visualSlots.js`，并补可查看的演示。动效包的 JS `rhythm` 与 CSS 节奏值保持一致；尊重 `useMotion` 的减少动态效果设置。
- 新增动效包时，同时登记包逻辑与同名 CSS，并更新 `backend/services/config.js` 的 `MOTION_PACK_IDS`，否则用户选择可能被恢复为默认包。修改通用样式、动效接口或主题 token 后，运行相关前端测试及 `npm run check:guards`。
