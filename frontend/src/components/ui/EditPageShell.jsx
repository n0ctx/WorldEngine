// frontend/src/components/ui/EditPageShell.jsx
import { useRef } from 'react';

export default function EditPageShell({
  loading = false,
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

  if (loading) {
    if (isOverlay) {
      return (
        <div className="we-settings-overlay" {...overlayHandlers}>
          <div
            className="we-edit-panel we-edit-panel-overlay flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="we-edit-empty-text">加载中…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="we-edit-canvas flex items-center justify-center">
        <p className="we-edit-empty-text">加载中…</p>
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
