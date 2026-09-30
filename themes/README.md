# WorldEngine 视觉主题包开发指引

根目录 `themes/` 只存放视觉主题包，均为仓库内置、只读：应用内只能查看列表和切换，不能导入、导出、删除或由写卡助手创建。新增主题只能由开发者在此目录添加。

动效包不在这里：逻辑在 `frontend/src/core/motion/`，样式在 `frontend/src/themes/motion/`，规则见 `frontend/CLAUDE.md`。

## 分层职责

主题系统分成三层：

```text
frontend/src/themes/
  - tokens.css: 核心默认 token，保持中性
  - fonts.css: 核心字体默认值，保持中性
  - ui.css / pages.css / chat.css: 组件与页面样式，只消费 token
  - motion/<pack-id>.css: 动效包样式，只声明 --we-fx-* 接口与 --we-motion-* 节奏变量

themes/<theme-id>/
  - theme.json: 视觉主题元信息
  - theme.css: 仅覆盖 --we-* token

frontend/src/shells/
  - shell 负责结构、布局、壳层装饰
```

核心层负责“默认可用”，视觉主题负责“视觉取值”，动效包负责“动效风格”，shell 负责“结构与布局”。主题不能替代 shell，也不应该把组件选择器写回主题目录。

## 对齐检查

运行以下命令检查内核 / 模板 / 主题三层是否对齐（无盲区、无孤悬覆盖），它也包含在 `npm run check:guards` 里：

```bash
npm run check:themes
```

退出码说明：
- `0` — 通过（某个主题只覆盖了部分 token 只会提示，不算失败）
- `1` — 失败：内核新增的主题可写 token 没有列进模板、主题覆盖了内核不存在的 token，或主题写了白名单以外的 token（越权）

主题可写的 token 是一张白名单（`scripts/check-theme-alignment.mjs` 的 `THEME_WRITABLE`），`_template/theme.css` 把它们全部列出，新主题从模板复制后删除不需要的行即可。新增或改名主题可写的核心 token 时，必须在同一次提交里同步白名单和模板。

## 主题包结构

每个主题必须是一个目录，目录名必须等于 `theme.json` 里的 `id`：

```text
themes/{theme_id}/
  theme.json
  theme.css
```

复制 `_template/` 后，只改 `theme.json` 和 `theme.css`。目录名必须与 `theme.json.id` 一致。

## 推荐覆盖顺序

优先按下面顺序覆盖 token，通常能最少改动地完成一个完整主题：

1. 基础色板：`--we-base-*`（页面底、卡片面、正文色、强调色、四个状态色、阴影底色，可选的壳层底 `shell` 与壳层字 `on-shell`）与 `--we-shadow-strength`（阴影浓度），再加 `--we-color-scheme`
2. 字体：`--we-font-*`（含展示字形 `--we-font-display-style`）
3. 形状：`--we-radius-*`
4. 质感例外：光尘 `--we-atmosphere-*`、表面高光与颗粒、浮层不透明度与模糊、会话页面板 `--we-pane-*`、卡片底与边框、封面暗罩、画布纹理与羊皮纸纤维

文字的各级灰、底色层级、边框、壳层（书桌、顶栏）色板、透明层、强调色的深浅变体、三档高度阴影都由核心 `tokens.css` 从基础色板按公式推导，主题不写，写了 `check:themes` 会报越权。想调某一级颜色，改基础色；想让阴影轻一些，调 `--we-shadow-strength`。

字号、行高、字距、字重由核心的字体角色（`--we-type-*`）统一定义，全站一致，主题不覆盖；主题改字体观感用 `--we-font-*`。

动效的时长与曲线由动效角色（`--we-motion-*`）定义，默认值在核心，动效包可以改写，主题不覆盖；动效风格归动效包（`frontend/src/core/motion/`）。

如果现有 token 不够用：
1. 先复用已有的语义 / 结构 token（`tokens.css` 的 B、C 层），能表达就不新增。
2. 确实新增时，归入 `tokens.css` 五层契约中的一层（D 层是两个内置主题换肤需要的旋钮，新增要有充分理由），并同一次提交里：在 `_template/theme.css` 列出；被 `DesignLabPage/visualSlots.js` 的某个视觉位认领；两个内置主题按需补取值。
3. 不要把选择器写回主题包。

