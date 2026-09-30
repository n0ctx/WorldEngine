/* WorldEngine 动效角色：全站普通过渡按用途选角色，时长与曲线成对使用。
 * CSS 侧 --we-motion-<角色>-duration / -easing 与本文件同名对齐，由 scripts/check-motion.mjs 核对（npm run check:motion）。
 * 这里是默认值：动效包可以在 rhythm 里改写，组件经 useMotion().role() 取当前包的值。
 * 出现、切换、反馈这些有风格的动效归动效包所有，见 core/motion/。 */

const INK = [0.22, 1, 0.36, 1];

// 每个角色可直接当 framer-motion 的 transition 用
export const MOTION = {
  // 状态：悬停、色变、边框、显隐、浮起、小位移
  state: { duration: 0.18, ease: INK },
  // 展开：折叠展开、面板入场
  enter: { duration: 0.38, ease: INK },
  // 收起：折叠收起、离场，先慢后快
  exit:  { duration: 0.30, ease: [0.55, 0, 1, 0.45] },
  // 页面：侧抽屉开合、章节开场，匀速起步、柔和结束
  page:  { duration: 0.30, ease: [0.65, 0, 0.35, 1] },
  // 循环：曲线由各自的关键帧定
  loop:  { duration: 1.2 },
};

// 列表逐项错峰的间隔（秒）
export const STAGGER = 0.05;
