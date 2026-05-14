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
export { default as Input }           from './ui/Input';
export { default as Range }           from './ui/Range';
export { default as Textarea }        from './ui/Textarea';
export { default as Select }          from './ui/Select';
export { default as Badge }           from './ui/Badge';
export { default as Card }            from './ui/Card';
export { default as ToggleSwitch }    from './ui/ToggleSwitch';
export { default as MarkdownEditor }  from './ui/MarkdownEditor';
export { default as ModalShell }      from './ui/ModalShell';
export { default as ModelCombobox }   from './ui/ModelCombobox';
export { default as Icon }            from './ui/Icon';
export { default as ToastCard }       from './ui/ToastCard.jsx';
export { default as PanelCard }       from './ui/PanelCard.jsx';
export { default as SectionTabs }     from './ui/SectionTabs.jsx';

// — UI 分子 —
export { default as FieldLabel }      from './ui/FieldLabel';
export { default as FormGroup }       from './ui/FormGroup';
export { default as ConfirmModal }    from './ui/ConfirmModal';
export { default as AvatarCircle }    from './ui/AvatarCircle';
export { default as SortableList }    from './ui/SortableList';
export { default as SortableGrid }    from './ui/SortableGrid';
export { default as BackButton }      from './ui/BackButton';
