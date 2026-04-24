/* 已迁移至 components/book/SessionListPanel.jsx，待 P8 清理 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../ui/Icon.jsx';
import { useNavigate } from 'react-router-dom';
import SessionItem from './SessionItem.jsx';
import { getSessions, createSession, deleteSession, renameSession, getSession } from '../../api/sessions.js';
import { getAvatarColor, getAvatarUrl } from '../../utils/avatar.js';

const PAGE_SIZE = 20;

export default function Sidebar({
  character,
  currentSessionId,
  onSessionSelect,
  onSessionDelete,
  onSessionCreate,
}) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const listRef = useRef(null);

  const avatarColor = getAvatarColor(character?.id);
  const avatarUrl = getAvatarUrl(character?.avatar_path);

  // 初始加载
  useEffect(() => {
    if (!character?.id) return;
    setSessions([]);
    setOffset(0);
    setHasMore(false);

    getSessions(character.id, PAGE_SIZE, 0)
      .then((data) => {
        setSessions(data);
        setOffset(data.length);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch(console.error);
  }, [character?.id]);

  // 加载更多（更旧的会话）
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await getSessions(character.id, PAGE_SIZE, offset);
      setSessions((prev) => [...prev, ...more]);
      setOffset((o) => o + more.length);
      setHasMore(more.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [character?.id, hasMore, loadingMore, offset]);

  // 滚动到底部时加载更多
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    function handleScroll() {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && hasMore && !loadingMore) {
        loadMore();
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadMore, loadingMore]);

  async function handleCreateSession() {
    try {
      const session = await createSession(character.id);
      setSessions((prev) => [session, ...prev]);
      onSessionCreate(session);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete(sessionId) {
    try {
      await deleteSession(sessionId);
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
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s)));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSelect(session) {
    // 刷新 session 获取最新 title
    try {
      const fresh = await getSession(session.id);
      setSessions((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s)));
      onSessionSelect(fresh);
    } catch {
      onSessionSelect(session);
    }
  }

  // 外部更新标题（SSE title_updated）
  Sidebar.updateTitle = (sessionId, title) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
  };

  // 外部追加新会话（自动建会话时使用）
  Sidebar.addSession = (session) => {
    setSessions((prev) => [session, ...prev]);
  };

  return (
    <div className="we-sidebar flex flex-col h-full">
      {/* 角色信息 */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div
            className="we-sidebar-avatar"
            style={{ '--avatar-bg': avatarColor }}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="w-9 h-9 object-cover" />
              : (character?.name?.[0] || '?')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text truncate">{character?.name || '…'}</p>
          </div>
          <button
            onClick={() => navigate(`/worlds/${character?.world_id}`)}
            className="text-xs text-text-secondary opacity-60 hover:opacity-100 transition-opacity flex-none"
            title="切换角色"
            aria-label="切换角色"
          >
            <Icon size={16}>
              <polyline points="15 18 9 12 15 6" />
            </Icon>
          </button>
        </div>

        {/* 新建对话 */}
        <button
          onClick={handleCreateSession}
          className="we-chat-new-btn"
        >
          <Icon size={16} strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          新对话
        </button>
      </div>

      {/* 会话列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {sessions.length === 0 && (
          <p className="text-xs text-center opacity-40 py-6">暂无对话</p>
        )}
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionId}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        ))}
        {loadingMore && (
          <p className="text-xs text-center opacity-40 py-2">加载中…</p>
        )}
      </div>
    </div>
  );
}
