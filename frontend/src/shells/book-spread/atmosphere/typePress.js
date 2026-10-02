/**
 * 印台：背景氛围的一种（--we-atmosphere-kind: press），配羊皮纸。深色书桌是一张印台，铅字和印章不时从空中落下，压出一记「印」：
 * - 下落：离桌越高块越大、投影越远越虚；重力加速，越近影子越实；
 * - 接触：顿两帧，再压过头一下，块随即抬走，露出烫金凹印（印章是朱砂平印）；块底的尘从四边挤出去，摩擦急停；
 * - 凹印约 480ms 平复成浅印，停留几秒后淡出；偶尔一整行连续落下，像排字；
 * - 点击在指针处盖一方朱印。
 * 颜色：烫金取 --we-atmosphere-color（随世界封面），暗部取 --we-atmosphere-shade，朱砂取 --we-color-accent。
 * 步进与绘制不依赖 React；AtmosphereLayer 负责循环、暂停与读取主题 token，经 createPressScene 驱动。
 */
import { approachColor, createMoteSpriteCache, releaseMoteSprite } from './lightDust.js';

const HAN = [...'印世界书卷章文字纸墨序史典志梦境天地风山河星月火夜光龙剑城门王灵归'];
const LATIN = [...'ABCDEFGHIKLMNOPRSTVWXYZ&§¶'];
const LARGE = [...'印书卷梦境龙剑灵&§¶'];
const WORDS = ['世界引擎', 'WORLD', '卷一', '序章', 'FIN', 'ANNO', '第一回', '星图', 'LIBER', '归档'];
const SEALS = ['世界之印', '万卷', '藏书', '印', '如意', '神游'];

// 一记印的节拍（秒）：接触后顿两帧、压过头、抬走；凹印平复、白热退去、停留后淡出
const HOLD = 0.04;
const PRESS = 0.06;
const LIFT = 0.08;
const SETTLE = 0.48;
const FLASH = 0.42;
const FADE = 1.8;
const LIFE = [4, 9];
const LINE_STAGGER = 0.09;
const CLICK_FALL = 0.3;
// 块离桌最高时放大的比例、压过头时缩回的比例
const ALTITUDE_SCALE = 0.6;
const OVERSHOOT = 0.035;
// 凹印深度：刚抬起时压得最深，平复后留一层浅印
const DEPTH_PEAK = 1.35;
const DEPTH_REST = 0.5;
// 三档块：size 为字号（全屏时），fall 为下落秒数，dust 为接触时挤出的尘数
const TIERS = {
  small: { size: [22, 32], fall: [0.38, 0.48], alpha: 0.8, dust: 6 },
  medium: { size: [44, 68], fall: [0.5, 0.62], alpha: 0.85, dust: 12 },
  large: { size: [120, 170], fall: [0.72, 0.86], alpha: 0.5, dust: 28 },
};
const SPAWN_INTERVAL = [0.6, 1.4];
const DUST_FRICTION = 7;
const MOTE_FRICTION = 3;
const MAX_DUST = 220;
const INTRO = 0.8;
const WARM_WHITE = { r: 255, g: 248, b: 228 };

const between = (rand, [min, max]) => min + rand() * (max - min);
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const easeOut = (x) => 1 - (1 - x) ** 3;
const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const rgba = (c, a) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** 一块的各个时刻（秒，从生成起算） */
function timesOf(piece) {
  const reveal = piece.fall + HOLD + PRESS;
  return { contact: piece.fall, reveal, end: reveal + piece.life + FADE };
}

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

function overlaps(pieces, x, y, w, h, gap) {
  return pieces.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + gap && Math.abs(p.y - y) < (p.h + h) / 2 + gap);
}

/** 在空处找一个落点（中心坐标）；挤不下就放弃这一记 */
function findSpot(state, w, h) {
  const { pieces, width, height, rand } = state;
  const gap = Math.min(w, h) * 0.4;
  for (let i = 0; i < 12; i++) {
    const x = w >= width ? width / 2 : w / 2 + rand() * (width - w);
    const y = h >= height ? height / 2 : h / 2 + rand() * (height - h);
    if (!overlaps(pieces, x, y, w, h, gap)) return { x, y };
  }
  return null;
}

