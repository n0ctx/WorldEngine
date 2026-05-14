# Frontend Coding Standards

前端改动必读规范。任何修改 `frontend/src/` 或 `themes/` 下代码之前，先通读本页。

---

## 一、CSS Token 规范

### 1.1 禁止裸值

组件样式**禁止直接写**以下原始值，必须换用对应 token：

| 禁止 | 应使用 |
|---|---|
| 颜色字面量（`#fff`、`rgb(...)`、`rgba(...)`）| `var(--we-color-*)` |
| 裸 px 间距（`padding: 8px`、`gap: 16px`）| `var(--we-space-*)` |
| 裸 px 字号（`font-size: 14px`）| `var(--we-text-*)` |
| 裸 px 圆角（`border-radius: 8px`）| `var(--we-radius-*)` |
| 裸 transition（`transition: 0.2s ease`）| `var(--we-duration-*)`  |
| 裸 z-index 数字（`z-index: 100`）| `var(--we-z-*)` |
| Tailwind 任意值（`min-h-[32px]`、`opacity-[0.75]`）| 语义 CSS 类 + token |

**例外**：设计稿明确要求的精确像素值保留原值，但必须加注释：
```css
width: 3px; /* design exact */
```

### 1.2 Token 使用层级

- **组件层** 只能消费 `--we-color-*`（语义色），禁止直接引用 `--we-core-*`（基础色）或 `--we-base-*`（色板）
- `--we-core-*` / `--we-base-*` 仅在 `tokens.css` 内部派生语义色时使用
- 若 token 不存在，**先在 `tokens.css` 补定义**，再在组件中消费；不要创造平行命名体系

### 1.3 无对应 token 的字号

小号字（通常 ≤ 10px）暂无 token 时，保留原始值并加注释：
```css
font-size: 9px; /* no token */
```

### 1.4 间距 scale 参考

| token | 值 |
|---|---|
| `--we-space-xxs` | 2px |
| `--we-space-xs`  | 4px |
| `--we-space-sm`  | 8px |
| `--we-space-md`  | 12px |
| `--we-space-lg`  | 16px |
| `--we-space-xl`  | 24px |
| `--we-space-2xl` | 32px |

---

## 二、CSS 文件职责边界

每个 CSS 文件只写属于自己职责范围的样式，**不要跨文件写错位置**：

| 文件 | 职责 |
|---|---|
| `frontend/src/themes/tokens.css` | 所有 `--we-*` token 定义（默认值）|
| `frontend/src/themes/fonts.css` | `@font-face` 与字体族默认值 |
| `frontend/src/themes/ui.css` | 通用 UI 组件（按钮、输入框、弹窗、chip 等）|
| `frontend/src/themes/pages.css` | 页面级容器与布局组件 |
| `frontend/src/themes/chat.css` | 对话区 / 写作区组件 |
| `themes/<id>/theme.css` | 仅覆写 `--we-*` token 取值，禁止写组件选择器 |

**新增 token**：在 `tokens.css` 添加定义，必要时在 `themes/_template/theme.css` 与各主题包补覆写条目（防止对齐缺失）。

**跨文件引用**：`ui.css` 可通过选择器同时覆盖在多个父容器下的变体，但不要把 chat 区样式写进 `ui.css`。

---

## 三、主题分层规则

```
frontend/src/themes/   ← 框架层：token 默认值 + 组件样式
themes/<id>/           ← 主题包：仅覆写 --we-* token
data/themes/           ← 用户导入主题（同结构）
```

**主题包（`themes/<id>/theme.css`）硬约束**：
- 只允许写 `:root { --we-xxx: <value>; }` 形式的 token 覆写
- 禁止写组件选择器（`.we-btn { ... }`）
- 禁止写 `@font-face`
- 禁止写 `!important`（已有 token 机制，无需强制覆盖）

**判断口诀**：改"默认值/组件结构/新 token" → `frontend/src/themes/`；改"某个主题的具体取值" → `themes/<id>/`。

