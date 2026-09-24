import { useId, useMemo } from 'react';
import { buildWorldScene, SCENE_HEIGHT, SCENE_WIDTH } from '../../core/utils/worldScene.js';

// 光晕按近似指数衰减：核心很亮，往外迅速变淡，长尾极弱
const GLOW_STOPS = [
  [0, 0.95],
  [0.03, 0.7],
  [0.07, 0.42],
  [0.14, 0.2],
  [0.28, 0.08],
  [0.5, 0.025],
  [1, 0],
];

// 无封面世界的场景画：按世界名稳定生成，铺满父容器（裁切而非留边）
export default function WorldSceneArt({ name, className }) {
  const scene = useMemo(() => buildWorldScene(name), [name]);
  const id = useId();
  const skyId = `${id}-sky`;
  const glowId = `${id}-glow`;
  const scatterId = `${id}-scatter`;
  const fogId = `${id}-fog`;
  const fogBlurId = `${id}-fog-blur`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      data-scene-hue={scene.hue}
    >
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={scene.sky.top} />
          <stop offset="0.55" stopColor={scene.sky.middle} />
          <stop offset="1" stopColor={scene.sky.bottom} />
        </linearGradient>
        <radialGradient id={glowId}>
          {GLOW_STOPS.map(([offset, opacity]) => (
            <stop key={offset} offset={offset} stopColor={scene.light.color} stopOpacity={opacity} />
          ))}
        </radialGradient>
        {/* 地平线上被光源照亮的一层散射，压扁成横向椭圆 */}
        <radialGradient id={scatterId}>
          <stop offset="0" stopColor={scene.light.color} stopOpacity="0.32" />
          <stop offset="0.45" stopColor={scene.haze} stopOpacity="0.14" />
          <stop offset="1" stopColor={scene.haze} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={fogId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={scene.haze} stopOpacity="0" />
          <stop offset="0.35" stopColor={scene.haze} stopOpacity="0.3" />
          <stop offset="1" stopColor={scene.haze} stopOpacity="0" />
        </linearGradient>
        <filter id={fogBlurId} x="-5%" y="-40%" width="110%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {scene.layers.map((layer, i) => (
          <linearGradient key={i} id={`${id}-layer${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={layer.top} />
            <stop offset="1" stopColor={layer.bottom} />
          </linearGradient>
        ))}
      </defs>
      <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill={`url(#${skyId})`} />
      {scene.stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
      ))}
      <ellipse
        cx={scene.light.x}
        cy={scene.horizon}
        rx={SCENE_WIDTH * 0.75}
        ry={SCENE_HEIGHT * 0.16}
        fill={`url(#${scatterId})`}
      />
      <circle cx={scene.light.x} cy={scene.light.y} r={scene.light.r * 14} fill={`url(#${glowId})`} />
      <circle cx={scene.light.x} cy={scene.light.y} r={scene.light.r} fill={scene.light.color} />
      {scene.layers.map((layer, i) => (
        <g key={i}>
          <path d={layer.d} fill={`url(#${id}-layer${i})`} />
          {/* 雾片浮在本层山脚、下一层之后，边缘模糊散开 */}
          {layer.fog && <path d={layer.fog} fill={`url(#${fogId})`} filter={`url(#${fogBlurId})`} />}
        </g>
      ))}
    </svg>
  );
}
