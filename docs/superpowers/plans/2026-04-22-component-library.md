# 前端通用组件库系统化提取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 系统提取前端重复模式为可复用组件，改造现有页面使用新组件，建立组件索引 + CLAUDE.md 规范双重约束。

**Architecture:** 在现有 `components/ui/` 下新增 5 个分子级组件（FormGroup、EditPageShell、ConfirmModal、AvatarUpload、FieldLabel 迁移），将 Select.jsx 内联 style 改为 CSS 类，新增 `utils/time.js`，最后创建 `components/index.js` 统一导出，改造所有使用旧模式的页面和 settings/ 组件。

**Tech Stack:** React 18 + TailwindCSS + CSS Variables (`--we-*`) + 现有 `styles/ui.css` / `styles/pages.css`

---

## 文件映射

**新增：**
- `frontend/src/utils/time.js`
- `frontend/src/components/ui/FieldLabel.jsx`（从 settings/ 迁移）
- `frontend/src/components/ui/FormGroup.jsx`
- `frontend/src/components/ui/AvatarUpload.jsx`
- `frontend/src/components/ui/ConfirmModal.jsx`
- `frontend/src/components/ui/EditPageShell.jsx`
- `frontend/src/components/index.js`

**重构：**
- `frontend/src/styles/ui.css`（新增 Select CSS 类）
- `frontend/src/components/ui/Select.jsx`（内联 style → CSS 类）
- `frontend/src/components/settings/FieldLabel.jsx`（删除，改为从 ui/ import）
- `frontend/src/components/settings/ProviderBlock.jsx`
- `frontend/src/components/settings/LlmConfigPanel.jsx`
- `frontend/src/components/settings/MemoryConfigPanel.jsx`
- `frontend/src/components/settings/PromptConfigPanel.jsx`
- `frontend/src/components/settings/DiaryConfigPanel.jsx`
- `frontend/src/components/settings/WritingLlmBlock.jsx`
- `frontend/src/pages/WorldCreatePage.jsx`
- `frontend/src/pages/WorldEditPage.jsx`
- `frontend/src/pages/CharacterCreatePage.jsx`
- `frontend/src/pages/CharacterEditPage.jsx`
- `frontend/src/pages/PersonaEditPage.jsx`
- `frontend/src/pages/WorldsPage.jsx`
- `CLAUDE.md`

**注意：** SettingsPage 使用 `we-settings-panel`（与 `we-edit-panel` 不同），内部有导航侧边栏，结构差异过大，不适用 EditPageShell，本次不改造。

---

## Task 1: 创建 utils/time.js

**Files:**
- Create: `frontend/src/utils/time.js`

- [ ] **Step 1: 创建文件**

```js
// frontend/src/utils/time.js
export function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}
```

- [ ] **Step 2: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```
期望：无 error，仅 warnings

- [ ] **Step 3: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/utils/time.js && git commit -m "feat: 新增 utils/time.js，提取 relativeTime 工具函数"
```

---

## Task 2: 迁移 FieldLabel 至 components/ui/

**Files:**
- Create: `frontend/src/components/ui/FieldLabel.jsx`
- Modify: `frontend/src/components/settings/FieldLabel.jsx`（改为 re-export）
- Verify: 所有 `import FieldLabel from './FieldLabel'` in settings/ 仍能工作

- [ ] **Step 1: 创建 ui/FieldLabel.jsx**

```jsx
// frontend/src/components/ui/FieldLabel.jsx
export default function FieldLabel({ children, hint }) {
  return (
    <label className="we-edit-label">
      {children}
      {hint && <span className="we-edit-label-hint">{hint}</span>}
    </label>
  );
}
```

- [ ] **Step 2: 将 settings/FieldLabel.jsx 改为 re-export**

将 `frontend/src/components/settings/FieldLabel.jsx` 内容改为：

```jsx
// settings/FieldLabel.jsx — 迁移兼容层，请从 ../ui/FieldLabel 导入
export { default } from '../ui/FieldLabel';
```

这样 settings/ 下已有的 `import FieldLabel from './FieldLabel'` 无需立即修改，不破坏现有功能。

- [ ] **Step 3: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/components/ui/FieldLabel.jsx frontend/src/components/settings/FieldLabel.jsx && git commit -m "feat: 迁移 FieldLabel 至 components/ui/"
```

---

## Task 3: 创建 FormGroup 组件

**Files:**
- Create: `frontend/src/components/ui/FormGroup.jsx`

- [ ] **Step 1: 创建文件**

```jsx
// frontend/src/components/ui/FormGroup.jsx
import FieldLabel from './FieldLabel';

