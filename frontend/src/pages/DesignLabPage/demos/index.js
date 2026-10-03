import { BadgeEmptyDemo, SortableDemo } from './list.jsx';
import { CodeBlockDemo, CssEnterDemo, EnterListDemo, ErrorBubbleDemo, MessageDemo, OptionCardDemo, SpeakerDemo } from './appear.jsx';
import { DialogDemo, ModalDemo, SaveCapsuleDemo, ToastDemo } from './overlay.jsx';
import { BounceRailDemo, FolderDemo, StepTrackDemo, TabsDemo, TaskListDemo } from './move.jsx';
import { CardHoverDemo, DeleteButtonDemo, PortalDemo, PressDemo, SinkDemo } from './press.jsx';
import { SideDrawerDemo, TopBarDemo } from './shell.jsx';
import { WorldPortalDemo } from './portal.jsx';
import { InputFocusDemo, SelectDemo, SwitchRangeDemo } from './input.jsx';
import { LegacyEnterDemo } from './legacy.jsx';
import { BusyDemo, LoopsDemo, StreamDemo } from './stream.jsx';
import { ChapterDemo, DoneConfirmDemo, StateValuesDemo } from './world.jsx';
import { RhythmDemo } from './rhythm.jsx';

/** 动效位 id → 演示组件；每个 id 必须在 slots.js 里有对应的动效位。 */
export const DEMOS = {
  'enter-list': EnterListDemo,
  message: MessageDemo,
  speaker: SpeakerDemo,
  'error-bubble': ErrorBubbleDemo,
  'code-block': CodeBlockDemo,
  'css-enter': CssEnterDemo,
  'option-card': OptionCardDemo,
  'legacy-css-enter': LegacyEnterDemo,
  modal: ModalDemo,
  dialog: DialogDemo,
  toast: ToastDemo,
  'save-capsule': SaveCapsuleDemo,
  'side-drawer': SideDrawerDemo,
  tabs: TabsDemo,
  'step-track': StepTrackDemo,
  'bounce-rail': BounceRailDemo,
  'world-portal': WorldPortalDemo,
  'task-list': TaskListDemo,
  folder: FolderDemo,
  topbar: TopBarDemo,
  press: PressDemo,
  portal: PortalDemo,
  sink: SinkDemo,
  'delete-button': DeleteButtonDemo,
  'card-hover': CardHoverDemo,
  select: SelectDemo,
  'input-focus': InputFocusDemo,
  'switch-range': SwitchRangeDemo,
  sortable: SortableDemo,
  'badge-empty': BadgeEmptyDemo,
  stream: StreamDemo,
  busy: BusyDemo,
  loops: LoopsDemo,
  'state-values': StateValuesDemo,
  chapter: ChapterDemo,
  'done-confirm': DoneConfirmDemo,
  rhythm: RhythmDemo,
};
