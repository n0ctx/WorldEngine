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
  // 卡片：悬停靠近、按下压缩、松开带一点过冲回弹
  card:    { type: 'spring', stiffness: 360, damping: 22, mass: 0.9, opacity: SPRING_FADE },
  // 消息入场：像角色走上舞台，短回弹后静止
  message: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8, opacity: SPRING_FADE },
  // 弹窗 / 设置：近临界阻尼，几乎不过冲
  overlay: { type: 'spring', stiffness: 380, damping: 34, mass: 0.9, opacity: SPRING_FADE },
};

// §2.5 手势目标值（whileHover / whileTap），transition 由 useMotion().gesture 配上对应弹簧
export const GESTURE = {
  press: {
    whileHover: { scale: 1.03 },
    whileTap:   { scale: 0.95 },
  },
  card: {
    whileHover: { y: -6, scale: 1.015 },
    whileTap:   { y: -2, scale: 0.97 },
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
  // 消息入场：从下方轻跳上台（配 SPRING.message）
  messageEnter: {
    hidden:  { opacity: 0, y: 14, scale: 0.97 },
    visible: { opacity: 1, y: 0,  scale: 1    },
  },
  // 场景入场：世界卡 / 空状态（配 SPRING.card，可放在 staggerList 容器下）
  sceneEnter: {
    hidden:  { opacity: 0, y: 18, scale: 0.96 },
    visible: { opacity: 1, y: 0,  scale: 1    },
  },
  // 弹窗 / 设置面板入场（配 SPRING.overlay）
  overlayEnter: {
    hidden:  { opacity: 0, y: 10, scale: 0.98 },
    visible: { opacity: 1, y: 0,  scale: 1    },
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
