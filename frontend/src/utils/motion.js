/* WorldEngine 动效 token — 权威定义见 DESIGN.md §9.1/§9.2 */

export const MOTION = {
  duration: {
    quick: 0.18,
    base:  0.32,
    slow:  0.50,
    crawl: 0.80,
  },
  ease: {
    ink:   [0.22, 1,    0.36, 1],
    page:  [0.65, 0,    0.35, 1],
    quill: [0.40, 0,    0.20, 1],
    sharp: [0.25, 0.46, 0.45, 0.94],
  },
  stagger: 0.05,
};

export const INK_RISE = {
  initial:    { opacity: 0, y: 8, filter: 'blur(1.5px)' },
  animate:    { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: MOTION.duration.base, ease: MOTION.ease.ink },
};
