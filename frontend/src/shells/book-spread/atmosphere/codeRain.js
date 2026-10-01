/**
 * 代码雨：背景氛围的一种（--we-atmosphere-kind: rain）。步进与绘制不依赖 React；
 * AtmosphereLayer 负责循环、暂停与读取主题 token，经 createRainScene 驱动。
 * - 三层景深：远层字小、暗、慢，近层字大、亮、快，近层雨头带辉光；
 * - 多数雨列是系统色（--we-atmosphere-shade 的色相），少数是主色（随世界封面）；
 * - 字形是镜像的半角片假名与数字，字钉在格子上不动，雨头经过时点亮、拖出渐暗的尾巴；
 * - 指针附近的雨变亮、换字更快；点击在指针处炸开一圈冲击波，扫过的字闪白并被推开。
 */

const GLYPHS = [...'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:."=*+<>¦'];
// size 为字号（也是格宽），density 为一列有雨的概率，speed 为每秒落下的格数，trail 为尾巴格数
const LAYERS = [
  { size: 11, density: 0.55, speed: [5, 9], trail: [12, 26], alpha: 0.32, glow: 0 },
  { size: 15, density: 0.32, speed: [8, 14], trail: [8, 20], alpha: 0.62, glow: 0 },
  { size: 22, density: 0.12, speed: [13, 21], trail: [6, 13], alpha: 1, glow: 14 },
];
const ACCENT_SHARE = 0.22;
const MUTATE_PER_SECOND = 0.08;
const SPOT_RADIUS = 220;
const SPOT_MUTATE_BOOST = 8;
const WAVE_SPEED = 900;
const WAVE_WIDTH = 70;
const WAVE_LIFE = 1.1;
const WAVE_PUSH = 10;
const MAX_WAVES = 4;
// 雨按 30 帧推进：一格一格地落，比满帧刷新更像终端
const FRAME_SECONDS = 1 / 30;

const between = (rand, [min, max]) => min + rand() * (max - min);
const randomGlyph = (rand) => Math.floor(rand() * GLYPHS.length);

function resetDrop(drop, rand, anywhere) {
  drop.trail = Math.round(between(rand, drop.layer.trail));
  drop.speed = between(rand, drop.layer.speed);
  drop.accent = rand() < ACCENT_SHARE;
  drop.y = anywhere ? rand() * (drop.rows + drop.trail) : -rand() * drop.rows * 0.6;
}

export function createRain(width, height, rand = Math.random) {
  const drops = [];
  for (const layer of LAYERS) {
    const rows = Math.ceil(height / layer.size);
    for (let x = layer.size / 2; x < width; x += layer.size) {
      if (rand() >= layer.density) continue;
      const drop = { x, layer, rows, glyphs: Array.from({ length: rows }, () => randomGlyph(rand)) };
      resetDrop(drop, rand, true);
      drops.push(drop);
    }
  }
  return drops;
}

export function addWave(waves, x, y) {
  waves.push({ x, y, t: 0 });
  if (waves.length > MAX_WAVES) waves.shift();
}

/** 按秒推进：雨落下、落出底部的从顶上重来；格子里的字随机换，指针附近换得更快。原地修改以免每帧分配。 */
export function stepRain(drops, waves, dt, { width, pointer }, rand = Math.random) {
  for (const drop of drops) {
    drop.y += drop.speed * dt;
    if (drop.y - drop.trail > drop.rows) resetDrop(drop, rand, false);
    const near = pointer && Math.abs(width - drop.x - pointer.x) < SPOT_RADIUS;
    let mutations = drop.rows * dt * MUTATE_PER_SECOND * (near ? SPOT_MUTATE_BOOST : 1);
    while (mutations > rand()) {
      drop.glyphs[Math.floor(rand() * drop.rows)] = randomGlyph(rand);
      mutations -= 1;
    }
  }
  for (const wave of waves) wave.t += dt;
  while (waves.length && waves[0].t > WAVE_LIFE) waves.shift();
}

