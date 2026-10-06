/**
 * 背景氛围层：垫在全部内容后面的一层静态光晕 + 一张动态画布。
 * - 画布画什么由主题的 --we-atmosphere-kind 选：dust 光尘（lightDust.js）/ rain 代码雨（codeRain.js）/ wall 字模墙（typeWall.js），换主题时随下一次重读切换；
 * - 颜色取 --we-atmosphere-color：进入世界后随封面主色变，书架页悬停入口时由外壳临时覆盖成该世界主色；
 * - names 是全部世界的世界名、角色名、玩家名（useAtmosphereNames），字模墙从里面取字模上的字和要拼的名字，随下一次重读交给场景；
 * - 强度由 CSS 按场景取 --we-atmosphere-opacity / --we-atmosphere-opacity-quiet 作用在 canvas 上；
 * - 页面隐藏时停掉循环；系统要求减少动效时不渲染 canvas，只留静态光晕。
 */
import { useEffect, useRef } from 'react';
import { useMotion } from '../../../core/hooks/useMotion.js';
import { hexToRgb } from '../../../core/utils/color.js';
import { createRainScene } from './codeRain.js';
import { createDustScene } from './lightDust.js';
import { createTypeWallScene } from './typeWall.js';

const MAX_DPR = 2;
// 主题切换不发事件给这里，按固定间隔重读一次 token；已知的换色（colorKey）立即重读
const TOKEN_REFRESH_SECONDS = 1;
// 画布每变一帧，整页（毛玻璃、遮罩、封面图）都要重新合成，满帧率下 Electron 里 GPU 常年占三四成；
// 氛围运动缓慢，限到 30 帧，步进按实际间隔算，速度不变。60Hz 下帧间隔有抖动，留一点余量才能稳定隔一帧画一次
const FRAME_INTERVAL_MS = 1000 / 30 - 4;
const SCENES = { dust: createDustScene, rain: createRainScene, wall: createTypeWallScene };
const NO_NAMES = [];

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

function Canvas({ colorKey, names }) {
  const canvasRef = useRef(null);
  const staleRef = useRef(true);
  const namesRef = useRef(names);

  useEffect(() => {
    namesRef.current = names;
    staleRef.current = true;
  }, [colorKey, names]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let sinceRead = 0;
    let kind = '';
    let scene = null;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene?.resize(width, height);
    }

    function readTokens() {
      const style = getComputedStyle(canvas);
      const wanted = style.getPropertyValue('--we-atmosphere-kind').trim();
      const next = SCENES[wanted] ? wanted : 'dust';
      if (next !== kind) {
        scene?.dispose();
        ctx.clearRect(0, 0, width, height);
        kind = next;
        scene = SCENES[kind](canvas);
        scene.resize(width, height);
      }
      scene.read((token) => toRgb(ctx, style.getPropertyValue(token)), (token) => style.getPropertyValue(token).trim(), namesRef.current);
    }

    function draw(now) {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      sinceRead += dt;
      if (!scene || staleRef.current || sinceRead >= TOKEN_REFRESH_SECONDS) {
        readTokens();
        staleRef.current = false;
        sinceRead = 0;
      }
      scene.frame(ctx, dt);
    }

    function tick(now) {
      if (!last || now - last >= FRAME_INTERVAL_MS) draw(now);
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    }

    // 停下时连场景一起丢掉：光尘的贴图在 Edge 里只掉引用不会释放，代码雨和字模墙的指针监听也要撤
    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      scene?.dispose();
      scene = null;
      kind = '';
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
      canvas.width = 0;
      canvas.height = 0;
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="we-atmosphere-canvas" />;
}

export default function AtmosphereLayer({ quiet = false, colorKey = '', names = NO_NAMES }) {
  const { reduced } = useMotion();
  return (
    <div className={`we-atmosphere${quiet ? ' we-atmosphere--quiet' : ''}`} aria-hidden="true">
      {reduced ? null : <Canvas colorKey={colorKey} names={names} />}
    </div>
  );
}
