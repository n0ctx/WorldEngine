// frontend/src/components/index.js
// 统一导出所有可复用组件。新增组件必须在此注册后方可在页面中使用。

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

// — UI 分子 —
export { default as FieldLabel }      from './ui/FieldLabel';
export { default as FormGroup }       from './ui/FormGroup';
export { default as EditPageShell }   from './ui/EditPageShell';
export { default as ConfirmModal }    from './ui/ConfirmModal';
export { default as AvatarUpload }    from './ui/AvatarUpload';
export { default as AvatarCircle }    from './ui/AvatarCircle';
export { default as SortableList }    from './ui/SortableList';
export { default as SortableGrid }    from './ui/SortableGrid';

// — Blocks 结构模式 —
export { default as BackButton }      from './blocks/BackButton';

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

// — Chat 专属 —
export { default as ActivatedEntriesRow } from './chat/ActivatedEntriesRow';

// — Writing 专属 —
export { default as CharacterPreviewModal } from './writing/CharacterPreviewModal';

// — Session 专属 —
export { default as LongTermMemoryModal } from './session/LongTermMemoryModal';

// — Settings 配置块 —
export { default as AuxLlmBlock }         from './settings/AuxLlmBlock';
export { default as AssistantModelBlock } from './settings/AssistantModelBlock';