---

## 四、CSS 类命名规范

### 4.1 命名前缀

所有项目 CSS 类必须以 `.we-` 开头（BEM 式语义命名）：
```css
.we-panel-card { ... }
.we-panel-card--active { ... }
.we-panel-card__body { ... }
```

禁止使用：
- 无前缀的通用类名（`.card`、`.btn`）
- Tailwind 任意值修饰符（`[min-h-32px]`、`/75`）
- 直接写 `opacity: 0.75` 而不用 token（有 `--we-opacity-*` 时优先）

### 4.2 修饰符与变体

- 状态修饰符用双连字符：`.we-xxx--active`、`.we-xxx--disabled`
- 子元素用双下划线：`.we-xxx__body`、`.we-xxx__icon`
- Shell 局部 chrome 组件前缀自由（但仍须 `we-` 起头）

---

## 五、组件写法约束

### 5.1 无 inline style

Shell / 页面组件禁止使用 `style={{ ... }}`，布局与装饰全部走 CSS 类：
```jsx
// ✗ 禁止
<div style={{ padding: '16px', color: '#fff' }}>

// ✓ 正确
<div className="we-page-right__body">
```

例外：动画关键帧、动态计算值（如拖拽 translate）可保留 inline style，但要注释说明原因。

### 5.2 按钮文案

按钮文案不加装饰符号，直接写语义文字：
```jsx
// ✗ 禁止
<button>✦ 助手</button>
<button>前往世界列表 →</button>

// ✓ 正确
<button>助手</button>
<button>前往世界列表</button>
```

### 5.3 图标按钮可达性

icon-only 按钮**必须**加 `aria-label`：
```jsx
<button aria-label="关闭面板"><Icon name="close" /></button>
```

### 5.4 异步区块三态

每个异步数据区块必须处理三态：
```jsx
if (loading) return <LoadingState />;
if (error)   return <ErrorState message={error} />;
if (!data?.length) return <EmptyState />;
return <DataList data={data} />;
```

### 5.5 CSS 嵌套陷阱

CSS 中 `::before` / `::after` 块的所有声明必须写在块内，**不可分离**：
```css
/* ✗ 危险：内容声明在块外，触发原生 CSS 嵌套，后续规则变子选择器 */
.we-foo::before {
}
content: '...'; /* 孤立块 → 后续所有规则成为 .we-foo::before 的后代 */

/* ✓ 正确 */
.we-foo::before {
  content: '';
  position: absolute;
  ...
}
```

---

## 六、数据与状态约束

| 规则 | 说明 |
|---|---|
| 禁止组件内直接 `fetch` | 所有网络请求必须通过 `frontend/src/core/api/` |
| 本地 UI 状态留在组件 | 仅跨页面共享的状态才放 `core/state/` |
| 路由/副作用不进纯 UI 组件 | `components/ui/` 不引入 `useNavigate`、`useEffect`(副作用) |
| assistant 能力单一入口 | 只通过 `core/features/assistant/` 暴露，页面不直接调内部模块 |

---

## 七、验证清单

改完前端代码后，按照改动范围自查：

- [ ] 是否引入了新的裸颜色字面量？（grep `#[0-9a-fA-F]`、`rgb(`）
- [ ] 是否引入了裸 px 间距而非 `--we-space-*`？
- [ ] 是否新增了主题包组件选择器（违反分层）？
- [ ] 是否新增了无 `we-` 前缀的 CSS 类？
- [ ] 是否有 icon-only 按钮缺少 `aria-label`？
- [ ] 是否有异步区块缺少 loading/empty/error 三态？
- [ ] 是否在组件内直接 `fetch`？
- [ ] 若新增 token，是否同步到 `_template/theme.css` 和各内置主题？（`npm run check:themes`）

**验证命令**：
```bash
npm run check          # 总闸门
npm run check:themes   # 主题 token 对齐检查
cd frontend && npm run lint
cd frontend && npm run build
```
