/* 动效包「信号」：出现、切换、反馈都是一次短促的数字信号——
 * 硬切闪烁、横向抖动、切片成字、错位撕裂。没有模糊，没有回弹。
 * 大面板、遮罩、换位走平滑曲线：整块内容被抖偏、跟随时一顿一顿都不好看。
 * 样式与关键帧见 themes/motion/signal.css。 */
import { MOTION } from '../../utils/motion.js';

// 硬切：每段保持起点值，到段尾瞬间跳到终点（等价 CSS steps(1, jump-end)）
const cut = (t) => (t >= 1 ? 1 : 0);

// 一拍：闪两下亮起、撕裂一次的长度，与 signal.css 的 --sig-beat 同值；一帧：按压硬切到位
const BEAT = 0.3;
const TICK = 0.1;

const ENTER = { duration: BEAT, ease: cut };
const EXIT = { duration: MOTION.state.duration, ease: cut };
const MOVE = MOTION.state;

// 闪两下亮起：亮起、回落、再亮起
const FLASH = [0, 1, 0.3, 1];
// 大面板的上浮起点
const RISE_Y = 8;

export default {
  id: 'signal',
  name: '信号',
  description: '出现、切换、反馈都是一次短促的数字信号：硬切闪烁、错位撕裂、切片成字。',
  // 依赖包身份的组件行为：写在包里，组件只读这些字段，不按包 id 判断
  traits: {
    neck: false,
    warp: false,
    rail: 'hop',
    orb: 'matrix',
  },
  // 全站节奏：沿用默认的节奏角色
  rhythm: {},
  variants: {
    // 小块入场：闪两下、抖一下，然后锁定（消息、说话者、下拉、错误提示）
    enter: {
      hidden:  { opacity: 0, x: -6 },
      visible: { opacity: FLASH, x: [-6, 4, -2, 0] },
      exit:    { opacity: [1, 0.4, 0], transition: EXIT },
    },
    // 大面板入场：淡入并上浮到位
    overlayEnter: {
      hidden:  { opacity: 0, y: RISE_Y },
      visible: { opacity: 1, y: 0 },
      exit:    { opacity: 0, y: 6 },
    },
    // 页签内容：原地闪两下亮起后锁定，不上浮、不看切换方向
    tabEnter: {
      hidden:  { opacity: 0 },
      visible: { opacity: FLASH, transition: ENTER },
    },
    // 遮罩：平滑亮起 / 熄灭
    overlayBackdrop: {
      hidden:  { opacity: 0 },
      visible: { opacity: 1 },
    },
    // 只变透明度的出现：闪两下亮起、闪一下熄灭（侧抽屉本体、图标互换）
    appear: {
      hidden:  { opacity: 0 },
      visible: { opacity: FLASH },
      exit:    { opacity: 0, transition: EXIT },
    },
    // 侧抽屉内容：从外侧边缘抖进来、闪一下退回去；custom 传外侧方向的位移
    edgeEnter: {
      hidden:  (edge) => ({ opacity: 0, x: edge, transition: EXIT }),
      visible: (edge) => ({
        opacity: FLASH,
        x: [edge, -edge / 2, edge / 4, 0],
        transition: { ...ENTER, delay: MOTION.state.duration },
      }),
    },
  },
  transitions: {
    enter:    ENTER,
    overlay:  MOTION.enter,
    backdrop: MOTION.state,
    // 指示条、高亮块换位：平滑滑过去；前后沿同一节奏，不拉伸
    move:      MOVE,
    moveTrail: MOVE,
    // 按压瞬时到位
    press:    { duration: TICK, ease: cut },
  },
  // 位移、尺寸、形状的变化：给定名义时长，走平滑曲线
  flow: (duration) => ({ duration, ease: MOTION.state.ease }),
  // 手势目标值，transition 由 useMotion().gesture 配上 press
  gestures: {
    // 带字的按钮和卡片不缩放：按下硬切下沉；提亮与磷光帧见 signal.css
    press:  { whileTap: { y: 1 } },
    // 入口面积大：悬停上移让位，按下落回原位
    portal: { whileHover: { y: -2 }, whileTap: { y: 0 } },
    // 发送：按下陷落
    sink:   { whileTap: { y: 1.5 } },
  },
  // 流式输出：新到达的字先是抖动的强调色横带，逐字切片成字；下划线光标领路
  stream: {
    // 单个字从轮到它到定住
    char: 0.32,
    // 逐字间隔；到达太快时压缩间隔，打字进度最多落后真实到达 lag 秒
    stagger: 0.035,
    lag: 0.6,
    // 下划线光标：亮一半、灭一半
    caret: 1.0,
    // 生成结束：光标闪一下熄灭
    caretOut: MOTION.state.duration,
  },
  // 世界被改写的一瞬：RGB 错位、切片撕裂、切片成字，只爆发一次后定格
  // 进入世界的页面转场「锁定跃迁」：旧页撕裂一次后熄灭，新旧页之间的一拍黑落两列代码雨，新页闪两下亮起；CSS 编排在 signal.css
  portal: { navigate: 0.36, total: 1.06 },
  fx: {
    // 错位撕裂一次
    burst: 0.42,
    // 整段文字切片成字
    decode: 0.4,
    // 完成确认从出现到熄灭
    stamp: 1.4,
    // 完成确认熄灭：压成一条横线后消失
    off: 0.24,
  },
};
