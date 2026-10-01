import { useId, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import ConfirmModal from '../../components/ui/ConfirmModal.jsx';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';
import { useFocusTrap } from '../../core/hooks/useFocusTrap.js';

/**
 * loadError 非空时只显示错误与重试/返回，不渲染表单：
 * 加载失败时表单是空值，误点保存会把空值写回。
 * dirty 为 true 时，返回按钮与点击遮罩先确认再关闭。
 */
export default function EditPageShell({
  loading = false,
  loadError = '',
  onRetry,
  dirty = false,
  isOverlay = false,
  onClose,
  title,
  headerActions,
  children,
}) {
  const mouseDownOnOverlay = useRef(false);
  const panelRef = useRef(null);
  const titleId = useId();
  const [confirmingClose, setConfirmingClose] = useState(false);

  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  useEscapeKey(requestClose);
  const onTab = useFocusTrap(panelRef, isOverlay && !loading && !loadError);

  const overlayHandlers = {
    onMouseDown: (e) => { mouseDownOnOverlay.current = e.target === e.currentTarget; },
    onClick: () => { if (mouseDownOnOverlay.current) requestClose(); },
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
      ref={panelRef}
      className={`we-edit-panel${isOverlay ? ' we-edit-panel-overlay' : ''}`}
      onClick={isOverlay ? (e) => e.stopPropagation() : undefined}
      {...(isOverlay ? {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': title ? titleId : undefined,
        tabIndex: -1,
        onKeyDown: onTab,
      } : {})}
    >
      <div className="we-edit-header">
        <button className="we-edit-back" onClick={requestClose}>← 返回</button>
        <div className="we-edit-header-row">
          {title && <h1 id={titleId} className="we-edit-title">{title}</h1>}
          {headerActions && <div className="we-edit-header-actions">{headerActions}</div>}
        </div>
      </div>
      {children}
    </div>
  );

  const closeConfirm = (
    <AnimatePresence>
      {confirmingClose && (
        <ConfirmModal
          title="放弃未保存的修改？"
          message="关闭后本次修改将丢失。"
          confirmText="放弃修改"
          cancelText="继续编辑"
          danger
          onConfirm={async () => onClose()}
          onClose={() => setConfirmingClose(false)}
        />
      )}
    </AnimatePresence>
  );

  if (isOverlay) {
    return (
      <>
        <div className="we-settings-overlay" {...overlayHandlers}>
          {panel}
        </div>
        {closeConfirm}
      </>
    );
  }

  return (
    <>
      <div className="we-edit-canvas">
        {panel}
      </div>
      {closeConfirm}
    </>
  );
}
