# CSS 片段知识库（CSSSNIPPET.md）

> 写卡助手处理 `css-snippet` 类任务时加载本文件。
> 行为框架（怎么生成 JSON、怎么报告父代理）见 `assistant/prompts/sub-agent.md`，不在本文件。

## CSS 片段架构

CSS 片段（`css-snippet`）承载用户自定义视觉样式：

- 每条片段是一段独立的 CSS 文本，归属于 chat / writing 某一空间
- 所有 `enabled=1` 的片段被前端拼接后注入 `<style id="we-custom-css">`，**全部为全局作用**——没有"按世界生效"的概念
- 适用场景：主题覆盖、气泡、消息容器、thinking-block、排版、动效

不属于 CSS 片段：

- 文本替换 / HTML 包裹 / Markdown 标记清洗 → 属于 `regex-rule`
- prompt 文本本身 → 属于 world-card / character-card / global-config
- 数据字段定义 → 属于 world-card stateFieldOps
- **整套换肤 / 全局换色 / "这个主题别红了"** → 属于 `theme` 资源，不要在 snippet 里堆 `:root { --we-base-* }` 覆盖。判断口诀见 `THEME.md` §「与 css-snippet 共存时的归位判断」。
- 修改弹窗遮罩浓度（`--we-color-bg-overlay` / `--we-color-overlay-heavy`）→ 走当前激活主题的 `theme.update`，不要在 snippet 里盖。

## operation 与 entityId

| operation | entityId | 备注 |
|---|---|---|
| `create` | 不输出 | 后端生成新 ID |
| `update` | 必填，目标片段 ID（先 `preview_card(target="css-snippet")` 取得）| 只输出需要修改的字段 |
| `delete` | 必填 | `changes` 输出 `{}` |

```json
{ "type": "css-snippet", "operation": "create|update|delete", "entityId": "...", "changes": {}, "explanation": "简体中文，50字以内" }
```

## changes 字段集

allowed keys：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 片段名称（用户在管理界面看到的名字）|
| `content` | string | 完整 CSS 文本，**create/update 时不能为空**（delete 时 changes 为 `{}`）|
| `mode` | string | `"chat"` / `"writing"`，不确定时默认 `"chat"` |
| `enabled` | number | `1` 启用 / `0` 禁用 |

> 不要输出 `scope` / `pattern` / `replacement` 等正则字段——那是 regex-rule。
> 不要输出 `world_id`——CSS 片段没有世界归属，全局生效。

## 注入机制

- 前端启动 / 配置变更时，按 mode 收集所有 `enabled=1` 的片段，**按顺序拼接成一段 CSS**
- 注入到 `<style id="we-custom-css">` 标签
- 注入位置：全局 document head；不区分世界、不区分会话
- chat 模式片段在聊天界面生效；writing 模式片段在写作界面生效

> 含义：用户可以通过自定义 CSS 覆盖任意 `--we-*` 变量、任意现有类，**作用域是整个前端**。

## 仅使用 CSS 变量（强约束）

WorldEngine 前端的颜色 / 字体 / 圆角 / 阴影 / z-index 都通过 `--we-*` 变量定义于 `frontend/src/themes/tokens.css`。详细规范见根 `CLAUDE.md` 与相关主题代码。

写片段时遵循：

- **优先覆盖 `--we-*` 变量**，而不是大面积硬编码颜色
- **禁止裸 hex / `rgba()` 拼色 / 非 token 圆角 / 非 token z-index**
- **禁止渐变背景 / glassmorphism / 发光效果 / 装饰性 emoji**

### token 三层（写片段时务必先分清）

`frontend/src/themes/tokens.css` 把 token 分成三层，从下往上：

1. **`--we-core-*`**：硬编码原始色（如 `--we-core-surface-100: #f7f7f4`）。**所有层禁止直接消费**，仅供 base 层引用。
2. **`--we-base-*`**：基础色板（`--we-base-paper-100/200/300/400`、`--we-base-ink-900/700/500`、`--we-base-vermilion-600/800`、`--we-base-gold-600/400`、`--we-base-moss-600`、`--we-base-amber-600`、`--we-base-slate-600`、`--we-base-book-bg` …）。**主题包**（`theme.css`）只允许覆盖这一层来批量换肤。
3. **`--we-color-*`**：语义层（`--we-color-bg-canvas/surface/elevated/subtle/muted`、`--we-color-text-primary/secondary/tertiary`、`--we-color-border-default/subtle/strong/focus`、`--we-color-accent`、`--we-color-status-success/warning/danger/info` …）。**组件 CSS** 与 **css-snippet 局部样式**应当读这一层。

> 在 `css-snippet` 里推荐用法：**消费 `--we-color-*` 语义层**做局部覆盖；只有当你想"全站换肤但又不打算建主题包"时，才在 `:root` 覆盖 `--we-base-*`（注意这会影响所有依赖该 base 的语义 token）。

### 常用 token 速查（默认值见 `frontend/src/themes/tokens.css`）

语义层（局部覆盖优先用这层）：

- `--we-color-bg-canvas`：页面大背景
- `--we-color-bg-surface`：卡片/面板背景
- `--we-color-bg-elevated`：浮层/弹窗
- `--we-color-text-primary` / `--we-color-text-secondary` / `--we-color-text-tertiary`
- `--we-color-border-default` / `--we-color-border-subtle` / `--we-color-border-strong`
- `--we-color-accent` / `--we-color-accent-deep` / `--we-color-accent-bg`
- `--we-color-status-success/warning/danger/info`

