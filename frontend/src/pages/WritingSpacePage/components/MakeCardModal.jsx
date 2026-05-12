import { useState } from 'react';
import ModalShell from '../../../components/ui/ModalShell.jsx';
import {
  analyzeNearbyForCard,
  createCharacterFromNearby,
} from '../../../api/session-nearby.js';
import { log } from '../../../utils/logger.js';

/**
 * 制卡 Modal — 两步流程
 *  1) pick：从本轮登场角色中挑选一个
 *  2) preview：LLM 草稿四字段可编辑后保存为正式角色卡
 *
 * 不引入新色值，沿用 AddSavedNearbyModal 的 we-cast-add-modal-* 视觉，
 * 预览步骤新增 we-make-card-modal-* 字段块。
 */
export default function MakeCardModal({ worldId, sessionId, nearby, onDone, onClose }) {
  const [step, setStep] = useState('pick'); // pick → preview
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);

  const list = Array.isArray(nearby) ? nearby : [];

  async function handlePick(item) {
    if (loading) return;
    setSelectedId(item.id);
    setLoading(true);
    try {
      const d = await analyzeNearbyForCard(worldId, sessionId, item.id);
      setDraft({
        name: d?.name ?? item.name ?? '',
        system_prompt: d?.system_prompt ?? '',
        description: d?.description ?? '',
        first_message: d?.first_message ?? '',
      });
      setStep('preview');
    } catch (e) {
      log.error('card.analyze_failed', e, { toast: e?.message || '分析失败' });
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  function backToPick() {
    if (loading) return;
    setStep('pick');
    setDraft(null);
    setSelectedId(null);
  }

  async function handleConfirm() {
    if (!draft || !selectedId) return;
    if (!draft.name.trim()) {
      log.error('card.name.invalid', null, { toast: '名字不能为空' });
      return;
    }
    setLoading(true);
    try {
      await createCharacterFromNearby(worldId, {
        session_id: sessionId,
        nearby_id: selectedId,
        name: draft.name.trim(),
        system_prompt: draft.system_prompt,
        description: draft.description,
        first_message: draft.first_message,
      });
      log.info('card.create.success', null, { toast: '已保存为角色卡' });
      onDone?.();
    } catch (e) {
      if (e?.status === 409) log.error('card.name.duplicate', e, { toast: '该名字已被占用' });
      else log.error('card.create_failed', e, { toast: e?.message || '创建失败' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={loading ? () => {} : onClose} maxWidth="max-w-md">
      {step === 'pick' && (
        <>
          <div className="we-cast-add-modal-body">
            <p className="we-cast-add-modal-title">选择本轮登场角色制卡</p>
            {list.length === 0 && (
              <p className="we-cast-add-modal-empty">本轮无登场角色</p>
            )}
            {list.map((n) => (
              <div key={n.id} className="we-cast-add-modal-row">
                <span className="we-cast-add-modal-name">
                  {n.name}
                  {n.is_saved ? '（已保存）' : ''}
                </span>
                <button
                  type="button"
                  className="we-cast-add-modal-action"
                  onClick={() => handlePick(n)}
                  disabled={loading}
                >
                  {loading && selectedId === n.id ? '分析中…' : '选择'}
                </button>
              </div>
            ))}
          </div>
          <div className="we-cast-add-modal-footer">
            <button
              type="button"
              className="we-cast-add-modal-close"
              onClick={onClose}
              disabled={loading}
            >
              关闭
            </button>
          </div>
        </>
      )}

      {step === 'preview' && draft && (
        <>
          <div className="we-cast-add-modal-body we-make-card-modal-preview">
            <p className="we-cast-add-modal-title">预览（可编辑）</p>

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
          </div>
          <div className="we-cast-add-modal-footer we-make-card-modal-footer">
            <button
              type="button"
              className="we-cast-add-modal-close"
              onClick={backToPick}
              disabled={loading}
            >
              返回
            </button>
            <button
              type="button"
              className="we-cast-add-modal-action"
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? '保存中…' : '保存为角色卡'}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
