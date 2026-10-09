import { useState } from 'react';
import { getCharactersByWorld, deleteCharacter, reorderCharacters } from '../../../core/api/characters';
import { log } from '../../../core/utils/logger.js';
import { saveItemOrder } from '../components/saveItemOrder.js';

// ── 角色删除 / 排序 ─────────────────────────────────────────────────────────

export function useCharacterActions(worldId, setCharacters) {
  const [deletingChar, setDeletingChar] = useState(null);

  async function handleDeleteChar() {
    try {
      await deleteCharacter(deletingChar.id);
      setDeletingChar(null);
      const chars = await getCharactersByWorld(worldId);
      setCharacters(chars);
    } catch (err) {
      log.error('character.delete_failed', err, { toast: `删除失败：${err.message}` });
    }
  }

  // 网格拖动只在松手时交出最终顺序：先排好本地列表，保存失败再按服务端顺序重读
  async function handleCharReorderEnd(finalChars) {
    setCharacters(finalChars);
    try {
      await saveItemOrder(finalChars, reorderCharacters);
    } catch (err) {
      log.error('character.sort.save_failed', err, { toast: `排序保存失败：${err.message}` });
      setCharacters(await getCharactersByWorld(worldId));
    }
  }

  return { deletingChar, setDeletingChar, handleDeleteChar, handleCharReorderEnd };
}