const sizeOf = (state, tier) => between(state.rand, TIERS[tier].size) * state.unit;

function makeType(state, ctx, glyph, tier, size) {
  const { rand } = state;
  const font = `600 ${size}px ${state.fonts.type}`;
  ctx.font = font;
  const w = Math.max(ctx.measureText(glyph).width, size * 0.5) + size * 0.18;
  return {
    kind: 'type', glyph, font, size, w, h: size * 1.16, tier,
    fall: between(rand, TIERS[tier].fall), alpha: TIERS[tier].alpha, dust: TIERS[tier].dust,
    rot0: (rand() - 0.5) * 0.2, rot: 0, life: between(rand, LIFE), t: 0,
  };
}

function makeSeal(state, size, fall) {
  const { rand } = state;
  const seal = createSealSprite(pick(rand, SEALS), size, state.colors.seal, state.fonts.seal, rand);
  return {
    kind: 'seal', sprite: seal.canvas, size, w: seal.w, h: seal.h, tier: 'medium',
    fall, alpha: 0.9, dust: TIERS.medium.dust,
    rot0: (rand() - 0.5) * 0.4, rot: (rand() - 0.5) * 0.12, life: between(rand, LIFE), t: 0,
  };
}

function addAt(state, piece, spot) {
  piece.x = spot.x;
  piece.y = spot.y;
  state.pieces.push(piece);
}

/** 一整行连续落下：块挨着块，从左到右错开 */
function spawnLine(state, ctx) {
  const tier = state.rand() < 0.7 ? 'small' : 'medium';
  const size = sizeOf(state, tier);
  const sorts = [...pick(state.rand, WORDS)].map((glyph) => makeType(state, ctx, glyph, tier, size));
  const total = sorts.reduce((sum, s) => sum + s.w, 0);
  const spot = total < state.width * 0.9 && findSpot(state, total, sorts[0].h);
  if (!spot) return;
  let x = spot.x - total / 2;
  sorts.forEach((sort, i) => {
    sort.rot0 = 0;
    sort.fall = sorts[0].fall;
    sort.t = -i * LINE_STAGGER;
    addAt(state, sort, { x: x + sort.w / 2, y: spot.y });
    x += sort.w;
  });
}

function randomType(state, ctx, tier) {
  const glyph = pick(state.rand, tier === 'large' ? LARGE : state.rand() < 0.6 ? HAN : LATIN);
  return makeType(state, ctx, glyph, tier, sizeOf(state, tier));
}

function spawn(state, ctx) {
  if (state.pieces.length >= state.cap) return;
  const roll = state.rand();
  if (roll < 0.18) {
    spawnLine(state, ctx);
    return;
  }
  let piece;
  if (roll < 0.3) piece = makeSeal(state, sizeOf(state, 'medium'), between(state.rand, TIERS.medium.fall));
  else if (roll < 0.36 && !state.pieces.some((p) => p.tier === 'large')) piece = randomType(state, ctx, 'large');
  else piece = randomType(state, ctx, state.rand() < 0.62 ? 'small' : 'medium');
  const spot = findSpot(state, piece.w, piece.h);
  if (spot) addAt(state, piece, spot);
  else if (piece.kind === 'seal') releaseMoteSprite(piece.sprite);
}

/** 首帧铺一半的印，已经落定、平复，像桌上本来就有 */
function seed(state, ctx) {
  for (let i = 0; i < Math.round(state.cap * 0.45); i++) {
    const piece = randomType(state, ctx, state.rand() < 0.65 ? 'small' : 'medium');
    const spot = findSpot(state, piece.w, piece.h);
    if (!spot) continue;
    piece.t = timesOf(piece).reveal + SETTLE + state.rand() * piece.life * 0.8;
    addAt(state, piece, spot);
  }
}

