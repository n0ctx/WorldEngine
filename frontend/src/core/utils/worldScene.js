/**
 * 无封面世界的场景构图「星图」：像游戏选关画面的一片星域——半露的行星带经纬线和明暗交界，
 * 两道虚线轨道上挂一颗卫星；世界名的每个字是一颗星，连成这片星域的星座；角上标坐标码。
 * 整幅只用一个由名字决定的色相，卫星和首星取偏移后的信号色。
 * 同名永远得到同一幅，不同名大概率不同。只产出数据，渲染交给 components/ui/WorldSceneArt.jsx。
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

function between(rand, min, max) {
  return min + rand() * (max - min);
}

export function buildWorldScene(name) {
  const rand = seededRandom(hashString(name || ''));
  const hue = Math.floor(rand() * 360);
  const planet = {
    cx: round(between(rand, 0.6, 0.8) * SCENE_WIDTH),
    cy: round(between(rand, 0.55, 0.78) * SCENE_HEIGHT),
    r: round(between(rand, 105, 145)),
  };
  // 星座：从左往右排开，每个字一颗，至少两颗才连得成线
  const count = Math.max(2, Math.min(7, Array.from(name || '').length));
  const span = between(rand, 150, 210);
  const stars = Array.from({ length: count }, (_, i) => ({
    x: round(28 + (i / (count - 1)) * span),
    y: round(between(rand, 34, 140)),
  }));
  const tilt = round(between(rand, -18, -6));
  const orbits = [1.35, 1.75].map((k) => ({ rx: round(planet.r * k), ry: round(planet.r * k * 0.3) }));
  const moonAngle = between(rand, Math.PI * 1.05, Math.PI * 1.45);
  return {
    hue,
    planet,
    stars,
    tilt,
    orbits,
    moon: { x: round(orbits[1].rx * Math.cos(moonAngle)), y: round(orbits[1].ry * Math.sin(moonAngle)) },
    code: `WE-${(hashString(name || '') % 9000) + 1000}`,
    deep: `hsl(${hue} 55% 5%)`,
    sky: `hsl(${hue} 50% 13%)`,
    line: `hsl(${hue} 70% 72%)`,
    lit: `hsl(${hue} 65% 58%)`,
    dark: `hsl(${hue} 55% 14%)`,
    signal: `hsl(${(hue + 40) % 360} 95% 68%)`,
    // 给书架环境光和正文氛围光晕的染色
    tint: `hsl(${hue} 80% 70%)`,
  };
}
