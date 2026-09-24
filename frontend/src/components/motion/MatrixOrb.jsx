/* 移植自 Rare UI matrix-orb — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 点阵球：idle 缓慢呼吸，thinking 有三颗热点绕行；状态切换时按权重从屏上现状过渡。 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useInView } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';
import { readCssColor } from './readCssColor.js';

const TAU = Math.PI * 2;
const STATES = ['idle', 'thinking'];
const SCALE = { idle: 0.88, thinking: 0.92 };

const STIFFNESS = 180;
const DAMPING = 26;
const BLEND = 0.16;

const ORBITERS = [
  { radius: 0.62, speed: 2.2, phase: 0, spread: 0.42 },
  { radius: 0.4, speed: -1.7, phase: 2.1, spread: 0.36 },
  { radius: 0.8, speed: 1.15, phase: 4, spread: 0.34 },
];

function intensityOf(state, d, nx, ny, t) {
  if (state === 'thinking') {
    let heat = 0;
    for (const o of ORBITERS) {
      const a = t * o.speed + o.phase;
      const dx = nx - Math.cos(a) * o.radius;
      const dy = ny - Math.sin(a) * o.radius;
      heat += Math.exp(-(dx * dx + dy * dy) / (o.spread * o.spread));
    }
    return 0.26 + 0.8 * Math.min(1, heat);
  }
  return 0.62 + 0.12 * Math.sin(t * 1.05 - d * 2.4);
}

function subscribeToZoom(onChange) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

// 缩放会改变 devicePixelRatio，按旧值建的缓冲会被放大发糊
function useDevicePixelRatio() {
  return useSyncExternalStore(subscribeToZoom, () => Math.min(window.devicePixelRatio || 1, 2), () => 1);
}

export default function MatrixOrb({ state = 'thinking', size = 24, dots = 9, label, className = '' }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const redrawRef = useRef(null);
  const dpr = useDevicePixelRatio();
  const { reduced } = useMotion();
  const inView = useInView(rootRef);

  useEffect(() => {
    stateRef.current = state;
    redrawRef.current?.();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const buffer = Math.round(size * dpr);
    canvas.width = canvas.height = buffer;
    ctx.scale(buffer / size, buffer / size);
    ctx.fillStyle = `rgb(${readCssColor(rootRef.current, 'var(--we-color-accent)').join(',')})`;

    const grid = Math.max(3, Math.round(dots));
    const half = (grid - 1) / 2;
    const spacing = (size * 0.74) / (grid - 1);
    const maxRadius = spacing * 0.6;
    const center = size / 2;

    const weights = { idle: 0, thinking: 0 };
    weights[stateRef.current] = 1;

    const draw = (t, scale) => {
      ctx.clearRect(0, 0, size, size);
      for (let iy = 0; iy < grid; iy++) {
        for (let ix = 0; ix < grid; ix++) {
          const nx = (ix - half) / half;
          const ny = (iy - half) / half;
          const d = Math.hypot(nx, ny);
          // 1.12 而不是方形角上的 1.41，轮廓才是圆的
          if (d > 1.12) continue;
          let blended = 0;
          for (const s of STATES) {
            if (weights[s] < 0.001) continue;
            blended += weights[s] * intensityOf(s, d, nx, ny, t);
          }
          const radius = maxRadius * Math.exp(-d * d * 1.7) * Math.min(1, Math.max(0, blended)) * scale;
          // 小于半个设备像素只会渲染成一团雾
          if (radius * dpr < 0.5) continue;
          ctx.beginPath();
          ctx.arc(center + (ix - half) * spacing * scale, center + (iy - half) * spacing * scale, radius, 0, TAU);
          ctx.fill();
        }
      }
    };

    if (reduced || !inView) {
      redrawRef.current = () => {
        const current = stateRef.current;
        for (const s of STATES) weights[s] = s === current ? 1 : 0;
        draw(0, SCALE[current]);
      };
      redrawRef.current();
      return () => { redrawRef.current = null; };
    }

    let t = 0;
    let scale = SCALE[stateRef.current];
    let velocity = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;
      const current = stateRef.current;
      // 按状态分别求权重，中途切换时从屏上现状过渡
      const step = 1 - Math.pow(1 - BLEND, dt * 60);
      for (const s of STATES) weights[s] += ((s === current ? 1 : 0) - weights[s]) * step;
      velocity += (-STIFFNESS * (scale - SCALE[current]) - DAMPING * velocity) * dt;
      scale += velocity * dt;
      draw(t, scale);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // state 不进依赖：循环只换目标，不重启
  }, [size, dots, dpr, reduced, inView]);

  return (
    <span ref={rootRef} className={`we-matrix-orb${className ? ` ${className}` : ''}`} data-state={state}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ width: size, height: size }} />
      {label && <span role="status" aria-live="polite" className="we-matrix-orb__label">{label}</span>}
    </span>
  );
}