export default function FormGroup({ label, required, hint, error, children }) {
  return (
    <div className="we-edit-form-group">
      {label && (
        <FieldLabel>
          {label}
          {required && <span style={{ color: 'var(--we-vermilion)' }}> *</span>}
        </FieldLabel>
      )}
      {children}
      {hint && <p className="we-edit-hint">{hint}</p>}
      {error && <p className="we-edit-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/components/ui/FormGroup.jsx && git commit -m "feat: 新增 FormGroup 通用表单字段组件"
```

---

## Task 4: 创建 AvatarUpload 组件

**Files:**
- Create: `frontend/src/components/ui/AvatarUpload.jsx`

参数名与 CharacterEditPage 内的局部 AvatarUpload 保持一致（使用 `avatarUploading`）以实现零成本迁移。

- [ ] **Step 1: 创建文件**

```jsx
// frontend/src/components/ui/AvatarUpload.jsx
export default function AvatarUpload({
  name,
  avatarUrl,
  avatarColor,
  avatarUploading,
  fileInputRef,
  onAvatarClick,
  onFileChange,
}) {
  const initial = (name || '?')[0].toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
      <div
        style={{ position: 'relative', cursor: 'pointer' }}
        onClick={onAvatarClick}
        onMouseEnter={(e) => {
          const mask = e.currentTarget.querySelector('.we-avatar-mask');
          if (mask) {
            mask.style.background = 'rgba(0,0,0,0.35)';
            const label = mask.querySelector('span');
            if (label) label.style.opacity = '1';
          }
        }}
        onMouseLeave={(e) => {
          const mask = e.currentTarget.querySelector('.we-avatar-mask');
          if (mask) {
            mask.style.background = 'rgba(0,0,0,0)';
            const label = mask.querySelector('span');
            if (label) label.style.opacity = '0';
          }
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--we-font-display)',
              fontSize: '28px',
              fontWeight: 300,
              color: '#fff',
            }}
          >
            {initial}
          </div>
        )}
        {avatarUploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#fff', fontSize: 12 }}>上传中…</span>
          </div>
        )}
        <div
          className="we-avatar-mask"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >
          <span style={{ color: '#fff', fontSize: 12, opacity: 0, transition: 'opacity 0.15s' }}>
            更换头像
          </span>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <p
        style={{
          fontFamily: 'var(--we-font-serif)',
          fontSize: 12,
          color: 'var(--we-ink-faded)',
          marginTop: 8,
          opacity: 0.7,
        }}
      >
        点击头像上传图片
      </p>
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/components/ui/AvatarUpload.jsx && git commit -m "feat: 新增 AvatarUpload 通用头像上传组件"
```

---

## Task 5: 创建 ConfirmModal 组件

**Files:**
- Create: `frontend/src/components/ui/ConfirmModal.jsx`

使用已有的 `.we-dialog-panel` CSS 类（定义于 `styles/ui.css:184`）。

- [ ] **Step 1: 创建文件**

```jsx
// frontend/src/components/ui/ConfirmModal.jsx
import { useState } from 'react';

export default function ConfirmModal({
  title = '确认',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onClose,
}) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="we-dialog-panel w-full max-w-sm mx-4" style={{ padding: '24px' }}>
        <h2
          style={{
            fontFamily: 'var(--we-font-display)',
            fontSize: '18px',
            fontStyle: 'italic',
            fontWeight: 400,
            color: 'var(--we-ink-primary)',
            marginBottom: '10px',
          }}
        >
          {title}
        </h2>
        <div
          style={{
            fontFamily: 'var(--we-font-serif)',
            fontSize: '14px',
            color: 'var(--we-ink-secondary)',
            marginBottom: '20px',
          }}
        >
          {message}
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={confirming}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              color: 'var(--we-ink-faded)',
              background: 'none',
              border: 'none',
              padding: '6px 16px',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--we-ink-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--we-ink-faded)'; }}
            className="disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              background: danger ? 'var(--we-vermilion)' : 'var(--we-ink-secondary)',
              color: 'var(--we-paper-base)',
              border: 'none',
              borderRadius: 'var(--we-radius-sm)',
              padding: '6px 16px',
              cursor: 'pointer',
            }}
            className="disabled:opacity-50"
          >
            {confirming ? '处理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/components/ui/ConfirmModal.jsx && git commit -m "feat: 新增 ConfirmModal 通用确认弹窗组件"
```

---

## Task 6: 创建 EditPageShell 组件

**Files:**
- Create: `frontend/src/components/ui/EditPageShell.jsx`

处理 WorldCreatePage / WorldEditPage / CharacterCreatePage / CharacterEditPage / PersonaEditPage 共同的骨架逻辑。

- [ ] **Step 1: 创建文件**

```jsx
// frontend/src/components/ui/EditPageShell.jsx

export default function EditPageShell({
  loading = false,
  isOverlay = false,
  onClose,
  title,
  children,
}) {
  if (loading) {
    if (isOverlay) {
      return (
        <div className="we-settings-overlay" onClick={onClose}>
          <div
            className="we-edit-panel we-edit-panel-overlay"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <p className="we-edit-empty-text">加载中…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="we-edit-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="we-edit-empty-text">加载中…</p>
      </div>
    );
  }

  const panel = (
    <div
      className={`we-edit-panel${isOverlay ? ' we-edit-panel-overlay' : ''}`}
      onClick={isOverlay ? (e) => e.stopPropagation() : undefined}
    >
      <div className="we-edit-header">
        <button className="we-edit-back" onClick={onClose}>← 返回</button>
        {title && <h1 className="we-edit-title">{title}</h1>}
      </div>
      {children}
    </div>
  );

  if (isOverlay) {
    return (
      <div className="we-settings-overlay" onClick={onClose}>
        {panel}
      </div>
    );
  }

  return (
    <div className="we-edit-canvas">
      {panel}
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/components/ui/EditPageShell.jsx && git commit -m "feat: 新增 EditPageShell 编辑页骨架组件"
```

---

## Task 7: 重构 Select 组件（内联 style → CSS 类）

**Files:**
- Modify: `frontend/src/styles/ui.css`（末尾追加 Select CSS 类）
- Modify: `frontend/src/components/ui/Select.jsx`

- [ ] **Step 1: 在 ui.css 末尾追加 Select CSS 类**

在 `frontend/src/styles/ui.css` 末尾追加：

```css
/* ── Select 自定义下拉 ── */
.we-select {
  position: relative;
  width: 100%;
}

.we-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--we-paper-shadow);
  border-radius: var(--we-radius-none);
  font-family: var(--we-font-serif);
  font-size: 14.5px;
  color: var(--we-ink-faded);
  cursor: pointer;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
  text-align: left;
}
.we-select-trigger.has-value {
  color: var(--we-ink-primary);
}
.we-select-trigger:hover:not(:disabled),
.we-select-trigger.open {
  border-color: var(--we-vermilion);
}
.we-select-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.we-select-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--we-ink-faded);
  transition: transform 0.15s;
}
.we-select-trigger.open .we-select-chevron {
  transform: rotate(180deg);
}

