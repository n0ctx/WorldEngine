/**
 * 字模墙：背景氛围的一种（--we-atmosphere-kind: wall），配羊皮纸。整张书桌铺满密排的铅字模，从上往下看是一格格金属小方块：
 * - 每隔十来秒一道波浪从左往右穿过整面墙，被波及的字模跟着起伏一下；
 * - 波浪经过时，排成一个名字的那一片字模抬起、字面提亮、露出朱砂侧面，在墙上拼出这个名字；停几秒后再来一道波把它们压回去；
 * - 指针像按在针画玩具上：周围一片字模被压下去，离开后慢慢浮回。
 * 名字取自全部世界的世界名、角色名、玩家名，字模上的字也从这些名字里取；取不到时用默认词。
 * 颜色：字模取 --we-color-shell-bg 混 --we-atmosphere-color，朱砂侧面取 --we-color-accent；字体取 --we-font-display。
 * 墙压得很淡，画面中间（正文多在这里）再淡一截，直接放在书桌上的字才读得清。
 * 静止的墙只画一次（离屏），每帧只重画动着的格；什么都不动时不重画。AtmosphereLayer 负责循环、暂停与读取主题 token。
 */

const CELL = 22;
const GAP = 2;
const RIPPLE = 4;
const BAND = 160;
const SKEW = 0.3;
const WAVE_TIME = 1.8;
const WAVE_EVERY = [9, 13];
const FIRST = 1.2;
const HOLD = [4, 6];
const SINK_TIME = 1.2;
const RISE = 0.35;
const DROP = 0.22;
const WORD_LIFT = 7;
const PRESS_R = 80;
const PRESS_DEPTH = 3;
const DEFAULT_CHARS = [...'世界引擎卷序章星图归档山河志夜航万书印字'];
const DEFAULT_WORDS = ['世界引擎', '万卷', '山河志'];
const NO_NAMES = [];
const MAX_DPR = 2;
// 墙的浓淡：正文多落在画面中间，中间只留三成半，往四边渐渐回到满浓度
const CENTER_KEEP = 0.35;
const FALLOFF = [0.2, 0.95];
const SETTLED = 0.001;

const between = (rand, [min, max]) => min + rand() * (max - min);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (from, to, t) => from + (to - from) * t;
const mix = (a, b, t) => ({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });
const paint = ({ r, g, b }, alpha = 1) => `rgb(${r | 0} ${g | 0} ${b | 0} / ${alpha})`;
// 带过冲的抬起：先冲过头两成再回到位
const springOut = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(10 * x));

/** 字模的取色：面、亮边、暗边、字、抬起的面、抬起的字、朱砂侧面、起伏的面、坑 */
function looks(colors) {
  const { shell, gold, red } = colors;
  return {
    face: paint(mix(shell, gold, 0.06)),
    rim: paint(gold, 0.08),
    edge: paint(mix(shell, { r: 0, g: 0, b: 0 }, 0.3)),
    glyph: paint(mix(shell, gold, 0.16)),
    lifted: paint(mix(shell, gold, 0.14)),
    liftedGlyph: paint(gold, 0.85),
    side: paint(red, 0.7),
    ripple: paint(mix(shell, gold, 0.04)),
    pit: paint(mix(shell, { r: 0, g: 0, b: 0 }, 0.35)),
  };
}

/** 字模上的字与要拼的名字：字取名字里的字母和汉字，不够六个时补默认字；没有名字时拼默认词 */
export function poolOf(names) {
  const chars = [...new Set(names.flatMap((name) => [...name].filter((ch) => /\p{L}/u.test(ch))))];
  return { chars: chars.length >= 6 ? chars : [...chars, ...DEFAULT_CHARS], words: names.length ? names : DEFAULT_WORDS };
}

/** 一格的浓度：离画面中心越近越淡（按椭圆距离），四边满浓度 */
export function keepAt(x, y, width, height) {
  const d = Math.hypot((x - width / 2) / (width / 2), (y - height / 2) / (height / 2)) / Math.SQRT2;
  const t = clamp01((d - FALLOFF[0]) / (FALLOFF[1] - FALLOFF[0]));
  return CENTER_KEEP + (1 - CENTER_KEEP) * t * t * (3 - 2 * t);
}

function buildGrid(width, height, pool, rand) {
  const cols = Math.ceil(width / CELL) + 1;
  const rows = Math.ceil(height / CELL) + 1;
  const x0 = (width - cols * CELL) / 2;
  const y0 = (height - rows * CELL) / 2;
  const chars = Array.from({ length: cols * rows }, () => pool.chars[Math.floor(rand() * pool.chars.length)]);
  const keep = Float32Array.from(chars, (_, k) => keepAt(x0 + (k % cols + 0.5) * CELL, y0 + (Math.floor(k / cols) + 0.5) * CELL, width, height));
  return { cols, rows, x0, y0, chars, keep, press: new Float32Array(cols * rows) };
}

