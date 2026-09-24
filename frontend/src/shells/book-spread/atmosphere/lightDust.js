/**
 * 光尘：从左上斜入的两道光（一道宽而淡、一道窄而亮），光里漂着缓慢上浮的微尘。
 * 纯绘制与步进逻辑，不依赖 React；AtmosphereLayer 负责循环、暂停与读取主题 token。
 */

// 光束方向：自左上向右下，与水平线约 62°
const SHAFT_ANGLE = (62 * Math.PI) / 180;
const SHAFT_DIR = { x: Math.cos(SHAFT_ANGLE), y: Math.sin(SHAFT_ANGLE) };
// 光源锚点（相对画面宽高），偏左上，落在内容区之外
const SHAFT_ORIGIN = { x: 0.18, y: -0.08 };
// 两道光：width 为半宽（相对画面长边），tilt 为相对主方向的偏角（度），alpha 为轴心强度
const SHAFTS = [
  { width: 0.2, tilt: 0, alpha: 0.16, phase: 0 },
  { width: 0.045, tilt: -4, alpha: 0.22, phase: 2.1 },
];

export function moteCountFor(width) {
  return width < 640 ? 36 : 90;
}

function spawnMote(width, height, rand, anywhere) {
  return {
    x: rand() * width,
    y: anywhere ? rand() * height : height + rand() * 40,
    r: 0.8 + rand() * rand() * 3.2,
    vy: 4 + rand() * 10,
    drift: 6 + rand() * 14,
    phase: rand() * Math.PI * 2,
    twinkle: 0.4 + rand() * 0.9,
  };
}

export function createMotes(count, width, height, rand = Math.random) {
  return Array.from({ length: count }, () => spawnMote(width, height, rand, true));
}

/** 按秒推进：上浮 + 正弦横漂；飘出顶部的从底部重新进场。原地修改以免每帧分配。 */
export function stepMotes(motes, dt, width, height, rand = Math.random) {
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i];
    m.phase += dt * 0.5;
    m.y -= m.vy * dt;
    m.x += Math.sin(m.phase) * m.drift * dt;
    if (m.y < -12 || m.x < -24 || m.x > width + 24) motes[i] = spawnMote(width, height, rand, false);
  }
}

/** 点到光束中轴的归一化距离：0 在轴上，1 在光束边缘，越远越大 */
function shaftDistance(x, y, width, height, halfWidth) {
  const ox = SHAFT_ORIGIN.x * width;
  const oy = SHAFT_ORIGIN.y * height;
  const dx = x - ox;
  const dy = y - oy;
  return Math.abs(dx * SHAFT_DIR.y - dy * SHAFT_DIR.x) / halfWidth;
}

/** 预渲染一颗柔光点，绘制时按半径缩放，避免每颗尘每帧新建径向渐变 */
export function createMoteSprite(color, doc = document) {
  const size = 64;
  const sprite = doc.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
  g.addColorStop(0.25, `rgba(${color.r}, ${color.g}, ${color.b}, 0.55)`);
  g.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

/**
 * 画一帧。time 以秒计，驱动光束的慢速呼吸。
 * color 为 {r,g,b}；整体强度由 CSS 的 opacity 按场景控制，这里按满强度画。
 */
export function drawFrame(ctx, { motes, sprite, width, height, color, time }) {
  ctx.clearRect(0, 0, width, height);

  const reach = Math.hypot(width, height) * 1.1;
  const longSide = Math.max(width, height);
  const halfWidth = longSide * SHAFTS[0].width;
  const ox = SHAFT_ORIGIN.x * width;
  const oy = SHAFT_ORIGIN.y * height;
  const rgb = `${color.r}, ${color.g}, ${color.b}`;

  // 光束：在沿光束方向旋转、再横向压扁的坐标系里画一个径向渐变，
  // 得到一道横向和纵向都平滑衰减的光锥，边缘干净，不会糊成一团
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const shaft of SHAFTS) {
    const breathe = 0.78 + 0.22 * Math.sin(time * 0.35 + shaft.phase);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(SHAFT_ANGLE - Math.PI / 2 + (shaft.tilt * Math.PI) / 180);
    ctx.scale((longSide * shaft.width) / reach, 1);
    const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    const a = shaft.alpha * breathe;
    cone.addColorStop(0, `rgba(${rgb}, ${a})`);
    cone.addColorStop(0.35, `rgba(${rgb}, ${a * 0.55})`);
    cone.addColorStop(0.7, `rgba(${rgb}, ${a * 0.15})`);
    cone.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = cone;
    ctx.fillRect(-reach, 0, reach * 2, reach);
    ctx.restore();
  }
  ctx.restore();

  // 微尘：落在光束里的亮，光束外的只剩一点余光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    const d = shaftDistance(m.x, m.y, width, height, halfWidth);
    const lit = d < 1 ? 1 - d * 0.6 : 0.28;
    const twinkle = 0.55 + 0.45 * Math.sin(m.phase * m.twinkle * 3);
    ctx.globalAlpha = Math.min(1, lit * twinkle * 0.9);
    const s = m.r * 6;
    ctx.drawImage(sprite, m.x - s / 2, m.y - s / 2, s, s);
  }
  ctx.restore();
}

/** 颜色缓动：约 1 秒内基本到位，换世界 / 悬停换入口时氛围慢慢换色而不是跳变 */
export function approachColor(current, target, dt) {
  const k = 1 - Math.exp(-dt * 2.4);
  return {
    r: current.r + (target.r - current.r) * k,
    g: current.g + (target.g - current.g) * k,
    b: current.b + (target.b - current.b) * k,
  };
}
