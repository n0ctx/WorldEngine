import Button from '../ui/Button.jsx';

// MessageList 的加载中 / 未选会话 / 加载失败态
export default function MessageListStatus({ loading, sessionId, loadError, onRetry }) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--we-color-text-faint)] we-type-ui">
        加载中…
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--we-color-text-faint)] we-type-ui">
        请选择或创建一个对话
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="we-type-ui text-[var(--we-color-status-danger)]">{loadError}</p>
      <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}