基础层（全站换肤覆盖这层）：

- `--we-base-paper-100/200/300/400`、`--we-base-ink-900/700/500`
- `--we-base-vermilion-600/800`、`--we-base-gold-600/400`、`--we-base-book-bg`

> 完整清单见 `frontend/src/themes/tokens.css`；**不要发明新 token 名**——如果现有 token 不够，先找有没有现成语义 token 可用，再考虑提议在 token 体系里补，不要在片段里堆裸 hex。

### 常用目标类

聊天模式（`mode:"chat"`）：

- `.we-message-assistant` / `.we-message-user`（整条消息容器）
- `.we-message-bubble-assistant` / `.we-message-bubble-user`（气泡）
- `.we-message-content`（气泡内的 Markdown 正文）
- `.we-think-block` / `.we-think-block-toggle` / `.we-think-block-body` / `.we-think-block-content`（思考链外壳与内容）

写作模式（`mode:"writing"`）：

- `.we-writing-prose`（写作正文段落，**不是** `.we-message-content`）
- `.we-writing-annotation`（旁注 / 注解）
- `.we-writing-think` / `.we-writing-think-toggle` / `.we-writing-think-body`（写作模式的思考链）

面板与卡片（chat / writing 都生效）：

- `.we-panel-card` / `.we-panel-card-header` / `.we-panel-card-body`（**不是**裸 `.we-panel`，没有这个类）
- `.we-panel-card-action` / `.we-panel-card-actions`（卡片头部按钮）
- `.we-panel-tab-body` / `.we-panel-tab-header`（标签页内容容器）

> 改前先 grep `frontend/src/components/` 或 `frontend/src/themes/` 确认类名存在，不要凭"语义猜测"造类名。命名规律是 `we-<area>-<element>[-modifier]`，但不是所有逻辑分区都有同名根类（如面板没有 `.we-panel`，只有 `.we-panel-card`）。
> 优先做"主题层"或"局部组件层"的样式，不要写脆弱的深层 DOM 选择器（如 `.page > div:nth-child(3) > ...`）。
> 谨慎使用 `!important`。
> 动效要克制，避免持续高频闪烁。

> **chat 与 writing 不通用**：chat 模式片段在 `<style id="we-custom-css">` 里只对聊天页生效，但选择器命中规则是浏览器决定的；如果你在 chat 片段里写 `.we-writing-prose`，写作页一旦也加载了这段 CSS 就会命中。为避免互染，写作相关样式请放在 `mode:"writing"` 片段里。

## 操作手册

### 主题改造（其实更适合走主题包）

"全站换肤"应优先用 `theme` 资源；`css-snippet` 适合做"在当前主题之上局部微调"。如果用户坚持用 snippet 做全站换肤，覆盖 `--we-base-*` 即可让语义层批量跟随：

```css
:root {
  /* 让纸面与文字整体偏暖偏深；其它语义 token 会自动从这两层派生 */
  --we-base-paper-100: #2a241d;   /* canvas */
  --we-base-paper-200: #332b22;   /* surface */
  --we-base-paper-300: #3f3528;   /* subtle / 边框 */
  --we-base-ink-900:   #efe3c8;   /* 主文字 */
  --we-base-ink-700:   #c9b899;   /* 次文字 */
}
```

只想改局部（例：把卡片底色调亮一点），用语义层就够：

```css
.we-message-bubble-assistant {
  background: var(--we-color-bg-elevated);
  border-color: var(--we-color-border-strong);
}
```

> **不要**写 `--we-paper-base` / `--we-ink-primary` 这种凭印象起的名字——它们不存在。所有 token 必须能在 `frontend/src/themes/tokens.css` 找到对应定义。

### 思考链样式

- chat 模式："给思考链做成旧终端荧光风格" → `mode:"chat"` + `.we-think-block` / `.we-think-block-body` 改字体 + 边框 + 颜色（覆盖 token）
- writing 模式：对应类是 `.we-writing-think` / `.we-writing-think-body`，不是 `.we-think-block`

### 写作正文版式

"写作正文更疏朗" → `mode:"writing"` + `.we-writing-prose` 改 `line-height` / `letter-spacing`（写作正文不是聊天气泡，**不要**用 `.we-message-content`）

### 修改 / 删除现有片段

- **必须**先 `preview_card(target="css-snippet")` 拉片段列表（含 id / name / mode / enabled）
- 从中确认目标 ID 后再生成提案
- update 只输出需要修改的字段（如只改 `content`，不要重复输出 `name` / `mode` / `enabled`）

## 反例

- 输出正则 `pattern` / `replacement` / `flags` / `scope`（应改用 regex-rule）
- 用 CSS 去做字符串替换（如试图用 `content:""` 替换文本——CSS 不能改实际文本）
- 依赖深层选择器：`.page > div:nth-child(3) > span`
- 大面积裸 hex：`color: #2a2a2a; background: #f5e6c8;`（应覆盖 token）
- 渐变背景 / 发光效果：`background: linear-gradient(...)` / `box-shadow: 0 0 20px gold`
- create / update 输出空 `content`
- delete 时 `changes` 不为 `{}`
