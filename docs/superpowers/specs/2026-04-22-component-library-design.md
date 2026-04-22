# 前端通用组件库系统化提取 — 设计规格

**日期**：2026-04-22  
**范围**：`frontend/src/components/` + `frontend/src/pages/` + `frontend/src/utils/`  
**方案**：方案 B（有意义边界）

---

## 背景与目标

当前前端存在以下问题：

1. **页面骨架重复**：`we-edit-canvas` + `we-edit-panel` + overlay + loading 逻辑在 5 个编辑页各写一遍（WorldCreatePage、WorldEditPage、CharacterCreatePage、CharacterEditPage、PersonaEditPage）
2. **表单组重复**：`we-edit-form-group` + `we-edit-label` + hint + error 散落在 `pages/` 和 `settings/` 共 40+ 处，无统一封装
3. **业务组件内联**：`DeleteConfirmModal`、`AvatarUpload`、`relativeTime` 均为页面级局部定义，无法复用
4. **Select 风格不一致**：`Select.jsx` 全量使用内联 style，与其他 `ui/` 组件的 CSS 类风格不一致
5. **book/ 无统一出口**：已有组件无法通过索引快速发现和导入
6. **无强制复用机制**：新页面无规范可查，易重新发明轮子

**目标**：一次性系统提取所有承载真实逻辑或跨页面复用的模式，改造现有页面使用新组件，建立索引 + 规范双重约束。

---

## §1 新增 / 调整组件总览

| 动作 | 文件 | 说明 |
|---|---|---|
| 新增 | `components/ui/FormGroup.jsx` | label + 控件 + hint + error 的标准表单组 |
| 新增 | `components/ui/EditPageShell.jsx` | 编辑页骨架：canvas + panel + overlay 模式 + loading 状态统一处理 |
| 新增 | `components/ui/ConfirmModal.jsx` | 通用确认弹窗，替代 WorldsPage 内联的 DeleteConfirmModal |
| 新增 | `components/ui/AvatarUpload.jsx` | 头像上传控件，提取自 CharacterEditPage，PersonaEditPage 可复用 |
| 新增 | `utils/time.js` | `relativeTime(ts)` 移入此处，WorldsPage 不再内联定义 |
| 重构 | `components/ui/Select.jsx` | 内联 style → CSS 类，接口不变 |
| 移动 | `components/settings/FieldLabel.jsx` → `components/ui/FieldLabel.jsx` | 统一路径，settings/ 改为从 ui/ import |
| 新增 | `components/index.js` | 统一导出所有可复用组件的入口索引 |
| 更新 | `CLAUDE.md` | 新增组件复用规范段落 |

**不新增目录**，所有新组件落在现有的 `components/ui/` 和 `utils/` 内。

---

## §2 组件接口设计

### FormGroup

```jsx
<FormGroup label="名称" required hint="覆盖全局配置" error={saveError}>
  <Input value={name} onChange={...} />
</FormGroup>
```

**Props**：

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `label` | string | — | 字段标签文字 |
| `required` | bool | false | 显示朱砂 `*` |
| `hint` | string | — | 灰色辅助说明，渲染为 `p.we-edit-hint` |
| `error` | string | — | 错误提示，渲染为 `p.we-edit-error`；为空则不渲染 |
| `children` | ReactNode | — | 实际输入控件 |

**内部结构**：
```
div.we-edit-form-group
  FieldLabel [+ required *]
  children
  [p.we-edit-hint]
  [p.we-edit-error]
```

FieldLabel 内部依旧渲染 `label.we-edit-label`，hint 和 error 均条件渲染（空字符串 / undefined 时不占位）。`label` prop 为空时不渲染 FieldLabel。

---

### EditPageShell

```jsx
<EditPageShell
  loading={loading}
  isOverlay={isOverlay}
  onClose={handleClose}
  title="编辑世界"
>
  <SectionTabs sections={sections} />
</EditPageShell>
```

**Props**：

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `loading` | bool | false | true 时居中显示"加载中…" |
| `isOverlay` | bool | false | true 时渲染蒙版 + 点击外部关闭 |
| `onClose` | func | — | 关闭回调（overlay 模式下点击蒙版或关闭按钮触发） |
| `title` | string | — | 可选页面标题，渲染在 panel 顶部 |
| `children` | ReactNode | — | 页面主体内容 |

