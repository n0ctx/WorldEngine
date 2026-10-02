/* 动效包「活字」：整套动效是印刷作坊里的两种材质——纸与铅字。
 *   纸：轻、挺。出现时像一张纸从上方落到位，大面板像一张纸落到桌上；滑动靠摩擦急停，不回弹。
 *   带字的块只平移不翻转：翻转会把文字压扁再拉开，等于缩放文字，进页时整屏正文会一起抽一下。
 *   铅字：重。往下落越落越快，接触时顿两帧，压过头再弹回。
 *   印（签名动作）：重物压到纸上的一下——顿帧、压过头、接触面留下凹印，再平复成平面印刷。
 * 纸只在动的时候有厚度：阴影、凹印、翘起只在动作过程里出现，静止时一切平印。
 * 主角是流式输出：每个字是一颗落进版里的铅字，前沿一块朱砂铅块领路。
 * 样式与关键帧见 themes/motion/letterpress.css；思考小球见 components/motion/MotionOrb.jsx 的 TypeOrb。 */

// 越落越快 / 起步快、急停（与 letterpress.css 的 --press-gravity / --press-friction 同值）
const GRAVITY = [0.55, 0, 0.9, 0.4];
const FRICTION = [0.15, 0.85, 0.2, 1];

const spring = (stiffness, damping, mass = 1) => ({ type: 'spring', stiffness, damping, mass });

// 纸滑动、展开到位：起步快、急停
const SLIDE = { duration: 0.34, ease: FRICTION };
const EXIT = { duration: 0.22, ease: GRAVITY };
// 落纸：从上方落到位，摩擦急停，不压过头、不回弹（与 letterpress.css 的 we-press-drop / we-press-land 同一动作）
const ENTER = { default: SLIDE, opacity: { duration: 0.1 } };
const LAND = { default: { duration: 0.4, ease: FRICTION }, opacity: { duration: 0.12 } };
const DROP_FROM = -10;
const LAND_FROM = -14;

export default {
  id: 'letterpress',
  name: '活字',
  description: '纸与铅字：出现时像一张纸落到位，铅字落下时顿一下、压过头再弹回，按下留一道凹印；流式输出一字一颗铅字。',
  // 依赖包身份的组件行为：写在包里，组件只读这些字段，不按包 id 判断
  traits: {
    neck: false,
    warp: false,
    rail: 'hop',
    orb: 'type',
  },
  // 全站节奏：纸是脆的，状态变化比默认快半拍（与 letterpress.css 的 --we-motion-* 同值）
  rhythm: {
    state: { duration: 0.15 },
  },
  variants: {
    // 小块入场：像一张纸从上方落到位，急停；离开时被提走，越提越快
    enter: {
      hidden:  { opacity: 0, y: DROP_FROM },
      visible: { opacity: 1, y: 0 },
      exit:    { opacity: 0, y: DROP_FROM / 2, transition: EXIT },
    },
    // 大面板入场：一张纸落到桌上。不缩放、不模糊、不横向动
    overlayEnter: {
      hidden:  { opacity: 0, y: LAND_FROM },
      visible: { opacity: 1, y: 0 },
      exit:    { opacity: 0, y: -8, transition: EXIT },
    },
    // 页签内容：顺着切换方向推进来，摩擦急停；custom 传方向（1 向右、-1 向左）
    tabEnter: {
      hidden:  (dir = 1) => ({ opacity: 0, x: dir * 24 }),
      visible: { opacity: 1, x: 0 },
    },
    overlayBackdrop: {
      hidden:  { opacity: 0 },
      visible: { opacity: 1 },
    },
    // 只变透明度的出现：印上去——落下几像素、到位即止（侧抽屉本体、图标互换、代码块）
    appear: {
      hidden:  { opacity: 0, y: -4 },
      visible: { opacity: 1, y: 0 },
      exit:    { opacity: 0, transition: EXIT },
    },
    // 侧抽屉内容：像推一张纸进来，摩擦急停，不回弹
    edgeEnter: {
      hidden:  (edge) => ({ opacity: 0, x: edge * 2, transition: EXIT }),
      visible: () => ({ opacity: 1, x: 0, transition: { ...SLIDE, delay: 0.1 } }),
    },
  },
  transitions: {
    enter:     ENTER,
    overlay:   LAND,
    backdrop:  SLIDE,
    // 指示物换位：像一根铅条推过去，急停；前后沿同一节奏，不拉伸
    move:      SLIDE,
    moveTrail: SLIDE,
    // 按下压进去，松手带一点过冲弹回（阻尼比约 0.5）
    press:     spring(900, 30),
  },
  // 位移、尺寸、形状的变化：给定名义时长，起步快、急停
  flow: (duration) => ({ duration, ease: FRICTION }),
  gestures: {
    // 带字的按钮不缩放：悬停纸边翘起，按下压进纸里；凹印见 letterpress.css
    press:  { whileHover: { y: -1 }, whileTap: { y: 2 } },
    // 入口卡片是一本书：悬停时封面沿书脊（左边）掀开一点，按下合上压实；书脊位置与透视见 letterpress.css
    portal: { whileHover: { rotateY: -8 }, whileTap: { rotateY: 0, y: 1 } },
    // 发送键只有图标：盖章，按下压扁
    sink:   { whileTap: { y: 3, scaleX: 1.06, scaleY: 0.9 } },
  },
  // 流式输出：一颗铅字落进版里、顿一下、压过头再弹回，凹印随后平复
  stream: {
    char: 0.42,
    stagger: 0.03,
    lag: 0.6,
    // 常驻铅块一下一下往下按
    caret: 1.0,
    // 生成结束：铅块被抽走
    caretOut: 0.3,
  },
  // 进入世界的页面转场「翻书」：书封压实，旧页沿左侧书脊翻起，枢纽各栏依次落纸；CSS 编排在 letterpress.css
  portal: { navigate: 0.45, total: 1.5 },
  fx: {
    // 新值重落：落下 → 顿帧 → 压过头 → 弹回 → 凹印平复
    burst: 0.6,
    // 整段文字压印
    decode: 0.6,
    // 完成确认从盖下到收走
    stamp: 1.8,
    // 完成确认淡去：像被纸吃进去
    off: 0.4,
  },
};
