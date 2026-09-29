/**
 * 动效位清单：全站每一处受（或本该受）动效控制的地方，一处一条。
 * 实验室按它分类展示；测试用它核对动效包的每个接口都有动效位引用、每个动效位都有演示。
 *
 * api 写法：variant:<键> / transition:<键> / gesture:<键> / flow / stream / fx / css:<键>
 *   css:<键> 对应动效包在 :root 里定义的 --we-fx-<键> 变量。
 * status：
 *   pack    走动效包，必须有演示
 *   blind   没接进动效包（硬编码或没有动效），切换动效不会变；演示可选
 *   closed  代码里有意关闭
 */

export const CATEGORIES = [
  { id: 'appear', label: '出现与消失' },
  { id: 'overlay', label: '浮层与弹窗' },
  { id: 'move', label: '换位与导航' },
  { id: 'press', label: '按压与悬停' },
  { id: 'input', label: '输入控件' },
  { id: 'list', label: '列表与排序' },
  { id: 'stream', label: '流式与等待' },
  { id: 'world', label: '世界改写' },
  { id: 'rhythm', label: '全站节奏' },
];

export const STATUS_LABEL = {
  pack: '动效包驱动',
  blind: '未接入动效包',
  closed: '已关闭',
};

export const SLOTS = [
  // ── 出现与消失 ──
  {
    id: 'enter-list', category: 'appear', title: '小块增删', status: 'pack',
    api: ['variant:enter', 'transition:enter'],
    usedIn: ['状态面板遮罩', '错误提示', '下拉菜单'],
  },
  {
    id: 'message', category: 'appear', title: '聊天消息入场', status: 'pack',
    api: ['variant:enter', 'transition:enter'],
    usedIn: ['MessageItem'],
  },
  {
    id: 'speaker', category: 'appear', title: '说话人切换', status: 'pack',
    api: ['variant:enter', 'transition:enter'],
    usedIn: ['SpeakerStage'],
  },
  {
    id: 'error-bubble', category: 'appear', title: '生成失败提示', status: 'pack',
    api: ['variant:enter', 'transition:enter'],
    usedIn: ['ChatErrorBubble'],
  },
  {
    id: 'code-block', category: 'appear', title: '代码块出现', status: 'pack',
    api: ['variant:appear', 'transition:enter', 'transition:press'],
    usedIn: ['CodeBlock'],
  },
  {
    id: 'css-enter', category: 'appear', title: 'CSS 入场（样机）', status: 'pack',
    api: ['css:enter'],
    usedIn: ['写作正文与批注', '写卡助手气泡与条目', '状态字段列表', '时间线条目', '故事线条目'],
    note: '这里用样机元素回放 --we-fx-enter，真实位置见「用在」。',
  },
  {
    id: 'option-card', category: 'appear', title: '剧情选项卡入场', status: 'blind',
    api: [], usedIn: ['OptionCard'],
    note: '入场的位移和时长写死在组件里，不随动效包变化。',
  },
  {
    id: 'legacy-css-enter', category: 'appear', title: '页面元素的固定 CSS 入场', status: 'blind',
    api: [], usedIn: ['会话中栏', '写卡助手遮罩', '设置遮罩', '写卡面板', '编辑面板遮罩'],
    note: '直接用 we-panel-fade（淡入）和 we-panel-rise（8px 上浮淡入）两个固定动画，不随动效包变化；'
      + '大面板不走信号锁定，横向抖动会把整页内容拽偏。',
  },

  // ── 浮层与弹窗 ──
  {
    id: 'modal', category: 'overlay', title: '确认弹窗', status: 'pack',
    api: ['variant:overlayEnter', 'variant:overlayBackdrop', 'transition:overlay', 'transition:backdrop', 'gesture:press'],
    usedIn: ['ConfirmModal', 'ModalShell'],
  },
  {
    id: 'dialog', category: 'overlay', title: '对话面板', status: 'pack',
    api: ['variant:overlayEnter', 'transition:overlay'],
    usedIn: ['DialogShell', '设置页'],
  },
  {
    id: 'toast', category: 'overlay', title: '提示条', status: 'pack',
    api: ['variant:overlayEnter', 'transition:overlay', 'fx'],
    usedIn: ['ToastCard'],
  },
  {
    id: 'side-drawer', category: 'overlay', title: '侧抽屉', status: 'pack',
    api: ['variant:appear', 'variant:edgeEnter', 'transition:enter', 'transition:backdrop'],
    usedIn: ['SideDrawer'],
  },
  {
    id: 'page-transition', category: 'overlay', title: '页面切换', status: 'closed',
    api: ['variant:page'], usedIn: ['PageTransition'],
    note: '会和页内翻页叠加造成双重位移，代码里有意关闭，任何动效都不生效。',
  },

  // ── 换位与导航 ──
  {
    id: 'tabs', category: 'move', title: '页签', status: 'pack',
    api: ['variant:tabEnter', 'transition:move', 'transition:moveTrail', 'transition:overlay'],
    usedIn: ['SectionTabs', 'GooeyNav'],
  },
  {
    id: 'step-track', category: 'move', title: '步骤条', status: 'pack',
    api: ['flow'], usedIn: ['StepTrack'],
  },
  {
    id: 'bounce-rail', category: 'move', title: '导航条', status: 'pack',
    api: ['transition:move', 'transition:moveTrail', 'flow'], usedIn: ['BounceRail', '设置页导航', 'WorldTimelinePanel'],
  },
  {
    id: 'task-list', category: 'move', title: '任务列表', status: 'pack',
    api: ['transition:move'], usedIn: ['TaskList'],
  },
  {
    id: 'folder', category: 'move', title: '文件夹开合', status: 'pack',
    api: ['flow'], usedIn: ['Folder'],
  },
  {
    id: 'topbar', category: 'move', title: '顶栏', status: 'pack',
    api: ['variant:enter', 'transition:enter', 'transition:press', 'gesture:press'], usedIn: ['TopBar'],
    note: '直接渲染真实顶栏；世界下拉只在进入过某个世界后才出现。',
  },

  // ── 按压与悬停 ──
  {
    id: 'press', category: 'press', title: '按钮按压', status: 'pack',
    api: ['gesture:press', 'transition:press'], usedIn: ['Button', 'TopBar', 'InputBox 工具栏'],
  },
  {
    id: 'portal', category: 'press', title: '入口卡片', status: 'pack',
    api: ['gesture:portal'], usedIn: ['WorldsGrid'],
  },
  {
    id: 'sink', category: 'press', title: '发送键', status: 'pack',
    api: ['gesture:sink'], usedIn: ['InputBoxComposer'],
  },
  {
    id: 'delete-button', category: 'press', title: '删除确认按钮', status: 'pack',
    api: ['transition:press'], usedIn: ['DeleteButton'],
    note: '翻盖和滑出确认条的时长、曲线写死在组件里，不随动效包变化；只有确认、取消两个圆钮的按压走动效包。',
  },
  {
    id: 'card-hover', category: 'press', title: '卡片悬停与按下', status: 'blind',
    api: [], usedIn: ['Card', 'PanelCard', '角色卡'],
    note: '现在只有普通 CSS 过渡，动效包管不到。',
  },

  // ── 输入控件 ──
  {
    id: 'select', category: 'input', title: '下拉选择', status: 'pack',
    api: ['variant:enter', 'transition:enter'], usedIn: ['Select'],
  },
  {
    id: 'input-focus', category: 'input', title: '输入框聚焦', status: 'blind',
    api: [], usedIn: ['Input', 'Textarea'],
  },
  {
    id: 'switch-range', category: 'input', title: '开关与滑块', status: 'blind',
    api: [], usedIn: ['ToggleSwitch', 'Range'],
    note: '墨流包里开关圆钮已有弹跳，滑块没有。',
  },

  // ── 列表与排序 ──
  {
    id: 'sortable', category: 'list', title: '拖拽排序', status: 'blind',
    api: [], usedIn: ['SortableList', 'SortableGrid'],
    note: '拖起时的阴影写死在组件里，不随动效包变化。',
  },
  {
    id: 'badge-empty', category: 'list', title: '徽标与空状态入场', status: 'blind',
    api: [], usedIn: ['Badge', 'EmptyState'],
  },

  // ── 流式与等待 ──
  {
    id: 'stream', category: 'stream', title: '流式输出', status: 'pack',
    api: ['stream'], usedIn: ['StreamingMarkdown'],
  },
  {
    id: 'busy', category: 'stream', title: '状态整理遮罩与思考指示', status: 'pack',
    api: ['fx', 'transition:backdrop'], usedIn: ['StateBusyOverlay', 'MotionOrb'],
    note: '思考指示 MotionOrb 只按动效包 id 选小球，不读 fx() 与过渡；遮罩与「整理中」字样由 StateBusyOverlay 驱动。',
  },
  {
    id: 'loops', category: 'stream', title: '循环动画', status: 'pack',
    api: ['css:skeleton', 'css:spin', 'css:typing', 'css:nudge'],
    usedIn: ['骨架屏', '工具运行指示', '打字三点', '新消息箭头'],
  },

  // ── 世界改写 ──
  {
    id: 'state-values', category: 'world', title: '状态数值变化', status: 'pack',
    api: ['fx'], usedIn: ['StatusValueChange', 'ChangeText'],
  },
  {
    id: 'chapter', category: 'world', title: '章节开场', status: 'pack',
    api: ['fx'], usedIn: ['ChapterDivider'],
  },
  {
    id: 'done-confirm', category: 'world', title: '完成确认', status: 'pack',
    api: ['fx'], usedIn: ['DoneConfirm'],
  },

  // ── 全站节奏 ──
  {
    id: 'rhythm', category: 'rhythm', title: '全站节奏', status: 'blind',
    api: [], usedIn: ['全站约 150 处普通 CSS 过渡'],
    note: '悬停、色变、开合这类过渡只认主题里的时长和曲线，动效包改不了。',
  },
];

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((slot) => [slot.id, slot]));