/** 一格字模：面、上沿亮边、下沿暗边、字 */
function drawSlug(g, x, y, size, ch, style) {
  g.fillStyle = style.face;
  g.fillRect(x, y, size, size);
  g.fillStyle = style.rim;
  g.fillRect(x, y, size, 1);
  g.fillStyle = style.edge;
  g.fillRect(x, y + size - 1, size, 1);
  g.fillStyle = style.glyph;
  g.fillText(ch, x + size / 2, y + size / 2 + 1);
}

function setFont(g, font) {
  Object.assign(g, { font: `600 ${Math.round(CELL * 0.62)}px ${font}`, textAlign: 'center', textBaseline: 'middle' });
}

/** 离屏画布 */
function offscreen(width, height, options) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  return { canvas, g: canvas.getContext('2d', options) };
}

/** 静止的整面墙：只在尺寸、颜色、字池变化时重画 */
function renderWall(grid, look, font, dpr, width, height) {
  const { canvas, g } = offscreen(Math.round(width * dpr), Math.round(height * dpr));
  if (!g) return canvas;
  g.scale(dpr, dpr);
  setFont(g, font);
  const style = { face: look.face, rim: look.rim, edge: look.edge, glyph: look.glyph };
  for (let k = 0; k < grid.chars.length; k++) {
    const x = grid.x0 + (k % grid.cols) * CELL;
    const y = grid.y0 + Math.floor(k / grid.cols) * CELL;
    g.globalAlpha = grid.keep[k];
    drawSlug(g, x, y, CELL - GAP, grid.chars[k], style);
  }
  return canvas;
}

/** 名字落在墙上哪些格：把名字排成大字栅格化到格子分辨率，墨够浓的格算进来 */
function wordMask(grid, word, font, rand) {
  const { g } = offscreen(grid.cols, grid.rows, { willReadFrequently: true });
  const mask = new Uint8Array(grid.cols * grid.rows);
  if (!g) return mask;
  const chars = [...word].slice(0, 6);
  const size = Math.min(grid.rows * 0.42, (grid.cols * 0.8) / chars.length);
  // 只读 alpha，字用什么颜色都一样，取画布默认的黑
  Object.assign(g, { font: `800 ${size}px ${font}`, textAlign: 'center', textBaseline: 'middle' });
  g.fillText(chars.join(''), grid.cols * between(rand, [0.4, 0.6]), grid.rows * between(rand, [0.32, 0.68]));
  const { data } = g.getImageData(0, 0, grid.cols, grid.rows);
  for (let k = 0; k < mask.length; k++) mask[k] = data[k * 4 + 3] > 110 ? 1 : 0;
  return mask;
}

/**
 * 一格此刻的抬起高度：波浪扫过时起伏一下；名字里的格随波抬起（word 为真），停够了随第二道波压回。
 * wave 是 { start, span, hold }，cx 是这一格沿波浪方向的位置。
 */
export function liftAt(wave, t, cx, inWord) {
  if (!wave) return { h: 0 };
  const reach = (cx + BAND) / wave.span;
  const pass = wave.start + reach * WAVE_TIME;
  const u = (t - pass) * (wave.span / WAVE_TIME) / BAND;
  const ripple = u > 0 && u < 1 ? RIPPLE * Math.sin(Math.PI * u) : 0;
  if (!inWord) return { h: ripple };
  const sink = wave.start + WAVE_TIME + wave.hold + reach * SINK_TIME;
  const up = springOut((t - pass) / RISE) * (1 - clamp01((t - sink) / DROP) ** 2);
  return { h: Math.max(ripple, WORD_LIFT * up), word: up > 0.02 };
}

/** 指针把附近的字模压下去：靠近时很快压到位，离开后慢慢浮回；返回这一帧有没有格还在动 */
function updatePress(grid, pointer, dt) {
  let moved = 0;
  for (let k = 0; k < grid.press.length; k++) {
    const x = grid.x0 + (k % grid.cols + 0.5) * CELL;
    const y = grid.y0 + (Math.floor(k / grid.cols) + 0.5) * CELL;
    const d = Math.hypot(x - pointer.x, y - pointer.y);
    const target = pointer.on && d < PRESS_R ? (1 - d / PRESS_R) ** 1.5 : 0;
    const rate = target > grid.press[k] ? 18 : 4;
    const step = (target - grid.press[k]) * Math.min(1, dt * rate);
    grid.press[k] += step;
    moved = Math.max(moved, Math.abs(step));
  }
  return moved > SETTLED;
}

