/**
 * 动效位清单：全站每一处受（或本该受）动效控制的地方，一处一条。
 * 实验室按它分类展示；测试用它核对动效包的每个接口都有动效位引用、每个动效位都有演示。
 *
 * api 写法：variant:<键> / transition:<键> / gesture:<键> / flow / stream / fx / css:<键>
 *   css:<键> 对应动效包在 :root 里定义的 --we-fx-<键> 变量。
 * status：
 *   pack    走动效包，必须有演示
 *   blind   没接进动效包（硬编码或没有动效），切换动效不会变；演示可选
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
    id: 'option-card', category: 'appear', title: '剧情选项卡', status: 'pack',
    api: ['css:enter'], usedIn: ['OptionCard'],
    note: '选项逐项错开入场；点选后，墨流是墨从点下的位置洇满选中项、其余项由近及远沉下变淡，'
      + '信号锁定是选中项被括号锁定并撕裂一次、其余项一格格变暗。',
  },
  {
    id: 'legacy-css-enter', category: 'appear', title: '遮罩与大面板的 CSS 入场', status: 'pack',
    api: ['css:scrim', 'css:panel'],
    usedIn: ['设置与编辑页遮罩', '对话面板遮罩', '弹窗遮罩', '写卡助手遮罩', '编辑面板', '会话中栏'],
    note: '遮罩只让底色入场（--we-fx-scrim），不带着上面的面板一起动：墨流从中央洇开，信号锁定硬切闪两下亮起。'
      + '大面板走 --we-fx-panel：墨流托起回弹，信号锁定平滑淡入上浮；都不缩放、不模糊。'
      + '这里用编辑页的遮罩与面板演示。',
  },

  // ── 浮层与弹窗 ──
  {
    id: 'modal', category: 'overlay', title: '确认弹窗', status: 'pack',
    api: ['variant:overlayEnter', 'variant:overlayBackdrop', 'transition:overlay', 'transition:backdrop', 'gesture:press'],
    usedIn: ['ConfirmModal', 'ModalShell'],
    note: '遮罩底色见「遮罩与大面板的 CSS 入场」。墨流的面板托起带回弹，不带光晕；'
      + '信号锁定的面板平滑上浮，落位时四角括号三拍锁上、停一会儿后闪一下熄灭。',
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

  // ── 换位与导航 ──
  {
    id: 'tabs', category: 'move', title: '页签', status: 'pack',
    api: ['variant:tabEnter', 'transition:move', 'transition:moveTrail', 'transition:overlay'],
    usedIn: ['SectionTabs', 'GooeyNav'],
    note: '信号锁定：指示线滑到新页签后，短括号三拍锁住页签（拼合导航不加）；内容区原地硬切闪两下后锁定。',
  },
  {
    id: 'step-track', category: 'move', title: '步骤条', status: 'pack',
    api: ['flow'], usedIn: ['StepTrack'],
  },
  {
    id: 'bounce-rail', category: 'move', title: '导航条', status: 'pack',
    api: ['transition:move', 'transition:moveTrail', 'flow'], usedIn: ['BounceRail', '设置页导航', 'WorldTimelinePanel'],
    note: '信号锁定：圆点沿弧线落位后，小方形准星三拍收紧套住它，停一下后熄灭。',
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
    note: '带字的按钮不缩放。墨流：悬停浮起，按下按进 2px、外沿一圈湿边，墨从触点在按钮里洇开，松手带过冲弹回；'
      + '信号锁定：按下硬切下沉 1px、底色提亮一格，短括号卡到四角，松手一起消失。触点涟漪由 useTouchFx 放，只有 Button 带。',
  },
  {
    id: 'portal', category: 'press', title: '入口卡片', status: 'pack',
    api: ['gesture:portal'], usedIn: ['WorldsGrid'],
    note: '浮起与按下走手势，不缩放；光晕、墨晕、括号与「卡片悬停与按下」同一套。演示借世界卡的类名。',
  },
  {
    id: 'sink', category: 'press', title: '发送键', status: 'pack',
    api: ['gesture:sink'], usedIn: ['InputBoxComposer'],
    note: '信号锁定按下时，短括号从键面分三拍向外弹开熄灭，像一次发射；墨流只有压扁回弹。演示借发送键的类名。',
  },
  {
    id: 'delete-button', category: 'press', title: '删除确认按钮', status: 'pack',
    api: ['transition:press'], usedIn: ['DeleteButton'],
    note: '翻盖和滑出确认条的时长、曲线写死在组件里，不随动效包变化；圆钮的按压走动效包，删除与取消的反馈由动效包样式按 data-status 接管：'
      + '信号锁定是展开后两个圆钮被括号锁定，确认删除时整颗按钮压成亮线熄灭再闪回对勾；'
      + '墨流是确认删除时按钮被拽着沉没、再浮回露出湿墨对勾，取消时从垃圾桶那一格洇开一圈淡墨。',
  },
  {
    id: 'card-hover', category: 'press', title: '卡片悬停与按下', status: 'pack',
    api: [], usedIn: ['Card', '角色卡'],
    note: '没有单独的动效接口：动效包样式按类名接管，触点位置与涟漪由 useTouchFx 放。都不缩放卡片。'
      + '墨流：湿墨光晕追着指针走，悬停浮起，按下从触点洇开、卡片按进纸里再弹回；'
      + '信号锁定：悬停时括号三拍锁定，按下括号贴紧、卡面闪一下强调色。PanelCard 只用作不可点的面板外壳，不加悬停。',
  },

  // ── 输入控件 ──
  {
    id: 'select', category: 'input', title: '下拉选择', status: 'pack',
    api: ['variant:enter', 'transition:enter'], usedIn: ['Select'],
  },
  {
    id: 'input-focus', category: 'input', title: '输入框聚焦', status: 'pack',
    api: [], usedIn: ['Input', 'Textarea', '各处 .we-input / .we-textarea'],
    note: '没有单独的动效接口：动效包样式按类名接管，画在输入框自身上（不加外层包装）；状态表格里的行内编辑不画。'
      + '墨流：湿墨描边从按下的位置漫开、框内晕开淡墨，再干成常态聚焦色，键盘聚焦从左侧开始；'
      + '信号锁定：描边硬切亮起、框内压上一拍强调色，外圈锁定框三拍收紧并在聚焦期间一直套着。',
  },
  {
    id: 'switch-range', category: 'input', title: '开关与滑块', status: 'pack',
    api: [], usedIn: ['ToggleSwitch', 'Range'],
    note: '没有单独的动效接口：动效包样式按类名接管；开关拨过之后才播圆钮动画。'
      + '墨流：圆钮拉长甩过去、轨道被墨染满，按住滑块时圆钮胀大带光晕；'
      + '信号锁定：轨道分四格点亮、圆钮落定时被准星锁住，按住滑块时准星跟着圆钮走。',
  },

  // ── 列表与排序 ──
  {
    id: 'sortable', category: 'list', title: '拖拽排序', status: 'pack',
    api: ['flow'], usedIn: ['SortableList', 'SortableGrid'],
    note: '其余条目让位走 flow；拿起、放下的样子写在动效包 CSS 里，按条目的 data-sort 切换。'
      + '网格（SortableGrid）只有拿在手里的跟手副本随动效包变化，放下仍是固定的回落动画。',
  },
  {
    id: 'badge-empty', category: 'list', title: '徽标与空状态入场', status: 'pack',
    api: ['css:enter'], usedIn: ['Badge', 'EmptyState'],
    note: '徽标和空状态标题的入场写在动效包 CSS 里，说明与按钮随后用 --we-fx-enter 入场；挂载时播一次。'
      + 'Badge 目前只在实验室里用到，接进会频繁刷新的列表前要先确认入场不会反复重播。',
  },

  // ── 流式与等待 ──
  {
    id: 'stream', category: 'stream', title: '流式输出', status: 'pack',
    api: ['stream'], usedIn: ['StreamingMarkdown'],
  },
  {
    id: 'busy', category: 'stream', title: '状态整理遮罩与思考指示', status: 'pack',
    api: ['fx', 'transition:backdrop'], usedIn: ['StateBusyOverlay', 'MotionOrb'],
    note: '思考指示 MotionOrb 只按动效包 id 选小球，不读 fx() 与过渡；遮罩与「整理中」字样由 StateBusyOverlay 驱动。'
      + '遮罩底色与标签外的括号（信号锁定反复收紧锁定）写在动效包 CSS 里。',
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
