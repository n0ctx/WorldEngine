// frontend/src/components/index.js
// 通用 UI 原子与分子的统一出口。
//
// 边界规则（强制）：
// 1. 此 barrel 只导出领域无关的视觉原子和分子，不导出任何 domain（chat / writing /
//    session / state / settings / assistant / edit）或 page-local 组件。
// 2. domain 组件必须通过其所在目录直接 import，例如：
//      import StatePanel from '../components/state/StatePanel.jsx';
//      import EditPageShell from '../pages/layout/EditPageShell';
// 3. page-local 组件位于 pages/<Page>/components/，仅供该页面使用。
// 4. book-spread shell 的结构性 chrome 位于 frontend/src/shells/，
//    禁止在此处导出，也禁止页面直接 import。页面应通过 pages/layout/PageLayout 描述布局。

// — UI 原子 —
export { default as Button }          from './ui/Button';
export { default as IconButton }      from './ui/IconButton.jsx';
export { default as Input }           from './ui/Input';
export { default as Range }           from './ui/Range';
export { default as Textarea }        from './ui/Textarea';
export { default as Select }          from './ui/Select';
export { default as Badge }           from './ui/Badge';
export { default as Checkbox }        from './ui/Checkbox.jsx';
export { default as SegmentedControl } from './ui/SegmentedControl.jsx';
export { default as TagInput }        from './ui/TagInput.jsx';
export { default as Card }            from './ui/Card';
export { default as ListItem }        from './ui/ListItem.jsx';
export { default as EmptyState }      from './ui/EmptyState.jsx';
export { default as Skeleton }        from './ui/Skeleton.jsx';
export { default as Divider }         from './ui/Divider.jsx';
export { default as SectionTitle }    from './ui/SectionTitle.jsx';
export { default as ToggleSwitch }    from './ui/ToggleSwitch';
export { default as MarkdownEditor }  from './ui/MarkdownEditor';

// — UI 分子 —
export { default as ConfirmModal }    from './ui/ConfirmModal';
export { default as SortableList }    from './ui/SortableList';