**行为**：
- `loading=true`：仅渲染骨架容器 + 居中"加载中…"文字，不渲染 children
- `isOverlay=true`：外层加 `.we-settings-overlay` 蒙版，panel 加 `.we-edit-panel-overlay`，点击蒙版触发 `onClose`，阻止冒泡
- `isOverlay=false`：外层为 `.we-edit-canvas`，无蒙版

---

### ConfirmModal

```jsx
<ConfirmModal
  title="确认删除"
  message={<>即将删除 <strong>「{world.name}」</strong>，无法恢复。</>}
  confirmText="确认删除"
  danger
  onConfirm={handleDelete}
  onClose={() => setDeletingWorld(null)}
/>
```

**Props**：

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `title` | string | "确认" | 弹窗标题 |
| `message` | ReactNode | — | 主体说明文字 |
| `confirmText` | string | "确认" | 确认按钮文字 |
| `cancelText` | string | "取消" | 取消按钮文字 |
| `danger` | bool | false | true 时确认按钮用朱砂色（`--we-vermilion`） |
| `onConfirm` | async func | — | 确认回调，组件内部管理 loading 状态 |
| `onClose` | func | — | 取消 / 关闭回调 |

**行为**：点击确认后自动进入 `confirming` 状态，禁用两个按钮；`onConfirm` resolve 后不自动关闭（由调用方通过 `onClose` 控制，保持灵活性）。

---

### AvatarUpload

```jsx
<AvatarUpload
  name={name}
  avatarUrl={avatarUrl}
  avatarColor={avatarColor}
  uploading={avatarUploading}
  fileInputRef={fileInputRef}
  onAvatarClick={handleAvatarClick}
  onFileChange={handleFileChange}
/>
```

**Props**：与 CharacterEditPage 内的局部 `AvatarUpload` 组件保持一致，零成本迁移。

| prop | 类型 | 说明 |
|---|---|---|
| `name` | string | 角色/人设名，用于生成首字和 alt |
| `avatarUrl` | string \| null | 已上传头像的 URL |
| `avatarColor` | string | 无头像时的背景色（由 `getAvatarColor` 生成） |
| `uploading` | bool | 显示上传中遮罩 |
| `fileInputRef` | ref | 文件输入框 ref |
| `onAvatarClick` | func | 点击头像区域的回调 |
| `onFileChange` | func | 文件选择变化的回调 |

---

### FieldLabel（移至 `components/ui/`）

```jsx
<FieldLabel hint="插入在用户消息之后">后置提示词</FieldLabel>
```

接口不变，仅文件路径变更：`components/settings/FieldLabel` → `components/ui/FieldLabel`。

---

### Select 重构

接口不变。将所有内联 style 提取为以下 CSS 类，写入 `frontend/src/index.css`：

```
.we-select-trigger     触发按钮
.we-select-dropdown    下拉列表容器
.we-select-option      单个选项
.we-select-option--active  当前选中项
```

hover 效果改为纯 CSS（`:hover` 伪类），移除 JS `onMouseEnter/Leave`。

---

## §3 现有页面/组件改造范围

### pages/

| 文件 | 改造内容 |
|---|---|
| `WorldCreatePage.jsx` | EditPageShell + FormGroup 替换手写骨架和表单组 |
| `WorldEditPage.jsx` | EditPageShell + FormGroup；`we-edit-form-group` 全部换 FormGroup |
| `CharacterCreatePage.jsx` | EditPageShell + FormGroup |
| `CharacterEditPage.jsx` | EditPageShell + FormGroup + AvatarUpload（内联 → import） |
| `PersonaEditPage.jsx` | EditPageShell + FormGroup + AvatarUpload |
| `SettingsPage.jsx` | EditPageShell 替换骨架 |
| `WorldsPage.jsx` | ConfirmModal 替换内联 DeleteConfirmModal；relativeTime → `import { relativeTime } from '../utils/time'` |

### components/settings/

