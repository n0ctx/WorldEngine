import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Dialog from '../ui/Dialog.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import Textarea from '../ui/Textarea.jsx';
import Button from '../ui/Button.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { getMiddleSummary, updateMiddleSummary } from '../../core/api/middle-summary.js';

export default function MiddleSummaryModal({ sessionId, onClose }) {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [coveredTo, setCoveredTo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMiddleSummary(sessionId)
      .then((res) => {
        if (cancelled) return;
        const loaded = res?.content ?? '';
        setError(''); setContent(loaded); setSavedContent(loaded); setCoveredTo(res?.coveredTo ?? 0); setLoading(false);
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
      await updateMiddleSummary(sessionId, content);
      onClose();
    } catch (err) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      size="lg"
      title="剧情摘要"
      busy={saving}
      onClose={requestClose}
      footer={(
        <>
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      )}
    >
      <p className="we-settings-toggle-hint mb-2">
        {coveredTo > 0 ? `已覆盖到第 ${coveredTo} 轮` : '尚未覆盖任何轮次'}
      </p>
      {loading ? (
        <Skeleton />
      ) : (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={saving}
          rows={16}
          placeholder="（暂无剧情摘要）"
        />
      )}
      {error && (
        <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]">
          {error}
        </p>
      )}

      <AnimatePresence>
        {confirmDiscard && (
          <ConfirmModal
            title="放弃未保存的修改？"
            message="你对剧情摘要做了改动但尚未保存，关闭将丢弃这些改动。"
            confirmText="放弃"
            cancelText="继续编辑"
            danger
            onConfirm={async () => { setConfirmDiscard(false); onClose(); }}
            onClose={() => setConfirmDiscard(false)}
          />
        )}
      </AnimatePresence>
    </Dialog>
  );
}
