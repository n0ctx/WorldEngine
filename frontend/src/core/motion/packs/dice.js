/* 动效包「掷」：整套动效是跑团桌上的两样东西——骰子与卡牌。
 *   骰子：被掷出去，跳起、翻滚、落地时弹一下再停住。数值改写是数字竖向翻滚到新值，像骰面滚到朝上的一面。
 *   卡牌：新内容像发牌一样从下方滑上桌，冲过一点再摆正；悬停是把卡拿起来，露出侧边的厚度，按下压回桌面。
 *   纸片：状态变化标签、徽标像从冲压板上按出来的厚纸片，短促地弹出、带出厚度。
 * 掷（签名动作）：起跳、翻滚、落地过冲、回弹、停住。弹簧都带可见的过冲（阻尼比约 0.5–0.65），不模糊、不缩放带字的元素。
 * 样式与关键帧见 themes/motion/dice.css；思考小球见 components/motion/MotionOrb.jsx 的 DieOrb。 */

// 落定：起步快、长尾收住（与 dice.css 的 --roll-settle 同值）
const SETTLE = [0.2, 0.9, 0.3, 1];
// 被拿走：越走越快（与 dice.css 的 --roll-fall 同值）
const FALL = [0.6, 0, 0.9, 0.5];

const spring = (stiffness, damping, mass = 1) => ({ type: 'spring', stiffness, damping, mass });

// 位移走弹簧（阻尼比约 0.6，冲过一截再回到位）；透明度走曲线，避免被弹簧推出范围
const DEAL = spring(380, 23);
const ENTER = { ...DEAL, opacity: { duration: 0.16, ease: SETTLE } };
const EXIT = { duration: 0.2, ease: FALL };
// 大面板：一张大卡牌推上桌，阻尼比约 0.63
const PANEL = { ...spring(300, 22), opacity: { duration: 0.2, ease: SETTLE } };
// 发牌的起点：从桌面下方滑上来
const DEAL_FROM = 24;
const PANEL_FROM = 30;

export default {
  id: 'dice',
  name: '掷',
  description: '骰子与卡牌：新内容像发牌一样滑上桌、冲过一点再摆正，悬停把卡拿起，数值改写像骰子翻滚到新的一面；流式输出一字一掷。',
  // 依赖包身份的组件行为：写在包里，组件只读这些字段，不按包 id 判断
  traits: {
    neck: false,
    warp: false,
    rail: 'hop',
    // 思考小球：一颗骰子每拍跳起翻一面、落地弹一下
    orb: 'die',
    shatter: false,
  },
  // 全站节奏：骰子落定干脆，状态变化比默认快一点（与 dice.css 的 --we-motion-* 同值）
  rhythm: {
    state: { duration: 0.2 },
  },
  variants: {
    // 小块入场：发牌——从下方滑上桌，冲过一点再回到位；离开时被收走，越走越快
    enter: {
      hidden:  { opacity: 0, y: DEAL_FROM },
      visible: { opacity: 1, y: 0 },
      exit:    { opacity: 0, y: DEAL_FROM / 2, transition: EXIT },
    },
    // 大面板入场：一张大卡牌推上桌。不缩放、不旋转（面板里有字）
    overlayEnter: {
      hidden:  { opacity: 0, y: PANEL_FROM },
      visible: { opacity: 1, y: 0 },
      exit:    { opacity: 0, y: PANEL_FROM / 2, transition: EXIT },
    },
    // 页签内容：顺着切换方向滑进来，冲过一点再回到位；custom 传方向（1 向右、-1 向左）
    tabEnter: {
      hidden:  (dir = 1) => ({ opacity: 0, x: dir * 28 }),
      visible: { opacity: 1, x: 0 },
    },
    overlayBackdrop: {
      hidden:  { opacity: 0 },
      visible: { opacity: 1 },
    },
    // 只变透明度的出现：从桌面下方弹上来一点（侧抽屉本体、图标互换、代码块）
    appear: {
      hidden:  { opacity: 0, y: 10 },
      visible: { opacity: 1, y: 0 },
      exit:    { opacity: 0, y: 6, transition: EXIT },
    },
    // 侧抽屉内容：从外侧滑进来，冲过一点再回到位
    edgeEnter: {
      hidden:  (edge) => ({ opacity: 0, x: edge * 2.2, transition: EXIT }),
      visible: () => ({ opacity: 1, x: 0, transition: { ...ENTER, delay: 0.1 } }),
    },
  },
  transitions: {
    enter:     ENTER,
    overlay:   PANEL,
    backdrop:  { duration: 0.26, ease: SETTLE },
    // 指示物换位：像骰子跳到下一格，落地弹一下；前后沿同一节奏，不拉伸
    move:      spring(560, 30),
    moveTrail: spring(560, 30),
    // 按下压回桌面，松手带过冲弹起（阻尼比约 0.6）
    press:     spring(800, 34),
  },
  // 位移、尺寸、形状的变化：同样的名义时长，换成带过冲的弹簧
  flow: (duration) => ({ type: 'spring', visualDuration: duration * 1.2, bounce: 0.35 }),
  gestures: {
    // 带字的按钮不缩放：悬停拿起，按下压回桌面；厚度变化见 dice.css
    press:  { whileHover: { y: -3 }, whileTap: { y: 2 } },
    // 入口卡片：悬停把盒子拿起来，按下压回桌面
    portal: { whileHover: { y: -8 }, whileTap: { y: 2 } },
    // 发送键只有图标：按下像出手前的骰子，压下并拧一下，松手弹回
    sink:   { whileTap: { y: 3, rotate: -18 } },
  },
  // 流式输出：每个字被掷上桌——从下方弹起、冲过基线一点、落定；一颗骰子在前沿领路
  stream: {
    char: 0.5,
    stagger: 0.028,
    lag: 0.6,
    // 常驻骰子每拍跳起翻一面
    caret: 0.9,
    // 生成结束：骰子被掷出画面
    caretOut: 0.36,
  },
  // 进入世界的页面转场「开盒」：点下的战役盒被拿起，其余的盒子滑下桌，一颗二十面骰被掷过换页的那一拍；
  // 枢纽页各栏像发牌一样一栏栏滑上桌，栏标题被掷上来、落地弹一下。CSS 编排在 dice.css
  portal: { navigate: 0.42, total: 1.3 },
  fx: {
    // 数值换新：数字竖向翻滚到新值，冲过一点再落定
    burst: 0.62,
    // 整段文字翻滚上来
    decode: 0.6,
    // 完成确认从掷出到收走
    stamp: 1.9,
    // 完成确认收走：滑下桌面
    off: 0.32,
  },
};
