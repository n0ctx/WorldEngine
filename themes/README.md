# WorldEngine 主题开发指引

`themes/` 存放内置/开发者主题；用户从前端导入的主题存放在 `data/themes/`。

## 分层职责

主题系统分成三层：

```text
frontend/src/themes/
  - tokens.css: 核心默认 token，保持中性
  - fonts.css: 核心字体默认值，保持中性
  - ui.css / pages.css / chat.css: 组件与页面样式，只消费 token

themes/<theme-id>/
  - theme.json: 主题元信息
  - theme.css: 仅覆盖 --we-* token

frontend/src/shells/
  - shell 负责结构、布局、壳层装饰
```

核心层负责“默认可用”，主题层负责“视觉取值”，shell 负责“结构与布局”。主题不能替代 shell，也不应该把组件选择器写回主题目录。

## 迁移声明

- 主题系统现在只接受正式语义 token 和基础色板 token，旧兼容别名已全部移除。
- 新主题请优先覆盖 `--we-color-*`、`--we-font-*`、`--we-page-canvas-*`、`--we-card-*`、`--we-panel-card-*`。
- 如果你的历史主题包或自定义 CSS 仍引用旧别名，需要手动迁移到当前 token 名。
- `lovable-cream` 现在使用自托管 `Instrument Sans` 变量字体近似 `docs/references/frontend/ui-and-theme.md` 中记录的暖 cream 方向；主题层仍只通过 `--we-font-*` token 引用字体，不在主题包里声明 `@font-face`。

## 主题包结构

每个主题必须是一个目录，目录名必须等于 `theme.json` 里的 `id`：

```text
themes/{theme_id}/
  theme.json
  theme.css
```

复制 `_template/` 后，只改 `theme.json` 和 `theme.css`。目录名、`theme.json.id`、导出包里的 `theme.id` 必须一致。

## 推荐覆盖顺序

优先按下面顺序覆盖 token，通常能最少改动地完成一个完整主题：

1. 语义色与透明层：`--we-color-*`
2. 字体与排版：`--we-font-*`、`--we-page-canvas-*`
3. 组件皮肤：`--we-card-*`、`--we-panel-card-*`
4. 壳层与装饰：`--we-topbar-*`、`--we-spine-*`、`--we-canvas-texture-image`
5. 基础色板：`--we-base-*`
6. 圆角与动效：`--we-radius-*`、`--we-duration-*`、`--we-easing-*`

如果现有 token 不够用，先补 `frontend/src/themes/tokens.css`，再回到主题里覆盖，不要把选择器写回主题包。

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

4. 刷新主题列表或重启后端，让系统重新扫描 `themes/`。

## 主题应该覆盖什么

### 适合放进主题的内容

- 基础色板：页面背景、卡片、边框、强调色、状态色
- 字体：衬线、无衬线、展示字体、印章字体、等宽字体
- 视觉节奏：圆角、阴影、动效时长、缓动曲线
- 全局质感：顶部壳层、纸张纹理、书脊阴影、覆盖层
- 页面大画布：`--we-page-canvas-*`、卡片名称字形、是否显示副标题

### 不适合放进主题的内容

- 组件结构和布局：左右栏、卡片内部排布、是否渲染某个区域
- 组件选择器：`.we-world-card`、`.we-chat-message` 之类的规则
- 数据逻辑：路由、状态、加载、导入导出流程
- 私有 DOM 依赖：`nth-child`、深层级选择器、临时 hack

## 默认主题

`classic-parchment/` 是默认内置主题，保留羊皮纸色板、书脊阴影、印章/纸张阴影、卡片边框与旧化质感。

`lovable-cream/` 走另一条更轻的暖 cream 路线，强调奶油底色、charcoal opacity 中性色、边框驱动的层级和更克制的阴影；当前以 `docs/references/frontend/ui-and-theme.md` 记录的方向为准。

这两个主题都只能覆盖 token，不能直接改结构。

## 版本与导入导出

前端导入/导出使用 `.wetheme.json`，格式保持不变：

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
      "paper": "#f7f7f4",
      "accent": "#7d766f",
      "ink": "#171717"
    }
  },
  "css": ":root { --we-color-bg-canvas: #f7f7f4; }"
}
```

开发者内置主题放在 `themes/`；用户导入主题由后端转换为 `data/themes/{id}/theme.json + theme.css`。

## 验收清单

- 主题包目录名与 `theme.json.id` 一致
- `theme.css` 里没有组件选择器
- 主题覆盖 token 的范围只包含视觉值
- 核心默认值在没有主题时也能正常工作
- 主题文档和模板里的 token 例子与实际核心 token 对齐
