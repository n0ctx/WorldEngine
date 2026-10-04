/* 动效包「墨流」：整套动效是同一种材质——墨在水中。
 *   浮现 / 沉没：出现时从柔焦的深处浮上来，带着惯性冲过一点再回落；离开时加速下沉、化开。
 *   黏滞流动：会移动的东西都有质量。前沿先冲出去、后沿被拖着跟上，行进中拉长，到位后回弹收拢。
 *   洇开：世界状态被改写时，字透过扰动的水面显形；新值被拉长着拽上来、收缩落定。
 *   引力：落下的东西会被拉长，落地压扁再弹回；离开时被往下拽着沉没。
 * 主角是流式输出：每个字是一滴落进纸里的墨，落下、回弹、晕出湿边，身后的字慢慢干成正文色。
 * 样式与关键帧见 themes/motion/liquid.css；畸变滤镜见 components/motion/InkWarp.jsx。 */

// 浮现：长尾收住；沉没：先慢后快坠下去
export const SURFACE = [0.16, 1, 0.3, 1];
const SINK = [0.7, 0, 0.84, 0];

const CLEAR = 'blur(0px)';
const BLUR_EXIT = 'blur(6px)';
const PANEL_FADE = 0.36;

const spring = (stiffness, damping, mass = 1) => ({ type: 'spring', stiffness, damping, mass });

// 位移、缩放走弹簧（阻尼比约 0.6，冲过头一点再回落）；透明度、模糊走曲线，避免弹簧把它们推出范围
const RISE = spring(260, 19);
const ENTER = { ...RISE, opacity: { duration: 0.32, ease: SURFACE }, filter: { duration: 0.42, ease: SURFACE } };
const EXIT = { duration: 0.28, ease: SINK };
const PANEL = { ...spring(220, 22), opacity: { duration: PANEL_FADE, ease: SURFACE } };
// 大面板托起：阻尼比约 0.5，冲过位置一截再回落（与 liquid.css 的 we-ink-lift / --ink-spring 同一手感）
const LIFT = { ...spring(220, 15), opacity: { duration: PANEL_FADE, ease: SURFACE } };

export default {
  id: 'liquid',
  name: '墨流',
  description: '墨在水中：出现时浮上来，移动时拉伸收缩，落下时回弹；流式输出一字一滴墨。',
  // 依赖包身份的组件行为：写在包里，组件只读这些字段，不按包 id 判断
  traits: {
    // 拼合导航的相邻分段之间拉出一段「颈」，像墨连着
    neck: true,
    // 世界状态改写的文字套一层畸变滤镜
    warp: true,
    // 导航条指示物：stretch 前后沿各走一个弹簧、行进中拉长；hop 整体沿弧线跳过去
    rail: 'stretch',
    // 思考 / 等待中的小球：ink 墨珠（大尺寸是流体），matrix 字符矩阵
    orb: 'ink',
    // 进入世界时把世界卡拆成铅字碎块（活字的拆版）
    shatter: false,
  },
  // 全站节奏：改写 core/utils/motion.js 的节奏角色；墨是慢慢洇开的，状态变化慢一拍（与 liquid.css 的 --we-motion-* 同值）
  rhythm: {
    state: { duration: 0.3 },
  },
  variants: {
    // 小块入场：从下方的柔焦里浮上来，竖向微微拉长，落位时回弹
    enter: {
      hidden:  { opacity: 0, y: 22, scaleX: 0.97, scaleY: 1.06, filter: 'blur(8px)' },
      visible: { opacity: 1, y: 0, scaleX: 1, scaleY: 1, filter: CLEAR },
      exit:    { opacity: 0, y: 14, scaleY: 0.96, filter: BLUR_EXIT, transition: EXIT },
    },
    // 大面板入场：从下方托起，冲过位置一截再回落。不缩放（面板里有字，缩放会抖），
    // 不加模糊（大块模糊会让文字在合成层上抖一下）；与 liquid.css 的 we-ink-lift 同一动作
    overlayEnter: {
      hidden:  { opacity: 0, y: 28 },
      visible: { opacity: 1, y: 0, transition: LIFT },
      exit:    { opacity: 0, y: 18, transition: EXIT },
    },
    // 页签内容：顺着指示条移动的方向流进来；custom 传方向（1 向右、-1 向左）
    tabEnter: {
      hidden:  (dir = 1) => ({ opacity: 0, x: dir * 40, scaleX: 1.04, filter: BLUR_EXIT }),
      visible: { opacity: 1, x: 0, scaleX: 1, filter: CLEAR },
    },
    overlayBackdrop: {
      hidden:  { opacity: 0 },
      visible: { opacity: 1 },
    },
    appear: {
      hidden:  { opacity: 0, scale: 0.6, filter: 'blur(4px)' },
      visible: { opacity: 1, scale: 1, filter: CLEAR },
      exit:    { opacity: 0, scale: 0.8, filter: 'blur(4px)', transition: EXIT },
    },
    // 侧抽屉内容：从外侧被水流带进来，冲过一点再回到位
    edgeEnter: {
      hidden:  (edge) => ({ opacity: 0, x: edge * 2.5, filter: BLUR_EXIT, transition: EXIT }),
      visible: () => ({ opacity: 1, x: 0, filter: CLEAR, transition: { ...ENTER, delay: 0.14 } }),
    },
  },
  transitions: {
    enter:     ENTER,
    overlay:   PANEL,
    backdrop:  { duration: PANEL_FADE, ease: SURFACE },
    // 指示物换位：前沿冲得快、后沿被拖着走，行进中明显拉长，到位后回弹收拢
    move:      spring(520, 30),
    moveTrail: spring(210, 20),
    // 按下像按进水面：松手时带一点回弹
    press:     spring(700, 26),
  },
  // 位移、尺寸、形状的变化：同样的名义时长，换成带回弹的弹簧
  flow: (duration) => ({ type: 'spring', visualDuration: duration * 1.25, bounce: 0.28 }),
  gestures: {
    // 带字的按钮和卡片不缩放（字会抖）：悬停浮起，按下按进纸里，松手带过冲弹回；湿墨从触点洇开见 liquid.css
    press:  { whileHover: { y: -2 }, whileTap: { y: 2 } },
    portal: { whileHover: { y: -4 }, whileTap: { y: 2 } },
    // 发送键只有图标：按下压扁、松手弹回
    sink:   { whileTap: { y: 3, scaleX: 1.06, scaleY: 0.92 } },
  },
  // 流式输出：一滴墨落下、砸开、回弹；湿墨色在之后慢慢干掉
  stream: {
    char: 1.1,
    stagger: 0.022,
    lag: 0.6,
    // 墨珠胀缩一次
    caret: 1.4,
    // 生成结束：墨珠被最后一个字吸收
    caretOut: 0.5,
  },
  // 进入世界的页面转场「洇门」：触点洇开一圈涟漪，旧页沉水，枢纽页浮出；CSS 编排在 liquid.css
  portal: { navigate: 0.42, total: 1.7 },
  fx: {
    // 数值换新：新值穿过扰动的水面浮上来
    burst: 0.9,
    // 整段文字洇开
    decode: 1.0,
    // 完成确认从落下到沉没
    stamp: 2.1,
    // 完成确认沉没
    off: 0.45,
  },
};
