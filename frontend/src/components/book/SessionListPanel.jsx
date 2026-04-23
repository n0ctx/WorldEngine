/* DESIGN.md §5.3 — 左页会话列表面板（无 Tab） */
import { useState, useEffect, useRef } from 'react';
import Icon from '../ui/Icon.jsx';
import { useNavigate } from 'react-router-dom';
import SessionItem from '../chat/SessionItem.jsx';
import { getSessions, createSession, deleteSession, renameSession, getSession } from '../../api/sessions.js';

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--we-paper-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button
            onClick={() => navigate(`/worlds/${character?.world_id}`)}
            title="切换角色"
            style={{
              padding: 4,
              borderRadius: 4,
              color: 'var(--we-ink-faded)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              opacity: 0.6,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
          >
            <Icon size={16}>
              <polyline points="15 18 9 12 15 6" />
            </Icon>
          </button>
        </div>

        <button
          onClick={handleCreateSession}
          style={{
            width: '100%',
            padding: '7px 0',
            marginTop: 10,
            border: '1.5px dashed var(--we-vermilion)',
            borderRadius: 4,
            background: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'var(--we-font-serif)',
            color: 'var(--we-vermilion)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--we-vermilion-bg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        >
          <Icon size={16} strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          新建会话
        </button>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {sessions.length === 0 && (
          <p style={{ fontSize: 12, textAlign: 'center', color: 'var(--we-ink-faded)', opacity: 0.6, padding: '24px 0' }}>
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
          <p style={{ fontSize: 11, textAlign: 'center', color: 'var(--we-ink-faded)', opacity: 0.5, padding: '8px 0' }}>
            加载中…
          </p>
        )}
      </div>
    </div>
  );
}