.we-select-dropdown {
  position: absolute;
  z-index: 50;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  background: var(--we-paper-base);
  border: 1px solid var(--we-paper-shadow);
  border-radius: var(--we-radius-sm);
  box-shadow: 0 4px 16px rgba(42, 31, 23, 0.14);
  overflow-y: auto;
  max-height: 12rem;
  padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--we-paper-shadow) transparent;
  list-style: none;
  margin: 0;
}
.we-select-dropdown::-webkit-scrollbar { width: 4px; }
.we-select-dropdown::-webkit-scrollbar-thumb { background: var(--we-paper-shadow); border-radius: 2px; }

.we-select-option {
  padding: 7px 14px;
  font-family: var(--we-font-serif);
  font-size: 14px;
  color: var(--we-ink-secondary);
  cursor: pointer;
  user-select: none;
  transition: background 0.12s;
}
.we-select-option:hover {
  background: var(--we-paper-aged);
}
.we-select-option--active {
  color: var(--we-vermilion);
}
```

- [ ] **Step 2: 重写 Select.jsx（移除所有内联 style 和 JS hover 事件）**

```jsx
// frontend/src/components/ui/Select.jsx
import { useState, useRef, useEffect } from 'react';

/**
 * 自定义下拉选择组件（固定选项，无自由输入）
 * options: { value: string, label: string }[]
 */
