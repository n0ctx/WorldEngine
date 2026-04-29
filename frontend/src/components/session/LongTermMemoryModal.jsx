import { useEffect, useState } from 'react';
import ModalShell from '../ui/ModalShell.jsx';
import Textarea from '../ui/Textarea.jsx';
import { getLongTermMemory, updateLongTermMemory } from '../../api/long-term-memory.js';

export default function LongTermMemoryModal({ sessionId, onClose }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getLongTermMemory(sessionId)
      .then((res) => { if (!cancelled) setContent(res?.content ?? ''); })
      .catch((err) => { if (!cancelled) setError(err.message || '加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

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
    <ModalShell onClose={saving ? undefined : onClose} maxWidth="max-w-2xl">
      <div className="we-dialog-header">
        <h2>长期记忆</h2>
      </div>

      <div className="we-dialog-body">
        <p className="we-settings-toggle-hint" style={{ marginBottom: 8 }}>
          每行一条，10–20 字。可加 [年月日] 或 [年月日时分] 时间前缀。开关关闭仅停止再产出与注入，已有内容保留。
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
          <p className="we-settings-toggle-hint" style={{ color: 'var(--we-vermilion)', marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>

      <div className="we-dialog-footer">
        <button onClick={onClose} disabled={saving} className="we-confirm-cancel">
          取消
        </button>
        <button onClick={handleSave} disabled={saving || loading} className="we-confirm-ok">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </ModalShell>
  );
}
