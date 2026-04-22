/* DESIGN.md §5.2 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorlds } from '../../api/worlds.js';
import { getCharacter } from '../../api/characters.js';
import { getLatestChatSession } from '../../api/sessions.js';
import useStore from '../../store/index.js';
import { useAssistantStore } from '../../../../assistant/client/useAssistantStore.js';

function extractIds(pathname) {
  const charChat = pathname.match(/\/characters\/([\w-]+)\/chat/);
  const worldWriting = pathname.match(/\/worlds\/([\w-]+)/);
  return {
    characterId: charChat?.[1] ?? null,
    worldId: worldWriting?.[1] ?? null,
  };
}

const itemStyle = {
  fontFamily: 'var(--we-font-display)',
  fontStyle: 'italic',
  fontSize: '12px',
  letterSpacing: '0.1em',
  padding: '3px 10px',
  border: 'none',
  borderRadius: '1px',
  cursor: 'pointer',
  background: 'none',
  outline: 'none',
  transition: 'color 0.2s, box-shadow 0.2s, background 0.2s',
  whiteSpace: 'nowrap',
  color: 'var(--we-topbar-item)',
};

const itemActiveStyle = {
  ...itemStyle,
  color: 'var(--we-gold-pale)',
  boxShadow: '0 0 0 1px var(--we-topbar-active-ring)',
  background: 'var(--we-topbar-active-bg)',
};

const sepStyle = {
  color: 'var(--we-topbar-sep)',
  fontSize: '12px',
  userSelect: 'none',
};

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { characterId, worldId } = extractIds(location.pathname);
  const currentWorldId = useStore((s) => s.currentWorldId);
  const setCurrentWorldId = useStore((s) => s.setCurrentWorldId);
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const toggleAssistant = useAssistantStore((s) => s.toggle);
  const isAssistantOpen = useAssistantStore((s) => s.isOpen);

  const [worlds, setWorlds] = useState([]);
  const [chatWorldId, setChatWorldId] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoveredWorldId, setHoveredWorldId] = useState(null);
  const [listBtnHover, setListBtnHover] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    getWorlds().then(setWorlds).catch(() => {});
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      getWorlds().then(setWorlds).catch(() => {});
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (worldId) {
      setCurrentWorldId(worldId);
    }
  }, [worldId, setCurrentWorldId]);

  useEffect(() => {
    let cancelled = false;

    if (!characterId) {
      setChatWorldId(null);
      return undefined;
    }

    getCharacter(characterId)
      .then((character) => {
        if (!cancelled) {
          const nextWorldId = character?.world_id ?? null;
          setChatWorldId(nextWorldId);
          if (nextWorldId) {
            setCurrentWorldId(nextWorldId);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChatWorldId(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [characterId, setCurrentWorldId]);

  const effectiveWorldId = worldId ?? chatWorldId ?? currentWorldId;

  // 从 worlds 列表里找当前 worldId 对应的名字
  const currentWorld = worlds.find((w) => w.id === effectiveWorldId);

  // 点击外部关闭下拉
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setDropdownOpen(false);
  }, [location.pathname]);

  const isWorldsList = location.pathname === '/';
  const isChat = !!characterId;
  const isWriting = location.pathname.match(/\/worlds\/([\w-]+)\/writing/);

  async function handleChatNavigate() {
    if (!effectiveWorldId) return;

    if (characterId) {
      navigate(`/characters/${characterId}/chat`);
      return;
    }

    try {
      const session = await getLatestChatSession(effectiveWorldId);
      if (session?.character_id) {
        setCurrentWorldId(effectiveWorldId);
        setCurrentCharacterId(session.character_id);
        setCurrentSessionId(session.id);
        navigate(`/characters/${session.character_id}/chat`);
        return;
      }
    } catch {
      // ignore and fall back to the world character list
    }

    setCurrentSessionId(null);
    navigate(`/worlds/${effectiveWorldId}`);
  }

  return (
    <div style={{
      height: '40px',
      flexShrink: 0,
      background: 'var(--we-topbar-bg)',
      borderBottom: '1px solid var(--we-topbar-border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: '4px',
      zIndex: 50,
      position: 'relative',
    }}>
      {/* 世界选择器 */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        {isWorldsList ? (
          <span style={{ ...itemStyle, cursor: 'default' }}>
            世界列表
          </span>
        ) : (
        <button
          style={currentWorld ? itemActiveStyle : itemStyle}
          onClick={() => setDropdownOpen((o) => !o)}
        >
          {currentWorld?.name ?? '选择世界'}
          <span style={{ marginLeft: '4px', opacity: 0.5, fontSize: '9px' }}>▾</span>
        </button>
        )}

        {dropdownOpen && (
          <div style={{
            position: 'absolute',
            top: '36px',
            left: 0,
            minWidth: '160px',
            background: 'var(--we-topbar-dropdown-bg)',
            border: '1px solid var(--we-topbar-dropdown-border)',
            borderRadius: '2px',
            boxShadow: 'var(--we-topbar-dropdown-shadow)',
            zIndex: 100,
            overflow: 'hidden',
          }}>
            {worlds.length === 0 && (
              <div style={{ padding: '8px 12px', color: 'var(--we-topbar-item-dim)', fontSize: '12px' }}>
                暂无世界
              </div>
            )}
            {worlds.map((w) => (
              <button
                key={w.id}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 12px',
                  background: w.id === effectiveWorldId
                    ? 'var(--we-topbar-active-bg)'
                    : hoveredWorldId === w.id ? 'rgba(255,255,255,0.05)' : 'none',
                  color: w.id === effectiveWorldId ? 'var(--we-gold-pale)' : 'var(--we-topbar-item-faint)',
                  fontFamily: 'var(--we-font-display)',
                  fontStyle: 'italic',
                  fontSize: '12px',
                  letterSpacing: '0.08em',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={() => setHoveredWorldId(w.id)}
                onMouseLeave={() => setHoveredWorldId(null)}
                onClick={() => {
                  setDropdownOpen(false);
                  setCurrentWorldId(w.id);
                  setCurrentCharacterId(null);
                  setCurrentSessionId(null);
                  navigate(`/worlds/${w.id}`);
                }}
              >
                {w.name}
              </button>
            ))}
            <div style={{ borderTop: '1px solid var(--we-topbar-divider)', margin: '2px 0' }} />
            <button
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 12px',
                background: 'none',
                color: listBtnHover ? 'var(--we-topbar-item-faint)' : 'var(--we-topbar-item-muted)',
                fontFamily: 'var(--we-font-display)',
                fontStyle: 'italic',
                fontSize: '11px',
                letterSpacing: '0.08em',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
              onMouseEnter={() => setListBtnHover(true)}
              onMouseLeave={() => setListBtnHover(false)}
              onClick={() => { setDropdownOpen(false); navigate('/'); }}
            >
              前往世界列表 →
            </button>
          </div>
        )}
      </div>

      {!isWorldsList && (
        <>
          <span style={sepStyle}>·</span>

          {/* 对话模式 */}
          <button
            style={isChat ? itemActiveStyle : itemStyle}
            onClick={() => { if (!effectiveWorldId) return; handleChatNavigate(); }}
          >
            对话
          </button>

          <span style={sepStyle}>·</span>

          {/* 写作空间 */}
          <button
            style={isWriting ? itemActiveStyle : itemStyle}
            onClick={() => {
              if (!effectiveWorldId) return;
              navigate(`/worlds/${effectiveWorldId}/writing`);
            }}
          >
            写作
          </button>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* 写卡助手 */}
      <button
        style={isAssistantOpen ? itemActiveStyle : itemStyle}
        onClick={toggleAssistant}
        title="写卡助手"
      >
        ✦ 助手
      </button>

      <span style={sepStyle}>·</span>

      {/* 设置 */}
      <button
        style={{ ...itemStyle, padding: '3px 8px', display: 'flex', alignItems: 'center' }}
        onClick={() => navigate('/settings', {
          state: {
            backgroundLocation: location,
            from: {
              pathname: location.pathname,
              search: location.search,
              hash: location.hash,
              state: location.state,
            },
          },
        })}
        title="设置"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ opacity: 0.6 }}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
