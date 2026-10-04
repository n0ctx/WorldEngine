/**
 * 拆版（traits.shatter 的包进入世界时用）：把点下的世界卡切成碎块交给转场遮罩。
 * - 封面切成一格格方铅块，每块用背景图切出自己那一块封面；没有封面时按强调色深浅铺色；
 * - 名字里的每颗铅字（SlugText 的 .we-slug-char）单独成块，比封面块重，崩得低、转得慢；
 * - 离点下的位置越近，崩得越猛、越早。
 * 坐标是视口坐标；PortalShards 按自己的位置换算，每帧用 stepShard 推进。
 */

const COLS = 9;
// 物理：重力（px/s²）；开头一段时间底边还在，撞上弹一下（竖向留 35%、横向留 70%、转速留 50%），之后撤掉
const GRAVITY = 2600;
const FLOOR_UNTIL = 0.6;
const BOUNCE = 0.35;
const SLIDE_KEEP = 0.7;
const SPIN_KEEP = 0.5;
const NO_COVER_TONES = ['var(--we-alpha-2)', 'var(--we-alpha-3)', 'var(--we-alpha-4)'];

/** 封面按 object-fit: cover 铺在卡上的尺寸与偏移，铅块用它切出自己那一块 */
function coverBox(img, rect) {
  if (!img?.naturalWidth) return null;
  const scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return { src: img.currentSrc || img.src, w, h, x: (rect.width - w) / 2, y: (rect.height - h) / 2 };
}

/** 崩开的初速度（px/s、deg/s）与起步延迟（s）：离点越近崩得越猛、越早；铅字重，崩得低、转得慢 */
export function launch(x, y, hit, heavy, rand = Math.random) {
  const dx = x - hit.x;
  const dy = y - hit.y;
  const d = Math.hypot(dx, dy) || 1;
  const near = 1 - Math.min(1, d / hit.reach);
  const kick = heavy ? 0.6 : 1;
  return {
    vx: (dx / d) * (80 + 260 * near) * kick + (rand() - 0.5) * 80,
    vy: -(180 + 420 * near) * kick - rand() * 80,
    vr: (rand() - 0.5) * (heavy ? 240 : 720),
    wait: (1 - near) * 0.06,
  };
}

function tilesOf(rect, hit, cover, rand) {
  const w = rect.width / COLS;
  const rows = Math.max(1, Math.round(rect.height / w));
  const h = rect.height / rows;
  const shards = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * w;
      const y = row * h;
      const style = cover
        ? { backgroundImage: `url("${cover.src}")`, backgroundSize: `${cover.w}px ${cover.h}px`, backgroundPosition: `${cover.x - x}px ${cover.y - y}px` }
        : { '--shard-tone': NO_COVER_TONES[Math.floor(rand() * NO_COVER_TONES.length)] };
      shards.push({ kind: 'tile', x: rect.left + x, y: rect.top + y, w: w - 1, h: h - 1, style, ...launch(x + w / 2, y + h / 2, hit, false, rand) });
    }
  }
  return shards;
}

function slugsOf(card, rect, hit, rand) {
  return [...card.querySelectorAll('.we-slug-char')].map((node) => {
    const box = node.getBoundingClientRect();
    const x = box.left - rect.left;
    const y = box.top - rect.top;
    const style = { fontSize: getComputedStyle(node).fontSize };
    return { kind: 'slug', ch: node.textContent, x: box.left, y: box.top, w: box.width, h: box.height, style, ...launch(x + box.width / 2, y + box.height / 2, hit, true, rand) };
  });
}

/** 把一张世界卡拆成碎块；point 是点下的视口坐标（键盘进入时没有，按卡片中心算） */
export function shatterCard(card, point, rand = Math.random) {
  const rect = card.getBoundingClientRect();
  const px = point?.clientX || rect.left + rect.width / 2;
  const py = point?.clientY || rect.top + rect.height / 2;
  const hit = { x: px - rect.left, y: py - rect.top, reach: Math.hypot(rect.width, rect.height) || 1 };
  const cover = coverBox(card.querySelector('img.we-world-card-bg'), rect);
  return [...tilesOf(rect, hit, cover, rand), ...slugsOf(card, rect, hit, rand)];
}

/** 推进一块：重力、位移、旋转；底边还在时撞上就弹一下 */
export function stepShard(body, t, dt, floor) {
  if (t < body.wait) return;
  body.vy += GRAVITY * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.r += body.vr * dt;
  if (t < FLOOR_UNTIL && body.y + body.h > floor && body.vy > 0) {
    body.y = floor - body.h;
    body.vy *= -BOUNCE;
    body.vx *= SLIDE_KEEP;
    body.vr *= SPIN_KEEP;
  }
}
