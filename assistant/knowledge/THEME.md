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
}
```

> 想看完整 token 链路怎样向 `--we-color-*` 语义层传导，读 `frontend/src/themes/tokens.css`。内置 `themes/classic-parchment/theme.css` 是最权威的样板。

## 工作流

1. **create**：先 `preview_card(target="theme", operation="create")`，拿到现有主题列表 → 选一个未被占用的 id（小写、含连字符更稳）。
2. **update / delete**：**必须**先 `preview_card(target="theme", operation="update"|"delete", entityId="<id>")` 拉当前 meta + css 全文；再决定 changes 怎么写。内置主题 update 不需要做任何额外动作，后端会自动 fork。
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
