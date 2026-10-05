/**
 * 无封面世界的场景画「古地图」：按世界名稳定生成一张古海图，同名永远同一张。
 * 海上一块主岛和两三座小岛，海岸有湾有岬，外面一圈圈水纹细线；岛上成列的山脉、成片的森林、
 * 从山脚流向海的河、偶尔一处湖，城镇之间一条红色虚线航路；海上有罗经线、浪花、帆船，偶尔一条海蛇；
 * 顶角一枚罗盘配比例尺，世界卡上外围再加黑白相间的图框。只产出数据，渲染交给 components/ui/WorldSceneArt.jsx。
 */
import { between, clamp, hashString, round, seededRandom } from './seededRandom.js';
import { farFrom, forest, landSpot, makeIsland, mountainRange, river, TAU } from './worldMapTerrain.js';

// 图框内沿：陆地和海上装饰都不进这条线（不画图框的构图也留同样的边）
const FRAME = 24;

/**
 * 两种构图，同一个世界名下主岛和岛上的一切完全一样，只换镜头：
 * card 世界卡与正文氛围底图（4:3），罗盘和船、海蛇避开左下角——那里压着世界卡的名字；
 * banner 对话、写作页顶上的台前横幅（16:5），镜头拉宽，主岛偏上居中，两侧再添两座远岛。
 */
export const SCENE_VIEWS = {
  card: { width: 400, height: 300, mainY: [0.4, 0.5], isletSpread: [1, 0.85], nameCorner: true, farIslets: false },
  banner: { width: 800, height: 250, mainY: [0.36, 0.44], isletSpread: [1.5, 0.6], nameCorner: false, farIslets: true },
};

// 离岛够远：按比例放大一圈之外，再留出 extra 的绝对距离（小岛按比例放大不够装下一条船）
function clearOfLand(islands, x, y, extra) {
  return islands.every((isle) => !isle.inside(x, y, 1.5) && Math.hypot((x - isle.cx) / isle.stretch, y - isle.cy) > isle.radius * 1.3 + extra);
}

// 海上随机取一点：离岛、离 avoid 里的点都够远；big 的装饰（船、海蛇）在世界卡上不进左下角
function seaSpot(rand, view, islands, avoid, gap, big = false) {
  const { width, height } = view;
  for (let tries = 0; tries < 80; tries++) {
    const x = between(rand, FRAME + 14, width - FRAME - 14);
    const y = between(rand, FRAME + 14, height - FRAME - 14);
    const underName = big && view.nameCorner && x < width * 0.45 && y > height * 0.7;
    if (!underName && clearOfLand(islands, x, y, big ? 16 : 6) && farFrom(avoid, x, y, gap)) return { x: round(x), y: round(y) };
  }
  return null;
}

// 图框：外圈与内圈之间一条黑白相间的刻度带，每 20 一格、隔格填色
function frameSegments({ width, height }) {
  const starts = (length) => Array.from({ length: Math.ceil((length - 16) / 40) }, (_, i) => 8 + i * 40);
  const cap = (start, length) => Math.min(10, length - 8 - start);
  return [
    ...starts(width).flatMap((x) => [8, height - 13].map((y) => ({ x, y, w: cap(x, width), h: 5 }))),
    ...starts(height).flatMap((y) => [8, width - 13].map((x) => ({ x, y, w: 5, h: cap(y, height) }))),
  ].filter((seg) => seg.w > 0 && seg.h > 0);
}

// 罗盘只放顶角，世界卡上还可以放右下角：左下角是世界卡写名字的地方，横幅的下沿已经淡进纸面
function compassSpot({ width, height, nameCorner }, islands) {
  const spots = [{ x: width - 58, y: 60 }, { x: 58, y: 60 }, ...(nameCorner ? [{ x: width - 58, y: height - 66 }] : [])];
  const ring = Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * TAU) * 34, Math.sin((i / 12) * TAU) * 34]);
  return spots.find(({ x, y }) => [[0, 0], ...ring].every(([dx, dy]) => islands.every((isle) => !isle.inside(x + dx, y + dy, 1.2)))) ?? spots[0];
}

// 主岛偏上（世界卡下半截压着名字和简介）；两三座小岛按等分的方向绕在四周，再夹回边框以内。
// 横幅矮而宽，小岛往两侧摊开、上下收拢，免得被夹回来压在主岛上；压上去的那座不要，取舍不影响后面的随机序列
function placeIslands(rand, view) {
  const { width: W, height: H } = view;
  const main = makeIsland(rand, between(rand, 0.4, 0.6) * W, between(rand, ...view.mainY) * H, between(rand, 58, 70), between(rand, 1.25, 1.5));
  const count = 2 + Math.floor(rand() * 2);
  const start = rand() * TAU;
  const islets = Array.from({ length: count }, (_, i) => {
    const a = start + (i / count) * TAU + between(rand, -0.3, 0.3);
    const dist = between(rand, 1.45, 1.9);
    const radius = between(rand, 8, 16);
    const [spreadX, spreadY] = view.isletSpread;
    const x = clamp(main.cx + Math.cos(a) * main.radius * main.stretch * dist * spreadX, FRAME + radius * 1.5, W - FRAME - radius * 1.5);
    const y = clamp(main.cy + Math.sin(a) * main.radius * dist * spreadY, FRAME + radius * 1.3, H - FRAME - radius * 1.3);
    return makeIsland(rand, x, y, radius, 1.25, 0.8);
  }).filter((isle) => !main.inside(isle.cx, isle.cy, 1.3));
  return { main, islets };
}