| 文件 | 改造内容 |
|---|---|
| `ProviderBlock.jsx` | `we-edit-form-group` → FormGroup |
| `LlmConfigPanel.jsx` | 同上 |
| `MemoryConfigPanel.jsx` | 同上 |
| `PromptConfigPanel.jsx` | 同上 |
| `DiaryConfigPanel.jsx` | 同上 |
| `WritingLlmBlock.jsx` | 同上 |
| `FieldLabel.jsx` | 删除此文件，改为从 `components/ui/FieldLabel` import |

---

## §4 components/index.js 内容

```js
// — UI 原子 —
export { default as Button }         from './ui/Button';
export { default as Input }          from './ui/Input';
export { default as Textarea }       from './ui/Textarea';
export { default as Select }         from './ui/Select';
export { default as Badge }          from './ui/Badge';
export { default as Card }           from './ui/Card';
export { default as ToggleSwitch }   from './ui/ToggleSwitch';
export { default as MarkdownEditor } from './ui/MarkdownEditor';
export { default as ModalShell }     from './ui/ModalShell';
export { default as ModelCombobox }  from './ui/ModelCombobox';

// — UI 分子 —
export { default as FieldLabel }     from './ui/FieldLabel';
export { default as FormGroup }      from './ui/FormGroup';
export { default as EditPageShell }  from './ui/EditPageShell';
export { default as ConfirmModal }   from './ui/ConfirmModal';
export { default as AvatarUpload }   from './ui/AvatarUpload';

// — Book 专属 —
export { default as BookSpread }         from './book/BookSpread';
export { default as Bookmark }           from './book/Bookmark';
export { default as CastPanel }          from './book/CastPanel';
export { default as ChapterDivider }     from './book/ChapterDivider';
export { default as CharacterSeal }      from './book/CharacterSeal';
export { default as FleuronLine }        from './book/FleuronLine';
export { default as MarginaliaList }     from './book/MarginaliaList';
export { default as PageFooter }         from './book/PageFooter';
export { default as PageLeft }           from './book/PageLeft';
export { default as PageRight }          from './book/PageRight';
export { default as PageTransition }     from './book/PageTransition';
export { default as ParchmentTexture }   from './book/ParchmentTexture';
export { default as SealStampAnimation } from './book/SealStampAnimation';
export { default as SectionTabs }        from './book/SectionTabs';
export { default as SessionListPanel }   from './book/SessionListPanel';
export { default as StatePanel }         from './book/StatePanel';
export { default as StatusSection }      from './book/StatusSection';
export { default as TopBar }             from './book/TopBar';
export { default as WritingPageLeft }    from './book/WritingPageLeft';
export { default as WritingSessionList } from './book/WritingSessionList';
```

---

## §5 CLAUDE.md 新增规范

在"前端分层"段落下方新增：

```md
**组件复用规则**
- 新页面组装前必须先查阅 `components/index.js`，有可用组件则强制复用，不可另起炉灶
- 编辑类页面骨架统一用 `EditPageShell`，禁止手写 `we-edit-canvas` / `we-edit-panel`
- 表单字段统一用 `FormGroup`，禁止散写 `div.we-edit-form-group` + `label.we-edit-label`
- 确认弹窗统一用 `ConfirmModal`，禁止页面内联定义局部弹窗
- 新组件需同步在 `components/index.js` 中注册后方可使用
- 没有现成组件时，先参照现有组件风格和 `DESIGN.md` 指引创建，放入 `components/ui/`
```

---

## §6 验证方式

1. `components/ui/` 下新增 5 个文件：FormGroup、EditPageShell、ConfirmModal、AvatarUpload、FieldLabel
2. `utils/time.js` 存在并导出 `relativeTime`
3. `components/settings/FieldLabel.jsx` 不再存在
4. `components/index.js` 存在并能正确 import 所有组件
5. 页面改造后功能验证：
   - 访问 `/worlds` → 世界卡片正常展示，删除时 ConfirmModal 弹出
   - 访问世界编辑页 → 表单可编辑、保存成功、overlay 模式可关闭
   - 访问角色编辑页 → 头像上传正常，表单保存正常
   - 访问 `/settings` → 各 Panel 表单布局正常
6. Select 组件在各使用场景下展开/选择/禁用行为正常
