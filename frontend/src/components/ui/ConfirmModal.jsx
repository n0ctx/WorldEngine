// frontend/src/components/ui/ConfirmModal.jsx
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { variants, transitions } from '../../utils/motion.js';

/**
 * 通用确认弹窗。
 * - onConfirm 应为 async 函数；resolve 后弹窗不自动关闭，由调用方通过 onClose 控制。
 * - onConfirm 抛出异常时，弹窗保持打开（confirming 重置为 false），调用方在 onConfirm 内自行处理错误提示。
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
  const mouseDownOnBackdrop = useRef(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        variants={variants.overlayBackdrop}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={transitions.quick}
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget; }}
        onClick={() => { if (mouseDownOnBackdrop.current && !confirming) onClose(); }}
      >
        <motion.div
          className="we-dialog-panel we-confirm-panel w-full max-w-sm mx-4"
          variants={variants.inkRise}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={transitions.ink}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="we-confirm-title">{title}</h2>
          <div className="we-confirm-message">{message}</div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              autoFocus
              disabled={confirming}
              className="we-confirm-cancel"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className={['we-confirm-ok', danger ? 'danger' : ''].filter(Boolean).join(' ')}
            >
              {confirming ? '处理中…' : confirmText}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
