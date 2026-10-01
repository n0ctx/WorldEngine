import { useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';

/**
 * 通用确认弹窗：Dialog 的确认版式。
 * - onConfirm 应为 async 函数；resolve 后弹窗不自动关闭，由调用方通过 onClose 控制。
 * - onConfirm 抛出异常时，弹窗保持打开（confirming 重置为 false），调用方在 onConfirm 内自行处理错误提示。
 * - 处理中 Esc、点空白处都不关闭。退场动画需要调用方用 AnimatePresence 包住条件渲染。
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

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog
      size="sm"
      alert
      title={title}
      description={message}
      busy={confirming}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} autoFocus disabled={confirming}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={handleConfirm} disabled={confirming}>
            {confirming ? '处理中…' : confirmText}
          </Button>
        </>
      )}
    />
  );
}
