/**
 * 背景氛围层：垫在全部内容后面的一层静态光晕 + 一张画光尘的 canvas。
 * - 颜色取 --we-atmosphere-color：进入世界后随封面主色变，书架页悬停入口时由外壳临时覆盖成该世界主色；
 * - 强度由 CSS 按场景取 --we-atmosphere-opacity / --we-atmosphere-opacity-quiet 作用在 canvas 上；
 * - 页面隐藏时停掉循环；系统要求减少动效时不渲染 canvas，只留静态光晕。
 */
import { useEffect, useRef } from 'react';
import { useMotion } from '../../../core/hooks/useMotion.js';
import { hexToRgb } from '../../../core/utils/color.js';
import { approachColor, createMoteSprite, createMotes, drawFrame, moteCountFor, stepMotes } from './lightDust.js';

const MAX_DPR = 2;
// 主题切换不发事件给这里，按固定间隔重读一次 token；已知的换色（colorKey）立即重读
const TOKEN_REFRESH_SECONDS = 1;

/** 借 canvas 把任意 CSS 颜色规范成 #rrggbb 或 rgba(...)，再转成 {r,g,b} */
function toRgb(ctx, value) {
  if (!value) return null;
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value.trim();
  const normalized = ctx.fillStyle;
  const hex = hexToRgb(normalized);
  if (hex) return hex;
  const m = normalized.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) } : null;
}

function Canvas({ colorKey }) {
  const canvasRef = useRef(null);
  const staleRef = useRef(true);

  useEffect(() => {
    staleRef.current = true;
  }, [colorKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let motes = [];
    let frame = 0;
    let last = 0;
    let time = 0;
    let sinceRead = 0;
    let target = null;
    let color = null;
    let sprite = null;
    let spriteKey = '';

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (motes.length !== moteCountFor(width)) motes = createMotes(moteCountFor(width), width, height);
    }

    function tick(now) {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      time += dt;
      sinceRead += dt;
      if (staleRef.current || sinceRead >= TOKEN_REFRESH_SECONDS) {
        target = toRgb(ctx, getComputedStyle(canvas).getPropertyValue('--we-atmosphere-color'));
        staleRef.current = false;
        sinceRead = 0;
      }
      if (target) color = color ? approachColor(color, target, dt) : target;
      if (color) {
        const key = `${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)}`;
        if (key !== spriteKey) {
          sprite = createMoteSprite(color);
          spriteKey = key;
        }
        stepMotes(motes, dt, width, height);
        drawFrame(ctx, { motes, sprite, width, height, color, time });
      }
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="we-atmosphere-canvas" />;
}

export default function AtmosphereLayer({ quiet = false, colorKey = '' }) {
  const { reduced } = useMotion();
  return (
    <div className={`we-atmosphere${quiet ? ' we-atmosphere--quiet' : ''}`} aria-hidden="true">
      {reduced ? null : <Canvas colorKey={colorKey} />}
    </div>
  );
}