/** 冲击波在这一点的强度（0–1）与外推方向 */
function waveAt(waves, x, y) {
  let strength = 0;
  let dx = 0;
  let dy = 0;
  for (const wave of waves) {
    const distance = Math.hypot(x - wave.x, y - wave.y) || 1;
    const offRing = Math.abs(distance - wave.t * WAVE_SPEED);
    if (offRing >= WAVE_WIDTH) continue;
    const s = (1 - offRing / WAVE_WIDTH) * (1 - wave.t / WAVE_LIFE);
    if (s > strength) {
      strength = s;
      dx = (x - wave.x) / distance;
      dy = (y - wave.y) / distance;
    }
  }
  return { strength, dx, dy };
}

const tint = ({ r, g, b }, white = 0) =>
  `rgb(${Math.round(r + (255 - r) * white)}, ${Math.round(g + (255 - g) * white)}, ${Math.round(b + (255 - b) * white)})`;

/**
 * 画一帧。colors 为 { system, accent }，各是 {r,g,b}；整体强度由 CSS 的 opacity 按场景控制，这里按满强度画。
 * 整个画面水平镜像（字形镜像），所以屏幕上的横坐标是 width - x。
 */
export function drawRain(ctx, { drops, waves, width, height, colors, pointer }, rand = Math.random) {
  ctx.clearRect(0, 0, width, height);
  const paint = {
    system: [tint(colors.system), tint(colors.system, 0.75)],
    accent: [tint(colors.accent), tint(colors.accent, 0.75)],
  };
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let layer = null;
  for (const drop of drops) {
    if (drop.layer !== layer) {
      layer = drop.layer;
      ctx.font = `${layer.size}px ui-monospace, Menlo, monospace`;
    }
    const [body, head] = drop.accent ? paint.accent : paint.system;
    const screenX = width - drop.x;
    const headRow = Math.floor(drop.y);
    for (let k = 0; k <= drop.trail; k++) {
      const row = headRow - k;
      if (row < 0 || row >= drop.rows) continue;
      const y = row * layer.size;
      let alpha = layer.alpha * (1 - k / (drop.trail + 1)) ** 1.5;
      if (pointer) alpha *= 0.6 + 1.2 * Math.max(0, 1 - Math.hypot(screenX - pointer.x, y - pointer.y) / SPOT_RADIUS);
      const wave = waveAt(waves, screenX, y);
      const lit = k === 0 || wave.strength > 0.4;
      ctx.globalAlpha = Math.min(1, alpha * (lit ? 1.6 : 1) + wave.strength);
      ctx.fillStyle = lit ? head : body;
      if (k === 0 && layer.glow) {
        ctx.shadowColor = body;
        ctx.shadowBlur = layer.glow;
      }
      const glyph = k === 0 ? randomGlyph(rand) : drop.glyphs[row];
      ctx.fillText(GLYPHS[glyph], drop.x - wave.dx * wave.strength * WAVE_PUSH, y + wave.dy * wave.strength * WAVE_PUSH);
      if (k === 0 && layer.glow) ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}

/**
 * 代码雨场景：AtmosphereLayer 每帧调 frame，每秒调 read 重读颜色；dispose 时撤掉指针监听。
 * 指针坐标按画布自己的位置换算，画布不铺满窗口（设计实验室的演示盒）时也对得上。
 */
export function createRainScene(canvas) {
  const waves = [];
  let drops = [];
  let width = 0;
  let height = 0;
  let colors = null;
  let pointer = null;
  let pending = 0;

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return x >= 0 && y >= 0 && x <= rect.width && y <= rect.height ? { x, y } : null;
  }
  const onMove = (event) => { pointer = localPoint(event); };
  const onDown = (event) => {
    const point = localPoint(event);
    if (point) addWave(waves, point.x, point.y);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });

  return {
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      drops = createRain(width, height);
    },
    read(readColor) {
      const system = readColor('--we-atmosphere-shade');
      const accent = readColor('--we-atmosphere-color');
      if (system && accent) colors = { system, accent };
    },
    frame(ctx, dt) {
      if (!colors) return;
      pending += dt;
      if (pending < FRAME_SECONDS) return;
      stepRain(drops, waves, pending, { width, pointer });
      drawRain(ctx, { drops, waves, width, height, colors, pointer });
      pending = 0;
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    },
  };
}
