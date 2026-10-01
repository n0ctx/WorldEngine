import { useEffect, useState } from 'react';
import ModalShell from '../../../components/ui/ModalShell.jsx';
import Button from '../../../components/ui/Button.jsx';
import CharacterSeal from '../../../components/chat/CharacterSeal.jsx';
import { getCharactersByWorld } from '../../../core/api/characters.js';
import { createEntityFromCard } from '../../../core/api/state-memory.js';
import { log } from '../../../core/utils/logger.js';

/** 从角色卡添加实体：建立置顶、关联卡片的角色实体 */
export default function AddEntityFromCardModal({ worldId, sessionId, entities, onAdded, onClose }) {
  const [chars, setChars] = useState(null); // null = loading, [] = empty
  const [adding, setAdding] = useState(null);
  const occupiedCardIds = new Set((entities ?? []).filter((e) => e.status === 'active' && e.card_id).map((e) => e.card_id));

  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    getCharactersByWorld(worldId)
      .then((rows) => { if (!cancelled) setChars(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setChars([]); });
    return () => { cancelled = true; };
  }, [worldId]);

  async function handleAdd(charId) {
    setAdding(charId);
    try {
      await createEntityFromCard(sessionId, charId);
      onAdded?.();
    } catch (e) {
      if (e?.status === 409) log.error('nearby.add.duplicate', e, { toast: '该角色已在状态记忆中' });
      else log.error('nearby.add.failed', e, { toast: e?.message || '添加失败' });
    } finally {
      setAdding(null);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-sm">
      <div className="we-cast-add-modal-body">
        <p className="we-cast-add-modal-title">从角色卡添加</p>
        {chars === null && (
          <p className="we-cast-add-modal-empty">加载中…</p>
        )}
        {chars !== null && chars.length === 0 && (
          <p className="we-cast-add-modal-empty">该世界暂无角色卡</p>
        )}
        {chars !== null && chars.map((c) => {
          const taken = occupiedCardIds.has(c.id);
          return (
            <div key={c.id} className="we-cast-add-modal-row">
              <CharacterSeal character={c} size={32} />
              <span className="we-cast-add-modal-name">{c.name}</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleAdd(c.id)}
                disabled={taken || adding === c.id}
              >
                {taken ? '已添加' : adding === c.id ? '…' : '添加'}
              </Button>
            </div>
          );
        })}
      </div>
      <div className="we-cast-add-modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </div>
    </ModalShell>
  );
}
