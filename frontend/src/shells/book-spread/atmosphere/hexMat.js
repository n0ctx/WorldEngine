/**
 * 战棋垫：背景氛围的一种（--we-atmosphere-kind: mat），配骰界。六角格本身由主题印在垫子上（--we-canvas-texture-image），
 * 这里只画格子被点亮的样子，格子位置与印刷的六角格对齐：
 * - 指针在桌面上移动，脚下那一格亮起，离开后慢慢暗回去，留下一串走过的格子，像主持人在战棋图上比划；
 * - 按下时以这一格为中心，一圈圈格子向外亮开再暗下，像摊开一张射程模板。
 * 颜色取 --we-atmosphere-color（进入世界后随封面主色变）。什么都没亮时不重画。AtmosphereLayer 负责循环、暂停与读取主题 token。
 */

// 与主题里印刷的六角格同一套尺寸：贴图 56×100，一行六角格的中心相距 56，行距 50，奇数行错开半格
const HEX_W = 56;
const ROW_H = 50;
const TOP = 33;
const HALF_W = 28;
const TIP = 33;
const SHOULDER = 17;

const TRAIL_FADE = 0.9;
const RIPPLE_SPEED = 420;
const RIPPLE_REACH = 3.2 * HEX_W;
const RIPPLE_BAND = 0.9 * HEX_W;
const FILL_ALPHA = 0.14;
const EDGE_ALPHA = 0.5;
const SETTLED = 0.01;

const paint = ({ r, g, b }, alpha) => `rgb(${r | 0} ${g | 0} ${b | 0} / ${alpha})`;
const isOdd = (row) => ((row % 2) + 2) % 2 === 1;

/** 第 row 行第 col 格的中心 */
export function hexCenter(col, row) {
  return { x: HALF_W + col * HEX_W - (isOdd(row) ? HALF_W : 0), y: TOP + row * ROW_H };
}

/** 点所在的格：取上下相邻两行里中心离它最近的一格 */
export function hexAt(x, y) {
  const first = Math.floor((y - TOP) / ROW_H);
  let best = null;
  for (const row of [first, first + 1]) {
    const col = Math.round((x - HALF_W + (isOdd(row) ? HALF_W : 0)) / HEX_W);
    const c = hexCenter(col, row);
    const d = Math.hypot(x - c.x, y - c.y);
    if (!best || d < best.d) best = { col, row, d };
  }
  return { col: best.col, row: best.row };
}

/** 射程模板此刻对一格的亮度：亮带随时间向外推，推过的格暗下去，推到尽头整圈收掉 */
export function rippleAt(age, distance) {
  const front = age * RIPPLE_SPEED;
  if (front > RIPPLE_REACH + RIPPLE_BAND || distance > RIPPLE_REACH) return 0;
  const t = 1 - Math.abs(front - distance) / RIPPLE_BAND;
  return t > 0 ? t * t * (1 - (distance / RIPPLE_REACH) * 0.5) : 0;
}

function tracePath(ctx, { x, y }) {
  ctx.moveTo(x, y - TIP);
  ctx.lineTo(x + HALF_W, y - SHOULDER);
  ctx.lineTo(x + HALF_W, y + SHOULDER);
  ctx.lineTo(x, y + TIP);
  ctx.lineTo(x - HALF_W, y + SHOULDER);
  ctx.lineTo(x - HALF_W, y - SHOULDER);
  ctx.closePath();
}

export function createHexMatScene(canvas) {
  const state = {
    width: 0, height: 0, color: null,
    trail: new Map(), ripples: [], current: '', dirty: false,
  };

  function locate(event) {
    const rect = canvas.getBoundingClientRect();
    return hexAt(event.clientX - rect.left, event.clientY - rect.top);
  }
  function onMove(event) {
    const { col, row } = locate(event);
    const key = `${col},${row}`;
    if (key === state.current) return;
    state.current = key;
    state.trail.set(key, { col, row, glow: 1 });
  }
  function onDown(event) {
    const { col, row } = locate(event);
    state.ripples.push({ origin: hexCenter(col, row), age: 0 });
  }
  function onOut(event) {
    if (!event.relatedTarget) state.current = '';
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerout', onOut);

  /** 收集这一帧要亮的格：走过的格与射程模板叠加，同一格取最亮的一份 */
  function litCells(dt) {
    const lit = new Map();
    for (const [key, cell] of state.trail) {
      if (key !== state.current) cell.glow -= dt / TRAIL_FADE;
      if (cell.glow <= SETTLED) state.trail.delete(key);
      else lit.set(key, { ...hexCenter(cell.col, cell.row), glow: cell.glow });
    }
    const span = Math.ceil(RIPPLE_REACH / ROW_H) + 1;
    state.ripples = state.ripples.filter((ripple) => {
      ripple.age += dt;
      if (ripple.age * RIPPLE_SPEED > RIPPLE_REACH + RIPPLE_BAND) return false;
      const { col: oc, row: or } = hexAt(ripple.origin.x, ripple.origin.y);
      for (let row = or - span; row <= or + span; row++) {
        for (let col = oc - span; col <= oc + span; col++) {
          const c = hexCenter(col, row);
          const glow = rippleAt(ripple.age, Math.hypot(c.x - ripple.origin.x, c.y - ripple.origin.y));
          const key = `${col},${row}`;
          if (glow > SETTLED && glow > (lit.get(key)?.glow ?? 0)) lit.set(key, { ...c, glow });
        }
      }
      return true;
    });
    return lit;
  }

  return {
    resize(width, height) {
      state.width = width;
      state.height = height;
      state.dirty = true;
    },
    read(readColor) {
      const color = readColor('--we-atmosphere-color');
      if (color) state.color = color;
    },
    frame(ctx, dt) {
      if (!state.color) return;
      const lit = litCells(dt);
      if (!lit.size && !state.dirty) return;
      ctx.clearRect(0, 0, state.width, state.height);
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      for (const cell of lit.values()) {
        ctx.beginPath();
        tracePath(ctx, cell);
        ctx.fillStyle = paint(state.color, cell.glow * FILL_ALPHA);
        ctx.fill();
        ctx.strokeStyle = paint(state.color, cell.glow * EDGE_ALPHA);
        ctx.stroke();
      }
      // 最后一格暗下去之后再清一次画面，之后什么都不画
      state.dirty = lit.size > 0;
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerout', onOut);
    },
  };
}
