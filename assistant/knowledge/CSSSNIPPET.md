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

WorldEngine 前端的颜色 / 字体 / 圆角 / 阴影 / z-index 都通过 `--we-*` 变量定义于 `frontend/src/themes/tokens.css`。详细规范见根 `CLAUDE.md` 与 `docs/references/frontend/ui-and-theme.md`。

写片段时遵循：

- **优先覆盖 `--we-*` 变量**，而不是大面积硬编码颜色
- **禁止裸 hex / `rgba()` 拼色 / 非 token 圆角 / 非 token z-index**
- **禁止渐变背景 / glassmorphism / 发光效果 / 装饰性 emoji**

### 常用 CSS 变量

- `--we-color-bg-canvas`：页面大背景
- `--we-color-bg-surface`：卡片 / 面板背景
- `--we-color-text-primary`：主文字色
- `--we-color-text-secondary`：次要文字色
- `--we-color-border-default`：默认边框
- `--we-card-bg` / `--we-panel-card-bg`：组件皮肤背景
- `--we-radius-sm` / `--we-radius-md`：圆角

> 完整变量清单见 `frontend/src/themes/tokens.css`；新片段不要发明新变量名，覆盖现有变量即可。

### 常用目标类

- `.we-message-content` / `.we-message-assistant`
- `.we-message-bubble-assistant` / `.we-message-bubble-user`
- `.we-think-block`

> 优先做"主题层"或"局部组件层"的样式，不要写脆弱的深层 DOM 选择器（如 `.page > div:nth-child(3) > ...`）。
> 谨慎使用 `!important`。
> 动效要克制，避免持续高频闪烁。

## 操作手册

### 主题改造

"把聊天界面调成深色羊皮纸主题" → 优先覆写 `:root` 下的 `--we-*` 变量，例：

```css
:root {
  --we-paper-base: var(--we-paper-aged);
  --we-ink-primary: #c9b899;
}
```

> 上例为示意；实际写片段时**仍应使用 token 而非裸 hex**——若现有 token 不够用，应先在 token 体系内引入新变量再覆盖，而不是在片段里堆 hex。

### 思考链样式

"给思考链做成旧终端荧光风格" → `.we-think-block` 改字体 + 边框 + 颜色（覆盖 token）

### 写作正文版式

"写作正文更疏朗" → `mode:"writing"` + `.we-message-content` 改 `line-height` / `letter-spacing`

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
