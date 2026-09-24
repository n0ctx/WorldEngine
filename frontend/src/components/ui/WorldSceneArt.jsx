import { useId, useMemo } from 'react';
import { buildWorldScene, SCENE_HEIGHT, SCENE_WIDTH } from '../../core/utils/worldScene.js';

// 无封面世界的场景画：按世界名稳定生成，铺满父容器（裁切而非留边）
export default function WorldSceneArt({ name, className }) {
  const scene = useMemo(() => buildWorldScene(name), [name]);
  const id = useId();
  const skyId = `${id}-sky`;
  const glowId = `${id}-glow`;
  const hazeId = `${id}-haze`;

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
          <stop offset="1" stopColor={scene.sky.bottom} />
        </linearGradient>
        <radialGradient id={glowId}>
          <stop offset="0" stopColor={scene.light.color} stopOpacity="0.9" />
          <stop offset="0.08" stopColor={scene.light.color} stopOpacity="0.45" />
          <stop offset="0.35" stopColor={scene.light.color} stopOpacity="0.12" />
          <stop offset="1" stopColor={scene.light.color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={hazeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={scene.haze} stopOpacity="0" />
          <stop offset="0.5" stopColor={scene.haze} stopOpacity="0.35" />
          <stop offset="1" stopColor={scene.haze} stopOpacity="0" />
        </linearGradient>
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
      <circle cx={scene.light.x} cy={scene.light.y} r={scene.light.r * 12} fill={`url(#${glowId})`} />
      <circle cx={scene.light.x} cy={scene.light.y} r={scene.light.r} fill={scene.light.color} />
      {scene.layers.map((layer, i) => (
        <g key={i}>
          {/* 每层山前都浮着一条雾，把远近层次隔开 */}
          <rect y={scene.horizon - 60 + i * 34} width={SCENE_WIDTH} height="90" fill={`url(#${hazeId})`} />
          <path d={layer.d} fill={`url(#${id}-layer${i})`} />
        </g>
      ))}
    </svg>
  );
}
