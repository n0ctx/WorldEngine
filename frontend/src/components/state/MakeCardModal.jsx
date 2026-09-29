import { useEffect, useState } from 'react';
import ModalShell from '../ui/ModalShell.jsx';
import { analyzeEntityForCard, createCharacterFromEntity } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

/**
 * 制卡 Modal —— 基于状态记忆实体，两种模式（对话 NPC 页签、写作角色页签）共用。
 * 打开即用 LLM 生成四字段草稿（可编辑），确认后从该实体新建公共角色卡。
 *
 * 不引入新色值，沿用既有 we-cast-add-modal-* / we-make-card-modal-* 视觉。
 */
export default function MakeCardModal({ worldId, sessionId, entity, onClose, onCreated }) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // 用微任务把同步 setState 挪出 effect 执行路径（参照 useStateMemory.js 的写法）
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');
    });
    analyzeEntityForCard(sessionId, entity.entity_id)
      .then((d) => {
        if (cancelled) return;
        setDraft({
          name: d?.name ?? entity.name ?? '',
          system_prompt: d?.system_prompt ?? '',
          description: d?.description ?? '',
          first_message: d?.first_message ?? '',
        });
      })
      .catch((e) => {
        if (cancelled) return;
        log.error('card.analyze_failed', e, { toast: e?.message || '分析失败' });
        setError(e?.message || '分析失败');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, entity.entity_id, entity.name]);

  async function handleConfirm() {
    if (!draft) return;
    if (!draft.name.trim()) {
      log.error('card.name.invalid', null, { toast: '名字不能为空' });
      return;
    }
    setLoading(true);
    try {
      await createCharacterFromEntity(worldId, {
        session_id: sessionId,
        entity_id: entity.entity_id,
        name: draft.name.trim(),
        system_prompt: draft.system_prompt,
        description: draft.description,
        first_message: draft.first_message,
      });
      log.success('card.create.success', null, { toast: '已保存为角色卡' });
      onCreated?.();
    } catch (e) {
      if (e?.status === 409) log.error('card.name.duplicate', e, { toast: '该名字已被占用' });
      else log.error('card.create_failed', e, { toast: e?.message || '创建失败' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={loading ? () => {} : onClose} maxWidth="max-w-md">
      <div className="we-cast-add-modal-body we-make-card-modal-preview">
        <p className="we-cast-add-modal-title">制成角色卡（可编辑）</p>

        {!draft && loading && (
          <p className="we-cast-add-modal-empty">分析中…</p>
        )}
        {!draft && !loading && error && (
          <p className="we-field-error">{error}</p>
        )}

        {draft && (
          <>
            <label className="we-make-card-modal-field">
              <span className="we-make-card-modal-label">名字</span>
              <input
                className="we-make-card-modal-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                disabled={loading}
              />
            </label>

            <label className="we-make-card-modal-field">
              <span className="we-make-card-modal-label">简介</span>
              <textarea
                className="we-make-card-modal-textarea"
                value={draft.description}
                rows={2}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                disabled={loading}
              />
            </label>

            <label className="we-make-card-modal-field">
              <span className="we-make-card-modal-label">人设（system_prompt）</span>
              <textarea
                className="we-make-card-modal-textarea"
                value={draft.system_prompt}
                rows={4}
                onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
                disabled={loading}
              />
            </label>

            <label className="we-make-card-modal-field">
              <span className="we-make-card-modal-label">开场白</span>
              <textarea
                className="we-make-card-modal-textarea"
                value={draft.first_message}
                rows={2}
                onChange={(e) => setDraft({ ...draft, first_message: e.target.value })}
                disabled={loading}
              />
            </label>
          </>
        )}
      </div>
      <div className="we-cast-add-modal-footer we-make-card-modal-footer">
        <button
          type="button"
          className="we-cast-add-modal-close"
          onClick={onClose}
          disabled={loading && !draft}
        >
          关闭
        </button>
        {draft && (
          <button
            type="button"
            className="we-cast-add-modal-action"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '保存中…' : '保存为角色卡'}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
