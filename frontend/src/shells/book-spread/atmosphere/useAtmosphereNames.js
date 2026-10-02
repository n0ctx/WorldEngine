/**
 * 背景氛围里压出来的名字：全部世界的世界名、角色名和玩家名。打开应用时取一次；
 * 某个世界的角色或玩家取不到时跳过那一份，世界列表都取不到时返回空数组，场景用自己的默认词。
 */
import { useEffect, useState } from 'react';
import { getCharactersByWorld } from '../../../core/api/characters.js';
import { listPersonas } from '../../../core/api/personas.js';
import { getWorlds } from '../../../core/api/worlds.js';

const NO_NAMES = [];

async function loadNames() {
  const worlds = await getWorlds();
  const members = await Promise.allSettled(worlds.flatMap((world) => [getCharactersByWorld(world.id), listPersonas(world.id)]));
  const people = members.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  return [...worlds, ...people].map((item) => item.name).filter(Boolean);
}

export function useAtmosphereNames() {
  const [names, setNames] = useState(NO_NAMES);

  useEffect(() => {
    let cancelled = false;
    loadNames()
      .then((loaded) => { if (!cancelled) setNames(loaded); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return names;
}
