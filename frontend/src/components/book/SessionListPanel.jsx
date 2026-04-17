/* DESIGN.md §5.3 — 左页会话列表面板（无 Tab） */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SessionItem from '../chat/SessionItem.jsx';
import { getSessions, createSession, deleteSession, renameSession, getSession } from '../../api/sessions.js';
import { getAvatarColor, getAvatarUrl } from '../../utils/avatar.js';

const PAGE_SIZE = 20;

export default function SessionListPanel({
  character,
  currentSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
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

  // 滚动到底部时加载更多
  async function loadMore() {
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
  }

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
  }, [hasMore, loadingMore, offset]);

  async function handleCreateSession() {
    if (!character) return;
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
    try {
      const fresh = await getSession(session.id);
      setSessions((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s)));
      onSessionSelect(fresh);
    } catch {
      onSessionSelect(session);
    }
  }

  // 外部更新标题（SSE title_updated）
  SessionListPanel.updateTitle = (sessionId, title) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
  };

  // 外部追加新会话（自动建会话时使用）
  SessionListPanel.addSession = (session) => {
    setSessions((prev) => [session, ...prev]);
  };

  return (
    <div className="we-session-list-panel flex flex-col h-full" style={{ fontFamily: 'var(--we-font-ui)' }}>
      {/* 角色信息头 */}
      <div
        style={{
          padding: '14px 14px 10px',
          borderBottom: '1px solid var(--we-paper-shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* 头像 */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: avatarColor,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              overflow: 'hidden',
            }}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover' }} />
              : (character?.name?.[0] || '?')}
          </div>

          {/* 角色名 */}
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--we-ink-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {character?.name || '…'}
          </span>

          {/* 返回世界按钮 */}
          <button
            onClick={() => navigate(`/worlds/${character?.world_id}`)}
            title="切换角色"
            style={{
              padding: '4px',
              borderRadius: 6,
              color: 'var(--we-ink-faded)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              opacity: 0.6,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* 新建会话 — 虚线按钮 */}
        <button
          onClick={handleCreateSession}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '6px 0',
            border: '1.5px dashed var(--we-paper-shadow)',
            borderRadius: 6,
            background: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--we-ink-faded)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--we-vermilion)';
            e.currentTarget.style.color = 'var(--we-vermilion)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--we-paper-shadow)';
            e.currentTarget.style.color = 'var(--we-ink-faded)';
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建会话
        </button>
      </div>

      {/* 会话列表 */}
      <div
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}
      >
        {sessions.length === 0 && (
          <p
            style={{
              fontSize: 12,
              textAlign: 'center',
              color: 'var(--we-ink-faded)',
              opacity: 0.6,
              padding: '24px 0',
            }}
          >
            暂无对话
          </p>
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
          <p
            style={{
              fontSize: 11,
              textAlign: 'center',
              color: 'var(--we-ink-faded)',
              opacity: 0.5,
              padding: '8px 0',
            }}
          >
            加载中…
          </p>
        )}
      </div>
    </div>
  );
}