function createMotes(width, height, rand) {
  const count = Math.round(clamp((width * height) / 40000, 10, 36));
  return Array.from({ length: count }, () => ({
    x: rand() * width,
    y: rand() * height,
    vx: 0,
    vy: 0,
    r: 0.8 + rand() * rand() * 2.6,
    drift: 3 + rand() * 6,
    phase: rand() * Math.PI * 2,
    twinkle: 0.4 + rand() * 0.9,
  }));
}

/** 接触瞬间：尘从块底四边挤出去 */
function squeezeDust(state, piece, strength) {
  const { rand, dust } = state;
  for (let i = 0; i < piece.dust; i++) {
    const side = Math.floor(rand() * 4);
    const along = rand() - 0.5;
    const nx = [0, 0, -1, 1][side];
    const ny = [-1, 1, 0, 0][side];
    const speed = (40 + rand() * 120) * strength;
    const slide = (rand() - 0.5) * speed * 0.6;
    dust.push({
      x: piece.x + (nx ? (nx * piece.w) / 2 : along * piece.w),
      y: piece.y + (ny ? (ny * piece.h) / 2 : along * piece.h),
      vx: nx * speed + ny * slide,
      vy: ny * speed + nx * slide,
      r: 0.6 + rand() * 1.4 * Math.sqrt(strength),
      age: 0,
      life: 0.9 + rand() * 1.4,
    });
  }
  if (dust.length > MAX_DUST) dust.splice(0, dust.length - MAX_DUST);
}

/** 接触瞬间：附近的浮尘被冲开 */
function pushMotes(state, piece, strength) {
  const reach = piece.size * 3;
  for (const m of state.motes) {
    const dx = m.x - piece.x;
    const dy = m.y - piece.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > reach) continue;
    const push = (1 - d / reach) * 160 * strength;
    m.vx += (dx / d) * push;
    m.vy += (dy / d) * push;
  }
}

function stepPieces(state, dt) {
  for (const piece of state.pieces) {
    const before = piece.t;
    piece.t += dt;
    if (before < piece.fall && piece.t >= piece.fall) {
      squeezeDust(state, piece, piece.size / 40);
      pushMotes(state, piece, piece.size / 40);
    }
  }
  state.pieces = state.pieces.filter((piece) => {
    if (piece.t < timesOf(piece).end) return true;
    if (piece.kind === 'seal') releaseMoteSprite(piece.sprite);
    return false;
  });
}

/** 挤出的尘摩擦急停后慢慢淡掉；浮尘被冲开后回到原来的慢漂 */
function stepDust(state, dt) {
  const { dust, motes, width, height } = state;
  const dustDecay = Math.exp(-DUST_FRICTION * dt);
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.age += dt;
    d.vx *= dustDecay;
    d.vy *= dustDecay;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.age > d.life) dust.splice(i, 1);
  }
  const moteDecay = Math.exp(-MOTE_FRICTION * dt);
  for (const m of motes) {
    m.phase += dt * 0.4;
    m.vx *= moteDecay;
    m.vy *= moteDecay;
    m.x = (m.x + (m.vx + Math.cos(m.phase) * m.drift) * dt + width) % width;
    m.y = (m.y + (m.vy + Math.sin(m.phase * 0.7) * m.drift) * dt + height) % height;
  }
}

function paletteOf({ foil, shade, seal }) {
  return {
    foil,
    shade,
    light: mix(foil, WARM_WHITE, 0.45),
    deep: mix(foil, shade, 0.45),
    metal: [mix(foil, shade, 0.55), mix(foil, shade, 0.82)],
    stone: [mix(mix(seal, shade, 0.6), foil, 0.15), mix(seal, shade, 0.6)],
  };
}

