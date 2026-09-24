/**
 * 无封面世界的场景构图：按世界名稳定生成一幅"远景"——天空渐变、一团光源、
 * 几点星、地平线上的雾带、三层由远及近的山脊或城市天际线（远层偏亮偏灰，做出空气透视）。
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

// 山脊：小步随机游走再回拉到基线附近，得到连绵起伏的轮廓，而不是一排锯齿三角
function mountainRidge(rand, baseY, amplitude) {
  let y = baseY - amplitude * (0.3 + rand() * 0.4);
  const points = [[0, y]];
  let x = 0;
  while (x < SCENE_WIDTH) {
    x = Math.min(SCENE_WIDTH, x + 6 + rand() * 10);
    const pull = (baseY - amplitude * 0.5 - y) * 0.08;
    y = Math.min(baseY, Math.max(baseY - amplitude, y + (rand() - 0.5) * amplitude * 0.22 + pull));
    points.push([x, y]);
  }
  return points;
}

function skylineRidge(rand, baseY, amplitude) {
  const points = [[0, baseY]];
  let x = 0;
  while (x < SCENE_WIDTH) {
    const top = baseY - amplitude * (0.25 + rand() * 0.75);
    const w = 10 + rand() * 26;
    points.push([x, top], [Math.min(SCENE_WIDTH, x + w), top]);
    x = Math.min(SCENE_WIDTH, x + w);
    points.push([x, baseY - amplitude * rand() * 0.3]);
  }
  return points;
}

function toPath(points) {
  const body = points.map(([x, y]) => `${round(x)},${round(y)}`).join(' L');
  return `M0,${SCENE_HEIGHT} L${body} L${SCENE_WIDTH},${SCENE_HEIGHT} Z`;
}

export function buildWorldScene(name) {
  const rand = seededRandom(hashString(name || ''));
  const hue = Math.floor(rand() * 360);
  const horizon = SCENE_HEIGHT * (0.5 + rand() * 0.16);
  const skyline = rand() < 0.35;

  // 光源只取暖金或冷月两种色调，避免落到发绿发紫的病态色；天空由世界色相的深色渐变到被光源染色的地平线
  const lightHue = rand() < 0.6 ? 28 + Math.floor(rand() * 22) : 200 + Math.floor(rand() * 30);
  const sky = {
    top: `hsl(${hue} 42% 8%)`,
    bottom: `hsl(${lightHue} 38% 26%)`,
  };
  const haze = `hsl(${lightHue} 40% 46%)`;
  const light = {
    x: round(SCENE_WIDTH * (0.18 + rand() * 0.64)),
    y: round(horizon * (0.35 + rand() * 0.4)),
    r: round(4 + rand() * 4),
    color: `hsl(${lightHue} 80% 82%)`,
  };
  const stars = Array.from({ length: 10 + Math.floor(rand() * 12) }, () => ({
    x: round(rand() * SCENE_WIDTH),
    y: round(rand() * horizon * 0.8),
    r: round(0.4 + rand() * 1.1),
    o: round(0.25 + rand() * 0.6),
  }));
  // 由远及近：远层最亮、最接近雾色，近层最暗；每层上沿亮、下沿沉进下一层的雾里
  const layers = [0, 1, 2].map((i) => {
    const baseY = horizon + i * (SCENE_HEIGHT - horizon) * 0.32;
    const amplitude = (skyline ? 64 : 80) - i * 16;
    const points = skyline && i > 0 ? skylineRidge(rand, baseY, amplitude) : mountainRidge(rand, baseY, amplitude);
    const lightness = 22 - i * 7;
    return {
      d: toPath(points),
      top: `hsl(${(hue + i * 8) % 360} ${26 - i * 6}% ${lightness}%)`,
      bottom: `hsl(${(hue + i * 8) % 360} ${22 - i * 6}% ${Math.max(3, lightness - 9)}%)`,
    };
  });

  return { hue, sky, haze, horizon: round(horizon), light, stars, layers };
}
