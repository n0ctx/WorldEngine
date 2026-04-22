// frontend/src/components/ui/EditPageShell.jsx

export default function EditPageShell({
  loading = false,
  isOverlay = false,
  onClose,
  title,
  children,
}) {
  if (loading) {
    if (isOverlay) {
      return (
        <div className="we-settings-overlay" onClick={onClose}>
          <div
            className="we-edit-panel we-edit-panel-overlay"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <p className="we-edit-empty-text">加载中…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="we-edit-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        {title && <h1 className="we-edit-title">{title}</h1>}
      </div>
      {children}
    </div>
  );

  if (isOverlay) {
    return (
      <div className="we-settings-overlay" onClick={onClose}>
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
