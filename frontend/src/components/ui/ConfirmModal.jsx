// frontend/src/components/ui/ConfirmModal.jsx
import { useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';

/**
 * 通用确认弹窗。
 * - onConfirm 应为 async 函数；resolve 后弹窗不自动关闭，由调用方通过 onClose 控制。
 * - onConfirm 抛出异常时，弹窗保持打开（confirming 重置为 false），调用方在 onConfirm 内自行处理错误提示。
 * - 退场动画需要调用方用 AnimatePresence 包住条件渲染（与 ModalShell 一致）。
 */
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
  const titleId = useId();
  const messageId = useId();
  const mouseDownOnBackdrop = useRef(false);
  const m = useMotion();
  const press = m.gesture('press', { disabled: confirming });
  useEscapeKey(() => { if (!confirming) onClose(); });

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <motion.div
      className="we-modal-backdrop fixed inset-0 z-[var(--we-z-modal)] flex items-center justify-center"
      variants={m.variant('overlayBackdrop')}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={m.transition('backdrop')}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={() => { if (mouseDownOnBackdrop.current && !confirming) onClose(); }}
    >
      <motion.div
        className="we-dialog-panel we-material we-confirm-panel w-full max-w-sm mx-4"
        variants={m.variant('overlayEnter')}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={m.transition('overlay')}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <span className="we-panel-edge" aria-hidden="true" />
        <h2 id={titleId} className="we-confirm-title">{title}</h2>
        <div id={messageId} className="we-confirm-message">{message}</div>
        <div className="flex justify-end gap-3">
          <motion.button
            onClick={onClose}
            autoFocus
            disabled={confirming}
            className="we-confirm-cancel"
            {...press}
          >
            {cancelText}
          </motion.button>
          <motion.button
            onClick={handleConfirm}
            disabled={confirming}
            className={['we-confirm-ok', danger ? 'danger' : ''].filter(Boolean).join(' ')}
            {...press}
          >
            {confirming ? '处理中…' : confirmText}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
