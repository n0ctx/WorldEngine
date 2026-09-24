/* 移植自 Rare UI grid-reveal — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 图片揭开：一张网格从一块逐步二分成 180 格；图片到达后每格染上它区域的平均色，
 * 细节多的区域先分裂，最后照片淡入盖住网格。 */
import { useEffect, useRef } from 'react';
import { useMotion } from '../../core/hooks/useMotion.js';
import { readCssColor } from './readCssColor.js';

const CELLS = 180;
const OPENING_CELLS = 4;
// 不跑到底：图片没到时进度停在这之前
const HOLD = 0.9;
// 等待期间网格分裂到这里就停，给图片到达留出后半程
const WAIT_CAP = 0.72;
const LAST_SPLIT = 0.92;
// 一格从父格里分离出来占用的进度
const MORPH = 0.055;
const SAMPLE = 128;
const COLOR_MS = 420;
const GUTTER_FROM = 0.35;
const GUTTER_TO = 0.75;
const PHOTO_FROM = 0.93;
const PACE_MS = 6000;

// 写成比较式，NaN 会落到 0
const clamp01 = (n) => (n > 0 ? (n < 1 ? n : 1) : 0);
const mix = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
// 永远到不了上限，图片比预期慢时仍在缓慢推进
const selfPaced = (elapsed) => HOLD * (1 - Math.exp(-elapsed / PACE_MS));

function hash(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function makeCell(x, y, w, h, parent) {
  return { x, y, w, h, r: 0, g: 0, b: 0, tone: hash(x + 3.1, y + 1.7, w * 31.7), detail: 0, splitAt: 0, parent, kids: null };
}

// 每次切最大的一格：格子保持接近正方形，数量一格一格地增加
function buildTree(aspect) {
  const root = makeCell(0, 0, 1, 1, null);
  const leaves = [root];
  const branches = [];
  while (leaves.length < CELLS) {
    let pick = 0;
    let widest = -1;
    for (let i = 0; i < leaves.length; i++) {
      const c = leaves[i];
      // 抖动只用来打破同尺寸格子之间的平局
      const area = c.w * aspect * c.h * (1 + 0.12 * hash(c.x, c.y, 7.3));
      if (area > widest) {
        widest = area;
        pick = i;
      }
    }
    const parent = leaves.splice(pick, 1)[0];
    const wide = parent.w * aspect >= parent.h;
    const half = wide ? parent.w / 2 : parent.h / 2;
    const a = wide ? makeCell(parent.x, parent.y, half, parent.h, parent) : makeCell(parent.x, parent.y, parent.w, half, parent);
    const b = wide ? makeCell(parent.x + half, parent.y, half, parent.h, parent) : makeCell(parent.x, parent.y + half, parent.w, half, parent);
    parent.kids = [a, b];
    branches.push(parent);
    leaves.push(a, b);
  }
  const opening = OPENING_CELLS - 1;
  const rest = Math.max(1, branches.length - opening);
  // 开场几次分裂排在 0 之前，第一帧就已分开
  branches.forEach((cell, i) => {
    cell.splitAt = i < opening ? -MORPH : (LAST_SPLIT * (i - opening + 1)) / rest;
  });
  return { root, branches };
}

// 每格的平均色，以及决定谁先分裂的亮度方差
function measureTree(root, pixels, size) {
  const gather = (cell) => {
    let s;
    if (cell.kids) {
      const a = gather(cell.kids[0]);
      const b = gather(cell.kids[1]);
      s = { n: a.n + b.n, r: a.r + b.r, g: a.g + b.g, b: a.b + b.b, l: a.l + b.l, l2: a.l2 + b.l2 };
    } else {
      s = { n: 0, r: 0, g: 0, b: 0, l: 0, l2: 0 };
      const x0 = Math.round(cell.x * size);
      const y0 = Math.round(cell.y * size);
      const x1 = Math.max(x0 + 1, Math.round((cell.x + cell.w) * size));
      const y1 = Math.max(y0 + 1, Math.round((cell.y + cell.h) * size));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * size + x) * 4;
          const l = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          s.n++;
          s.r += pixels[i];
          s.g += pixels[i + 1];
          s.b += pixels[i + 2];
          s.l += l;
          s.l2 += l * l;
        }
      }
    }
    const n = s.n || 1;
    cell.r = s.r / n;
    cell.g = s.g / n;
    cell.b = s.b / n;
    cell.detail = Math.max(0, s.l2 / n - (s.l / n) * (s.l / n));
    return s;
  };
  gather(root);
}

// 复用同一批时间槽，只改顺序，节奏不变
function orderByDetail(branches, openedBefore) {
  const pending = branches.filter((c) => c.splitAt > openedBefore);
  if (pending.length < 2) return;
  const slots = pending.map((c) => c.splitAt).sort((a, b) => a - b);
  const queue = pending.filter((c) => !c.parent || c.parent.splitAt <= openedBefore);
  let next = 0;
  while (queue.length && next < slots.length) {
    let pick = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].detail > queue[pick].detail) pick = i;
    }
    const cell = queue.splice(pick, 1)[0];
    cell.splitAt = slots[next++];
    for (const kid of cell.kids ?? []) {
      if (kid.kids) queue.push(kid);
    }
  }
}

