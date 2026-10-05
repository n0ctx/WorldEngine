import { IconCopy, IconPencil, IconRotateCcw, IconTrash } from '../ui/icons.jsx';
import Button from '../ui/Button.jsx';
import { useCopyFeedback, useDeleteConfirmation } from './useMessageHooks.js';

// 消息下方操作行里的按钮：对话与写作共用，样式由 .we-message-actions 统一给

export function CopyButton({ getText }) {
  const { copied, copy } = useCopyFeedback(getText);
  return (
    <Button variant="text" size="sm" onClick={copy} aria-label={copied ? '已复制到剪贴板' : '复制消息内容'}>
      <IconCopy size={16} />
      {copied ? '已复制' : '复制'}
    </Button>
  );
}

export function EditButton({ onClick, label = '编辑消息' }) {
  return (
    <Button variant="text" size="sm" onClick={onClick} aria-label={label}>
      <IconPencil size={16} />
      编辑
    </Button>
  );
}

export function RegenerateButton({ onClick }) {
  return (
    <Button variant="text" size="sm" onClick={onClick} aria-label="重新生成 AI 回复">
      <IconRotateCcw size={16} />
      重新生成
    </Button>
  );
}

export function DeleteButton({ onDelete }) {
  const { confirming, handleClick } = useDeleteConfirmation(onDelete);
  return (
    <Button
      variant="text"
      size="sm"
      onClick={handleClick}
      aria-label={confirming ? '确认删除消息' : '删除消息'}
      className={confirming ? 'we-delete-btn--confirming' : undefined}
    >
      <IconTrash size={16} />
      {confirming ? '确认？' : '删除'}
    </Button>
  );
}

export function EditConfirmActions({ onCancel, onConfirm, confirmLabel }) {
  return (
    <div className="we-message-edit-actions">
      <Button variant="secondary" size="sm" onClick={onCancel}>取消</Button>
      <Button variant="primary" size="sm" onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  );
}
