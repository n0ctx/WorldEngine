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

  async function handleCharReorderEnd(finalChars) {
    await saveItemOrder(finalChars, reorderCharacters);
  }

  return { deletingChar, setDeletingChar, handleDeleteChar, handleCharReorderEnd };
}
