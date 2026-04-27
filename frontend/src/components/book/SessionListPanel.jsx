/* DESIGN.md §5.3 — 左页会话列表面板（无 Tab） */
import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../ui/Icon.jsx';
import { useNavigate } from 'react-router-dom';
import SessionItem from '../chat/SessionItem.jsx';
import { getSessions, createSession, deleteSession, renameSession, getSession } from '../../api/sessions.js';
import { pushErrorToast } from '../../utils/toast.js';
import { chatSessionListBridge } from '../../utils/session-list-bridge.js';

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

  useEffect(() => {
    if (!character?.id) return;
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setSessions([]);
      setOffset(0);
      setHasMore(false);

      try {
        const data = await getSessions(character.id, PAGE_SIZE, 0);
        if (cancelled) return;
        setSessions(data);
        setOffset(data.length);
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [character?.id]);

  // 滚动到底部时加载更多
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
    if (!character) return;
    try {
      const session = await createSession(character.id);
      setSessions((prev) => [session, ...prev]);
      onSessionCreate(session);
    } catch (e) {
      pushErrorToast(e.message || '创建会话失败');
    }
  }

  async function handleDelete(sessionId) {
    try {
      await deleteSession(sessionId);
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);
      onSessionDelete(sessionId, remaining);
    } catch (e) {
      pushErrorToast(e.message || '删除会话失败');
    }
  }

  async function handleRename(sessionId, title) {
    try {
      const updated = await renameSession(sessionId, title);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s)));
    } catch (e) {
      pushErrorToast(e.message || '重命名会话失败');
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

  useEffect(() => {
    chatSessionListBridge.updateTitle = (sessionId, title) => {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
    };
    chatSessionListBridge.addSession = (session) => {
      setSessions((prev) => [session, ...prev]);
    };
    return () => {
      chatSessionListBridge.updateTitle = null;
      chatSessionListBridge.addSession = null;
    };
  }, []);

  return (
    <div className="we-session-list-panel">
      <div className="we-session-list-head">
        <div className="we-session-list-nav">
          <button
            onClick={() => navigate(`/worlds/${character?.world_id}`)}
            title="切换角色"
            className="we-session-list-back"
          >
            <Icon size={16}>
              <polyline points="15 18 9 12 15 6" />
            </Icon>
          </button>
        </div>

        <button
          onClick={handleCreateSession}
          className="we-session-list-create"
        >
          <Icon size={16} strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          新建会话
        </button>
      </div>

      <div ref={listRef} className="we-session-list-scroll">
        {sessions.length === 0 && (
          <p className="we-session-list-empty">
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
          <p className="we-session-list-loading">
            加载中…
          </p>
        )}
      </div>
    </div>
  );
}
