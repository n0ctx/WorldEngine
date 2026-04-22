// frontend/src/components/ui/ConfirmModal.jsx
import { useState } from 'react';

export default function ConfirmModal({
  title = '确认',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onClose,
}) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="we-dialog-panel w-full max-w-sm mx-4" style={{ padding: '24px' }}>
        <h2
          style={{
            fontFamily: 'var(--we-font-display)',
            fontSize: '18px',
            fontStyle: 'italic',
            fontWeight: 400,
            color: 'var(--we-ink-primary)',
            marginBottom: '10px',
          }}
        >
          {title}
        </h2>
        <div
          style={{
            fontFamily: 'var(--we-font-serif)',
            fontSize: '14px',
            color: 'var(--we-ink-secondary)',
            marginBottom: '20px',
          }}
        >
          {message}
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={confirming}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              color: 'var(--we-ink-faded)',
              background: 'none',
              border: 'none',
              padding: '6px 16px',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--we-ink-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--we-ink-faded)'; }}
            className="disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              background: danger ? 'var(--we-vermilion)' : 'var(--we-ink-secondary)',
              color: 'var(--we-paper-base)',
              border: 'none',
              borderRadius: 'var(--we-radius-sm)',
              padding: '6px 16px',
              cursor: 'pointer',
            }}
            className="disabled:opacity-50"
          >
            {confirming ? '处理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
