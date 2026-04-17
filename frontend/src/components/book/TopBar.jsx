/* DESIGN.md §5.2 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorlds } from '../../api/worlds.js';

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
  border: '1px solid transparent',
  borderRadius: '1px',
  cursor: 'pointer',
  background: 'none',
  transition: 'color 0.2s, border-color 0.2s, background 0.2s',
  whiteSpace: 'nowrap',
  color: 'rgba(255,255,255,0.5)',
};

const itemActiveStyle = {
  ...itemStyle,
  color: 'var(--we-gold-pale)',
  borderColor: 'rgba(201,168,90,0.3)',
  background: 'rgba(201,168,90,0.08)',
};

const sepStyle = {
  color: 'rgba(255,255,255,0.2)',
  fontSize: '12px',
  userSelect: 'none',
};

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { characterId, worldId } = extractIds(location.pathname);

  const [worlds, setWorlds] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    getWorlds().then(setWorlds).catch(() => {});
  }, []);

  // 从 worlds 列表里找当前 worldId 对应的名字
  const currentWorld = worlds.find((w) => w.id === worldId);

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

  const isPersonaDrawerOpen = !!location.pathname.match(/\/worlds\/[\w-]+\/persona/) && !!location.state?.backgroundLocation;
  const isChat = !!characterId || !!location.pathname.match(/\/worlds\/[\w-]+$/);
  const isWriting = location.pathname.match(/\/worlds\/([\w-]+)\/writing/);

  return (
    <div style={{
      height: '40px',
      flexShrink: 0,
      background: '#3d2e22',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: '4px',
      zIndex: 50,
      position: 'relative',
    }}>
      {/* 世界选择器 */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          style={currentWorld ? itemActiveStyle : itemStyle}
          onClick={() => setDropdownOpen((o) => !o)}
        >
          {currentWorld?.name ?? '选择世界'}
          <span style={{ marginLeft: '4px', opacity: 0.5, fontSize: '9px' }}>▾</span>
        </button>

        {dropdownOpen && (
          <div style={{
            position: 'absolute',
            top: '36px',
            left: 0,
            minWidth: '160px',
            background: '#3d2e22',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '2px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100,
            overflow: 'hidden',
          }}>
            {worlds.length === 0 && (
              <div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
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
                  background: w.id === worldId ? 'rgba(201,168,90,0.1)' : 'none',
                  color: w.id === worldId ? 'var(--we-gold-pale)' : 'rgba(255,255,255,0.6)',
                  fontFamily: 'var(--we-font-display)',
                  fontStyle: 'italic',
                  fontSize: '12px',
                  letterSpacing: '0.08em',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (w.id !== worldId) e.target.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { if (w.id !== worldId) e.target.style.background = 'none'; }}
                onClick={() => {
                  setDropdownOpen(false);
                  navigate(`/worlds/${w.id}`);
                }}
              >
                {w.name}
              </button>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '2px 0' }} />
            <button
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 12px',
                background: 'none',
                color: 'rgba(255,255,255,0.35)',
                fontFamily: 'var(--we-font-display)',
                fontStyle: 'italic',
                fontSize: '11px',
                letterSpacing: '0.08em',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.target.style.color = 'rgba(255,255,255,0.6)'; }}
              onMouseLeave={(e) => { e.target.style.color = 'rgba(255,255,255,0.35)'; }}
              onClick={() => { setDropdownOpen(false); navigate('/'); }}
            >
              前往世界列表 →
            </button>
          </div>
        )}
      </div>

      <span style={sepStyle}>·</span>

      {/* 对话模式 */}
      <button
        style={isChat ? itemActiveStyle : { ...itemStyle, opacity: worldId ? 1 : 0.4, cursor: worldId ? 'pointer' : 'default' }}
        disabled={!worldId}
        onClick={() => {
          if (characterId) navigate(`/characters/${characterId}/chat`);
          else if (worldId) navigate(`/worlds/${worldId}`);
        }}
      >
        对话
      </button>

      <span style={sepStyle}>·</span>

      {/* 写作空间 */}
      <button
        style={isWriting ? itemActiveStyle : { ...itemStyle, opacity: worldId ? 1 : 0.4, cursor: worldId ? 'pointer' : 'default' }}
        disabled={!worldId}
        onClick={() => {
          if (worldId) navigate(`/worlds/${worldId}/writing`);
        }}
      >
        写作
</button>

      <div style={{ flex: 1 }} />

      {/* 玩家人设 */}
      <button
        style={{ ...itemStyle, opacity: worldId ? 1 : 0.4, cursor: worldId ? 'pointer' : 'default' }}
        disabled={!worldId}
        onClick={() => {
          if (!worldId) return;
          if (isPersonaDrawerOpen) {
            navigate(location.pathname, { state: { ...location.state, closingDrawer: true }, replace: true });
          } else {
            navigate(`/worlds/${worldId}/persona`, { state: { backgroundLocation: { pathname: `/worlds/${worldId}`, search: '', hash: '' } } });
          }
        }}
      >
        玩家人设
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
