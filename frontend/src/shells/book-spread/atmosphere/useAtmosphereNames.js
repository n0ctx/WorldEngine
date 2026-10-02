/**
 * 背景氛围里压出来的字取自这些名字：世界内取世界名、该世界的角色名和当前玩家名；书架层取全部世界名。
 * 进出世界时重取；取不到时返回空数组，场景用自己的默认字。
 */
import { useEffect, useState } from 'react';
import { getCharactersByWorld } from '../../../core/api/characters.js';
import { getPersona } from '../../../core/api/personas.js';
import { getWorld, getWorlds } from '../../../core/api/worlds.js';
import { useScopedWorldId } from '../../../core/features/worldAccent/useWorldAccentVars.js';

const NO_NAMES = [];

async function loadNames(worldId) {
  if (!worldId) return (await getWorlds()).map((world) => world.name);
  const [world, characters, persona] = await Promise.all([
    getWorld(worldId),
    getCharactersByWorld(worldId),
    getPersona(worldId).catch(() => null),
  ]);
  return [world?.name, ...characters.map((character) => character.name), persona?.name];
}

export function useAtmosphereNames() {
  const worldId = useScopedWorldId();
  // 记下这份名字是为哪个世界取的：换世界后、新结果回来前不沿用上一个世界的名字
  const [loaded, setLoaded] = useState({ worldId: undefined, names: NO_NAMES });

  useEffect(() => {
    let cancelled = false;
    loadNames(worldId)
      .then((names) => { if (!cancelled) setLoaded({ worldId, names: names.filter(Boolean) }); })
      .catch(() => { if (!cancelled) setLoaded({ worldId, names: NO_NAMES }); });
    return () => { cancelled = true; };
  }, [worldId]);

  return loaded.worldId === worldId ? loaded.names : NO_NAMES;
}
