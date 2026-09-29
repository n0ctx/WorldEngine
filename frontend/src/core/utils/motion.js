/* WorldEngine 动效 token —— 唯一真源。
 * 规格以本文件和相关主题 token 为准。
 * CSS 侧 --we-duration-* / --we-easing-* 由本文件按语义对齐；
 * 一致性由 scripts/check-motion.mjs 守护（npm run check:motion）。
 *
 * 动效语言：信号锁定 —— 出现、切换、反馈都是一次短促的数字信号：
 * 硬切闪烁、横向抖动、乱码解码、分格跳变。没有模糊，没有回弹。
 * 平滑曲线只留给悬停变色、折叠展开这类普通状态过渡。 */

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

// 硬切：每段保持起点值，到段尾瞬间跳到终点（等价 CSS steps(1, jump-end)）
const cut = (t) => (t >= 1 ? 1 : 0);
// 分格：把一段位移切成 n 格逐格跳过去（等价 CSS steps(n, jump-end)）
const stepped = (n) => (t) => (t >= 1 ? 1 : Math.floor(t * n) / n);

// §2.2 缓动函数
export const EASE = {
  // 墨水浸润：快速展开、柔和收尾 — 普通状态过渡
  ink:     [0.22, 1.00, 0.36, 1.00],
  // 翻页：匀速起步、柔和结束 — 页面级过渡
  page:    [0.65, 0.00, 0.35, 1.00],
  // 落笔：微微加速再收 — 点击确认
  quill:   [0.40, 0.00, 0.20, 1.00],
  // 利落：快进快出 — 工具提示、hover 色变
  sharp:   [0.25, 0.46, 0.45, 0.94],
  // 收回：先快后慢 — 折叠
  retract: [0.55, 0.00, 1.00, 0.45],
  // 匀速
  linear:  'linear',
  // 硬切：信号闪烁的每一帧
  cut,
  // 分格：指示条、高亮块在位置之间逐格跳
  stepped: stepped(4),
};

// §2.3 stagger
export const STAGGER = {
  list:      0.05,
  panel:     0.06,
  character: 0.08,
};

// §2.4 信号锁定 —— 所有出现与切换：闪两下、抖一下，然后锁定。
// 时长复用 DURATION 档位，CSS 侧 we-signal-in 等关键帧用对应的 --we-duration-* 即可对齐
export const SIGNAL = {
  // 入场：0 → 亮 → 暗 → 亮，横向 -6 → 4 → -2 → 0（CSS：--we-duration-normal）
  enter: DURATION.base,
  // 离场：闪一下熄灭（CSS：--we-duration-fast）
  exit:  DURATION.quick,
  // 按压：瞬间到位，不回弹
  press: DURATION.micro,
  // 指示条 / 高亮块换位：分四格跳过去
  hop:   DURATION.quick,
};

// §2.5 信号故障 —— 世界状态被改写的一瞬：RGB 错位、切片撕裂、切片成字，只爆发一次后定格。
// 切片成字：字切成横带，强调色下各自抖动，一层层定住、闪一下，最后退回正文色（样式见 ui.css .we-slice）
export const GLITCH = {
  // 错位撕裂一次的总时长
  burst:      0.42,
  // 整段文字切片成字的总时长
  decode:     0.4,
  // 保存确认从出现到熄灭的总时长
  stamp:      1.4,
  // 熄灭：压成一条横线后消失
  off:        0.24,
};

// §2.6 流式输出 —— 新到达的字先是抖动的强调色横带，逐字切片成字；下划线光标领路
export const STREAM = {
  // 单个字：轮到它时横带一层层定住、整字闪一下，退回正文色
  char:     { duration: 0.32 },
  // 逐字间隔；到达太快时压缩间隔，打字进度最多落后真实到达 lag 秒（落后的部分就是屏幕上还在抖的字）
  typing:   { stagger: 0.035, lag: 0.6 },
  // 下划线光标：亮一半、灭一半，硬切
  caret:    { duration: 1.00 },
  // 生成结束：光标闪一下熄灭
  caretOut: { duration: SIGNAL.exit },
};

// 手势目标值（whileHover / whileTap），transition 由 useMotion().gesture 配上瞬时硬切
export const GESTURE = {
  press: {
    whileTap:   { scale: 0.96 },
  },
  // 入口面积大：悬停上移让位；按下只压缩
  portal: {
    whileHover: { y: -2 },
    whileTap:   { scale: 0.98 },
  },
  // 发送：按下陷落
  sink: {
    whileTap: { y: 1.5 },
  },
};

// 预组合 variants（framer-motion variants 对象，直接展开使用）
export const variants = {
  // 信号锁定入场：消息、弹窗、面板、卡片、说话者都用这一种
  signalIn: {
    hidden:  { opacity: 0, x: -6 },
    visible: { opacity: [0, 1, 0.3, 1], x: [-6, 4, -2, 0] },
    exit:    { opacity: [1, 0.4, 0], transition: { duration: SIGNAL.exit, ease: cut } },
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
    hidden:  { opacity: 0, x: -6 },
    visible: { opacity: [0, 1, 0.3, 1], x: [-6, 4, -2, 0] },
  },
  // 页面级：路由切换过渡
  pageTransition: {
    hidden:  { opacity: 0 },
    visible: { opacity: [0, 1, 0.3, 1], transition: { duration: SIGNAL.enter, ease: cut } },
    exit:    { opacity: 0, transition: { duration: SIGNAL.exit, ease: cut } },
  },
  // 遮罩：分三档亮起 / 熄灭
  overlayBackdrop: {
    hidden:  { opacity: 0 },
    visible: { opacity: 1 },
  },
};

// transition 预设（配合 variants 或 motion props 使用）
export const transitions = {
  ink:     { duration: DURATION.base,   ease: EASE.ink     },
  quick:   { duration: DURATION.quick,  ease: EASE.sharp   },
  medium:  { duration: DURATION.medium, ease: EASE.ink     },
  slow:    { duration: DURATION.slow,   ease: EASE.page    },
  page:    { duration: DURATION.quick,  ease: EASE.ink     },
  quill:   { duration: DURATION.base,   ease: EASE.quill   },
  retract: { duration: DURATION.quick,  ease: EASE.retract },
  // 信号锁定：配 variants.signalIn / listItem
  signal:  { duration: SIGNAL.enter, ease: cut },
  // 闪一下熄灭：配离场 { opacity: [1, 0.4, 0] }
  signalOut: { duration: SIGNAL.exit, ease: cut },
  // 遮罩分三档亮起
  backdrop: { duration: DURATION.quick, ease: stepped(3) },
  // 位置换位分四格跳
  hop:     { duration: SIGNAL.hop, ease: EASE.stepped },
  // 按压瞬时到位
  press:   { duration: SIGNAL.press, ease: cut },
};
