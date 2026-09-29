/* WorldEngine 动效 token：各动效包共用的时长、平滑曲线与普通状态过渡。
 * CSS 侧 --we-duration-* / --we-easing-* 由本文件按语义对齐；
 * 一致性由 scripts/check-motion.mjs 守护（npm run check:motion）。
 * 出现、切换、反馈这些有风格的动效归动效包所有，见 core/motion/。 */

// §2.1 时长
export const DURATION = {
  micro:   0.10,
  quick:   0.18,
  base:    0.30,
  medium:  0.38,
  slow:    0.50,
  loop:    1.20,
};

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
};

// §2.3 stagger
export const STAGGER = {
  list:  0.05,
  panel: 0.06,
};

// transition 预设（配合 variants 或 motion props 使用）
export const transitions = {
  ink:    { duration: DURATION.base,   ease: EASE.ink },
  medium: { duration: DURATION.medium, ease: EASE.ink },
};
