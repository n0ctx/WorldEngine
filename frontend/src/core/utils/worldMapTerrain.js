/**
 * 古地图的地形：岛的轮廓，以及岛上的山脉、森林、河，都在给定的岛内按随机序列生成。
 * 摆放规则（离哪里多远、放几处）由 worldScene.js 决定。
 */
import { between, round } from './seededRandom.js';

export const TAU = Math.PI * 2;

export function farFrom(points, x, y, gap) {
  return points.every((p) => Math.hypot(p.x - x, p.y - y) >= gap);
}

// 岛：半径随角度由低频到高频八组正弦叠出——低频定轮廓，高频刻出湾和岬；detail 控制碎度
export function makeIsland(rand, cx, cy, radius, stretch, detail = 1) {
  const waves = [[2, 0.2], [3, 0.14], [4, 0.09], [6, 0.06], [9, 0.045], [14, 0.03], [23, 0.018], [37, 0.01]]
    .map(([k, a]) => ({ k, a: a * between(rand, 0.6, 1.4) * (k > 6 ? detail : 1), p: rand() * TAU }));
  const radiusAt = (t) => radius * (1 + waves.reduce((sum, w) => sum + w.a * Math.sin(w.k * t + w.p), 0));
  const outline = Array.from({ length: 240 }, (_, i) => {
    const t = (i / 240) * TAU;
    return `${round(cx + Math.cos(t) * radiusAt(t) * stretch)},${round(cy + Math.sin(t) * radiusAt(t))}`;
  });
  return {
    cx,
    cy,
    radius,
    stretch,
    d: `M${outline.join(' L')} Z`,
    // margin < 1 往里收，> 1 往外放
    inside: (x, y, margin = 1) => {
      const dx = (x - cx) / stretch;
      const dy = y - cy;
      return Math.hypot(dx, dy) < radiusAt(Math.atan2(dy, dx)) * margin;
    },
  };
}

// 岛内随机取一点，离 avoid 里的点至少 gap
export function landSpot(rand, isle, margin, avoid = [], gap = 0) {
  for (let tries = 0; tries < 80; tries++) {
    const x = isle.cx + between(rand, -1, 1) * isle.radius * isle.stretch;
    const y = isle.cy + between(rand, -1, 1) * isle.radius;
    if (isle.inside(x, y, margin) && farFrom(avoid, x, y, gap)) return { x: round(x), y: round(y) };
  }
  return null;
}

// 山脉：沿一个方向排出五到八座，中段最高
export function mountainRange(rand, isle, avoid) {
  const start = landSpot(rand, isle, 0.5, avoid, 18);
  if (!start) return [];
  const heading = rand() * TAU;
  const count = 5 + Math.floor(rand() * 4);
  const peaks = [];
  for (let i = 0; i < count; i++) {
    const x = start.x + Math.cos(heading) * i * 10 + between(rand, -2.5, 2.5);
    const y = start.y + Math.sin(heading) * i * 6 + between(rand, -2, 2);
    if (!isle.inside(x, y, 0.74)) break;
    peaks.push({ x: round(x), y: round(y), s: round(4 + Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 3.5 + rand() * 1.2) });
  }
  return peaks;
}

// 森林：围着一点长出九到十五棵，挤在一起
export function forest(rand, isle, avoid) {
  const center = landSpot(rand, isle, 0.6, avoid, 20);
  if (!center) return [];
  const trees = [];
  const count = 9 + Math.floor(rand() * 7);
  for (let i = 0; i < count; i++) {
    const a = rand() * TAU;
    const d = Math.sqrt(rand()) * 15;
    const x = center.x + Math.cos(a) * d * 1.3;
    const y = center.y + Math.sin(a) * d;
    if (isle.inside(x, y, 0.82) && farFrom(avoid, x, y, 9) && farFrom(trees, x, y, 4.2)) {
      trees.push({ x: round(x), y: round(y), r: round(between(rand, 2.4, 3.3)) });
    }
  }
  return trees;
}

// 河：从山脚出发，边蜿蜒边往岛外走，一直流进海
export function river(rand, isle, from) {
  if (!from) return [];
  const pts = [[from.x, from.y + 5]];
  let [x, y] = pts[0];
  let angle = Math.atan2(y - isle.cy, x - isle.cx);
  for (let i = 0; i < 90 && isle.inside(x, y, 1.04); i++) {
    const out = Math.atan2(y - isle.cy, x - isle.cx);
    const wander = angle + between(rand, -0.5, 0.5);
    angle = Math.atan2(Math.sin(wander) * 0.72 + Math.sin(out) * 0.28, Math.cos(wander) * 0.72 + Math.cos(out) * 0.28);
    x += Math.cos(angle) * 4.5;
    y += Math.sin(angle) * 4.5;
    pts.push([round(x), round(y)]);
  }
  return pts;
}
