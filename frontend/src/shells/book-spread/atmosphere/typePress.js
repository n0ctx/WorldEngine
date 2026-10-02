/**
 * 素压：背景氛围的一种（--we-atmosphere-kind: press），配羊皮纸。每隔几秒，画面左右边缘压下一行名字，不上墨、只压出凹痕：
 * - 汉字名竖排、一字一字从上往下落，西文名整行转 90° 像书脊；字只有画面高的百分之几，同屏最多六行；
 * - 每个字下落时只看到一团影子由虚变实、向落点收拢（重力加速）；
 * - 接触：凹印整块出现，顿两帧再压过头、回弹；下沿的光边被灯擦成金色后退成微光，四边挤出一点尘；
 * - 凹痕在十来秒里慢慢变平、淡出；约五次里有一次是一方淡朱印。
 * 压的名字取自全部世界的世界名、角色名、玩家名，取不到时用默认词；中间的阅读区不落。
 * 颜色：光边取 --we-atmosphere-color，暗边与影子取 --we-atmosphere-shade，朱印取 --we-color-accent。
 * 步进与绘制不依赖 React；AtmosphereLayer 负责循环、暂停与读取主题 token，经 createPressScene 驱动。
 */
import { approachColor, createMoteSpriteCache, releaseMoteSprite } from './lightDust.js';

const DEFAULT_LINES = ['世界引擎', '卷一', '序章', '星图', '归档', '山河志', '夜航', '万卷'];
const DEFAULT_SEALS = ['世界之印', '万卷', '藏书', '如意', '神游'];
const NO_NAMES = [];
const HAN_NAME = /^\p{Script=Han}+$/u;
const LETTER = /\p{L}/u;
const LATIN = /\p{Script=Latin}/u;
const MAX_LINE = 8;
const MAX_LATIN_LINE = 24;

// 一个字的节拍（秒）：落下、顿两帧、压过头、回弹平复；光边从金色退成微光；一行停留后一起淡出
const FALL = [0.5, 0.65];
const STAGGER = 0.08;
const HOLD = 0.04;
const PRESS = 0.08;
const SETTLE = 0.48;
const RIM = 1.2;
const LIFE = [10, 14];
const FADE = 3;
const INTERVAL = [2.5, 4.5];
const FIRST = 0.8;
const MAX_MARKS = 6;
const SEAL_SHARE = 0.2;
// 字号、印的边长占画面高度的比例；一行的中心只在左右两侧的窄带里，上下留边
const GLYPH_SIZE = [0.035, 0.055];
const LEADING = 1.12;
const SEAL_SIZE = [0.07, 0.1];
const EDGE_BAND = [0.025, 0.14];
const ROW_MARGIN = 0.08;
// 凹痕深度：压过头时最深，回弹后停在常态，随后慢慢变平
const DEPTH_PEAK = 1.3;
const DEPTH_REST = 1;
const DUST_PER_GLYPH = 3;
const DUST_PER_SEAL = 8;
const DUST_FRICTION = 6;
const WARM_WHITE = { r: 255, g: 248, b: 228 };
const between = (rand, [min, max]) => min + rand() * (max - min);
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const easeOut = (x) => 1 - (1 - x) ** 3;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const rgba = (c, a) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;

/** 纸纹缺口：边缘多、印面少，随机挖掉几处，像纸面没吃上印泥 */
function erodeSeal(g, w, h, size, border, rand) {
  g.globalCompositeOperation = 'destination-out';
  const specks = Math.round(size * 2.2);
  for (let i = 0; i < specks; i++) {
    let x = rand() * w;
    let y = rand() * h;
    if (rand() < 0.65) {
      const inset = rand() ** 2 * border * 1.6;
      const side = Math.floor(rand() * 4);
      if (side === 0) y = inset;
      else if (side === 1) y = h - inset;
      else if (side === 2) x = inset;
      else x = w - inset;
    }
    g.globalAlpha = 0.4 + rand() * 0.6;
    g.beginPath();
    g.arc(x, y, (0.3 + rand() * rand() * 1.6) * (size / 60), 0, Math.PI * 2);
    g.fill();
  }
}

