import { useRef } from 'react';

/**
 * loadError 非空时只显示错误与重试/返回，不渲染表单：
 * 加载失败时表单是空值，误点保存会把空值写回。
 */
export default function EditPageShell({
  loading = false,
  loadError = '',
  onRetry,
  isOverlay = false,
  onClose,
  title,
  headerActions,
  children,
}) {
  const mouseDownOnOverlay = useRef(false);
  const overlayHandlers = {
    onMouseDown: (e) => { mouseDownOnOverlay.current = e.target === e.currentTarget; },
    onClick: () => { if (mouseDownOnOverlay.current) onClose(); },
  };

  if (loading || loadError) {
    const placeholder = loadError ? (
      <div className="flex flex-col items-center gap-3">
        <p className="we-edit-empty-text">{loadError}</p>
        <div className="flex gap-3">
          <button className="we-edit-back" onClick={onClose}>← 返回</button>
          <button className="we-edit-back" onClick={onRetry}>重试</button>
        </div>
      </div>
    ) : (
      <p className="we-edit-empty-text">加载中…</p>
    );
    if (isOverlay) {
      return (
        <div className="we-settings-overlay" {...overlayHandlers}>
          <div
            className="we-edit-panel we-edit-panel-overlay flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {placeholder}
          </div>
        </div>
      );
    }
    return (
      <div className="we-edit-canvas flex items-center justify-center">
        {placeholder}
      </div>
    );
  }

  const panel = (
    <div
      className={`we-edit-panel${isOverlay ? ' we-edit-panel-overlay' : ''}`}
      onClick={isOverlay ? (e) => e.stopPropagation() : undefined}
    >
      <div className="we-edit-header">
        <button className="we-edit-back" onClick={onClose}>← 返回</button>
        <div className="we-edit-header-row">
          {title && <h1 className="we-edit-title">{title}</h1>}
          {headerActions && <div className="we-edit-header-actions">{headerActions}</div>}
        </div>
      </div>
      {children}
    </div>
  );

  if (isOverlay) {
    return (
      <div className="we-settings-overlay" {...overlayHandlers}>
        {panel}
      </div>
    );
  }

  return (
    <div className="we-edit-canvas">
      {panel}
    </div>
  );
}
