/**
 * 无封面世界的场景构图：按世界名稳定生成一幅"远景"——天空渐变、一团逐级衰减的光源、
 * 几点星、地平线散射、三层由远及近的山脊或城市天际线；远层向雾色靠拢、近层压暗，
 * 层与层之间浮着边缘起伏的雾片，做出空气透视。
 * 同名永远得到同一幅，不同名大概率不同。
 * 只产出数据，渲染交给 components/worlds/WorldSceneArt.jsx。
 */

export const SCENE_WIDTH = 400;
export const SCENE_HEIGHT = 300;

// FNV-1a：把名字压成 32 位种子
function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32：由种子得到可复现的 [0,1) 序列
function seededRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n) {
  return Math.round(n * 10) / 10;
}

// 一维值噪声：cells 个随机高度，用余弦插值连成平滑起伏，x ∈ [0, 1]
function smoothNoise(rand, cells) {
  const knots = Array.from({ length: cells + 1 }, () => rand());
  return (x) => {
    const p = x * cells;
    const i = Math.min(cells - 1, Math.floor(p));
    const t = (1 - Math.cos((p - i) * Math.PI)) / 2;
    return knots[i] * (1 - t) + knots[i + 1] * t;
  };
}

// 山脊：低频定出山势，高频叠出细节，再隆起一座主峰；远层平缓、近层嶙峋
function mountainRidge(rand, baseY, amplitude, depth) {
  const broad = smoothNoise(rand, 3 + depth);
  const detail = smoothNoise(rand, 9 + depth * 6);
  const grain = smoothNoise(rand, 26 + depth * 10);
  const peakX = 0.15 + rand() * 0.7;
  const peakW = 0.08 + rand() * 0.1;
  const detailWeight = 0.16 + depth * 0.08;
  const points = [];
  for (let x = 0; x <= SCENE_WIDTH; x += 5) {
    const u = x / SCENE_WIDTH;
    const peak = Math.exp(-(((u - peakX) / peakW) ** 2));
    const h = 0.26 + broad(u) * 0.4 + (detail(u) - 0.5) * detailWeight + (grain(u) - 0.5) * 0.05 + peak * 0.32;
    points.push([x, baseY - amplitude * Math.min(1, h)]);
  }
  return points;
}

// 天际线：楼宽、楼高都偏向"多数矮小、偶有高楼"，不排成等距的齿
function skylineRidge(rand, baseY, amplitude) {
  const points = [[0, baseY]];
  let x = 0;
  while (x < SCENE_WIDTH) {
    const top = baseY - amplitude * (0.18 + rand() ** 1.8 * 0.82);
    const w = 6 + rand() ** 2 * 38;
    points.push([x, top], [Math.min(SCENE_WIDTH, x + w), top]);
    x = Math.min(SCENE_WIDTH, x + w);
    points.push([x, baseY - amplitude * rand() * 0.22]);
  }
  return points;
}

function closePath(outline) {
  return `M0,${SCENE_HEIGHT} L${outline} L${SCENE_WIDTH},${SCENE_HEIGHT} Z`;
}

function toPath(points) {
  return closePath(points.map(([x, y]) => `${round(x)},${round(y)}`).join(' L'));
}

// 过相邻采样点的中点做二次贝塞尔，轮廓连续平滑
function smoothOutline(points) {
  let d = `${round(points[0][0])},${round(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q${round(x)},${round(y)} ${round((x + nx) / 2)},${round((y + ny) / 2)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${round(lx)},${round(ly)}`;
}

function toSmoothPath(points) {
  return closePath(smoothOutline(points));
}

// 雾片：上沿缓慢起伏（像被风拉开的雾），下沿平直沉进下一层山脚
function fogSheet(rand, top, depth) {
  const drift = smoothNoise(rand, 4);
  const points = [];
  for (let x = 0; x <= SCENE_WIDTH; x += 20) {
    points.push([x, top + (drift(x / SCENE_WIDTH) - 0.5) * 22]);
  }
  const bottom = round(top + 44 - depth * 8);
  return `M${smoothOutline(points)} L${SCENE_WIDTH},${bottom} L0,${bottom} Z`;
}

// 色相取最短弧插值
function mixHue(a, b, t) {
  const delta = ((b - a + 540) % 360) - 180;
  return Math.round((a + delta * t + 360) % 360);
}

export function buildWorldScene(name) {
  const rand = seededRandom(hashString(name || ''));
  const hue = Math.floor(rand() * 360);
  const horizon = SCENE_HEIGHT * (0.5 + rand() * 0.16);
  const skyline = rand() < 0.35;

  // 光源只取暖金或冷月两种色调，避免落到发绿发紫的病态色；天空由世界色相的深色，经被光源染色的中段，过渡到最亮的地平线
  const lightHue = rand() < 0.6 ? 28 + Math.floor(rand() * 22) : 200 + Math.floor(rand() * 30);
  const sky = {
    top: `hsl(${hue} 42% 8%)`,
    middle: `hsl(${mixHue(hue, lightHue, 0.55)} 36% 15%)`,
    bottom: `hsl(${lightHue} 38% 28%)`,
  };
  const haze = `hsl(${lightHue} 36% 50%)`;
  const light = {
    x: round(SCENE_WIDTH * (0.18 + rand() * 0.64)),
    y: round(horizon * (0.35 + rand() * 0.4)),
    r: round(4 + rand() * 4),
    color: `hsl(${lightHue} 80% 82%)`,
  };
  // 星越靠近地平线越被散射光吞掉
  const stars = Array.from({ length: 10 + Math.floor(rand() * 12) }, () => {
    const y = rand() * horizon * 0.8;
    return {
      x: round(rand() * SCENE_WIDTH),
      y: round(y),
      r: round(0.4 + rand() * 1.1),
      o: round((0.25 + rand() * 0.6) * (1 - (y / horizon) ** 2 * 0.8)),
    };
  });
  // 由远及近：远层几乎融进雾色、对比最低，近层最暗；每层上沿受光略亮、下沿沉进雾里
  const layers = [0, 1, 2].map((depth) => {
    const distance = (2 - depth) / 2;
    const baseY = horizon + depth * (SCENE_HEIGHT - horizon) * 0.32;
    const amplitude = (skyline ? 64 : 80) - depth * 16;
    const d = skyline && depth > 0
      ? toPath(skylineRidge(rand, baseY, amplitude))
      : toSmoothPath(mountainRidge(rand, baseY, amplitude, depth));
    const layerHue = mixHue(hue, lightHue, distance * 0.6);
    const saturation = 16 + depth * 4;
    const lightness = 6 + distance * 13;
    return {
      d,
      lightness,
      top: `hsl(${layerHue} ${saturation}% ${round(lightness + 4)}%)`,
      bottom: `hsl(${layerHue} ${saturation + 4}% ${round(Math.max(3, lightness - 7))}%)`,
      fog: depth < 2 ? fogSheet(rand, baseY - amplitude * 0.3, depth) : null,
    };
  });

  return { hue, sky, haze, horizon: round(horizon), light, stars, layers };
}