function coverRect(iw, ih, w, h) {
  const s = Math.max(w / iw, h / ih);
  return { dx: (w - iw * s) / 2, dy: (h - ih * s) / 2, dw: iw * s, dh: ih * s };
}

function greyOf(tone, dark, clock) {
  return (dark ? 30 : 228) + tone * 13 + Math.sin(clock * 1.5 + tone * 6.28) * 3;
}

function drawScene(s) {
  const { ctx, root, width, height, split } = s;
  // 读不到像素时网格保持灰色，照片照常淡入
  const tint = s.hasColors ? s.fade : 0;
  const shade = (grey, target) => Math.round(mix(grey, target, tint));
  const base = greyOf(root.tone, s.dark, s.clock);
  // 格缝陷进这层底色，而不是透出背后的界面
  ctx.fillStyle = `rgb(${Math.round(shade(base, root.r) * 0.92)},${Math.round(shade(base, root.g) * 0.92)},${Math.round(shade(base, root.b) * 0.92)})`;
  ctx.fillRect(0, 0, width, height);

  const soft = 1 - smoothstep(GUTTER_FROM, GUTTER_TO, split);
  const gutter = s.scale * soft;
  const rounded = soft > 0.01 && typeof ctx.roundRect === 'function';

  const paint = (p) => {
    // 取整到整像素，相邻格子严丝合缝
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const w = Math.round(p.x + p.w) - x;
    const h = Math.round(p.y + p.h) - y;
    const onLeft = x <= 0;
    const onTop = y <= 0;
    const onRight = x + w >= width;
    const onBottom = y + h >= height;
    // 只有内侧边留缝，外轮廓保持完整
    const left = onLeft ? 0 : gutter;
    const top = onTop ? 0 : gutter;
    const innerW = w - left - (onRight ? 0 : gutter);
    const innerH = h - top - (onBottom ? 0 : gutter);
    if (innerW <= 0 || innerH <= 0) return;
    const grey = greyOf(p.tone, s.dark, s.clock);
    ctx.fillStyle = `rgb(${shade(grey, p.r)},${shade(grey, p.g)},${shade(grey, p.b)})`;
    if (rounded) {
      const radius = Math.min(innerW, innerH) * 0.12 * soft;
      ctx.beginPath();
      ctx.roundRect(x + left, y + top, innerW, innerH, [
        !onLeft && !onTop ? radius : 0,
        !onRight && !onTop ? radius : 0,
        !onRight && !onBottom ? radius : 0,
        !onLeft && !onBottom ? radius : 0,
      ]);
      ctx.fill();
    } else {
      ctx.fillRect(x + left, y + top, innerW, innerH);
    }
  };

  const walk = (cell, p) => {
    if (!cell.kids || split < cell.splitAt) {
      paint(p);
      return;
    }
    // 子格从父格的位置出发，分离到各自的位置
    const t = easeOut(clamp01((split - cell.splitAt) / MORPH));
    for (const kid of cell.kids) {
      walk(kid, {
        x: mix(p.x, kid.x * width, t),
        y: mix(p.y, kid.y * height, t),
        w: mix(p.w, kid.w * width, t),
        h: mix(p.h, kid.h * height, t),
        r: mix(p.r, kid.r, t),
        g: mix(p.g, kid.g, t),
        b: mix(p.b, kid.b, t),
        tone: mix(p.tone, kid.tone, t),
      });
    }
  };
  walk(root, { x: 0, y: 0, w: width, h: height, r: root.r, g: root.g, b: root.b, tone: root.tone });

  if (!s.image) return;
  const photo = s.hasColors ? smoothstep(PHOTO_FROM, 1, split) * s.fade : s.fade;
  if (photo <= 0.002) return;
  const fit = coverRect(s.image.naturalWidth, s.image.naturalHeight, width, height);
  ctx.globalAlpha = photo;
  ctx.drawImage(s.image, fit.dx, fit.dy, fit.dw, fit.dh);
  ctx.globalAlpha = 1;
}

function readAverages(el, root, branches, at) {
  const buffer = document.createElement('canvas');
  buffer.width = SAMPLE;
  buffer.height = SAMPLE;
  const ctx = buffer.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const fit = coverRect(el.naturalWidth, el.naturalHeight, SAMPLE, SAMPLE);
  ctx.drawImage(el, fit.dx, fit.dy, fit.dw, fit.dh);
  try {
    measureTree(root, ctx.getImageData(0, 0, SAMPLE, SAMPLE).data, SAMPLE);
    orderByDetail(branches, at);
    return true;
  } catch {
    return false;
  }
}

