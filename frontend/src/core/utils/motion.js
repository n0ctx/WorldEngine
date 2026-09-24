/* WorldEngine 动效 token —— 唯一真源。
 * 规格以本文件和相关主题 token 为准。
 * CSS 侧 --we-duration-* / --we-easing-* 由本文件按语义对齐；
 * 一致性由 scripts/check-motion.mjs 守护（npm run check:motion）。 */

// §2.1 时长
export const DURATION = {
  instant: 0,
  micro:   0.10,
  quick:   0.18,
  base:    0.30,
  medium:  0.38,
  slow:    0.50,
  crawl:   0.75,
  loop:    1.20,
  ambient: 2.00,
};

// §2.2 缓动函数
export const EASE = {
  // 墨水浸润：快速展开、柔和收尾 — 主要入场曲线
  ink:     [0.22, 1.00, 0.36, 1.00],
  // 翻页：匀速起步、柔和结束 — 页面级过渡
  page:    [0.65, 0.00, 0.35, 1.00],
  // 落笔：微微加速再收 — 盖印、点击确认
  quill:   [0.40, 0.00, 0.20, 1.00],
  // 利落：快进快出 — 工具提示、hover 色变
  sharp:   [0.25, 0.46, 0.45, 0.94],
  // 收回：先快后慢 — 离场、折叠
  retract: [0.55, 0.00, 1.00, 0.45],
  // 匀速：流式文字渐入
  linear:  'linear',
};

// §2.3 stagger
export const STAGGER = {
  list:      0.05,
  panel:     0.06,
  character: 0.08,
};

// §2.4 模糊半径
export const BLUR = {
  entry:   '1.5px',
  edit:    '2px',
  overlay: '0px',
};

// §2.5 命名弹簧 —— 页面只引用键名，不直接写 stiffness/damping。
// 弹簧没有对应的 CSS 曲线；CSS 侧的按压/悬停反馈继续用 --we-duration-* 与 --we-easing-*。
// 透明度不走弹簧，单独用短淡入：弹簧驱动 opacity 时，结束交接那一帧会闪回初始透明度。
const SPRING_FADE = { duration: DURATION.quick, ease: EASE.ink };

export const SPRING = {
  // 轻按压：按下立即压缩，松开短促回弹一次
  press:   { type: 'spring', stiffness: 520, damping: 26, mass: 0.6, opacity: SPRING_FADE },
  // 世界入口：体量大，悬停轻轻让位，按下压缩，松开只过冲回弹一次
  portal:  { type: 'spring', stiffness: 300, damping: 24, mass: 1.1, opacity: SPRING_FADE },
  // 消息入场：像角色走上舞台，短回弹后静止
  message: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8, opacity: SPRING_FADE },
  // 切换角色：新的说话者从侧面落到台前，弹一下后站定
  speaker: { type: 'spring', stiffness: 340, damping: 24, mass: 1.0, opacity: SPRING_FADE },
  // 弹窗 / 设置：近临界阻尼，几乎不过冲
  overlay: { type: 'spring', stiffness: 380, damping: 34, mass: 0.9, opacity: SPRING_FADE },
  // 发送：按下陷落，松开短促回弹一次
  sink:    { type: 'spring', stiffness: 700, damping: 18, mass: 0.5, opacity: SPRING_FADE },
  // 跟随光的出现 / 消失
  glowFade: { type: 'spring', stiffness: 300, damping: 35 },
};

// §2.5 流式书写 —— 新到达的文字逐字打出，书写光标跟着正在出现的字走
export const STREAM = {
  // 单个字：从一团墨色微光中显形；已出现的字不再参与
  char:     { duration: 0.42,           ease: EASE.ink },
  // 逐字间隔；到达太快时压缩间隔，打字进度最多落后真实到达 lag 秒
  typing:   { stagger: 0.026, lag: 0.45 },
  // 书写光标：短促亮起后缓缓回暗，一次呼吸一个周期
  caret:    { duration: 1.10,           ease: EASE.page },
  // 生成结束：光标先暗下去再移除
  caretOut: { duration: DURATION.base,  ease: EASE.retract },
};

// §2.5 手势目标值（whileHover / whileTap），transition 由 useMotion().gesture 配上对应弹簧
export const GESTURE = {
  press: {
    whileHover: { scale: 1.03 },
    whileTap:   { scale: 0.95 },
  },
  // 入口面积大：悬停只上移让位、不放大；按下只压缩
  portal: {
    whileHover: { y: -2 },
    whileTap:   { scale: 0.98 },
  },
  // 发送：没有悬停位移，按下陷落
  sink: {
    whileTap: { y: 1.5 },
  },
};

// §2.6 预组合 variants（framer-motion variants 对象，直接展开使用）
export const variants = {
  // 组件级：从下浮现 + 模糊消散（主入场）
  inkRise: {
    hidden:  { opacity: 0, y: 8,  filter: 'blur(1.5px)' },
    visible: { opacity: 1, y: 0,  filter: 'blur(0px)'   },
  },
  // 组件级：向上淡出
  inkFade: {
    visible: { opacity: 1, y: 0,  filter: 'blur(0px)' },
    hidden:  { opacity: 0, y: -6, filter: 'blur(1px)'  },
  },
  // 列表容器：stagger 子项
  staggerList: {
    hidden:  {},
    visible: { transition: { staggerChildren: STAGGER.list } },
  },
  staggerPanel: {
    hidden:  {},
    visible: { transition: { staggerChildren: STAGGER.panel } },
  },
  // 列表子项：配合 staggerList / staggerPanel 使用
  listItem: {
    hidden:  { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0 },
  },
  // 页面级：路由切换过渡
  pageTransition: {
    hidden:  { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE.ink } },
    exit:    { opacity: 0,       transition: { duration: 0.08,           ease: EASE.retract } },
  },
  // 消息入场：从下方升上台，只有位移（配 SPRING.message）
  messageEnter: {
    hidden:  { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0  },
  },
  // 场景入场：世界入口 / 空状态（配 SPRING.portal）
  sceneEnter: {
    hidden:  { opacity: 0, y: 18, scale: 0.96 },
    visible: { opacity: 1, y: 0,  scale: 1    },
  },
  // 切换角色：说话者从左侧走上台，只有横移（配 SPRING.speaker）
  speakerEnter: {
    hidden:  { opacity: 0, x: -16 },
    visible: { opacity: 1, x: 0   },
  },
  // 弹窗 / 设置面板入场：原地展开，只有缩放（配 SPRING.overlay）
  overlayEnter: {
    hidden:  { opacity: 0, scale: 0.97 },
    visible: { opacity: 1, scale: 1    },
  },
  // overlay 级：背景遮罩淡入淡出（供 ConfirmModal 等复用）
  overlayBackdrop: {
    hidden:  { opacity: 0 },
    visible: { opacity: 1 },
  },
};

// §2.6 transition 预设（配合 variants 或 motion props 使用）
export const transitions = {
  ink:     { duration: DURATION.base,   ease: EASE.ink     },
  quick:   { duration: DURATION.quick,  ease: EASE.sharp   },
  medium:  { duration: DURATION.medium, ease: EASE.ink     },
  slow:    { duration: DURATION.slow,   ease: EASE.page    },
  page:    { duration: DURATION.quick,  ease: EASE.ink     },
  quill:   { duration: DURATION.base,   ease: EASE.quill   },
  retract: { duration: DURATION.quick,  ease: EASE.retract },
};
