import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalShell from '../ui/ModalShell.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import Textarea from '../ui/Textarea.jsx';
import { getLongTermMemory, updateLongTermMemory } from '../../core/api/long-term-memory.js';

export default function LongTermMemoryModal({ sessionId, onClose }) {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLongTermMemory(sessionId)
      .then((res) => {
        if (cancelled) return;
        const loaded = res?.content ?? '';
        setError(''); setContent(loaded); setSavedContent(loaded); setLoading(false);
      })
      .catch((err) => { if (!cancelled) { setError(err.message || '加载失败'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [sessionId]);

  function requestClose() {
    if (saving) return;
    if (content !== savedContent) { setConfirmDiscard(true); return; }
    onClose();
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await updateLongTermMemory(sessionId, content);
      onClose();
    } catch (err) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={requestClose} maxWidth="max-w-2xl">
      <div className="we-dialog-header">
        <h2>长期记忆</h2>
      </div>

      <div className="we-dialog-body">
        <p className="we-settings-toggle-hint mb-2">
          每行一条，10–20 字。开关关闭仅停止再产出与注入，已有内容保留。
        </p>
        {loading ? (
          <p className="we-settings-toggle-hint">加载中…</p>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={saving}
            rows={16}
            placeholder="（暂无长期记忆条目）"
          />
        )}
        {error && (
          <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]">
            {error}
          </p>
        )}
      </div>

      <div className="we-dialog-footer">
        <button onClick={requestClose} disabled={saving} className="we-confirm-cancel">
          取消
        </button>
        <button onClick={handleSave} disabled={saving || loading} className="we-confirm-ok">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      {/* 放弃确认浮层：portal 到 body，脱离 ModalShell 的 transform 上下文 */}
      {confirmDiscard && createPortal(
        <div className="we-tm-confirm-layer">
          <ConfirmModal
            title="放弃未保存的修改？"
            message="你对长期记忆做了改动但尚未保存，关闭将丢弃这些改动。"
            confirmText="放弃"
            cancelText="继续编辑"
            danger
            onConfirm={async () => { setConfirmDiscard(false); onClose(); }}
            onClose={() => setConfirmDiscard(false)}
          />
        </div>,
        document.body,
      )}
    </ModalShell>
  );
}
