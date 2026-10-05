import { useId, useMemo } from 'react';
import { buildWorldScene, SCENE_HEIGHT as H, SCENE_WIDTH as W } from '../../core/utils/worldScene.js';

const GRID = Array.from({ length: 11 }, (_, i) => i * 40);
// 行星表面的纬线（相对半径的高度）与经线（相对半径的横向半轴）
const LATITUDES = [-0.66, -0.33, 0, 0.33, 0.66];
const MERIDIANS = [0.3, 0.68];

// 无封面世界的场景画「星图」：按世界名稳定生成，铺满父容器（裁切而非留边）
export default function WorldSceneArt({ name, className }) {
  const s = useMemo(() => buildWorldScene(name), [name]);
  const id = useId();
  const { cx, cy, r } = s.planet;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      data-scene-hue={s.hue}
    >
      <defs>
        <radialGradient id={`${id}-sky`} cx={cx / W} cy={cy / H} r="0.9">
          <stop offset="0" stopColor={s.sky} />
          <stop offset="1" stopColor={s.deep} />
        </radialGradient>
        <radialGradient id={`${id}-planet`} cx="0.32" cy="0.26" r="0.85">
          <stop offset="0" stopColor={s.lit} />
          <stop offset="1" stopColor={s.dark} />
        </radialGradient>
        <clipPath id={`${id}-clip`}><circle cx={cx} cy={cy} r={r} /></clipPath>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      <g stroke={s.line} strokeOpacity="0.07">
        {GRID.map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2={H} />)}
        {GRID.map((y) => <line key={`h${y}`} x1="0" y1={y} x2={W} y2={y} />)}
      </g>
      <g stroke={s.line} strokeOpacity="0.5">
        {GRID.map((x) => <line key={x} x1={x} y1="0" x2={x} y2="6" />)}
      </g>
      {/* 大气：行星外一圈淡光 */}
      <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={s.lit} strokeOpacity="0.14" strokeWidth="12" />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}-planet)`} />
      <g clipPath={`url(#${id}-clip)`} fill="none" stroke={s.line} strokeOpacity="0.28">
        <g transform={`rotate(${s.tilt} ${cx} ${cy})`}>
          {LATITUDES.map((k) => {
            const rx = r * Math.sqrt(1 - k * k);
            return <ellipse key={k} cx={cx} cy={cy + k * r} rx={rx} ry={rx * 0.2} />;
          })}
          {MERIDIANS.map((k) => <ellipse key={k} cx={cx} cy={cy} rx={r * k} ry={r} />)}
        </g>
        {/* 明暗交界：右下压一块夜面 */}
        <circle cx={cx + r * 0.45} cy={cy + r * 0.38} r={r * 1.02} fill={s.deep} fillOpacity="0.62" stroke="none" />
      </g>
      <g transform={`translate(${cx} ${cy}) rotate(${s.tilt})`} fill="none" stroke={s.signal}>
        {s.orbits.map((o) => <ellipse key={o.rx} rx={o.rx} ry={o.ry} strokeOpacity="0.6" strokeDasharray="2 6" strokeLinecap="round" />)}
        <circle cx={s.moon.x} cy={s.moon.y} r="4.5" fill={s.signal} stroke="none" />
        <circle cx={s.moon.x} cy={s.moon.y} r="10" strokeOpacity="0.8" />
      </g>
      <polyline points={s.stars.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={s.line} strokeOpacity="0.55" />
      {s.stars.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 2.6 : 1.8} fill={s.line} />)}
      <circle cx={s.stars[0].x} cy={s.stars[0].y} r="7" fill="none" stroke={s.signal} />
      <text x={W - 14} y="24" textAnchor="end" fill={s.line} fontSize="11" letterSpacing="2" className="we-world-scene__code">
        {s.code}
      </text>
    </svg>
  );
}
