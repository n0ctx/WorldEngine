import { useState, useEffect, useRef } from 'react';
import { listWritingSessions, createWritingSession, deleteWritingSession } from '../../api/writing-sessions.js';
import { renameSession } from '../../api/sessions.js';

function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function WritingSessionItem({ session, isActive, onSelect, onDelete, onRename }) {
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

  function cancelEdit() { setEditing(false); }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
    if (e.key === 'Escape') cancelEdit();
  }

  return (
    <div
      className={`we-session-item${isActive ? ' we-session-item--active' : ''}`}
      onClick={() => !editing && onSelect(session)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
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
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); setConfirmDelete(false); }}
                className="we-session-item__delete-confirm"
              >
                删除
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="we-session-item__icon-btn"
                title="删除会话"
                aria-label="删除写作会话"
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

export default function WritingSessionList({ worldId, currentSessionId, onSessionSelect, onSessionCreate, onSessionDelete }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!worldId) return;
    setLoading(true);
    listWritingSessions(worldId)
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [worldId]);

  WritingSessionList.updateTitle = (sessionId, title) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, title } : s));
  };

  WritingSessionList.addSession = (session) => {
    setSessions((prev) => [session, ...prev]);
  };

  async function handleCreate() {
    try {
      const session = await createWritingSession(worldId);
      setSessions((prev) => [session, ...prev]);
      onSessionCreate(session);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete(sessionId) {
    try {
      await deleteWritingSession(worldId, sessionId);
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);
      onSessionDelete(sessionId, remaining);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRename(sessionId, title) {
    try {
      const updated = await renameSession(sessionId, title);
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, title: updated.title } : s));
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="we-session-list-root">
      <div className="we-session-list-header">
        <button
          onClick={handleCreate}
          className="we-session-new-btn"
          aria-label="新建写作会话"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建写作会话
        </button>
      </div>

      <div className="we-session-list-body">
        {loading && (
          <p className="we-session-empty">加载中…</p>
        )}
        {!loading && sessions.length === 0 && (
          <p className="we-session-empty">暂无写作记录</p>
        )}
        {sessions.map((session) => (
          <WritingSessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionId}
            onSelect={onSessionSelect}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        ))}
      </div>
    </div>
  );
}
