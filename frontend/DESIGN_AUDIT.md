# DESIGN_AUDIT.md

> **临时审计产物，T29B 完成后删除。**
> 由 T29A 任务生成，供 T29B 按图施工。

---

## 一、设计令牌清单

所有 `--we-*` 变量定义于 `/frontend/src/index.css` 的 `:root` 块，并通过 `@theme` 暴露为 Tailwind v4 工具类。

### 1.1 画布与表面

| CSS 变量 | 值 | 用途 | Tailwind 工具类 |
|---|---|---|---|
| `--we-canvas` | `#f5f4ed` | 页面主背景（羊皮纸） | `bg-canvas` |
| `--we-ivory` | `#faf9f5` | 卡片/浮层表面（象牙白） | `bg-ivory` |
| `--we-sand` | `#e8e6dc` | 次要按钮背景（暖沙） | `bg-sand` |
| `--we-white` | `#ffffff` | 最高对比度元素（纯白） | `bg-white` |
| `--we-surface-dark` | `#30302e` | 暗面容器/导航边框（深炭灰） | `bg-surface-dark` |
| `--we-surface-deep` | `#141413` | 最深暗面背景（近黑） | `bg-surface-deep` |

### 1.2 品牌与强调

| CSS 变量 | 值 | 用途 | Tailwind 工具类 |
|---|---|---|---|
| `--we-accent` | `#c96442` | 主 CTA 按钮（陶土橙） | `bg-accent` / `text-accent` |
| `--we-accent-soft` | `#d97757` | 次要强调/暗面链接（珊瑚） | `bg-accent-soft` / `text-accent-soft` |
| `--we-error` | `#b53333` | 错误状态（深暖红） | `bg-error` / `text-error` |
| `--we-focus` | `#3898ec` | Focus ring（焦点蓝，唯一冷色） | `border-focus` / `ring-focus` |

### 1.3 文字

| CSS 变量 | 值 | 用途 | Tailwind 工具类 |
|---|---|---|---|
| `--we-text` | `#141413` | 正文主色 | `text-text` |
| `--we-text-secondary` | `#5e5d59` | 次要说明文字（橄榄灰） | `text-text-secondary` |
| `--we-text-tertiary` | `#87867f` | 三级文字/元数据（石灰） | `text-text-tertiary` |
| `--we-text-muted` | `#4d4c48` | 按钮文字/紧凑正文（暖炭） | `text-text-muted` |
| `--we-text-on-dark` | `#b0aea5` | 暗面文字（暖银） | `text-text-on-dark` |

### 1.4 边框

| CSS 变量 | 值 | 用途 | Tailwind 工具类 |
|---|---|---|---|
| `--we-border` | `#f0eee6` | 最柔和的分隔（奶油边框） | `border-border` |
| `--we-border-strong` | `#e8e6dc` | 更明显的分隔（暖沙边框） | `border-border-strong` |
| `--we-border-dark` | `#30302e` | 暗面边框 | `border-border-dark` |

### 1.5 环形阴影色

| CSS 变量 | 值 | 用途 | Tailwind 工具类 |
|---|---|---|---|
| `--we-ring` | `#d1cfc5` | 标准 hover/focus ring | `ring-ring-warm` |
| `--we-ring-deep` | `#c2c0b6` | active/pressed ring | `ring-ring-warm-deep` |

### 1.6 阴影预设

| CSS 变量 | 值 | 用途 | Tailwind 工具类 |
|---|---|---|---|
| `--we-shadow-ring` | `0 0 0 1px var(--we-ring)` | 按钮 hover/交互卡片 | `shadow-ring` |
| `--we-shadow-ring-deep` | `0 0 0 1px var(--we-ring-deep)` | active/pressed 状态 | `shadow-ring-deep` |
| `--we-shadow-whisper` | `rgba(0,0,0,0.05) 0 4px 24px` | 悬浮卡片/弹层 | `shadow-whisper` |

### 1.7 字体栈

