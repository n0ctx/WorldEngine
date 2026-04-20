/* WorldEngine 动效 token — 权威定义见 MOTION.md §2 */

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

// §2.6 预组合 variants（framer-motion variants 对象，直接展开使用）
export const variants = {
  inkRise: {
    hidden:  { opacity: 0, y: 8,  filter: 'blur(1.5px)' },
    visible: { opacity: 1, y: 0,  filter: 'blur(0px)'   },
  },
  inkFade: {
    visible: { opacity: 1, y: 0,  filter: 'blur(0px)' },
    hidden:  { opacity: 0, y: -6, filter: 'blur(1px)'  },
  },
  staggerList: {
    hidden:  {},
    visible: { transition: { staggerChildren: STAGGER.list } },
  },
  staggerPanel: {
    hidden:  {},
    visible: { transition: { staggerChildren: STAGGER.panel } },
  },
};

// §2.6 transition 预设（配合 variants 或 motion props 使用）
export const transitions = {
  ink:     { duration: DURATION.base,   ease: EASE.ink     },
  quick:   { duration: DURATION.quick,  ease: EASE.sharp   },
  medium:  { duration: DURATION.medium, ease: EASE.ink     },
  slow:    { duration: DURATION.slow,   ease: EASE.page    },
  quill:   { duration: DURATION.base,   ease: EASE.quill   },
  retract: { duration: DURATION.quick,  ease: EASE.retract },
};
