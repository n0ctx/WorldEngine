import { useState, useRef, useEffect } from 'react';
import Icon from '../ui/Icon.jsx';

function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SessionItem({ session, isActive, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef(null);

  const displayTitle = session.title || formatDate(session.created_at);

  function startEdit(e) {
    e.stopPropagation();
    setDraft(session.title || '');
    setEditing(true);
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function confirmEdit() {
    const trimmed = draft.trim();
    onRename(session.id, trimmed || null);
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
    if (e.key === 'Escape') cancelEdit();
  }

  function handleDeleteClick(e) {
    e.stopPropagation();
    setConfirmDelete(true);
  }

  function handleConfirmDelete(e) {
    e.stopPropagation();
    onDelete(session.id);
    setConfirmDelete(false);
  }

  function handleCancelDelete(e) {
    e.stopPropagation();
    setConfirmDelete(false);
  }

  return (
    <div
      data-session-id={session.id}
      className={`we-session-item${isActive ? ' we-session-item--active' : ''}${editing ? ' we-session-item--editing' : ''}`}
      onClick={() => !editing && onSelect(session)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setConfirmDelete(false);
      }}
    >
      <div className="we-session-item__content">
        {editing ? (
          <input
            ref={inputRef}
            className="we-session-item__edit-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={confirmEdit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            className="we-session-item__title"
            onDoubleClick={startEdit}
            title={displayTitle}
          >
            {displayTitle}
          </p>
        )}
        <p className="we-session-item__date">
          {formatDate(session.updated_at)}
        </p>
      </div>

      {!editing && hovered && (
        <div className="we-session-item__actions" onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <div className="we-session-item__confirm-group">
              <button
                onClick={handleConfirmDelete}
                className="we-session-item__delete-confirm"
              >
                删除
              </button>
              <button
                onClick={handleCancelDelete}
                className="we-session-item__cancel-confirm"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="we-session-item__btn-group">
              <button
                onClick={startEdit}
                className="we-session-item__icon-btn"
                title="编辑标题"
                aria-label="编辑会话标题"
              >
                <Icon size={16}>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </Icon>
              </button>
              <button
                onClick={handleDeleteClick}
                className="we-session-item__icon-btn"
                title="删除会话"
                aria-label="删除会话"
              >
                <Icon size={16}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </Icon>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