| CSS 变量 | 值 | Tailwind 工具类 |
|---|---|---|
| `--we-serif` | `"Anthropic Serif", Georgia, "Noto Serif SC", serif` | `font-serif` |
| `--we-sans` | `"Anthropic Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans SC", sans-serif` | `font-sans` |
| `--we-mono` | `"Anthropic Mono", ui-monospace, Consolas, monospace` | `font-mono` |

### 1.8 圆角刻度

| CSS 变量 | 值 | 适用场景 | Tailwind 工具类 |
|---|---|---|---|
| `--we-radius-sharp` | `4px` | 极小行内元素 | `rounded-sharp` |
| `--we-radius-sm` | `6px` | 小按钮/次要交互元素 | `rounded-sm` |
| `--we-radius` | `8px` | 标准按钮/卡片/容器 | `rounded` |
| `--we-radius-md` | `12px` | 主按钮/输入框/导航元素 | `rounded-md` |
| `--we-radius-lg` | `16px` | 特色容器/面板 | `rounded-lg` |
| `--we-radius-xl` | `24px` | 标签类元素/高亮容器 | `rounded-xl` |
| `--we-radius-2xl` | `32px` | Hero 容器/嵌入媒体/大卡片 | `rounded-2xl` |

---

## 二、钩子类名清单

以下钩子类名为项目约定，供 T24A 用户片段精确定位，也供 T29B 在组件上补齐。**T29A 不在组件上添加这些类，只做登记。**

### 全局结构
| 钩子类 | 挂载位置 |
|---|---|
| `we-app` | 应用根容器 |
| `we-sidebar` | 侧边栏 |
| `we-main` | 主内容区 |
| `we-modal` | 模态框容器 |
| `we-modal-backdrop` | 模态框遮罩 |

### 对话相关
| 钩子类 | 挂载位置 |
|---|---|
| `we-chat-message` | 每条消息行（含 user 和 ai） |
| `we-chat-message-user` | 用户消息行 |
| `we-chat-message-ai` | AI 消息行 |
| `we-chat-bubble` | 消息气泡内容区 |
| `we-chat-input` | 输入框区域 |

### 列表卡片
| 钩子类 | 挂载位置 |
|---|---|
| `we-character-card` | 角色卡片 |
| `we-world-card` | 世界卡片 |
| `we-session-card` | 会话列表项 |
| `we-persona-card` | 玩家人设卡片 |

### 按钮
| 钩子类 | 挂载位置 |
|---|---|
| `we-btn` | 所有按钮基础类 |
| `we-btn-primary` | 主按钮（陶土） |
| `we-btn-secondary` | 次要按钮（沙色） |
| `we-btn-ghost` | 幽灵按钮（透明底） |
| `we-btn-danger` | 危险按钮（红色） |

### 输入
| 钩子类 | 挂载位置 |
|---|---|
| `we-input` | 单行输入框 |
| `we-textarea` | 多行文本域 |
| `we-select` | 下拉选择框 |

### 记忆面板
| 钩子类 | 挂载位置 |
|---|---|
| `we-memory-panel` | 记忆面板容器 |
| `we-state-field-row` | 状态字段每一行 |

---

## 三、字体回退策略

- `Anthropic Serif`、`Anthropic Sans`、`Anthropic Mono` 均为 Anthropic 闭源自研字体，**本项目不加载这些字体文件**，仅作为首选项占位。
- 实际回退链：
  - 衬线：`Georgia`（macOS/Windows 均内置，形态最接近）→ `Noto Serif SC`（中文衬线补充）
  - 无衬线：`system-ui / -apple-system`（系统 UI 字体，最自然）→ `Segoe UI / Roboto`→ `Noto Sans SC`
  - 等宽：`ui-monospace`（macOS SF Mono）→ `Consolas`（Windows）→ 通用 `monospace`
- **不引入任何 Web Font CDN 或 @font-face**，保持零外部字体依赖，离线可用。

---

## 四、组件变更清单（T29B 施工目标）

### 高优先级（视觉差异最大）

