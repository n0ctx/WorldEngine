import { useEffect, useState } from 'react';
import ModalShell from '../ui/ModalShell.jsx';
import CharacterSeal from '../chat/CharacterSeal.jsx';
import { getCharactersByWorld } from '../../api/characters.js';
import { addSavedNearbyFromCharacter } from '../../api/session-nearby.js';
import { log } from '../../utils/logger.js';

export default function AddSavedNearbyModal({ worldId, sessionId, nearby, onAdded, onClose }) {
  const [chars, setChars] = useState(null); // null = loading, [] = empty
  const [adding, setAdding] = useState(null);
  const occupiedNames = new Set((nearby ?? []).map((n) => n.name));

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
      await addSavedNearbyFromCharacter(worldId, sessionId, charId);
      onAdded?.();
    } catch (e) {
      if (e?.status === 409) log.error('nearby.add.duplicate', e, { toast: '名字已在登场角色池中' });
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
          const taken = occupiedNames.has(c.name);
          return (
            <div key={c.id} className="we-cast-add-modal-row">
              <CharacterSeal character={c} size={32} />
              <span className="we-cast-add-modal-name">{c.name}</span>
              <button
                type="button"
                onClick={() => handleAdd(c.id)}
                disabled={taken || adding === c.id}
                className="we-cast-add-modal-action"
              >
                {taken ? '已在池中' : adding === c.id ? '…' : '添加'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="we-cast-add-modal-footer">
        <button
          type="button"
          onClick={onClose}
          className="we-cast-add-modal-close"
        >
          关闭
        </button>
      </div>
    </ModalShell>
  );
}