/** 块此刻离桌的高度（0 贴桌，1 最高）、缩放和不透明度：重力下落 → 顿 → 压过头 → 抬走 */
function blockPose(piece) {
  const { contact, reveal } = timesOf(piece);
  const t = piece.t;
  if (t < contact) {
    const p = t / contact;
    const altitude = 1 - p * p;
    return { altitude, scale: 1 + ALTITUDE_SCALE * altitude, alpha: clamp(p / 0.2, 0, 1) };
  }
  if (t < contact + HOLD) return { altitude: 0, scale: 1, alpha: 1 };
  if (t < reveal) return { altitude: 0, scale: 1 - OVERSHOOT * Math.sin((Math.PI * (t - contact - HOLD)) / PRESS), alpha: 1 };
  const q = (t - reveal) / LIFT;
  const altitude = 0.25 * easeOut(q);
  return { altitude, scale: 1 + ALTITUDE_SCALE * altitude, alpha: 1 - q };
}

/** 块面：铅字刻着字，印章沾着印泥；投影的偏移与模糊不随变换缩放，按像素比换算 */
function drawBlock(ctx, piece, pal, px) {
  if (piece.t < 0 || piece.t >= timesOf(piece).reveal + LIFT) return;
  const { altitude, scale, alpha } = blockPose(piece);
  const { w, h, size } = piece;
  const seal = piece.kind === 'seal';
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.rot + (piece.rot0 - piece.rot) * altitude);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = rgba(pal.shade, 0.35 + 0.45 * (1 - altitude));
  ctx.shadowBlur = (2 + size * 0.6 * altitude) * px;
  ctx.shadowOffsetX = (1 + size * 0.55 * altitude) * px;
  ctx.shadowOffsetY = (1.5 + size * 0.8 * altitude) * px;
  const [top, bottom] = seal ? pal.stone : pal.metal;
  const body = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  body.addColorStop(0, rgba(top, 1));
  body.addColorStop(1, rgba(bottom, 1));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.06);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = rgba(pal.light, 0.55);
  ctx.beginPath();
  ctx.moveTo(-w / 2, h / 2);
  ctx.lineTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.stroke();
  if (seal) {
    ctx.globalAlpha = alpha * 0.55;
    ctx.drawImage(piece.sprite, -w / 2, -h / 2, w, h);
  } else {
    ctx.font = piece.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(pal.shade, 0.7);
    ctx.fillText(piece.glyph, 0, size * 0.03);
    ctx.fillStyle = rgba(pal.light, 0.75);
    ctx.fillText(piece.glyph, 0, 0);
  }
  ctx.restore();
}

function drawSealMark(ctx, piece, alpha, flash) {
  const { w, h, sprite } = piece;
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  if (!flash) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * flash * 0.7;
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
}

/** 烫金凹印：上沿压出暗边、下沿接住一线光，金面带一道斜向金属光；flash 时整体偏白热 */
function drawTypeMark(ctx, piece, pal, m, fade, flash) {
  const depth = (m < SETTLE ? DEPTH_PEAK + (DEPTH_REST - DEPTH_PEAK) * easeOut(m / SETTLE) : DEPTH_REST) * fade;
  const d = Math.max(0.6, piece.size * 0.028) * depth;
  const { w, h, glyph } = piece;
  ctx.font = piece.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(pal.shade, 0.9);
  ctx.fillText(glyph, -d * 0.6, -d);
  ctx.fillStyle = rgba(pal.light, 0.35);
  ctx.fillText(glyph, d * 0.4, d);
  const foil = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  foil.addColorStop(0, rgba(mix(pal.deep, WARM_WHITE, flash), 1));
  foil.addColorStop(0.45, rgba(mix(pal.light, WARM_WHITE, flash), 1));
  foil.addColorStop(0.6, rgba(mix(pal.foil, WARM_WHITE, flash), 1));
  foil.addColorStop(1, rgba(mix(pal.deep, WARM_WHITE, flash), 1));
  ctx.fillStyle = foil;
  ctx.fillText(glyph, 0, 0);
}