| 文件 | 主要变更 |
|---|---|
| `frontend/src/pages/ChatPage.jsx` | 背景 `bg-canvas`；整体布局色系替换 |
| `frontend/src/components/chat/MessageItem.jsx` | 气泡色：AI `bg-ivory`、user `bg-accent/10`；气泡圆角 `rounded-lg`；挂 `we-chat-message`、`we-chat-bubble`、`we-chat-message-user\|ai` |
| `frontend/src/components/chat/MessageList.jsx` | 背景 `bg-canvas`；列表容器色系 |
| `frontend/src/components/chat/InputBox.jsx` | 外壳 `bg-ivory border-border rounded-lg`；发送按钮改 primary 风格；挂 `we-chat-input` |
| `frontend/src/components/chat/Sidebar.jsx` | 侧边栏背景、会话列表色系；挂 `we-sidebar` |
| `frontend/src/components/chat/SessionItem.jsx` | hover `bg-sand`；选中态；挂 `we-session-card` |

### 中优先级（页面级/弹层）

| 文件 | 主要变更 |
|---|---|
| `frontend/src/pages/WorldsPage.jsx` | 列表背景 `bg-canvas`；卡片 `bg-ivory hover:bg-sand`；挂 `we-world-card` |
| `frontend/src/pages/CharactersPage.jsx` | 同 WorldsPage；挂 `we-character-card` |
| `frontend/src/pages/CharacterEditPage.jsx` | 表单页背景；弹层用 ModalShell；标题 `font-serif` |
| `frontend/src/pages/SettingsPage.jsx` | 分区标题 `font-serif text-xl`；输入区用 Input/Textarea 原语；分隔线色系 |

### 通用组件（散落 className 清理）

| 文件/目录 | 主要变更 |
|---|---|
| `frontend/src/components/memory/MemoryPanel.jsx` | 分区标题 `font-serif`；字段行挂 `we-state-field-row`；挂 `we-memory-panel` |
| `frontend/src/components/settings/CustomCssManager.jsx` | 表单色系；按钮改 Claude 风格 |
| `frontend/src/components/settings/RegexRuleEditor.jsx` | 同上 |
| `frontend/src/components/settings/RegexRulesManager.jsx` | 同上 |
| `frontend/src/components/prompt/EntryEditor.jsx` | 输入框 `we-input`/`we-textarea` |
| `frontend/src/components/prompt/EntryList.jsx` | 列表项色系 |
| `frontend/src/components/state/StateFieldEditor.jsx` | 输入 + 下拉框 `we-input`/`we-select` |
| `frontend/src/components/state/StateFieldList.jsx` | 列表行 `we-state-field-row` |

### 新建 UI 原语（T29B 任务一）

| 文件（待建） | 说明 |
|---|---|
| `frontend/src/components/ui/Button.jsx` | variant: primary/secondary/ghost/danger；挂 `we-btn we-btn-{variant}` |
| `frontend/src/components/ui/Card.jsx` | elevation: flat/contained/ring/whisper；挂 `we-card` |
| `frontend/src/components/ui/Input.jsx` | 标准输入框；挂 `we-input` |
| `frontend/src/components/ui/Textarea.jsx` | 多行文本域；挂 `we-textarea` |
| `frontend/src/components/ui/Badge.jsx` | 标签胶囊；挂 `we-badge` |
| `frontend/src/components/ui/ModalShell.jsx` | 通用弹层外壳；挂 `we-modal`/`we-modal-backdrop` |

---

## 五、与 T24A 的兼容约定

- T24A 的 `<style id="we-custom-css">` 注入点位于 `<head>` 末尾，**优先级天然高于**本任务定义的 `:root` 和 `@theme`（后加载的样式表优先）。
- 用户可在自定义片段中直接覆盖任意 `--we-*` 变量，例如：
  ```css
  :root { --we-canvas: #1a1a1a; --we-text: #e8e6dc; }
  ```
  即可实现"用户自定义暗色主题"，无需修改任何组件代码。
- 用户也可通过钩子类精确定位组件，例如：
  ```css
  .we-chat-bubble { background: #ffe !important; }
  ```
- **T29B 不得删除任何已登记的 `.we-*` 钩子类**，保证用户片段的长期稳定性。
- T29B 新建的 UI 原语组件（Button、Card 等）应在内部合并传入的 `className`，确保用户片段中的 `.we-btn-primary` 选择器仍可命中。