/** 一格动着的字模：先挖出坑，再按高度画朱砂（或金属）侧面和抬起的面；被按下的缩进去、变暗 */
function drawMoving(g, look, x, y, ch, lift, press) {
  const size = CELL - GAP;
  const h = lift.h * (1 - press);
  // 先擦掉静止墙上这一格，半透明画上去时不会叠出重影
  g.clearRect(x, y, size, size);
  g.fillStyle = look.pit;
  g.fillRect(x, y, size, size);
  if (h > 0.3) {
    g.fillStyle = lift.word ? look.side : look.ripple;
    g.fillRect(x, y - h + size * 0.5, size, h + size * 0.5);
    const face = lift.word ? look.lifted : look.face;
    const glyph = lift.word ? look.liftedGlyph : look.glyph;
    drawSlug(g, x, y - h, size, ch, { face, rim: look.rim, edge: look.edge, glyph });
    return;
  }
  const inset = press * PRESS_DEPTH;
  drawSlug(g, x + inset, y + inset, size - inset * 2, ch, { face: look.ripple, rim: look.edge, edge: look.rim, glyph: look.glyph });
}

function startWave(state, rand) {
  const word = state.pool.words[Math.floor(rand() * state.pool.words.length)];
  state.wave = {
    start: state.t,
    span: state.width + BAND * 2 + SKEW * state.height,
    hold: between(rand, HOLD),
    mask: wordMask(state.grid, word, state.font, rand),
  };
}

function waveDone(state) {
  const { wave } = state;
  return wave && state.t > wave.start + WAVE_TIME + wave.hold + SINK_TIME + DROP + RISE;
}

/** 画一帧：整面静止的墙，再把动着的格逐行重画（下面一行抬起会压住上一行） */
function drawFrame(ctx, state) {
  const { grid, wave, t } = state;
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.drawImage(state.wall, 0, 0, state.width, state.height);
  setFont(ctx, state.font);
  for (let k = 0; k < grid.chars.length; k++) {
    const col = k % grid.cols;
    const row = Math.floor(k / grid.cols);
    const x = grid.x0 + col * CELL;
    const y = grid.y0 + row * CELL;
    const lift = liftAt(wave, t, x + SKEW * y, wave?.mask[k] === 1);
    const press = grid.press[k];
    if (lift.h < 0.3 && press < 0.02) continue;
    ctx.globalAlpha = grid.keep[k];
    drawMoving(ctx, state.look, x, y, grid.chars[k], lift, press);
  }
  ctx.globalAlpha = 1;
}

export function createTypeWallScene(canvas, rand = Math.random) {
  const state = {
    width: 0, height: 0, t: 0, dpr: 1,
    names: NO_NAMES, pool: poolOf(NO_NAMES), grid: null, wall: null, look: null, colorKey: '', font: 'serif',
    wave: null, nextWave: FIRST, pointer: { x: 0, y: 0, on: false }, still: false,
  };

  function onPointer(event) {
    const rect = canvas.getBoundingClientRect();
    state.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, on: true };
  }
  // 指针移出窗口：按下的字模浮回
  function onOut(event) {
    if (!event.relatedTarget) state.pointer = { ...state.pointer, on: false };
  }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerout', onOut);

  function rebuild() {
    if (!state.width || !state.look) return;
    state.grid = buildGrid(state.width, state.height, state.pool, rand);
    state.wall = renderWall(state.grid, state.look, state.font, state.dpr, state.width, state.height);
    state.wave = null;
    state.still = false;
  }

  return {
    resize(width, height) {
      state.width = width;
      state.height = height;
      // 与 AtmosphereLayer 的画布分辨率一致，离屏的墙才不糊
      state.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      rebuild();
    },
    read(readColor, readValue, names = NO_NAMES) {
      if (names !== state.names) {
        state.names = names;
        state.pool = poolOf(names.filter(Boolean));
        state.colorKey = '';
      }
      const shell = readColor('--we-color-shell-bg');
      const gold = readColor('--we-atmosphere-color');
      const red = readColor('--we-color-accent');
      const font = readValue('--we-font-display') || 'serif';
      if (!shell || !gold || !red) return;
      const key = JSON.stringify([shell, gold, red, font]);
      if (key === state.colorKey) return;
      state.colorKey = key;
      state.look = looks({ shell, gold, red });
      state.font = font;
      rebuild();
    },
    frame(ctx, dt) {
      if (!state.grid) return;
      state.t += dt;
      if (!state.wave && state.t >= state.nextWave) startWave(state, rand);
      if (waveDone(state)) {
        state.wave = null;
        state.nextWave = state.t + between(rand, WAVE_EVERY);
      }
      const pressing = updatePress(state.grid, state.pointer, dt);
      // 什么都不动时只在刚静下来的那一帧重画一次
      if (state.still && !state.wave && !pressing) return;
      drawFrame(ctx, state);
      state.still = !state.wave && !pressing;
    },
    dispose() {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerout', onOut);
    },
  };
}
