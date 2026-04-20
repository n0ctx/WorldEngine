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
      data-session-id={session.id}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        padding: '8px 10px',
        cursor: 'pointer',
        position: 'relative',
        borderRadius: 'var(--we-radius-sm)',
        transition: 'background 0.12s',
        background: isActive ? 'rgba(0,0,0,0.13)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--we-vermilion)' : '2px solid transparent',
        userSelect: 'none',
      }}
      onClick={() => !editing && onSelect(session)}
      onMouseEnter={(e) => {
        setHovered(true);
        if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        setConfirmDelete(false);
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            style={{
              width: '100%',
              fontSize: 13.5,
              fontFamily: 'var(--we-font-serif)',
              background: 'var(--we-paper-base)',
              border: '1px solid var(--we-vermilion)',
              borderRadius: 3,
              padding: '2px 6px',
              color: 'var(--we-ink-primary)',
              outline: 'none',
            }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={confirmEdit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            style={{
              fontSize: 13.5,
              fontFamily: 'var(--we-font-serif)',
              color: 'var(--we-ink-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.4,
              margin: 0,
            }}
            onDoubleClick={startEdit}
            title={displayTitle}
          >
            {displayTitle}
          </p>
        )}
        <p style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--we-ink-faded)', marginTop: 2, margin: '2px 0 0' }}>
          {formatDate(session.updated_at)}
        </p>
      </div>

      {!editing && hovered && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={handleConfirmDelete}
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 3,
                  background: 'var(--we-vermilion)',
                  color: 'var(--we-paper-base)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                删除
              </button>
              <button
                onClick={handleCancelDelete}
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 3,
                  background: 'var(--we-paper-shadow)',
                  color: 'var(--we-ink-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                onClick={startEdit}
                style={{
                  padding: 4,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--we-ink-faded)',
                  borderRadius: 3,
                }}
                title="编辑标题"
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--we-vermilion)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--we-ink-faded)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button
                onClick={handleDeleteClick}
                style={{
                  padding: 4,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--we-ink-faded)',
                  borderRadius: 3,
                }}
                title="删除会话"
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--we-vermilion)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--we-ink-faded)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
