/**
 * 视觉位清单：主题能改的每一类视觉取值，一类一条，是动效位清单（slots.js）在视觉一侧的对应物。
 * 实验室「视觉」分页按它分类展示；测试用它核对核心 token 都被某个视觉位认领、每个 ready 的视觉位都有演示。
 *
 * tokens：认领的核心 token，* 匹配任意后缀。没有专属 token 的组件类视觉位写 []。
 * status：ready 有演示；pending 演示还没做。
 */

export const VISUAL_CATEGORIES = [
  { id: 'color', label: '色彩' },
  { id: 'type', label: '字体与排版' },
  { id: 'shape', label: '形状与层次' },
  { id: 'component', label: '控件与卡片' },
  { id: 'shell', label: '壳层与氛围' },
  { id: 'page', label: '页面' },
  { id: 'chat', label: '聊天' },
];

export const VISUAL_STATUS_LABEL = {
  ready: '已有演示',
  pending: '演示待补',
};

export const VISUAL_SLOTS = [
  // ── 色彩 ──
  {
    id: 'base-palette', category: 'color', title: '基础色板', status: 'ready',
    tokens: ['--we-base-*', '--we-shadow-strength'], usedIn: ['主题换肤只写这一层，语义色都由它按公式推导'],
  },
  {
    id: 'surface-colors', category: 'color', title: '底色、文字与边框', status: 'ready',
    tokens: ['--we-color-scheme', '--we-color-bg-*', '--we-color-text-*', '--we-color-on-accent', '--we-color-border-*', '--we-color-scrim'],
    usedIn: ['全站所有表面、正文、分隔线'],
  },
  {
    id: 'accent-colors', category: 'color', title: '强调与状态', status: 'ready',
    tokens: ['--we-color-accent*', '--we-color-ornament', '--we-color-gold-pale', '--we-color-status-*'],
    usedIn: ['主按钮、选中态、徽标、花饰与分隔线、成功 / 警告 / 危险提示'],
  },
  {
    id: 'wash-colors', category: 'color', title: '透明度阶梯与状态层', status: 'ready',
    tokens: [
      '--we-alpha-*', '--we-opacity-disabled', '--we-color-hover', '--we-color-pressed', '--we-color-highlight-*', '--we-color-shade*',
      '--we-color-white', '--we-color-cover-*', '--we-color-avatar-*',
    ],
    usedIn: ['输入框底、悬停底、遮罩、阴影、头像占位、不可用控件'],
  },

  // ── 字体与排版 ──
  {
    id: 'fonts', category: 'type', title: '字体', status: 'ready',
    tokens: ['--we-font-*'], usedIn: ['界面、叙事正文、标题、等宽'],
  },
  {
    id: 'type-roles', category: 'type', title: '字体角色', status: 'ready',
    tokens: ['--we-type-*', '--we-leading-flush', '--we-glyph-*', '--we-weight-*'],
    usedIn: ['全站文字：组件只选角色，由角色给齐字号、行高、字距、字重'],
  },

  // ── 形状与层次 ──
  {
    id: 'radius', category: 'shape', title: '圆角', status: 'ready',
    tokens: ['--we-radius-*'], usedIn: ['按钮、输入框、卡片、弹窗'],
  },
  {
    id: 'shadow', category: 'shape', title: '阴影与焦点环', status: 'ready',
    tokens: ['--we-shadow-*', '--we-focus-ring'], usedIn: ['纸面抬升与凹陷、弹窗、提示条、滑块、键盘焦点'],
  },
  {
    id: 'material', category: 'shape', title: '表面材料', status: 'ready',
    tokens: ['--we-material-*', '--we-grain-*', '--we-glass-*', '--we-blur-*', '--we-stage-surface'],
    usedIn: ['世界入口、台前、消息、输入胶囊、弹窗'],
  },

  // ── 控件与卡片 ──
  {
    id: 'controls', category: 'component', title: '按钮与表单控件', status: 'ready',
    tokens: [], usedIn: ['Button、Badge、Input、Textarea、Select、ToggleSwitch、Range'],
    note: '没有专属 token，全部由色彩、圆角、阴影几类 token 组合而成。',
  },
  {
    id: 'cards', category: 'component', title: '卡片与面板', status: 'ready',
    tokens: ['--we-card-*', '--we-panel-card-*'], usedIn: ['Card、PanelCard、EmptyState'],
  },
  {
    id: 'entry-cols', category: 'component', title: '条目列与条目行', status: 'ready',
    tokens: ['--we-col-*'], usedIn: ['世界页三栏：故事线、角色、世界规则'],
    note: '故事线、角色两栏是真实组件；第三栏只放真实的规则入口卡，「我扮演」区块未放。',
  },

  // ── 壳层与氛围 ──
  {
    id: 'topbar-skin', category: 'shell', title: '顶栏', status: 'ready',
    tokens: ['--we-topbar-*'], usedIn: ['TopBar'],
    note: '用真实的顶栏样式类搭的样机，不含路由和数据。',
  },
  {
    id: 'atmosphere', category: 'shell', title: '背景氛围「光尘」', status: 'ready',
    tokens: ['--we-atmosphere-*'], usedIn: ['AtmosphereLayer'],
    note: '真实组件，这里收进固定尺寸的盒子里；真实页面里铺满整个窗口。',
  },
  {
    id: 'panes', category: 'shell', title: '分栏与画布纹理', status: 'ready',
    tokens: ['--we-pane-*', '--we-canvas-*'], usedIn: ['BookSpread 左右页、聊天中栏'],
    note: '真实的 BookSpread 与侧抽屉，收进固定尺寸的盒子里；下方一条用真实的画布类展示纹理。',
  },

  // ── 页面 ──
  {
    id: 'page-canvas', category: 'page', title: '页面大画布', status: 'ready',
    tokens: ['--we-page-*', '--we-card-name-*', '--we-parchment-*'], usedIn: ['书架页、世界页大标题与纸面'],
    note: '样机：用真实的页头样式类，加上真实的引导、角色卡和纸纹组件拼成，不是整页。',
  },
  {
    id: 'world-card', category: 'page', title: '世界卡与书架空态', status: 'ready',
    tokens: ['--we-card-overlay-*', '--we-card-cover-*', '--we-bookshelf-*'], usedIn: ['WorldsGrid'],
    note: '世界卡是真实的 WorldsGrid（假数据）；书架的读取失败与空态按 WorldsPage 的结构用真实样式类搭成样机。',
  },
  {
    id: 'loading', category: 'page', title: '加载占位', status: 'ready',
    tokens: ['--we-loading-*'], usedIn: ['设置面板加载'],
    note: '样机：设置页的加载态是页面内部状态，无法单独渲染，这里用它的真实样式类搭出同样的结构。',
  },

  // ── 聊天 ──
  {
    id: 'chat', category: 'chat', title: '聊天消息', status: 'ready',
    tokens: [], usedIn: ['MessageItem'],
  },
  {
    id: 'chat-controls', category: 'chat', title: '翻页按钮与输入栏', status: 'ready',
    tokens: ['--we-pager-*', '--we-composer-*'], usedIn: ['Pager', 'InputBox'],
    note: '真实的 InputBox 与 Pager，发送和续写等回调为空。',
  },

];

export const VISUAL_SLOT_BY_ID = Object.fromEntries(VISUAL_SLOTS.map((slot) => [slot.id, slot]));
