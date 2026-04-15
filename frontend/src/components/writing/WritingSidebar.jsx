import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listWritingSessions, createWritingSession, deleteWritingSession } from '../../api/writingSessions.js';

function SessionItem({ session, isActive, onSelect, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const title = session.title || '无标题';
  const date = new Date(session.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  function handleDeleteClick(e) {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete(session.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2000);
    }
  }

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-accent/15 text-text' : 'hover:bg-sand text-text-secondary'
      }`}
      onClick={() => onSelect(session)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{title}</p>
        <p className="text-xs opacity-40 mt-0.5">{date}</p>
      </div>
      <button
        className={`flex-none opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 rounded ${
          confirmDelete ? 'text-red-500' : 'text-text-secondary hover:text-red-400'
        }`}
        onClick={handleDeleteClick}
        title={confirmDelete ? '再次点击确认删除' : '删除'}
      >
        {confirmDelete ? '确认' : '删除'}
      </button>
    </div>
  );
}

export default function WritingSidebar({
  worldId,
  worldName,
  currentSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
  onTitleUpdate,
}) {
  const navigate = useNavigate();
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

  // 外部可调用更新标题
  WritingSidebar.updateTitle = (sessionId, title) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
    onTitleUpdate?.(sessionId, title);
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

  return (
    <div className="we-sidebar flex flex-col h-full">
      {/* 顶部信息 */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            className="flex-none text-accent opacity-70"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text truncate">{worldName || '写作空间'}</p>
            <p className="text-xs opacity-40">创意写作</p>
          </div>
          <button
            onClick={() => navigate(`/worlds/${worldId}`)}
            className="flex-none text-text-secondary opacity-60 hover:opacity-100 transition-opacity"
            title="返回角色页"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* 新建会话 */}
        <button
          onClick={handleCreate}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-border text-sm text-text-secondary hover:bg-sand hover:text-text transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建会话
        </button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {loading && <p className="text-xs text-center opacity-30 py-4">加载中…</p>}
        {!loading && sessions.length === 0 && (
          <p className="text-xs text-center opacity-30 py-6">暂无写作记录</p>
        )}
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionId}
            onSelect={onSessionSelect}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
