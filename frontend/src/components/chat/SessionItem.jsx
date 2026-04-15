import { useState, useRef, useEffect } from 'react';

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
      className={`we-session-card group relative flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-accent/10 text-text'
          : 'hover:bg-sand text-text-secondary'
      }`}
      onClick={() => !editing && onSelect(session)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
    >
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            className="w-full text-sm bg-canvas border border-accent rounded px-1 py-0.5 text-text outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={confirmEdit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            className="text-sm font-medium truncate leading-snug"
            onDoubleClick={startEdit}
            title={displayTitle}
          >
            {displayTitle}
          </p>
        )}
        <p className="text-xs opacity-50 mt-0.5">{formatDate(session.updated_at)}</p>
      </div>

      {/* 删除按钮 */}
      {!editing && hovered && (
        <div className="flex-none flex items-center" onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <div className="flex gap-1">
              <button
                onClick={handleConfirmDelete}
                className="text-xs px-1.5 py-0.5 rounded bg-red-500 text-white hover:bg-red-600"
              >
                删除
              </button>
              <button
                onClick={handleCancelDelete}
                className="text-xs px-1.5 py-0.5 rounded bg-border hover:bg-ivory"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={handleDeleteClick}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 rounded hover:text-red-500 transition-opacity"
              title="删除会话"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