// 先按 CORS 请求以便读像素；没有 CORS 头的地址会被拒，退回普通请求
function loadImage(url, onLoad, isCancelled, withCors = true) {
  const el = new Image();
  if (withCors) el.crossOrigin = 'anonymous';
  el.decoding = 'async';
  el.onload = () => {
    if (!isCancelled() && el.naturalWidth && el.naturalHeight) onLoad(el);
  };
  el.onerror = () => {
    if (!isCancelled() && withCors) loadImage(url, onLoad, isCancelled, false);
  };
  el.src = url;
}

// 不在视口里就不画；环境不支持时当作一直可见
function watchVisibility(frame, onChange) {
  if (typeof IntersectionObserver !== 'function') return null;
  let visible = true;
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting === visible) return;
    visible = entry.isIntersecting;
    onChange(visible);
  }, { rootMargin: '150px' });
  observer.observe(frame);
  return observer;
}

function createScene(frame, ctx, aspect) {
  const { root, branches } = buildTree(aspect);
  const [r, g, b] = readCssColor(frame, 'var(--we-color-bg-canvas)');
  return {
    ctx, root, branches, width: 0, height: 0, scale: 1,
    dark: 0.299 * r + 0.587 * g + 0.114 * b < 128,
    clock: 0, split: 0, fade: 0, hasColors: false, image: null, loadedAt: -1,
  };
}

function renderAt(scene, split, now) {
  scene.split = split;
  scene.fade = scene.loadedAt < 0 ? 0 : smoothstep(0, COLOR_MS, now - scene.loadedAt);
  drawScene(scene);
}

// 减少动效没有循环，直接画落定的一帧
function renderSettled(scene) {
  const settled = scene.loadedAt < 0 ? performance.now() : scene.loadedAt + COLOR_MS;
  renderAt(scene, scene.image ? 1 : WAIT_CAP, settled);
}

// 改尺寸会清空画布，尺寸变了就重画
function fitCanvas(scene, frame, canvas, repaint) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = frame.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  scene.scale = dpr;
  if (w === scene.width && h === scene.height) return;
  scene.width = w;
  scene.height = h;
  canvas.width = w;
  canvas.height = h;
  repaint();
}

// 一帧的推进：收尾由图片到达决定，而不是进度数字；返回是否已完全落定
function advance(scene, run, dt, now) {
  run.elapsed += dt;
  scene.clock = run.elapsed;
  const ready = scene.image !== null;
  const target = ready ? 1 : selfPaced(run.elapsed * 1000);
  run.eased += (target - run.eased) * (1 - Math.exp(-dt * 5.5));
  const wanted = Math.min(run.eased, ready ? 1 : WAIT_CAP);
  run.split += (wanted - run.split) * (1 - Math.exp(-dt * 4));
  renderAt(scene, run.split, now);
  return ready && run.eased > 0.995 && now - scene.loadedAt > COLOR_MS && run.split > 0.9995;
}

function animateScene(scene, frame) {
  const run = { elapsed: 0, eased: 0, split: 0 };
  let frameId = 0;
  let last = 0;
  let stopped = false;
  const tick = (now) => {
    frameId = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!advance(scene, run, dt, now)) return;
    // 之后不再有变化，停掉循环
    renderAt(scene, 1, now);
    stopped = true;
    cancelAnimationFrame(frameId);
  };
  const start = () => {
    if (stopped) return;
    last = 0;
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(tick);
  };
  const visibility = watchVisibility(frame, (visible) => (visible ? start() : cancelAnimationFrame(frameId)));
  start();
  return () => {
    cancelAnimationFrame(frameId);
    visibility?.disconnect();
  };
}

function runReveal({ frame, canvas, src, aspect, reduced }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  const scene = createScene(frame, ctx, aspect);
  let cancelled = false;
  const repaint = () => (reduced ? renderSettled(scene) : renderAt(scene, scene.split, performance.now()));
  const resize = () => fitCanvas(scene, frame, canvas, repaint);
  resize();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(frame);

  if (src) {
    loadImage(src, (el) => {
      scene.image = el;
      scene.loadedAt = performance.now();
      scene.hasColors = readAverages(el, scene.root, scene.branches, scene.split);
      if (reduced) repaint();
    }, () => cancelled);
  }

  if (reduced) repaint();
  const stopAnimation = reduced ? null : animateScene(scene, frame);
  return () => {
    cancelled = true;
    stopAnimation?.();
    observer?.disconnect();
  };
}

export default function GridReveal({ src, alt = '', aspect = 1, className = '' }) {
  const { reduced } = useMotion();
  const frameRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!frameRef.current || !canvasRef.current) return undefined;
    return runReveal({ frame: frameRef.current, canvas: canvasRef.current, src, aspect, reduced });
  }, [reduced, src, aspect]);

  return (
    <div ref={frameRef} className={`we-grid-reveal${className ? ` ${className}` : ''}`}>
      <canvas ref={canvasRef} {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })} />
    </div>
  );
}