/** 块抬走后留下的印：白热一闪、凹印从深压平复成浅印，最后淡出 */
function drawMark(ctx, piece, pal, intro) {
  const { reveal, end } = timesOf(piece);
  const m = piece.t - reveal;
  if (m < 0) return;
  const fade = clamp((end - piece.t) / FADE, 0, 1);
  const alpha = piece.alpha * fade * fade * intro;
  const flash = m < FLASH ? (1 - m / FLASH) ** 2 : 0;
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.rot);
  ctx.globalAlpha = alpha;
  if (piece.kind === 'seal') drawSealMark(ctx, piece, alpha, flash);
  else drawTypeMark(ctx, piece, pal, m, fade, flash);
  ctx.restore();
}

function drawDust(ctx, { motes, dust }, sprite, intro) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    ctx.globalAlpha = intro * (0.18 + 0.14 * Math.sin(m.phase * m.twinkle * 3));
    const s = m.r * 6;
    ctx.drawImage(sprite, m.x - s / 2, m.y - s / 2, s, s);
  }
  for (const d of dust) {
    ctx.globalAlpha = 0.85 * (1 - d.age / d.life) ** 1.5;
    const s = d.r * 6;
    ctx.drawImage(sprite, d.x - s / 2, d.y - s / 2, s, s);
  }
  ctx.restore();
}

/** 按秒推进块与尘：块落到桌面的那一帧挤出尘、冲开浮尘，淡出完的块收走。原地修改以免每帧分配。 */
export function stepPress(state, dt) {
  stepPieces(state, dt);
  stepDust(state, dt);
}

/** 推进一帧：落新块、处理点击、步进块与尘 */
function advance(state, ctx, dt) {
  state.time += dt;
  if (!state.seeded) {
    seed(state, ctx);
    state.seeded = true;
  }
  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    spawn(state, ctx);
    state.spawnIn = between(state.rand, SPAWN_INTERVAL);
  }
  while (state.clicks.length) addAt(state, makeSeal(state, sizeOf(state, 'medium'), CLICK_FALL), state.clicks.shift());
  stepPress(state, dt);
}

/** 画一帧：先画桌上的印，再画尘，最上面是还在空中或刚压下的块。整体强度由 CSS 的 opacity 按场景控制。 */
export function drawPress(ctx, state, sprite) {
  const pal = paletteOf(state.colors);
  const px = ctx.getTransform().a;
  const intro = Math.min(1, state.time / INTRO);
  ctx.clearRect(0, 0, state.width, state.height);
  for (const piece of state.pieces) drawMark(ctx, piece, pal, intro);
  drawDust(ctx, state, sprite, intro);
  for (const piece of state.pieces) drawBlock(ctx, piece, pal, px);
}

/**
 * 印台场景：AtmosphereLayer 每帧调 frame，每秒调 read 重读颜色和字体；dispose 时撤指针监听、释放贴图。
 * read(readColor, readValue)：readColor 把 token 换成 {r,g,b}，readValue 取 token 原文。
 */
export function createPressScene(canvas, rand = Math.random) {
  const state = {
    rand, width: 0, height: 0, unit: 1, cap: 6, time: 0, spawnIn: 0.4, seeded: false,
    colors: null, fonts: { type: 'serif', seal: 'serif' }, pieces: [], motes: [], dust: [], clicks: [],
  };
  let target = null;
  const sprites = createMoteSpriteCache();

  const onDown = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) state.clicks.push({ x, y });
  };
  window.addEventListener('pointerdown', onDown, { passive: true });

  return {
    resize(width, height) {
      Object.assign(state, {
        width,
        height,
        unit: clamp(Math.min(width, height) / 900, 0.45, 1.15),
        cap: Math.round(clamp((width * height) / 60000, 6, 20)),
        motes: createMotes(width, height, rand),
      });
    },
    read(readColor, readValue) {
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
      advance(state, ctx, dt);
      drawPress(ctx, state, sprites.get(state.colors.foil));
    },
    dispose() {
      window.removeEventListener('pointerdown', onDown);
      sprites.release();
      for (const piece of state.pieces) if (piece.kind === 'seal') releaseMoteSprite(piece.sprite);
      state.pieces = [];
    },
  };
}
