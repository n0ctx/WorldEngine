# Frontend UI And Theme

前端视觉规则、token 分层、主题边界与自定义 CSS 约束。

## 快速入口

- 想改 token 名或默认值：看 `frontend/src/themes/tokens.css`
- 想改框架样式：看 `frontend/src/themes/ui.css`、`pages.css`、`chat.css`
- 想改内置主题：看 `themes/<theme-id>/theme.css`
- 想改 shell 装饰：看 `frontend/src/shells/`
- 想判断自定义 CSS 应不应该改代码：先看本页“自定义 CSS 边界”

## 分层规则

- `frontend/src/themes/`：定义 token 名与框架样式，保持中性默认值
- `themes/<theme-id>/theme.css`：只覆写 `--we-*` token 取值
- `frontend/src/shells/`：负责结构、布局、壳层装饰
- 页面和组件只消费 token，不发明平行主题体系

## 常见真源

- token：`frontend/src/themes/tokens.css`
- 字体默认：`frontend/src/themes/fonts.css`
- 通用 UI：`frontend/src/themes/ui.css`
- 页面框架：`frontend/src/themes/pages.css`
- 对话 / 写作区：`frontend/src/themes/chat.css`
- 主题开发说明：`themes/README.md`

## 当前约束

- 主题层只覆写 token，不写组件选择器
- 新增 `--we-*` token 后，要同步检查内置主题、模板主题和自定义 CSS 参考文档
- 页面层禁止为主题差异写内联 style 或硬编码颜色
- 每个异步区块都应有 `loading / empty / error` 三态
- icon-only 按钮必须有 `aria-label`

## 自定义 CSS 边界

- 适合自定义 CSS：覆盖 token、微调已暴露的稳定类名、局部排版/节奏
- 不适合自定义 CSS：改布局结构、依赖深层 DOM、用裸 hex 重造配色体系
- 如果需求需要新增稳定锚点类名或 token，优先改源码，再让 CSS 片段消费新出口

## 主题开发提醒

- 先覆盖语义色与字体，再考虑壳层纹理和装饰
- 新主题优先覆写 `--we-color-*`、`--we-font-*`、`--we-page-canvas-*`、`--we-card-*`、`--we-panel-card-*`
- 壳层和结构问题优先在 `shells/` 修，不要误塞回主题目录

## 相关代码文件

- `frontend/src/themes/tokens.css`
- `frontend/src/themes/ui.css`
- `frontend/src/themes/pages.css`
- `frontend/src/themes/chat.css`
- `themes/README.md`