/** 朱砂印面：阴文（满底挖字）或阳文（边框加字），字按右列起、自上而下排 */
function createSealSprite(text, size, color, font, rand, doc = document) {
  const chars = [...text];
  const cols = chars.length === 4 ? 2 : 1;
  const rows = chars.length === 1 ? 1 : 2;
  const w = cols === 1 && rows === 2 ? size * 0.62 : size;
  const h = size;
  const res = 2;
  const canvas = doc.createElement('canvas');
  canvas.width = Math.ceil(w * res);
  canvas.height = Math.ceil(h * res);
  const g = canvas.getContext('2d');
  if (!g) return { canvas, w, h };
  g.scale(res, res);
  const yin = rand() < 0.55;
  const border = size * 0.07;
  g.fillStyle = rgba(color, 1);
  g.strokeStyle = rgba(color, 1);
  if (yin) {
    g.beginPath();
    g.roundRect(0, 0, w, h, size * 0.05);
    g.fill();
  } else {
    g.lineWidth = border;
    g.strokeRect(border / 2, border / 2, w - border, h - border);
  }
  const cellW = (w - border * 3) / cols;
  const cellH = (h - border * 3) / rows;
  g.font = `700 ${Math.min(cellW, cellH) * 0.92}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.globalCompositeOperation = yin ? 'destination-out' : 'source-over';
  chars.forEach((ch, i) => {
    const col = cols - 1 - Math.floor(i / rows);
    const row = i % rows;
    g.fillText(ch, border * 1.5 + cellW * (col + 0.5), border * 1.5 + cellH * (row + 0.5));
  });
  erodeSeal(g, w, h, size, border, rand);
  return { canvas, w, h };
}

/** 一行（或一方印）全部落完、停留、淡出完的时刻 */
const endOf = (mark) => mark.fall + mark.units[mark.units.length - 1].delay + mark.life + FADE;

/** 接触后的凹痕深度：顿住 → 压过头 → 回弹到常态 → 随停留慢慢变平 */
function depthAt(mark, since) {
  if (since < HOLD) return DEPTH_REST;
  if (since < HOLD + PRESS) return DEPTH_REST + (DEPTH_PEAK - DEPTH_REST) * easeOut((since - HOLD) / PRESS);
  const settle = since - HOLD - PRESS;
  if (settle < SETTLE) return DEPTH_PEAK + (DEPTH_REST - DEPTH_PEAK) * easeOut(settle / SETTLE);
  return DEPTH_REST * (1 - 0.5 * clamp(since / mark.life, 0, 1));
}

/** 在一侧边缘的窄带里找落点（整行的中心），上下不出画；和已有的行叠在一起就换个位置再试，挤不下就这一行不落 */
function findSpot(state, side, w, h, gap) {
  const { width, height, rand, marks } = state;
  const top = ROW_MARGIN * height + h / 2;
  const bottom = (1 - ROW_MARGIN) * height - h / 2;
  for (let i = 0; i < 8; i++) {
    const band = between(rand, EDGE_BAND) * width;
    const x = side < 0 ? band : width - band;
    const y = bottom > top ? top + rand() * (bottom - top) : height / 2;
    if (!marks.some((m) => Math.abs(m.x - x) < (m.w + w) / 2 + gap && Math.abs(m.y - y) < (m.h + h) / 2 + gap)) return { x, y };
  }
  return null;
}

/** 名字截到一行压得下的长度：竖排按字截，西文截在词边上 */
function clip(raw) {
  const chars = [...raw.trim()];
  if (!LATIN.test(raw)) return chars.slice(0, MAX_LINE).join('');
  if (chars.length <= MAX_LATIN_LINE) return chars.join('');
  const cut = chars.slice(0, MAX_LATIN_LINE + 1).join('');
  return cut.slice(0, cut.lastIndexOf(' ')).trim() || cut.slice(0, MAX_LATIN_LINE);
}

/**
 * 从名字里挑要压的行和印：竖排的最长取 8 个字、西文最长 24 个字符，含字母或汉字的名字都能压；
 * 一、二、四个字的纯汉字名直接刻成印，三个字的照私印的习惯补一个「印」。都挑不出来时用默认词。
 */
export function poolsFrom(names) {
  const lines = new Set();
  const seals = new Set();
  for (const raw of names) {
    const name = clip(raw);
    if (!LETTER.test(name)) continue;
    lines.add(name);
    if (!HAN_NAME.test(name)) continue;
    const length = [...name].length;
    if ([1, 2, 4].includes(length)) seals.add(name);
    else if (length === 3) seals.add(`${name}印`);
  }
  return {
    lines: lines.size ? [...lines] : DEFAULT_LINES,
    seals: seals.size ? [...seals] : DEFAULT_SEALS,
  };
}

/** 挑一行画面上还没有的；名字都已经在画面上时允许重复 */
function pickLine(state) {
  const shown = new Set(state.marks.map((m) => m.text));
  const fresh = state.pools.lines.filter((line) => !shown.has(line));
  return pick(state.rand, fresh.length ? fresh : state.pools.lines);
}

/**
 * 一行字拆成逐个落下的单元：汉字等竖排，一字一格、自上而下错开；含拉丁字母的整行转 90° 当一个单元。
 * 单元的 w / h 是它在屏幕上占的框（转过之后的），dx / dy 是相对整行中心的位置。
 */
function makeLine(state, ctx) {
  const { rand, height } = state;
  const text = pickLine(state);
  const size = clamp(between(rand, GLYPH_SIZE) * height, 22, 48);
  const font = `600 ${size}px ${state.fonts.type}`;
  const base = { kind: 'line', text, font, size, fall: between(rand, FALL), life: between(rand, LIFE), t: 0 };
  if (LATIN.test(text)) {
    ctx.font = font;
    const length = ctx.measureText(text).width;
    return { ...base, w: size * 1.2, h: length, units: [{ ch: text, dx: 0, dy: 0, w: size * 1.2, h: length, delay: 0, rot: Math.PI / 2 }] };
  }
  const chars = [...text].filter((ch) => ch.trim());
  const step = size * LEADING;
  const units = chars.map((ch, i) => ({ ch, dx: 0, dy: (i - (chars.length - 1) / 2) * step, w: size, h: step, delay: i * STAGGER, rot: 0 }));
  return { ...base, w: size * 1.1, h: chars.length * step, units };
}

function makeSeal(state) {
  const { rand } = state;
  const size = clamp(between(rand, SEAL_SIZE) * state.height, 48, 100);
  const sprite = createSealSprite(pick(rand, state.pools.seals), size, state.colors.seal, state.fonts.seal, rand);
  const unit = { dx: 0, dy: 0, w: sprite.w, h: sprite.h, delay: 0, rot: (rand() - 0.5) * 0.24 };
  return { kind: 'seal', text: '', sprite: sprite.canvas, size, w: sprite.w, h: sprite.h, units: [unit], fall: between(rand, FALL), life: between(rand, LIFE), t: 0 };
}

function spawn(state, ctx) {
  if (state.marks.length >= MAX_MARKS) return null;
  const seal = state.rand() < SEAL_SHARE && !state.marks.some((m) => m.kind === 'seal');
  const mark = seal ? makeSeal(state) : makeLine(state, ctx);
  state.side = -state.side;
  const spot = findSpot(state, state.side, mark.w, mark.h, mark.size * 0.8);
  if (!spot) {
    if (seal) releaseMoteSprite(mark.sprite);
    return null;
  }
  Object.assign(mark, spot);
  state.marks.push(mark);
  return mark;
}

/** 一个单元接触桌面的瞬间：尘从它的四边挤出去，摩擦急停 */
function squeezeDust(state, mark, unit) {
  const { rand, dust } = state;
  const strength = Math.sqrt(mark.size / 60);
  const count = mark.kind === 'seal' ? DUST_PER_SEAL : DUST_PER_GLYPH;
  for (let i = 0; i < count; i++) {
    const side = Math.floor(rand() * 4);
    const along = rand() - 0.5;
    const nx = [0, 0, -1, 1][side];
    const ny = [-1, 1, 0, 0][side];
    const speed = (30 + rand() * 70) * strength;
    dust.push({
      x: mark.x + unit.dx + (nx ? (nx * unit.w) / 2 : along * unit.w),
      y: mark.y + unit.dy + (ny ? (ny * unit.h) / 2 : along * unit.h),
      vx: nx * speed,
      vy: ny * speed,
      r: 0.6 + rand() * 1,
      age: 0,
      life: 0.8 + rand() * 1,
    });
  }
}

/** 按秒推进：每个字落到桌面的那一帧挤出尘，淡出完的行收走；尘摩擦急停后淡掉。原地修改以免每帧分配。 */
export function stepPress(state, dt) {
  for (const mark of state.marks) {
    const before = mark.t;
    mark.t += dt;
    for (const unit of mark.units) {
      const contact = mark.fall + unit.delay;
      if (before < contact && mark.t >= contact) squeezeDust(state, mark, unit);
    }
  }
  state.marks = state.marks.filter((mark) => {
    if (mark.t < endOf(mark)) return true;
    if (mark.kind === 'seal') releaseMoteSprite(mark.sprite);
    return false;
  });
  const decay = Math.exp(-DUST_FRICTION * dt);
  for (let i = state.dust.length - 1; i >= 0; i--) {
    const d = state.dust[i];
    d.age += dt;
    d.vx *= decay;
    d.vy *= decay;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.age > d.life) state.dust.splice(i, 1);
  }
}

/** 还在空中的单元只画影子：离桌越高越大、越虚、越淡。用离屏的块投影，只留下影子本身 */
function drawShadow(ctx, mark, unit, shade, px) {
  const t = mark.t - unit.delay;
  if (t < 0) return;
  const p = clamp(t / mark.fall, 0, 1);
  const altitude = 1 - p * p;
  const scale = 1 + 0.3 * altitude;
  const w = unit.w * scale;
  const h = unit.h * scale;
  const away = 10000;
  ctx.save();
  ctx.shadowColor = rgba(shade, (0.15 + 0.4 * p) * clamp(p / 0.3, 0, 1));
  ctx.shadowBlur = (2 + mark.size * 0.5 * altitude) * px;
  ctx.shadowOffsetX = (away + mark.size * 0.25 * altitude) * px;
  ctx.shadowOffsetY = mark.size * 0.35 * altitude * px;
  ctx.fillStyle = rgba(shade, 1);
  ctx.beginPath();
  ctx.roundRect(mark.x + unit.dx - w / 2 - away, mark.y + unit.dy - h / 2, w, h, mark.size * 0.06);
  ctx.fill();
  ctx.restore();
}

/** 素压的字：上沿暗边、下沿光边，字心挖空露出桌面再压一层薄暗，像压进去的 */
function drawGlyph(ctx, mark, unit, colors, since, alpha) {
  const d = Math.max(0.8, mark.size * 0.035) * depthAt(mark, since);
  const rim = since < RIM ? 0.15 + 0.75 * (1 - since / RIM) ** 2 : 0.15;
  const light = mix(colors.foil, WARM_WHITE, 0.35);
  ctx.font = mark.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba(colors.shade, 0.85);
  ctx.fillText(unit.ch, -d * 0.6, -d);
  ctx.fillStyle = rgba(light, rim);
  ctx.fillText(unit.ch, d * 0.4, d);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillText(unit.ch, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba(colors.shade, 0.18);
  ctx.fillText(unit.ch, 0, 0);
}

function drawSeal(ctx, mark, since, alpha) {
  ctx.globalAlpha = alpha * 0.55;
  ctx.drawImage(mark.sprite, -mark.w / 2, -mark.h / 2, mark.w, mark.h);
  if (since >= RIM) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * 0.5 * (1 - since / RIM) ** 2;
  ctx.drawImage(mark.sprite, -mark.w / 2, -mark.h / 2, mark.w, mark.h);
}

/** 已经落下的单元画成凹痕或朱印；一行一起淡出 */
function drawMark(ctx, mark, colors) {
  const alpha = clamp((endOf(mark) - mark.t) / FADE, 0, 1) ** 2;
  for (const unit of mark.units) {
    const since = mark.t - mark.fall - unit.delay;
    if (since < 0) continue;
    ctx.save();
    ctx.translate(mark.x + unit.dx, mark.y + unit.dy);
    ctx.rotate(unit.rot);
    if (mark.kind === 'seal') drawSeal(ctx, mark, since, alpha);
    else drawGlyph(ctx, mark, unit, colors, since, alpha);
    ctx.restore();
  }
}

/** 画一帧：先画桌上的印（字心挖空会擦掉下面的东西，所以最先画），再画尘和还在空中的影子 */
export function drawPress(ctx, state, sprite) {
  const px = ctx.getTransform().a;
  ctx.clearRect(0, 0, state.width, state.height);
  for (const mark of state.marks) drawMark(ctx, mark, state.colors);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const d of state.dust) {
    ctx.globalAlpha = 0.6 * (1 - d.age / d.life) ** 1.5;
    const s = d.r * 6;
    ctx.drawImage(sprite, d.x - s / 2, d.y - s / 2, s, s);
  }
  ctx.restore();
  for (const mark of state.marks) {
    for (const unit of mark.units) if (mark.t < mark.fall + unit.delay) drawShadow(ctx, mark, unit, state.colors.shade, px);
  }
}

/**
 * 素压场景：AtmosphereLayer 每帧调 frame，每秒调 read 重读颜色、字体和名字；dispose 时释放贴图。
 * read(readColor, readValue, names)：readColor 把 token 换成 {r,g,b}，readValue 取 token 原文，names 是要压的名字。
 */
export function createPressScene(_canvas, rand = Math.random) {
  const state = {
    rand, width: 0, height: 0, side: rand() < 0.5 ? -1 : 1, spawnIn: FIRST,
    colors: null, fonts: { type: 'serif', seal: 'serif' }, marks: [], dust: [],
    names: NO_NAMES, pools: poolsFrom(NO_NAMES),
  };
  let target = null;
  const sprites = createMoteSpriteCache();

  return {
    resize(width, height) {
      state.width = width;
      state.height = height;
    },
    read(readColor, readValue, names = NO_NAMES) {
      if (names !== state.names) {
        state.names = names;
        state.pools = poolsFrom(names);
      }
      const foil = readColor('--we-atmosphere-color');
      const shade = readColor('--we-atmosphere-shade');
      const seal = readColor('--we-color-accent');
      if (foil && shade && seal) target = { foil, shade, seal };
      state.fonts = { type: readValue('--we-font-prose') || 'serif', seal: readValue('--we-font-display') || 'serif' };
    },
    frame(ctx, dt) {
      if (!target) return;
      const prev = state.colors;
      state.colors = prev
        ? { foil: approachColor(prev.foil, target.foil, dt), shade: approachColor(prev.shade, target.shade, dt), seal: target.seal }
        : target;
      state.spawnIn -= dt;
      if (state.spawnIn <= 0) {
        spawn(state, ctx);
        state.spawnIn = between(rand, INTERVAL);
      }
      stepPress(state, dt);
      drawPress(ctx, state, sprites.get(state.colors.foil));
    },
    dispose() {
      sprites.release();
      for (const mark of state.marks) if (mark.kind === 'seal') releaseMoteSprite(mark.sprite);
      state.marks = [];
    },
  };
}
