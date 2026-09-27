import { useState } from 'react';
import { listPersonas, activatePersona, deletePersona, reorderPersonas } from '../../../core/api/personas';
import { getWorldTimeline } from '../../../core/api/sessions';
import { log } from '../../../core/utils/logger.js';
import { saveItemOrder } from '../components/saveItemOrder.js';

// ── 玩家卡删除 / 激活 / 排序 ─────────────────────────────────────────────────

export function usePersonaActions({ worldId, setPersonas, setTimeline, setPersonaExpanded, setCurrentWritingSessionId }) {
  const [deletingPersona, setDeletingPersona] = useState(null);

  async function handleDeletePersona() {
    try {
      await deletePersona(deletingPersona.id);
      setDeletingPersona(null);
      const ps = await listPersonas(worldId);
      setPersonas(ps);
    } catch (err) {
      log.error('character.delete_failed', err, { toast: `删除失败：${err.message}` });
      setDeletingPersona(null);
    }
  }

  async function handleActivatePersona(personaId) {
    try {
      const ps = await activatePersona(worldId, personaId);
      setPersonas(ps);
      // 激活切换后写作 session hint 可能指向旧 persona 的 session，清掉避免误命中
      setCurrentWritingSessionId(null);
      setPersonaExpanded(false);
      // 故事线里的写作会话按当前激活 persona 过滤，切换后必须重拉，否则左栏还显示旧 persona 的写作故事线
      const tl = await getWorldTimeline(worldId);
      setTimeline(tl);
    } catch (err) {
      log.error('character.activate_failed', err, { toast: `激活失败：${err.message}` });
    }
  }

  async function handlePersonaReorderEnd(finalPersonas) {
    await saveItemOrder(finalPersonas, reorderPersonas);
  }

  return { deletingPersona, setDeletingPersona, handleDeletePersona, handleActivatePersona, handlePersonaReorderEnd };
}
