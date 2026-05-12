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
export { default as ToastCard }       from './ui/ToastCard.jsx';
export { default as InterruptedMark } from './ui/InterruptedMark.jsx';

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

// — 通用 UI 原子（自 components/book 拆分迁出，保留 barrel 兼容） —
export { default as PanelCard }           from './ui/PanelCard.jsx';
export { default as SectionTabs }         from './ui/SectionTabs.jsx';
export { default as SealStampAnimation }  from './ui/SealStampAnimation.jsx';
export { default as MarginaliaList }      from './ui/MarginaliaList.jsx';

// — 状态系统组件 —
export { default as StatePanel }          from './state/StatePanel.jsx';
export { default as StatusSection }       from './state/StatusSection.jsx';
export { default as StatusTable }         from './state/StatusTable.jsx';

// — 会话列表 —
export { default as SessionListPanel }    from './session/SessionListPanel.jsx';

// — 写作面板 —
export { default as WritingSessionList }  from './writing/WritingSessionList.jsx';
export { default as NearbyPanel }         from './writing/NearbyPanel.jsx';
export { default as NearbyCharacterBlock } from './writing/NearbyCharacterBlock.jsx';
export { default as AddSavedNearbyModal } from './writing/AddSavedNearbyModal.jsx';
export { default as MakeCardModal }       from './writing/MakeCardModal.jsx';

// — 聊天装饰 —
export { default as ChapterDivider }      from './chat/ChapterDivider.jsx';
export { default as CharacterSeal }       from './chat/CharacterSeal.jsx';

// 注：classic-parchment shell 的结构性 chrome（BookSpread / PageLeft / PageRight /
// WritingPageLeft / Bookmark / ParchmentTexture / PageFooter / FleuronLine /
// TopBar / PageTransition / MemoryRecallOverlay）已迁入
// frontend/src/shells/classic-parchment/，禁止在 components barrel 中再导出，
// 也禁止页面直接 import。页面应通过 core/layout/PageLayout 描述布局。

// — Chat 专属 —
export { default as ActivatedEntriesRow } from './chat/ActivatedEntriesRow';

// — Session 专属 —
export { default as LongTermMemoryModal } from './session/LongTermMemoryModal';

// — Assistant 专属 —
export { default as PlanDocViewer }       from './assistant/PlanDocViewer';

// — Settings 配置块 —
export { default as AuxLlmBlock }         from './settings/AuxLlmBlock';
export { default as AssistantModelBlock } from './settings/AssistantModelBlock';
