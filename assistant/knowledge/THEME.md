# 主题包知识库（THEME.md）

> 写卡助手处理 `theme` 类任务时加载本文件。
> 行为框架（怎么生成 JSON、怎么报告父代理）见 `assistant/prompts/sub-agent.md`，不在本文件。

## 主题包架构

主题（`theme`）是用户可在设置面板里切换的整套视觉包：

- 真源是文件系统：`/data/themes/<id>/theme.json + theme.css`（用户层），`/themes/<id>/...`（内置层）
- 内置主题（`classic-parchment`、`lovable-cream`）只读；助手对内置主题执行 `update` 时，**会自动先把内置整份复制到 user 层（`/data/themes/<id>/`）再覆写**，原内置文件不动
- 全部 `enabled` 主题中只有"当前激活"那张生效（用户在设置切换）；与 `css-snippet`（全局并行注入）完全不同

不属于 theme：

- 短小的"调一两个变量"或"给某种气泡换颜色" → 用 `css-snippet`（不要建新主题）
- 文本替换 / Markdown 清洗 → 属于 `regex-rule`
- 字体 `@font-face`、组件选择器、布局相关 CSS → **禁止**（theme.css 只允许 token 覆盖）

> 判断口诀：用户说"做一个主题/换肤" → theme；说"覆盖某个气泡样式/给思考链上色" → css-snippet。

## operation 与 entityId

| operation | entityId | 备注 |
|---|---|---|
| `create` | **必填**，新主题 id（小写字母开头，仅 `a-z 0-9 _ -`，长度 2-64）| 撞已存在 id（含内置）一律拒绝；不会"静默改名" |
| `update` | **必填**，目标主题 id；内置主题会被自动 fork 到 user 层 | 只输出需要修改的字段；不要再带 `id`（重命名 = delete + create）|
| `delete` | **必填**，仅 user 层主题；内置主题无 user 覆盖时拒绝 | `changes` 输出 `{}` |

```json
{ "type": "theme", "operation": "create|update|delete", "entityId": "<theme-id>", "changes": {}, "explanation": "简体中文，50字以内" }
```

> 与 `css-snippet` 的关键差异：theme 的 `create` **也必须**带 entityId（主题 id 是人为命名的，不是数据库自增）。

## changes 字段集

allowed keys（白名单，多余字段会被丢弃）：

| 字段 | 类型 | create 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✅ | 主题显示名（设置面板里展示给用户）|
| `version` | string | ✅ | 语义化版本，如 `"1.0.0"` |
| `author` | string |  | 作者署名 |
| `description` | string |  | 一句话简介 |
| `preview` | object |  | 缩略色卡，键自定（常见 `paper` / `accent` / `ink`），值为色值字符串 |
| `css` | string | ✅ | 完整 `theme.css` 文本；**create/update 提供时不能为空** |

`id` 不允许通过 changes 修改；要改 id 请 `delete + create`。

## CSS 内容强约束（与 css-snippet 同源）

WorldEngine 颜色 / 字体 / 圆角 / 阴影 / z-index 都通过 `--we-*` 变量定义于 `frontend/src/themes/tokens.css`。详见根 `CLAUDE.md` 与 `docs/references/frontend/ui-and-theme.md`。

主题 CSS 必须遵循：

- **只在 `:root` 下覆写 `--we-*` 变量**；禁止任何组件选择器（`.we-message-bubble`、`button.primary` …）
- 禁止 `@font-face`、`@import`、`@keyframes`、`@media`、伪类伪元素
- 禁止裸 hex 之外的散乱色值堆叠——优先覆盖 `--we-base-*` / `--we-color-*` 等已有 token；不发明新 token 名
- 禁止渐变背景、glassmorphism、发光、装饰性 emoji
- 谨慎使用 `!important`

### 推荐覆盖入口（最小一套即可生效）

```css
:root {
  /* 纸面 / 背景层 */
  --we-base-paper-100: #...;   /* canvas 大背景 */
  --we-base-paper-200: #...;   /* surface 卡片底 */
  --we-base-paper-300: #...;   /* muted/分隔 */
  --we-base-paper-400: #...;   /* 深一阶纸面 */

  /* 文字 */
  --we-base-ink-900: #...;     /* 主文字 */
  --we-base-ink-700: #...;     /* 次文字 */
  --we-base-ink-500: #...;     /* 弱化文字 */

  /* 强调 / 装饰 */
  --we-base-vermilion-600: #...; /* 主 accent */
  --we-base-gold-600: #...;      /* 装饰金 */
  --we-base-book-bg: #...;       /* TopBar / 深底 */

  /* 弹窗 / 遮罩（单独列出：用户感知最强烈的"差分太大"通常在这里） */
  --we-color-bg-overlay: rgba(?, ?, ?, 0.45);  /* 普通弹窗背景遮罩，推荐 0.40-0.55 */
  --we-color-overlay-heavy: rgba(?, ?, ?, 0.60); /* 重要操作弹窗，推荐 0.55-0.70 */
}
```

> 想看完整 token 链路怎样向 `--we-color-*` 语义层传导，读 `frontend/src/themes/tokens.css`。内置 `themes/classic-parchment/theme.css` 是最权威的样板。