## 先出样：草稿主题

主题的设计要先在设计实验室（开发环境下的 `/dev/design`，「视觉」分页）出样，由用户在浏览器里确认后再落地，不要一上来就建 `themes/<id>/`。

1. 复制 `themes/_template/theme.css` 到 `frontend/src/pages/DesignLabPage/drafts/<名字>.css`，改取值。
2. 实验室「主题」一行会出现「草稿 · 名字」，选中即临时套用（不写配置，离开页面恢复设置里的主题）；改文件会热更新。
3. 用户确认后，才把它搬进 `themes/<id>/theme.css`，补 `theme.json`，删除草稿。

## 快速开始

1. 复制模板目录：

```bash
cp -R themes/_template themes/my-theme
```

2. 修改 `themes/my-theme/theme.json`：

```json
{
  "id": "my-theme",
  "name": "我的主题",
  "version": "1.0.0",
  "author": "",
  "description": "一句话说明主题风格。",
  "preview": {
    "paper": "#f7f7f4",
    "accent": "#7d766f",
    "ink": "#171717"
  }
}
```

3. 修改 `themes/my-theme/theme.css` 中的 token 取值，只保留真正需要覆盖的部分。

4. 刷新主题列表，系统会重新扫描 `themes/`。

## 主题应该覆盖什么

### 适合放进主题的内容

- 基础色板：页面底、卡片面、正文色、强调色、状态色、阴影底色与浓度
- 字体：衬线、无衬线、展示字体、印章字体、等宽字体
- 视觉节奏：圆角、阴影浓度
- 全局质感：光尘、纸张纹理、浮层透明度、封面暗罩
- 壳层：用 `--we-base-shell` / `--we-base-on-shell` 另起一层深色书桌；书桌、顶栏上的文字与边框由核心推导

### 字体

主题包只能通过 `--we-font-*` 引用字体族，不能写 `@font-face`。需要新字体时：字体文件放 `frontend/src/assets/fonts/`，在核心层 `frontend/src/themes/fonts.css` 里声明 `@font-face`（只声明字体族，不改各处默认用哪个），主题再用 `--we-font-*` 指向它。中文字体体积大，会影响首屏，先确认授权并使用可变字体或子集化。

### 世界主色

世界封面提取的主色会在深色主题下覆盖 `--we-color-accent` 系 token；画布偏亮的主题（如羊皮纸）不套用，只用主题自带的强调色。主色按钮的文字用的是 `--we-color-bg-canvas`，取色保证主色与一个近黑基准（`frontend/src/core/utils/accentBasis.js`）的对比度不低于 4.5:1，所以新的深色主题的画布不能比这个基准更亮，`frontend/tests/themes/theme-wiring.test.js` 会核对。主题自带的强调色宜克制、低饱和，把颜色让给世界封面。

### 不适合放进主题的内容

- 组件结构和布局：左右栏、卡片内部排布、是否渲染某个区域
- 组件选择器：`.we-world-card`、`.we-chat-message` 之类的规则
- 数据逻辑：路由、状态、加载流程
- 私有 DOM 依赖：`nth-child`、深层级选择器、临时 hack

## 内置主题

`nocturne/` 是默认内置主题（暗色）。`classic-parchment/`（亮色，保留羊皮纸色板、书脊阴影、印章/纸张阴影、卡片边框与旧化质感）是另一个内置主题。

内置主题都只能覆盖 token，不能直接改结构。

## 验收清单

- 主题包目录名与 `theme.json.id` 一致
- `theme.css` 里没有组件选择器
- 主题覆盖 token 的范围只包含视觉值
- 核心默认值在没有主题时也能正常工作
- `npm run check:themes` 退出码为 0（无孤悬覆盖、无模板盲区）
- 深色主题的画布不比取色基准更亮（`frontend` 下的 `tests/themes` 通过）
- 已经过设计实验室出样，并由用户确认