export default function Select({
  value = '',
  onChange,
  options = [],
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const selected = options.find((o) => o.value === value);

  function handleSelect(optValue) {
    onChange(optValue);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={['we-select', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        className={[
          'we-select-trigger',
          selected ? 'has-value' : '',
          open ? 'open' : '',
        ].filter(Boolean).join(' ')}
      >
        <span>{selected ? selected.label : '—'}</span>
        <svg
          className="we-select-chevron"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul className="we-select-dropdown">
          {options.map((option) => (
            <li
              key={option.value}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(option.value); }}
              className={[
                'we-select-option',
                option.value === value ? 'we-select-option--active' : '',
              ].filter(Boolean).join(' ')}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证构建 + 手动检查**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

启动前端后访问任意含 Select 的页面（如世界编辑页的 LLM 参数），确认下拉正常展开、悬停高亮、选中项朱砂色显示。

- [ ] **Step 4: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/styles/ui.css frontend/src/components/ui/Select.jsx && git commit -m "refactor: Select 组件内联 style 改为 CSS 类"
```

---

## Task 8: 创建 components/index.js

**Files:**
- Create: `frontend/src/components/index.js`

- [ ] **Step 1: 创建文件**

```js
// frontend/src/components/index.js
// 统一导出所有可复用组件。新增组件必须在此注册后方可在页面中使用。

// — UI 原子 —
export { default as Button }          from './ui/Button';
export { default as Input }           from './ui/Input';
export { default as Textarea }        from './ui/Textarea';
export { default as Select }          from './ui/Select';
export { default as Badge }           from './ui/Badge';
export { default as Card }            from './ui/Card';
export { default as ToggleSwitch }    from './ui/ToggleSwitch';
export { default as MarkdownEditor }  from './ui/MarkdownEditor';
export { default as ModalShell }      from './ui/ModalShell';
export { default as ModelCombobox }   from './ui/ModelCombobox';

// — UI 分子 —
export { default as FieldLabel }      from './ui/FieldLabel';
export { default as FormGroup }       from './ui/FormGroup';
export { default as EditPageShell }   from './ui/EditPageShell';
export { default as ConfirmModal }    from './ui/ConfirmModal';
export { default as AvatarUpload }    from './ui/AvatarUpload';

// — Book 专属 —
export { default as BookSpread }          from './book/BookSpread';
export { default as Bookmark }            from './book/Bookmark';
export { default as CastPanel }           from './book/CastPanel';
export { default as ChapterDivider }      from './book/ChapterDivider';
export { default as CharacterSeal }       from './book/CharacterSeal';
export { default as FleuronLine }         from './book/FleuronLine';
export { default as MarginaliaList }      from './book/MarginaliaList';
export { default as PageFooter }          from './book/PageFooter';
export { default as PageLeft }            from './book/PageLeft';
export { default as PageRight }           from './book/PageRight';
export { default as PageTransition }      from './book/PageTransition';
export { default as ParchmentTexture }    from './book/ParchmentTexture';
export { default as SealStampAnimation }  from './book/SealStampAnimation';
export { default as SectionTabs }         from './book/SectionTabs';
export { default as SessionListPanel }    from './book/SessionListPanel';
export { default as StatePanel }          from './book/StatePanel';
export { default as StatusSection }       from './book/StatusSection';
export { default as TopBar }              from './book/TopBar';
export { default as WritingPageLeft }     from './book/WritingPageLeft';
export { default as WritingSessionList }  from './book/WritingSessionList';
```

- [ ] **Step 2: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/components/index.js && git commit -m "feat: 新增 components/index.js 统一组件导出索引"
```

---

## Task 9: 改造 settings/ 组件（FormGroup + ConfirmModal）

**Files:**
- Modify: `frontend/src/components/settings/ProviderBlock.jsx`
- Modify: `frontend/src/components/settings/LlmConfigPanel.jsx`
- Modify: `frontend/src/components/settings/PromptConfigPanel.jsx`
- Modify: `frontend/src/components/settings/DiaryConfigPanel.jsx`
- Modify: `frontend/src/components/settings/WritingLlmBlock.jsx`
- Modify: `frontend/src/components/settings/MemoryConfigPanel.jsx`（无 we-edit-form-group，但有内联弹窗 DiaryDisableConfirm → ConfirmModal）

改造规则：
1. 添加 `import FormGroup from '../ui/FormGroup'`
2. 移除 `import FieldLabel from './FieldLabel'`（如果该文件改完后不再直接使用 FieldLabel，则删除此 import；否则改为 `import FieldLabel from '../ui/FieldLabel'`）
3. 将 `<div className="we-edit-form-group"><FieldLabel>X</FieldLabel>...` 替换为 `<FormGroup label="X">...`
4. 若 FieldLabel 有 `hint` prop，将 hint 内容移至 FormGroup 的 `hint` prop

**特殊情况（LlmConfigPanel Temperature 滑块）**：该字段使用 flex 布局将 FieldLabel 和数值并排显示，FormGroup 不适用，保留 `div.we-edit-form-group + FieldLabel` 的原始写法，仅将 FieldLabel 的 import 路径改为 `../ui/FieldLabel`。

- [ ] **Step 1: 改造 ProviderBlock.jsx**

`import` 段从：
```js
import FieldLabel from './FieldLabel';
```
改为：
```js
import FormGroup from '../ui/FormGroup';
```

将所有 `<div className="we-edit-form-group"><FieldLabel>X</FieldLabel>...` 替换为 `<FormGroup label="X">...`：

```jsx
// 改造前：
<div className="we-edit-form-group">
  <FieldLabel>Provider</FieldLabel>
  <Select value={config.provider || ''} onChange={onProviderChange} options={providers} />
</div>

// 改造后：
<FormGroup label="Provider">
  <Select value={config.provider || ''} onChange={onProviderChange} options={providers} />
</FormGroup>
```

```jsx
// API Key 改造前：
<div className="we-edit-form-group">
  <FieldLabel>API Key</FieldLabel>
  <div style={{ display: 'flex', gap: '8px' }}>
    ...
  </div>
</div>

// 改造后：
<FormGroup label="API Key">
  <div style={{ display: 'flex', gap: '8px' }}>
    ...
  </div>
</FormGroup>
```

```jsx
// Base URL 改造前：
<div className="we-edit-form-group">
  <FieldLabel>Base URL</FieldLabel>
  <Input ... />
</div>

// 改造后：
<FormGroup label="Base URL">
  <Input ... />
</FormGroup>
```

```jsx
// 模型 改造前：
<div className="we-edit-form-group">
  <FieldLabel>模型</FieldLabel>
  <ModelSelector ... />
</div>

// 改造后：
<FormGroup label="模型">
  <ModelSelector ... />
</FormGroup>
```

```jsx
// 思考链级别（带 hint）改造前：
<div className="we-edit-form-group">
  <FieldLabel hint="auto = 不传参数，使用模型默认行为">思考链级别</FieldLabel>
  <Select ... />
</div>

// 改造后：
<FormGroup label="思考链级别" hint="auto = 不传参数，使用模型默认行为">
  <Select ... />
</FormGroup>
```

- [ ] **Step 2: 改造 LlmConfigPanel.jsx**

添加 `import FormGroup from '../ui/FormGroup'`，将 `import FieldLabel from './FieldLabel'` 改为 `import FieldLabel from '../ui/FieldLabel'`（Temperature 滑块保留使用 FieldLabel）。

```jsx
// Max Tokens 改造前：
<div className="we-edit-form-group">
  <FieldLabel>Max Tokens</FieldLabel>
  <Input ... />
</div>

// 改造后：
<FormGroup label="Max Tokens">
  <Input ... />
</FormGroup>
```

```jsx
// HTTP 代理地址（带 hint）改造前：
<div className="we-edit-form-group">
  <FieldLabel hint="仅对 LLM / Embedding 网络请求生效，留空不使用代理">HTTP 代理地址</FieldLabel>
  <div style={{ display: 'flex', gap: '8px' }}>
    ...
  </div>
</div>

// 改造后：
<FormGroup label="HTTP 代理地址" hint="仅对 LLM / Embedding 网络请求生效，留空不使用代理">
  <div style={{ display: 'flex', gap: '8px' }}>
    ...
  </div>
</FormGroup>
```

Temperature 滑块保持不变（仍使用 `div.we-edit-form-group + FieldLabel` 以保留 flex 自定义布局）。

- [ ] **Step 3: 改造 PromptConfigPanel.jsx**

添加 `import FormGroup from '../ui/FormGroup'`，移除 FieldLabel import（如有）。

将所有 `<div className="we-edit-form-group">...<label className="we-edit-label">X</label>...` 替换为 `<FormGroup label="X">...`（PromptConfigPanel 使用裸 `label.we-edit-label` 而非 FieldLabel 组件，效果相同）。

- [ ] **Step 4: 改造 DiaryConfigPanel.jsx**

同上，添加 FormGroup import，替换 we-edit-form-group 模式。

- [ ] **Step 5: 改造 WritingLlmBlock.jsx**

同上。

- [ ] **Step 6: 改造 MemoryConfigPanel.jsx（DiaryDisableConfirm → ConfirmModal）**

MemoryConfigPanel 无 `we-edit-form-group`，但有内联 `DiaryDisableConfirm` 组件。

新增 import：
```js
import ConfirmModal from '../ui/ConfirmModal';
```

删除：`function DiaryDisableConfirm(...)` 局部组件定义（第 25-56 行全部删除）。

将 `DiaryDisableConfirm` 调用（原 152-158 行）替换为：

```jsx
{confirmPending && (
  <ConfirmModal
    title={`关闭${diaryLabel}`}
    message={
      <>
        <p style={{ marginBottom: '6px' }}>
          关闭后将删除所有已生成的日记记录（包括数据库条目和本地文件），此操作不可撤销。
        </p>
        <p style={{ color: 'var(--we-vermilion)', fontSize: '13px' }}>
          确认要继续吗？
        </p>
      </>
    }
    confirmText="确认关闭并删除"
    danger
    onConfirm={handleConfirmDisable}
    onClose={() => setConfirmPending(false)}
  />
)}
```

- [ ] **Step 8: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 9: 手动验证**

启动前端，访问 `/settings`：
- 进入 LLM 配置面板，确认所有表单字段（Provider、API Key、Base URL、模型、Temperature 滑块、Max Tokens）布局正常
- 进入记忆配置面板，开启日记后再关闭，确认 ConfirmModal 弹出、取消和确认均正常

- [ ] **Step 10: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/components/settings/ && git commit -m "refactor: settings/ 组件改用 FormGroup，MemoryConfigPanel 改用 ConfirmModal"
```

---

## Task 10: 改造 WorldCreatePage + CharacterCreatePage

**Files:**
- Modify: `frontend/src/pages/WorldCreatePage.jsx`
- Modify: `frontend/src/pages/CharacterCreatePage.jsx`

这两个页面无 overlay 模式、无 loading 状态（不加载远程数据）。

- [ ] **Step 1: 改造 WorldCreatePage.jsx**

完整新文件内容：

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorld } from '../api/worlds';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';

export default function WorldCreatePage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleSave() {
    if (!name.trim()) {
      setSaveError('名称为必填项');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const world = await createWorld({
        name: name.trim(),
        system_prompt: systemPrompt,
        post_prompt: postPrompt,
      });
      navigate(`/worlds/${world.id}/edit`, { replace: true });
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditPageShell onClose={() => navigate(-1)} title="新建世界">
      <div className="we-edit-form-stack">
        <FormGroup label="名称" required>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="世界的名称"
            autoFocus
          />
        </FormGroup>

        <FormGroup label="世界 System Prompt">
          <MarkdownEditor
            value={systemPrompt}
            onChange={setSystemPrompt}
            placeholder="描述这个世界的背景、规则、氛围……"
            minHeight={144}
          />
        </FormGroup>

        <FormGroup
          label="后置提示词"
          hint="插入在用户消息之后，作为 user 角色发送"
          error={saveError}
        >
          <MarkdownEditor
            value={postPrompt}
            onChange={setPostPrompt}
            placeholder="每次对话附加的世界级指令，例如输出语言、格式要求……"
            minHeight={72}
          />
        </FormGroup>

        <div className="we-edit-save-row">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '创建中…' : '创建世界'}
          </Button>
        </div>
      </div>
    </EditPageShell>
  );
}
```

注意：`saveError` 是全局表单错误（不属于任何单个字段），不传入 FormGroup 的 `error` prop，保留在 save row 上方独立渲染：

```jsx
{saveError && <p className="we-edit-error">{saveError}</p>}
<div className="we-edit-save-row">...</div>
```

- [ ] **Step 2: 改造 CharacterCreatePage.jsx**

完整新文件内容：

```jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createCharacter } from '../api/characters';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';

export default function CharacterCreatePage() {
  const { worldId } = useParams();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleSave() {
    if (!name.trim()) {
      setSaveError('名称为必填项');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const character = await createCharacter(worldId, {
        name: name.trim(),
        system_prompt: systemPrompt,
        post_prompt: postPrompt,
        first_message: firstMessage,
      });
      navigate(`/characters/${character.id}/edit`, { replace: true });
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditPageShell onClose={() => navigate(-1)} title="新建角色">
      <div className="we-edit-form-stack">
        <FormGroup label="名称" required>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="角色的名字"
            autoFocus
          />
        </FormGroup>

        <FormGroup label="System Prompt">
          <MarkdownEditor
            value={systemPrompt}
            onChange={setSystemPrompt}
            placeholder="角色的性格、背景、说话风格……"
            minHeight={144}
          />
        </FormGroup>

        <FormGroup label="后置提示词" hint="插入在用户消息之后，作为 user 角色发送">
          <MarkdownEditor
            value={postPrompt}
            onChange={setPostPrompt}
            placeholder="每次对话附加的角色级指令，例如特定的回复格式……"
            minHeight={72}
          />
        </FormGroup>

        <FormGroup label="开场白">
          <MarkdownEditor
            value={firstMessage}
            onChange={setFirstMessage}
            placeholder="角色在对话开始时主动说的第一句话，留空则由用户先开口"
            minHeight={96}
          />
        </FormGroup>

        {saveError && <p className="we-edit-error">{saveError}</p>}

        <div className="we-edit-save-row">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '创建中…' : '创建角色'}
          </Button>
        </div>
      </div>
    </EditPageShell>
  );
}
```

- [ ] **Step 3: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: 手动验证**

启动前端，访问新建世界页和新建角色页，确认表单布局正常、保存/创建功能正常。

- [ ] **Step 5: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/pages/WorldCreatePage.jsx frontend/src/pages/CharacterCreatePage.jsx && git commit -m "refactor: WorldCreatePage + CharacterCreatePage 改用 EditPageShell + FormGroup"
```

---

## Task 11: 改造 WorldEditPage + CharacterEditPage

**Files:**
- Modify: `frontend/src/pages/WorldEditPage.jsx`
- Modify: `frontend/src/pages/CharacterEditPage.jsx`

这两个页面支持 overlay 模式，有 loading 状态，有 SealStampAnimation。

- [ ] **Step 1: 改造 WorldEditPage.jsx**

**改动点（非整体重写，只列关键变更）：**

新增 import：
```js
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';
```

删除 import：无（原有 import 保留）

**替换 loading + render 部分**（原 143-353 行）：

```jsx
// 删除原有 if (loading) {...} 块（143-157 行），由 EditPageShell 处理

// sections 内容保持不变，但所有 we-edit-form-group 改为 FormGroup：

// 示例 basic section 改动：
// 改造前：
// <div className="we-edit-form-group">
//   <label className="we-edit-label">名称 <span style={{ color: 'var(--we-vermilion)' }}>*</span></label>
//   <Input ... />
// </div>
// 改造后：
// <FormGroup label="名称" required>
//   <Input ... />
// </FormGroup>

// 改造前：
// <div className="we-edit-form-group">
//   <label className="we-edit-label">世界 System Prompt</label>
//   <MarkdownEditor ... />
// </div>
// 改造后：
// <FormGroup label="世界 System Prompt">
//   <MarkdownEditor ... />
// </FormGroup>

// 改造前：
// <div className="we-edit-form-group">
//   <label className="we-edit-label">后置提示词<span className="we-edit-label-hint">...</span></label>
//   <MarkdownEditor ... />
// </div>
// 改造后：
// <FormGroup label="后置提示词" hint="插入在用户消息之后，作为 user 角色发送">
//   <MarkdownEditor ... />
// </FormGroup>

// saveError 保持在 save row 上方独立渲染

// 替换 return 部分（原 326-353 行）：
return (
  <>
    <EditPageShell
      loading={loading}
      isOverlay={isOverlay}
      onClose={handleClose}
      title={loading ? '' : `编辑世界 · ${name}`}
    >
      <SectionTabs sections={sections} defaultKey="basic" />
    </EditPageShell>
    <SealStampAnimation trigger={sealKey} text="成" />
  </>
);
```

所有 llm section、state_templates section、export section 内的 `we-edit-form-group` 同样替换为 `FormGroup`。

- [ ] **Step 2: 改造 CharacterEditPage.jsx**

与 WorldEditPage 相同策略：

新增 import：
```js
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';
import AvatarUpload from '../components/ui/AvatarUpload';
```

删除：原文件内的局部 `function AvatarUpload(...)` 定义（第 16-82 行）。

所有 `we-edit-form-group` 替换为 FormGroup（方式同 WorldEditPage）。

替换 return 部分：
```jsx
return (
  <>
    <EditPageShell
      loading={loading}
      isOverlay={isOverlay}
      onClose={handleClose}
      title={loading ? '' : `编辑角色 · ${name}`}
    >
      <SectionTabs sections={sections} defaultKey="basic" />
    </EditPageShell>
    <SealStampAnimation trigger={sealKey} text="成" />
  </>
);
```

- [ ] **Step 3: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: 手动验证**

- 从世界列表点击编辑（overlay 模式）：弹出面板，可编辑、可保存、可关闭
- 直接访问 `/worlds/:id/edit`（非 overlay 模式）：全页面，功能正常
- 角色编辑同上，验证头像上传

- [ ] **Step 5: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/pages/WorldEditPage.jsx frontend/src/pages/CharacterEditPage.jsx && git commit -m "refactor: WorldEditPage + CharacterEditPage 改用 EditPageShell + FormGroup + AvatarUpload"
```

---

## Task 12: 改造 PersonaEditPage

**Files:**
- Modify: `frontend/src/pages/PersonaEditPage.jsx`

PersonaEditPage 无 overlay 模式，有 loading，有内联头像上传逻辑（需改为 AvatarUpload 组件）。

- [ ] **Step 1: 改造 PersonaEditPage.jsx**

完整新文件内容：

```jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPersona, updatePersona, uploadPersonaAvatar } from '../api/personas';
import { getPersonaStateValues, updatePersonaStateValue } from '../api/persona-state-values';
import { downloadPersonaCard } from '../api/import-export';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StateValueField from '../components/state/StateValueField';
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';
import AvatarUpload from '../components/ui/AvatarUpload';

export default function PersonaEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [personaId, setPersonaId] = useState(null);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [avatarPath, setAvatarPath] = useState(null);
  const [stateFields, setStateFields] = useState([]);

  useEffect(() => {
    Promise.all([
      getPersona(worldId),
      getPersonaStateValues(worldId),
    ]).then(([p, fields]) => {
      setPersonaId(p.id);
      setName(p.name ?? '');
      setSystemPrompt(p.system_prompt ?? '');
      setAvatarPath(p.avatar_path ?? null);
      setStateFields(fields);
      setLoading(false);
    });
  }, [worldId, reloadKey]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:persona-updated', h);
    return () => window.removeEventListener('we:persona-updated', h);
  }, []);

  async function handleStateValueSave(fieldKey, valueJson) {
    try {
      await updatePersonaStateValue(worldId, fieldKey, valueJson);
    } catch (err) {
      console.error('状态值保存失败', err);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const result = await uploadPersonaAvatar(worldId, file);
      setAvatarPath(result.avatar_path);
      window.dispatchEvent(new Event('we:persona-updated'));
    } catch (err) {
      alert(`头像上传失败：${err.message}`);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updatePersona(worldId, { name, system_prompt: systemPrompt });
      window.dispatchEvent(new Event('we:persona-updated'));
      navigate(-1);
    } catch (err) {
      alert(`保存失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      await downloadPersonaCard(worldId, `${name || '玩家'}.wechar.json`);
    } catch (err) {
      alert(`导出失败：${err.message}`);
    }
  }

  const avatarUrl = getAvatarUrl(avatarPath);
  const avatarColor = getAvatarColor(personaId || worldId);

  return (
    <EditPageShell loading={loading} onClose={() => navigate(-1)} title="玩家人设">
      <div className="we-edit-form-stack">
        <AvatarUpload
          name={name}
          avatarUrl={avatarUrl}
          avatarColor={avatarColor}
          avatarUploading={avatarUploading}
          fileInputRef={fileInputRef}
          onAvatarClick={() => fileInputRef.current?.click()}
          onFileChange={handleFileChange}
        />

        <FormGroup label="玩家名">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="你在这个世界里的名字" />
        </FormGroup>

        <FormGroup label="人设">
          <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="你的身份、背景等" minHeight={120} />
        </FormGroup>

        {stateFields.length > 0 && (
          <div>
            <div className="we-edit-state-sep" />
            <FormGroup label="玩家状态">
              <div className="we-state-value-list" style={{ marginTop: 8 }}>
                {stateFields.map(f => (
                  <div key={f.field_key} style={{ marginBottom: 12 }}>
                    <p className="we-state-value-label" style={{ marginBottom: 4 }}>{f.label}</p>
                    <StateValueField field={f} onSave={handleStateValueSave} />
                  </div>
                ))}
              </div>
            </FormGroup>
          </div>
        )}

        <div className="we-edit-state-sep" />

        <div className="we-edit-save-row">
          <Button variant="ghost" size="sm" onClick={handleExport}>导出为角色卡</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </EditPageShell>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 手动验证**

访问玩家人设页，确认头像显示/上传正常、表单字段布局正确、保存后返回。

- [ ] **Step 4: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/pages/PersonaEditPage.jsx && git commit -m "refactor: PersonaEditPage 改用 EditPageShell + FormGroup + AvatarUpload"
```

---

## Task 13: 改造 WorldsPage（ConfirmModal + relativeTime import）

**Files:**
- Modify: `frontend/src/pages/WorldsPage.jsx`

WorldsPage 使用 `we-worlds-canvas`（非 `we-edit-canvas`），不适用 EditPageShell。仅替换：
1. 内联 `DeleteConfirmModal` → import `ConfirmModal`
2. 内联 `relativeTime` → import from `utils/time`

- [ ] **Step 1: 改造 WorldsPage.jsx**

**删除**（文件顶部）：
```js
function relativeTime(ts) { ... }   // 删除整个函数（9-22 行）
function DeleteConfirmModal(...) { ... }  // 删除整个函数（24-63 行）
```

**修改 import 段**，新增：
```js
import { relativeTime } from '../utils/time';
import ConfirmModal from '../components/ui/ConfirmModal';
```

**改造删除弹窗调用**（原 252-258 行）：

```jsx
// 改造前：
{deletingWorld && (
  <DeleteConfirmModal
    world={deletingWorld}
    onConfirm={handleDelete}
    onClose={() => setDeletingWorld(null)}
  />
)}

// 改造后：
{deletingWorld && (
  <ConfirmModal
    title="确认删除"
    message={
      <>
        <p style={{ marginBottom: '6px' }}>
          即将删除世界 <span style={{ color: 'var(--we-ink-primary)', fontWeight: 500 }}>「{deletingWorld.name}」</span>。
        </p>
        <p style={{ color: 'var(--we-vermilion)', fontSize: '13px' }}>
          此操作将同时删除其下所有角色和会话，且无法恢复。
        </p>
      </>
    }
    confirmText="确认删除"
    danger
    onConfirm={handleDelete}
    onClose={() => setDeletingWorld(null)}
  />
)}
```

- [ ] **Step 2: 验证构建**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 手动验证**

访问 `/worlds`，点击世界卡片的删除按钮，确认 ConfirmModal 正常弹出、取消和确认操作均正常。

- [ ] **Step 4: Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add frontend/src/pages/WorldsPage.jsx && git commit -m "refactor: WorldsPage 改用 ConfirmModal 和 utils/time"
```

---

## Task 14: 更新 CLAUDE.md + 最终验证

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 在 CLAUDE.md「前端分层」段落下方新增组件复用规则**

在 `frontend/src/api/` 那段规则之后（"前端分层"段落内），新增：

```md
**组件复用规则**
- 新页面组装前必须先查阅 `frontend/src/components/index.js`，有可用组件则强制复用，不可另起炉灶
- 编辑类页面骨架统一用 `EditPageShell`，禁止手写 `we-edit-canvas` / `we-edit-panel`
- 表单字段统一用 `FormGroup`，禁止散写 `div.we-edit-form-group` + `label.we-edit-label`
- 确认弹窗统一用 `ConfirmModal`，禁止页面内联定义局部弹窗
- 新组件需同步在 `components/index.js` 中注册后方可使用
- 没有现成组件时，先参照现有组件风格和 `DESIGN.md` 指引创建，放入 `components/ui/`
```

- [ ] **Step 2: 完整构建验证**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run build 2>&1
```

期望：构建成功，无 error（warning 可接受）。

- [ ] **Step 3: 全链路手动验证清单**

- `/worlds` — 世界列表正常展示，时间戳相对格式显示，删除弹窗（ConfirmModal）正常
- `/worlds/new` — 新建世界，表单布局正常，创建成功
- `/worlds/:id/edit`（直接访问）— 编辑世界全页，所有 tab 正常，保存成功
- `/worlds/:id/edit`（overlay 模式，从世界列表点编辑）— 弹出面板，关闭正常
- `/worlds/:id/characters/new` — 新建角色，表单布局正常
- `/characters/:id/edit`（直接访问）— 编辑角色，头像上传正常，tab 切换正常
- `/worlds/:id/persona` — 玩家人设，头像上传，状态字段显示正常
- `/settings` — LLM 配置、Prompt 配置等各 Panel 布局正常，Select 下拉交互正常

- [ ] **Step 4: 最终 Commit**

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && git add CLAUDE.md && git commit -m "docs: CLAUDE.md 新增组件复用规范"
```
