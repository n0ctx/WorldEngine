# WorldEngine 主题开发指引

`themes/` 存放内置/开发者主题；用户从前端导入的主题存放在 `data/themes/`。

## 主题包结构

每个主题必须是一个目录，目录名必须等于 `theme.json` 里的 `id`：

```text
themes/{theme_id}/
  theme.json
  theme.css
```

`theme.json` 描述主题元信息；`theme.css` 覆盖 `--we-*` CSS token。参考 `_template/` 创建新主题。

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
- 主题只覆盖基础色、语义色、字体、少量全局质感 token；不要复制 `.we-*` 组件选择器。
- 只有当主题主动想改变某个新 token 的视觉取值时，才需要更新该主题。

## 默认主题

`classic-parchment/` 是默认内置主题，id 为 `classic-parchment`。它只覆盖基础 token，组件布局和交互仍由核心样式维护。

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
  "css": ":root { --we-base-paper-100: #ede3d0; }"
}
```

开发者放在 `themes/` 下的内置主题以目录形式维护；用户导入主题由后端转换为 `data/themes/{id}/theme.json + theme.css`。
