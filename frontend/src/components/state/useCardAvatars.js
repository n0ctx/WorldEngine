import { useEffect, useState } from 'react';
import { getCharactersByWorld } from '../../core/api/characters.js';

/** 本世界角色卡的头像：card_id → avatar_path。状态记忆里的角色实体只记着关联的卡，头像要从卡上取 */
export function useCardAvatars(worldId) {
  const [avatars, setAvatars] = useState(() => new Map());

  useEffect(() => {
    if (!worldId) return undefined;
    let cancelled = false;
    getCharactersByWorld(worldId)
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        setAvatars(new Map(rows.filter((row) => row.avatar_path).map((row) => [row.id, row.avatar_path])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [worldId]);

  return avatars;
}
