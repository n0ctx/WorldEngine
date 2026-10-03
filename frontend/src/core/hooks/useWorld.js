import { useEffect, useState } from 'react';
import { getWorld } from '../api/worlds.js';
import { log } from '../utils/logger.js';

/**
 * 按 id 取一个世界（封面、名字、主色等）。worldId 变化后、新结果到达前返回 null，不显示上一个世界的数据。
 */
export function useWorld(worldId) {
  const [loaded, setLoaded] = useState({ id: null, world: null });

  useEffect(() => {
    if (!worldId) return undefined;
    let cancelled = false;
    getWorld(worldId)
      .then((world) => { if (!cancelled) setLoaded({ id: worldId, world }); })
      .catch((err) => { if (!cancelled) log.error('world.load_failed', err); });
    return () => { cancelled = true; };
  }, [worldId]);

  return worldId && loaded.id === worldId ? loaded.world : null;
}