## 换 accent 色 / 批量替换颜色的强约束

用户说"把所有红色换成 X"或"主题里某个色不要了"时，**禁止只搜替 hex 字面量**。一个 accent 色在主题里通常以三种形态出现：

1. **十六进制本体**（`#ff2a6d`）—— 出现在 `--we-base-vermilion-600`、`--we-color-accent`、`--we-color-accent-deep` 等。
2. **RGB 分量 + alpha 的 `rgba()`**（`rgba(255, 42, 109, 0.10)` / `0.25` / `0.4` …）—— 出现在 `--we-color-accent-bg` / `--we-color-accent-border` / `--we-shadow-*` / `--we-topbar-active-bg` 等阴影、半透层。
3. **HSL / 派生计算**（少见，但 `color-mix()` 也存在于部分主题）。

强约束：

- **必须先 `preview_card(target="theme", operation="update", entityId="<id>")` 拉到完整 `css` 全文**，肉眼或正则统计出旧色（hex 与所有不同 alpha 的 rgba）一共在多少处出现，再开始改。这一步不能省，否则会出现"换了一部分、另一部分还是旧色"的半调残留。
- **同步换算 rgba**：把旧 hex 转成 RGB 分量 → 把新 hex 转成 RGB 分量 → 所有 `rgba(<旧R>, <旧G>, <旧B>, α)` 都换成 `rgba(<新R>, <新G>, <新B>, α)`，**alpha 通道保持不变**。alpha 决定层级关系（bg 10%、border 25%、shadow 40% 等），不能丢。
- **顺手清理跟随色**：`--we-color-border-focus`、`--we-shadow-*`、`--we-topbar-active-ring`、`--we-bookshelf-frame-border`、`--we-color-avatar-placeholder` 这类"光晕 / 边框 / 占位"经常直接耦合旧 accent；它们如果留着旧色，视觉上和"没改"几乎等同。
- **changes.css 必须输出整段新 CSS**（不是 diff）：apply_theme 是整体覆写，不要只贴改动行。

> 弹窗遮罩独立于 accent 色：用户说"弹窗背景差分太大"时**不要去碰 accent**，而是单独调 `--we-color-bg-overlay` / `--we-color-overlay-heavy` 的 alpha（典型从 0.70 降到 0.40-0.55）。这是两个正交的需求，计划里必须独立成 step。

## 与 css-snippet 共存时的归位判断

同一空间里 theme 和 css-snippet 都可以"看起来在改颜色"，弄错归位会导致改了半天没效果。判定顺序：

1. **它是不是当前激活主题的内置 token？**（`--we-*` 在主题 CSS 里、由 `theme.css` 在 `:root` 设值）→ 改主题的 `changes.css`。
2. **它是不是组件选择器层的样式（`.we-message-bubble-*`、`.we-think-block` 等）？** → 改 css-snippet。
3. **同一资源里两种都有改动需求**（典型：换肤 + 给气泡加边框） → 拆两个 step：一个 `theme.update`、一个 `css-snippet.update`，**不要混进同一个 apply**。
4. **用户说"FX / 特效 / 滤镜 / 动画 / 仅气泡 / 仅思考链"** → 大概率是 css-snippet 范围，theme 不应介入。
5. **用户说"整套换肤 / 全局换色 / 这个主题别红了"** → 主题范围，css-snippet 不应介入。

> 反例：在 css-snippet 里写 `:root { --we-base-vermilion-600: ... }` 来"覆盖当前主题"——技术上能生效但语义错位，正确做法是直接改主题包；除非用户明确要求"不要动主题，只在外面叠一层"。

## 工作流

1. **create**：先 `preview_card(target="theme", operation="create")`，拿到现有主题列表 → 选一个未被占用的 id（小写、含连字符更稳）。
2. **update / delete**：**必须**先 `preview_card(target="theme", operation="update"|"delete", entityId="<id>")` 拉当前 meta + css 全文；再决定 changes 怎么写。内置主题 update 不需要做任何额外动作，后端会自动 fork。
   - **批量替换颜色前**：在 preview 出的 css 全文里统计旧色出现次数（hex + 所有 alpha 的 rgba 都要数），心里有数再生成新 css；否则极易漏改、出现半调残留。详见下文「换 accent 色 / 批量替换颜色的强约束」。
3. 调 `apply_theme` 落库。

## 反例

- create 时不给 entityId（×）；id 含大写或空格（×）
- update / delete 时不先 preview_card（×，会被闸门拒绝）
- 在 `changes.css` 里写组件选择器（`.we-message-bubble-assistant { ... }`）→ 改用 `css-snippet`
- 在 `changes.css` 里嵌 `@font-face` 或 `@import url(...)` → 禁止
- 把"想换某个气泡颜色"这类一处覆盖做成新主题 → 应改用 `css-snippet`
- create 时 `css` 字段为空字符串 / 缺失
- delete 时 `changes` 不为 `{}`
- 修改完主题后调 `setActiveTheme` 或试图替用户切换 → **越权**，激活态只由用户在设置面板控制
