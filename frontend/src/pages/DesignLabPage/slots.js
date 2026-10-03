/**
 * 动效位清单：全站每一处受（或本该受）动效控制的地方，一处一条。
 * 实验室按它分类展示；测试用它核对动效包的每个接口、每个接管的核心类都有动效位认领，每个动效位都有演示。
 *
 * api 写法：variant:<键> / transition:<键> / gesture:<键> / flow / stream / fx / role / css:<键>
 *   css:<键> 对应动效包在 :root 里定义的 --we-fx-<键> 变量。
 * hooks：动效包样式直接接管的核心类（BEM 块名，不带点）；包 CSS 选择器里出现的每个 .we-* 块都要在这里登记。
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
    id: 'speaker', category: 'appear', title: '台前上台与收放', status: 'pack',
    api: ['variant:enter', 'transition:enter'],
    hooks: ['we-speaker-stage'],
    usedIn: ['SpeakerStage'],
    note: '大台前（世界画、立绘、展示字号的名字）换人时整块重新上台，动作由包样式接管；正文滚离顶部后收成一行台前，一行台前换人走 variant:enter。收放本身是页面角色的过渡。',
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
    hooks: ['we-option-list', 'we-option-btn'],
    api: ['css:enter'], usedIn: ['OptionCard'],
    note: '选项逐项错开入场；点选后，墨流是墨从点下的位置洇满选中项、其余项由近及远沉下变淡，'
      + '信号是选中项文字双曝光撕裂一次（更重、中段反向），其余项按序变暗、卡面加竖向斜纹；'
      + '活字是选中项被压下 2px、压出凹印，其余项由近及远被一道折痕暗影扫过、退到三级文字色。',
  },
  {
    id: 'legacy-css-enter', category: 'appear', title: '遮罩与大面板的 CSS 入场', status: 'pack',
    api: ['css:scrim', 'css:panel'],
    usedIn: ['设置页遮罩', '对话面板遮罩', '弹窗遮罩', '写卡助手遮罩', '会话中栏'],
    note: '遮罩只让底色入场（--we-fx-scrim），不带着上面的面板一起动：墨流从中央洇开，信号硬切闪两下亮起，活字平稳压暗。'
      + '大面板走 --we-fx-panel：墨流托起回弹，信号平滑淡入上浮，活字像一张纸落到桌上、摩擦急停；都不缩放、不模糊。'
      + '这里用设置页的遮罩与会话中栏演示。',
  },

  // ── 浮层与弹窗 ──
  {
    id: 'modal', category: 'overlay', title: '确认弹窗', status: 'pack',
    api: ['variant:overlayEnter', 'variant:overlayBackdrop', 'transition:overlay', 'transition:backdrop', 'gesture:press'],
    usedIn: ['ConfirmModal', 'Dialog'],
    note: '遮罩底色见「遮罩与大面板的 CSS 入场」。墨流的面板托起带回弹，不带光晕；'
      + '信号的面板平滑淡入上浮，不再画装饰。',
  },
  {
    id: 'dialog', category: 'overlay', title: '对话面板', status: 'pack',
    api: ['variant:overlayEnter', 'transition:overlay'],
    usedIn: ['Dialog', '设置页'],
  },
  {
    id: 'toast', category: 'overlay', title: '提示条', status: 'pack',
    hooks: ['we-toast-card'],
    api: ['variant:overlayEnter', 'transition:overlay', 'fx'],
    usedIn: ['ToastCard'],
  },
  {
    id: 'save-capsule', category: 'overlay', title: '编辑弹层保存栏', status: 'pack',
    api: ['variant:overlayEnter', 'transition:overlay', 'fx'], usedIn: ['SaveCapsule', 'EditPageShell（世界 / 角色 / 玩家编辑）'],
    note: '编辑弹层里需要手动保存的字段共用一个浮起胶囊，没有改动时收起，一有改动就从正文底部浮起；'
      + '出现和收起沿用弹窗与提示条的入场（墨流托起回弹、信号淡入上浮、活字落纸急停），'
      + '存好后「已保存」标签走状态变化标签的签名动作（墨流拽出墨签、信号实色刷出、活字压下小印），停一拍再收起。',
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
    note: '信号：指示线滑到新页签后，内容区原地硬切闪两下；不再画括号（拼合导航不加）。',
  },
  {
    id: 'step-track', category: 'move', title: '步骤条', status: 'pack',
    api: ['flow'], usedIn: ['StepTrack'],
  },
  {
    id: 'bounce-rail', category: 'move', title: '导航条', status: 'pack',
    api: ['transition:move', 'transition:moveTrail', 'flow'], usedIn: ['BounceRail', '设置页导航', 'WorldTimelinePanel'],
    note: '信号：圆点沿弧线跳到位即止，不再画准星。',
  },
  {
    id: 'world-portal', category: 'move', title: '进入世界', status: 'pack',
    hooks: ['we-portal-veil', 'we-worlds-canvas', 'we-characters-canvas', 'we-worldhub-layout', 'we-worldhub-section-header', 'we-section-title'],
    api: [], usedIn: ['WorldsPage → CharactersPage', 'AppShell（跨路由遮罩 .we-portal-veil）'],
    note: '没有独立的动效接口：时序（navigate / total）在动效包的 portal 字段，编排在动效包 CSS 里按 data-portal 接管。'
      + '墨流「洇门」：旧页沉入水中，枢纽页从柔焦里浮上来，栏标题从湿墨色干成正文色；'
      + '信号「锁定跃迁」：旧页横向撕裂一次、暗半拍后硬切熄灭，新旧页之间的一拍黑里落两列硬切下坠的代码雨，新页闪两下亮起（雨画在 .we-portal-veil 上）；'
      + '活字「翻书」：书封压实，旧页沿左侧书脊朝人翻起、越翻越暗，侧立时切页，枢纽页留着翻页的影子，三栏依次落纸、栏标题压一下凹印。'
      + '转场期间旧页禁止二次点击，卡片的触点涟漪与指针光晕由整页退出接管，不重复播放。',
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
    hooks: [
      'we-btn', 'we-btn-primary', 'we-btn-danger', 'we-btn-icon', 'we-btn-text', 'we-section-tab', 'we-menu', 'we-list-item',
    ],
    api: ['gesture:press', 'transition:press'], usedIn: ['Button', 'TopBar', 'InputBox 工具栏'],
    note: '带字的按钮不缩放。墨流：悬停浮起，按下按进 2px、外沿一圈湿边，墨从触点在按钮里洇开，松手带过冲弹回；'
      + '信号：按下硬切下沉 1px、底色提亮一格，压住到锁定那一拍磷光帧硬切外扩两步即灭（轻点撞不到）；'
      + '活字：悬停纸边翘起 1px、垫一层浅影，按下压进 2px、压出凹印，松手带过冲弹回、凹印慢慢平复。触点涟漪由 useTouchFx 放，只有 Button 带；文字色调的按钮不浮起、不按压、不画外框。',
  },
  {
    id: 'portal', category: 'press', title: '入口卡片', status: 'pack',
    hooks: ['we-world-card', 'we-world-card-shell', 'we-world-card-name'],
    api: ['gesture:portal'], usedIn: ['WorldsGrid'],
    note: '浮起与按下走手势，不缩放。信号的入口卡不画整框——悬停时名字双曝光一次，按下进入时整面冲洗一帧强调色即灭，再进锁定跃迁；'
      + '活字把入口卡当一本书，悬停时封面沿左侧书脊掀开 8°，按下合上压实，再进翻书。演示借世界卡的类名。',
  },
  {
    id: 'sink', category: 'press', title: '发送键', status: 'pack',
    hooks: ['we-chat-send-btn'],
    api: ['gesture:sink'], usedIn: ['InputBoxComposer'],
    note: '信号按下时落底那一下补一帧磷光（轻点也能撞到）；墨流只有压扁回弹；活字是盖章，压扁时键身压出深凹印。演示借发送键的类名。',
  },
  {
    id: 'delete-button', category: 'press', title: '删除确认按钮', status: 'pack',
    hooks: ['we-delete-btn'],
    api: ['transition:press'], usedIn: ['DeleteButton'],
    note: '翻盖和滑出确认条的时长、曲线写死在组件里，不随动效包变化；圆钮的按压走动效包，删除与取消的反馈由动效包样式按 data-status 接管：'
      + '信号是确认删除时整颗按钮压成亮线熄灭、黑一拍后闪回露出对勾；'
      + '墨流是确认删除时按钮被拽着沉没、再浮回露出湿墨对勾，取消时从垃圾桶那一格洇开一圈淡墨；'
      + '活字是确认删除时按钮被盖上一记朱砂、压到 3px 深，随即对折收起再展开露出对勾，取消只空压一下。',
  },
  {
    id: 'card-hover', category: 'press', title: '卡片悬停与按下', status: 'pack',
    hooks: ['we-card', 'we-character-card', 'we-touch-fx'],
    api: [], usedIn: ['Card（可点的浮起卡）', '角色卡'],
    note: '动效包样式按类名接管，触点位置与涟漪由 useTouchFx 放。'
      + '只接管可点的浮起卡（variant="raised" interactive）；描边行与凹陷框不浮起。'
      + '墨流：湿墨光晕追着指针走。普通卡片不缩放，悬停浮起，按下按进纸里再回位；角色卡悬停不浮起，按下缓缓微缩，松手用同一段缓动回到原尺寸；'
      + '信号：悬停后磷光帧两步硬切外扩即灭，按下贴紧复位；'
      + '活字：悬停纸边翘起 2px，按下压进纸里、凹印画在触点层上，松手弹回、凹印慢慢平复。',
  },

  // ── 输入控件 ──
  {
    id: 'select', category: 'input', title: '下拉选择', status: 'pack',
    api: ['variant:enter', 'transition:enter'], usedIn: ['Select'],
  },
  {
    id: 'input-focus', category: 'input', title: '输入框聚焦', status: 'pack',
    hooks: ['we-input', 'we-textarea', 'we-status-inline-surface'],
    api: [], usedIn: ['Input', 'Textarea', '各处 .we-input / .we-textarea'],
    note: '动效包样式按类名接管，画在输入框自身上（不加外层包装）；状态表格里的行内编辑不画。'
      + '墨流：湿墨描边从按下的位置漫开、框内晕开淡墨，再干成常态聚焦色，键盘聚焦从左侧开始；'
      + '信号：描边硬切亮起、框内压上一拍强调色，外圈锁定框三拍收紧并在聚焦期间一直套着；'
      + '活字：描边整圈同时压出来、框内一道深凹印，随后平复成常态聚焦色，不从触点扩散。',
  },
  {
    id: 'switch-range', category: 'input', title: '开关与滑块', status: 'pack',
    hooks: ['we-toggle-track', 'we-toggle-thumb', 'we-range'],
    api: [], usedIn: ['ToggleSwitch', 'Range'],
    note: '动效包样式按类名接管；开关拨过之后才播圆钮动画。'
      + '墨流：圆钮拉长甩过去、轨道被墨染满，按住滑块时圆钮胀大带光晕；'
      + '信号：轨道分四格点亮、圆钮硬切到位；按住滑块时圆钮胀大。不再画准星；'
      + '活字：圆钮像铅块推过去、急停后压一下，轨道颜色在落位那一刻一次盖满；按住滑块时圆钮往下沉、压出凹印，不放大。',
  },

  // ── 列表与排序 ──
  {
    id: 'sortable', category: 'list', title: '拖拽排序', status: 'pack',
    hooks: ['we-sortable-item', 'we-sortable-overlay'],
    api: ['flow'], usedIn: ['SortableList', 'SortableGrid'],
    note: '其余条目让位走 flow；拿起、放下的样子写在动效包 CSS 里，按条目的 data-sort 切换。'
      + '活字：拿起时条目提起、投影变深，原来的位置留下一道压痕；放下时压实、压过头 1px。'
      + '网格（SortableGrid）只有拿在手里的跟手副本随动效包变化，放下仍是固定的回落动画。',
  },
  {
    id: 'badge-empty', category: 'list', title: '徽标与空状态入场', status: 'pack',
    hooks: ['we-badge', 'we-empty-state'],
    api: ['css:enter'], usedIn: ['Badge', 'EmptyState'],
    note: '徽标和整页空状态标题的入场写在动效包 CSS 里（行内空状态 size="sm" 不播），说明与按钮随后用 --we-fx-enter 入场；挂载时播一次。'
      + 'Badge 目前只在实验室里用到，接进会频繁刷新的列表前要先确认入场不会反复重播。',
  },

  // ── 流式与等待 ──
  {
    id: 'reply-moment', category: 'stream', title: '回复的开始与收尾', status: 'pack',
    api: [],
    hooks: ['we-message-assistant', 'we-message-bubble-assistant', 'we-message-label', 'we-writing-prose'],
    usedIn: ['MessageItem', 'AssistantMessageRow', 'WritingMessageItem'],
    note: '一轮回复开始（等首字时）与收尾（流式转定稿）各做一次签名动作，按 data-moment="start|end" 由包样式接管；开始代替通用入场。写作页作用在整段叙事上。',
  },
  {
    id: 'stream', category: 'stream', title: '流式输出', status: 'pack',
    hooks: ['we-stream-char', 'we-stream-caret', 'we-fx-glyph', 'we-chat-empty-state', 'we-asst-stream-cursor'],
    api: ['stream'], usedIn: ['StreamingMarkdown'],
  },
  {
    id: 'busy', category: 'stream', title: '状态整理遮罩与思考指示', status: 'pack',
    hooks: ['we-ink-bead', 'we-type-orb', 'we-state-change-overlay', 'we-cast-state-overlay'],
    api: ['fx', 'transition:backdrop'], usedIn: ['StateBusyOverlay', 'MotionOrb'],
    note: '思考指示 MotionOrb 按动效包的 traits.orb 选小球，不读 fx() 与过渡；遮罩与「整理中」字样由 StateBusyOverlay 驱动。'
      + '遮罩底色写在动效包 CSS 里；信号只留底色，不画括号；活字是一层平的纸色。'
      + '活字的小球是「检字」：一颗方铅字每拍弹起、换一个字、落下压实，小尺寸只留铅块。',
  },
  {
    id: 'loops', category: 'stream', title: '循环动画', status: 'pack',
    hooks: ['we-skel', 'we-asst-new-msg-arrow'],
    api: ['css:skeleton', 'css:spin', 'css:typing', 'css:nudge'],
    usedIn: ['骨架屏', '工具运行指示', '打字三点', '新消息箭头'],
  },

  // ── 世界改写 ──
  {
    id: 'state-values', category: 'world', title: '状态数值变化', status: 'pack',
    hooks: ['we-change-tag', 'we-fx-burst', 'we-ink-warp'],
    api: ['fx'], usedIn: ['StatusValueChange', 'ChangeText', 'TurnChangeStrip'],
  },
  {
    id: 'chapter', category: 'world', title: '章节开场', status: 'pack',
    hooks: ['we-chapter-header', 'we-chapter-title', 'we-chapter-fleuron-line', 'we-chapter-fleuron-mark'],
    api: ['fx'], usedIn: ['ChapterDivider'],
  },
  {
    id: 'done-confirm', category: 'world', title: '完成确认', status: 'pack',
    hooks: ['we-done-confirm'],
    api: ['fx'], usedIn: ['DoneConfirm'],
  },

  // ── 全站节奏 ──
  {
    id: 'rhythm', category: 'rhythm', title: '全站节奏', status: 'pack',
    api: ['role'], usedIn: ['全站约 250 处普通 CSS 过渡', 'useMotion().role()'],
    note: '悬停、色变、显隐、折叠、抽屉这类过渡按用途选动效角色（--we-motion-<角色>-duration / -easing）；'
      + '默认值在 core/utils/motion.js，动效包可以在 rhythm 里改写，CSS 同值写在自己的 :root 里。'
      + '墨流：状态变化慢一拍（300ms），墨慢慢洇开；信号：沿用默认；活字：状态变化快半拍（150ms），纸是脆的。点「播放节奏尺」对比各角色的快慢与曲线。',
  },
];

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((slot) => [slot.id, slot]));
