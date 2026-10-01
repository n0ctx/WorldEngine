import { Copy, PencilLine, RotateCcw, Trash2 } from 'lucide-react';
import { useCopyFeedback, useDeleteConfirmation } from './useMessageHooks.js';

// 消息下方操作行里的按钮：对话与写作共用，样式由 .we-message-actions 统一给

export function CopyButton({ getText }) {
  const { copied, copy } = useCopyFeedback(getText);
  return (
    <button onClick={copy} aria-label={copied ? '已复制到剪贴板' : '复制消息内容'}>
      <Copy size={16} />
      {copied ? '已复制' : '复制'}
    </button>
  );
}

export function EditButton({ onClick, label = '编辑消息' }) {
  return (
    <button onClick={onClick} aria-label={label}>
      <PencilLine size={16} />
      编辑
    </button>
  );
}

export function RegenerateButton({ onClick }) {
  return (
    <button onClick={onClick} aria-label="重新生成 AI 回复">
      <RotateCcw size={16} />
      重新生成
    </button>
  );
}

export function DeleteButton({ onDelete }) {
  const { confirming, handleClick } = useDeleteConfirmation(onDelete);
  return (
    <button
      onClick={handleClick}
      aria-label={confirming ? '确认删除消息' : '删除消息'}
      className={confirming ? 'we-delete-btn--confirming' : undefined}
    >
      <Trash2 size={16} />
      {confirming ? '确认？' : '删除'}
    </button>
  );
}

export function EditConfirmActions({ onCancel, onConfirm, confirmLabel }) {
  return (
    <div className="we-message-edit-actions">
      <button onClick={onCancel}>取消</button>
      <button className="primary" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  );
}