// 在几座之外按 gap 依次放 count 个点，place 每次给出一个候选
function placeApart(count, place) {
  const spots = [];
  for (let i = 0; i < count; i++) {
    const spot = place(spots);
    if (spot) spots.push(spot);
  }
  return spots;
}

// 陆上：先定山脉和湖，再放城镇，森林和丘陵填进剩下的空地；小岛上的树林放最后——
// 两种构图留下的小岛可能不同，放在前面会让主岛上的随机序列错开
function placeLand(rand, main, islets) {
  const ranges = [mountainRange(rand, main, [])];
  if (rand() < 0.55) ranges.push(mountainRange(rand, main, ranges[0]));
  const peaks = ranges.flat().sort((a, b) => a.y - b.y);
  const lakeAt = rand() < 0.45 ? landSpot(rand, main, 0.45, peaks, 16) : null;
  const lake = lakeAt ? makeIsland(rand, lakeAt.x, lakeAt.y, between(rand, 5, 8), 1.4, 0.5) : null;
  const lakePoints = lakeAt ? [lakeAt] : [];
  const towns = placeApart(4, (placed) => landSpot(rand, main, 0.7, [...peaks, ...lakePoints, ...placed], placed.length ? 28 : 12));
  const woods = forest(rand, main, [...peaks, ...lakePoints, ...towns]);
  const mainTrees = [...woods, ...forest(rand, main, [...peaks, ...lakePoints, ...towns, ...woods])];
  const hills = placeApart(10, (placed) => landSpot(rand, main, 0.78, [...peaks, ...mainTrees, ...lakePoints, ...towns, ...placed], 11));
  const isletTrees = rand() < 0.6 && islets[0] ? forest(rand, islets[0], []).slice(0, 5) : [];
  const allTrees = [...mainTrees, ...isletTrees].sort((a, b) => a.y - b.y);
  const route = [...towns].sort((a, b) => a.x - b.x);
  return {
    lake: lake?.d ?? null,
    peaks,
    hills: hills.sort((a, b) => a.y - b.y),
    trees: allTrees,
    river: river(rand, main, ranges[0][Math.floor(ranges[0].length / 2)]),
    towns,
    route: route.length > 1
      ? `M${route[0].x},${route[0].y} ${route.slice(1).map((t, i) => `Q${round((route[i].x + t.x) / 2)},${round((route[i].y + t.y) / 2 - 8)} ${t.x},${t.y}`).join(' ')}`
      : '',
    goal: route.at(-1) ?? null,
  };
}

// 横幅两侧的远岛：主岛周围的小岛只占中段，宽镜头下两头的海太空
function farIslets(rand, { width, height }) {
  return [between(rand, 0.07, 0.17), between(rand, 0.83, 0.93)].map((u) => {
    const radius = between(rand, 14, 24);
    return makeIsland(rand, u * width, between(rand, 0.3, 0.55) * height, radius, 1.35, 0.9);
  });
}

// 海上：罗盘先占一个角，再放船、海蛇和浪花；横幅更宽，浪花多撒一些
function placeSea(rand, view, islands) {
  const compass = compassSpot(view, islands);
  const ships = placeApart(2, (placed) => seaSpot(rand, view, islands, [compass, ...placed], 50, true));
  const serpent = rand() < 0.5 ? seaSpot(rand, view, islands, [compass, ...ships], 50, true) : null;
  const taken = [compass, ...ships, ...(serpent ? [serpent] : [])];
  const marks = placeApart(Math.round(view.width / 40), (placed) => seaSpot(rand, view, islands, [...taken, ...placed], 26));
  return { compass, ships, serpent, marks, rhumbs: Array.from({ length: 16 }, (_, i) => (i / 16) * 360) };
}

// 海色随世界名变；陆地、墨线、红色航路固定在羊皮纸一路
function palette(hue, landHue) {
  return {
    sea: [`hsl(${hue} 36% 28%)`, `hsl(${hue} 44% 9%)`],
    waterline: `hsl(${hue} 42% 66%)`,
    // 河与湖的水固定在蓝绿一带：海面可以是任何颜色，水得一眼看出是水
    water: `hsl(${190 + (hue % 30)} 38% 47%)`,
    land: [`hsl(${landHue} 46% 86%)`, `hsl(${landHue} 38% 72%)`],
    shore: `hsl(${landHue} 30% 58%)`,
    canopy: `hsl(${landHue + 40} 22% 62%)`,
    ink: `hsl(${landHue - 8} 46% 14%)`,
    red: 'hsl(6 70% 46%)',
    // 给世界页环境光和正文氛围光晕的染色
    tint: `hsl(${hue} 70% 64%)`,
  };
}

// 染色只取决于世界名的第一个随机数，和整幅图同源；书架环境光、正文氛围光晕用它，不必画整张图
export function worldSceneTint(name) {
  const rand = seededRandom(hashString(`${name || ''}#map`));
  return palette(Math.floor(rand() * 360), 0).tint;
}

export function buildWorldScene(name, layout = 'card') {
  const view = SCENE_VIEWS[layout];
  const rand = seededRandom(hashString(`${name || ''}#map`));
  const hue = Math.floor(rand() * 360);
  const landHue = 34 + Math.floor(rand() * 10);
  const { main, islets } = placeIslands(rand, view);
  const land = placeLand(rand, main, islets);
  const islands = [main, ...islets, ...(view.farIslets ? farIslets(rand, view) : [])];
  return {
    width: view.width,
    height: view.height,
    hue,
    islands: islands.map((isle) => isle.d),
    ...land,
    ...placeSea(rand, view, islands),
    frame: frameSegments(view),
    ...palette(hue, landHue),
  };
}
