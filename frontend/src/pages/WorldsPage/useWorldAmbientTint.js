import { useEffect, useState } from 'react';
import useStore from '../../core/state/index';
import { extractAccentColorFromImageSrc } from '../../core/utils/extractAccentColor.js';
import { getAvatarUrl } from '../../core/utils/avatar';
import { buildWorldScene } from '../../core/utils/worldScene.js';

function worldTint(world, coverTints) {
  if (world.accent_color) return world.accent_color;
  // 封面还没取到色时沿用主题色；没有封面时用场景画的染色。
  if (world.cover_path) return coverTints[world.id] ?? null;
  return buildWorldScene(world.name).tint;
}

export function useWorldAmbientTint(worlds) {
  const setAmbientTint = useStore((state) => state.setAmbientTint);
  const [litWorld, setLitWorld] = useState(null);
  const [coverTints, setCoverTints] = useState({});

  const tintWorld = litWorld ?? worlds[0] ?? null;
  const ambientTint = tintWorld ? worldTint(tintWorld, coverTints) : null;

  useEffect(() => { setAmbientTint(ambientTint); }, [ambientTint, setAmbientTint]);
  useEffect(() => {
    if (!tintWorld?.cover_path || tintWorld.accent_color || tintWorld.id in coverTints) return;
    const { id, cover_path: coverPath } = tintWorld;
    extractAccentColorFromImageSrc(getAvatarUrl(coverPath))
      .then((color) => setCoverTints((previous) => ({ ...previous, [id]: color })));
  }, [tintWorld, coverTints]);
  useEffect(() => () => setAmbientTint(null), [setAmbientTint]);

  return { litWorld, setLitWorld };
}
