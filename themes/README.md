# WorldEngine 主题开发指引

`themes/` 存放内置/开发者主题；用户从前端导入的主题存放在 `data/themes/`。

## 主题包结构

每个主题必须是一个目录，目录名必须等于 `theme.json` 里的 `id`：

```text
themes/{theme_id}/
  theme.json
  theme.css
```

`theme.json` 描述主题元信息；`theme.css` 覆盖 `--we-*` CSS token。参考 `_template/` 创建新主题；复制模板后必须把目录名、`theme.json.id`、导出包里的 `theme.id` 保持一致。

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
    "accent": "#9f4f36",
    "ink": "#171717"
  }
}
```

3. 修改 `themes/my-theme/theme.css` 中的 token 取值。

4. 重启后端或刷新主题列表，让后端重新扫描根目录 `themes/`。

## 自动适配规则

主题层只负责“换肤”，不承载组件结构 CSS。

加载顺序固定为：

```text
核心样式 tokens.css / chat.css / ui.css / pages.css / index.css
→ 当前主题 theme.css
→ 用户自定义 CSS 片段
```

因此未来修改前端组件时，只要遵守以下规则，主题会自动继承新界面，不需要两边同步更新：

- 组件样式写在 `frontend/src/styles/` 或组件对应核心 CSS 中，不写进主题目录。
- 组件颜色、字体、边框、阴影、圆角、z-index 等都引用 `--we-*` token。
- 新增 token 时，先在 `frontend/src/styles/tokens.css` 提供默认值，并尽量让语义 token 由基础 token 派生。
- 主题只覆盖基础色、语义色、字体、卡片/面板皮肤、动效节奏、阴影与少量全局质感 token；不要复制 `.we-*` 组件选择器。
- 只有当主题主动想改变某个新 token 的视觉取值时，才需要更新该主题。

## 推荐覆盖的 token

优先覆盖基础 token，语义 token 会自动派生：

```css
:root {
  --we-base-paper-100: #f7f7f4; /* 主画布 / 正文页 */
  --we-base-paper-200: #ffffff; /* 面板 / 卡片表面 */
  --we-base-paper-300: #e2e2dc; /* 常规边框 */
  --we-base-paper-400: #c9c9c0; /* 强边框 / muted surface */

  --we-base-ink-900: #171717;   /* 主文字 */
  --we-base-ink-700: #525252;   /* 次级文字 */
  --we-base-ink-500: #737373;   /* 标签 / 说明 */

  --we-base-vermilion-600: #9f4f36; /* 主强调 */
  --we-base-vermilion-800: #733724; /* 强调 hover / pressed */
  --we-base-gold-600: #8a6f2f;      /* 装饰强调 */
  --we-base-gold-400: #b7923b;      /* active / hover 装饰 */

  --we-base-moss-600: #3f6f4a;  /* success */
  --we-base-amber-600: #9a5b18; /* warning */
  --we-base-slate-600: #4b5563; /* info / disabled */
  --we-base-book-bg: #2f3136;   /* 外层壳背景 */
}
```

需要改变卡片、面板、动效或全局质感时，再覆盖组件皮肤 token：

```css
:root {
  --we-card-bg: var(--we-paper-base);
  --we-card-border: 1px solid var(--we-paper-shadow);
  --we-card-radius: var(--we-radius-sm);
  --we-card-shadow: var(--we-shadow-paper-lift);
  --we-card-hover-shadow: var(--we-card-shadow);

  --we-panel-card-bg: var(--we-paper-aged);
  --we-panel-card-border: 1px solid var(--we-paper-shadow);
  --we-panel-card-radius: var(--we-radius-md);
  --we-panel-card-shadow: 0 0 0 1px color-mix(in srgb, var(--we-base-ink-900) 3%, transparent);

  --we-duration-fast: 120ms;
  --we-duration-normal: 200ms;
  --we-easing-sharp: cubic-bezier(.25, .46, .45, .94);
}
```

如主题包含强风格质感（例如纸张、金属、玻璃、木纹），可以覆盖：

```css
:root {
  --we-topbar-bg: #2f3136;
  --we-topbar-dropdown-bg: #2f3136;
  --we-spine-shadow-left: linear-gradient(to right, rgba(0, 0, 0, 0.10), transparent);
  --we-spine-shadow-right: linear-gradient(to left, rgba(0, 0, 0, 0.07), transparent);
  --we-shadow-stamp-up: 0 2px 0 var(--we-vermilion-deep), 0 4px 8px var(--we-color-shadow-md);
  --we-shadow-paper-lift: 0 1px 3px var(--we-color-shadow-sm);
}
```

## 默认主题

`classic-parchment/` 是默认内置主题，id 为 `classic-parchment`。羊皮纸色板、书脊阴影、印章/纸张阴影、卡片边框与旧化质感都放在该主题内；核心样式只保留中性默认 token、组件布局和交互。

## 分层边界

- 核心样式提供可用的中性默认值，确保主题加载失败时界面仍可操作。
- 主题负责“视觉取值”：颜色、字体、边框、阴影、圆角、动效时长/缓动、全局质感。
- 主题不负责“组件结构”：是否渲染图标、是否使用双页布局、面板里有哪些区域，仍由 React 组件和核心 CSS 控制。
- 旧变量名如 `--we-paper-base` / `--we-vermilion` 仍保留为兼容别名；新组件应优先使用语义 token 或组件皮肤 token，如 `--we-color-bg-canvas`、`--we-card-border`、`--we-panel-card-bg`。

## 不建议做的事

- 不要在主题里复制 `.we-world-card`、`.we-panel-card`、`.we-chat-message` 等组件选择器；这些类名服务组件结构，不是主题 API。
- 不要在主题里隐藏、插入或重排组件；图标是否显示、双页结构是否存在，应由 React 组件或后续 UI shell 机制决定。
- 不要依赖未公开的 DOM 层级选择器，如 `.foo > div:nth-child(2)`；页面重构时会很容易失效。
- 不要把用户自定义 CSS 片段当主题模板使用。自定义 CSS 是最后覆盖层，适合个人局部修补，不适合维护可分发主题。

## 导入导出

前端导入/导出使用 `.wetheme.json`，格式为：

```json
{
  "format": "worldengine-theme-v1",
  "theme": {
    "id": "my-theme",
    "name": "我的主题",
    "version": "1.0.0",
    "author": "",
    "description": "",
    "preview": {
      "paper": "#ede3d0",
      "accent": "#a23b2e",
      "ink": "#2a1f17"
    }
  },
  "css": ":root { --we-base-paper-100: #f7f7f4; }"
}
```

开发者放在 `themes/` 下的内置主题以目录形式维护；用户导入主题由后端转换为 `data/themes/{id}/theme.json + theme.css`。
