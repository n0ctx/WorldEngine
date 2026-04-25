/* DESIGN.md §5.2 */
import { useState, useEffect, useRef } from 'react';
import Icon from '../ui/Icon.jsx';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorlds } from '../../api/worlds.js';
import { getCharacter } from '../../api/characters.js';
import useStore from '../../store/index.js';
import { useAssistantStore } from '@assistant/useAssistantStore.js';

function extractIds(pathname) {
  const charChat = pathname.match(/\/characters\/([\w-]+)\/chat/);
  const worldWriting = pathname.match(/\/worlds\/([\w-]+)/);
  return {
    characterId: charChat?.[1] ?? null,
    worldId: worldWriting?.[1] ?? null,
  };
}

// Overlay routes that should not affect topbar state — mirrors App.jsx's background <Routes> block.
const OVERLAY_PATTERNS = [
  /^\/worlds\/new$/,
  /^\/worlds\/[\w-]+\/edit$/,
  /^\/worlds\/[\w-]+\/persona$/,
  /^\/worlds\/[\w-]+\/characters\/new$/,
  /^\/characters\/[\w-]+\/edit$/,
  /^\/settings$/,
];

function resolveTopbarPathname(location) {
  const bg = location.state?.backgroundLocation;
  if (bg) return bg.pathname;
  if (OVERLAY_PATTERNS.some((re) => re.test(location.pathname))) return '/';
  return location.pathname;
}

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const topbarPathname = resolveTopbarPathname(location);
  const { characterId, worldId } = extractIds(topbarPathname);
  const currentWorldId = useStore((s) => s.currentWorldId);
  const setCurrentWorldId = useStore((s) => s.setCurrentWorldId);
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const toggleAssistant = useAssistantStore((s) => s.toggle);
  const isAssistantOpen = useAssistantStore((s) => s.isOpen);

  const [worlds, setWorlds] = useState([]);
  const [worldsLoading, setWorldsLoading] = useState(false);
  const [chatWorldId, setChatWorldId] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  async function loadWorlds() {
    setWorldsLoading(true);
    try {
      const data = await getWorlds();
      setWorlds(data);
    } catch {
      setWorlds([]);
    } finally {
      setWorldsLoading(false);
    }
  }

  useEffect(() => {
    loadWorlds();
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      loadWorlds();
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

  const isWorldsList = topbarPathname === '/';

  return (
    <div className="we-topbar">
      {/* 世界选择器 */}
      <div ref={dropdownRef} className="we-topbar-world-wrap">
        {isWorldsList ? (
          <span className="we-topbar-item we-topbar-item--static">
            世界列表
          </span>
        ) : (
        <button
          className={`we-topbar-item${currentWorld ? ' we-topbar-item--active' : ''}`}
          onClick={() => setDropdownOpen((o) => !o)}
          aria-label={currentWorld ? `切换世界，当前：${currentWorld.name}` : '选择世界'}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
        >
          {currentWorld?.name ?? '选择世界'}
          <span className="we-topbar-caret">▾</span>
        </button>
        )}

        {dropdownOpen && (
          <div className="we-topbar-dropdown">
            {worldsLoading ? (
              <div className="we-topbar-dropdown-empty">
                加载中…
              </div>
            ) : worlds.length === 0 ? (
              <div className="we-topbar-dropdown-empty">
                暂无世界记录
              </div>
            ) : null}
            {!worldsLoading && worlds.map((w) => (
              <button
                key={w.id}
                className={`we-topbar-dropdown-item${w.id === effectiveWorldId ? ' we-topbar-dropdown-item--active' : ''}`}
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
            {!worldsLoading && <div className="we-topbar-dropdown-divider" />}
            <button
              className="we-topbar-dropdown-list-btn"
              onClick={() => { setDropdownOpen(false); navigate('/'); }}
            >
              前往世界列表 →
            </button>
          </div>
        )}
      </div>

      {!isWorldsList && effectiveWorldId && (
        <>
          <span className="we-topbar-sep">·</span>

          {/* 故事 */}
          <button
            className={`we-topbar-item${topbarPathname === `/worlds/${effectiveWorldId}` ? ' we-topbar-item--active' : ''}`}
            onClick={() => navigate(`/worlds/${effectiveWorldId}`)}
            aria-label="进入故事页"
          >
            故事
          </button>

          <span className="we-topbar-sep">·</span>

          {/* 配置 */}
          <button
            className={`we-topbar-item${topbarPathname === `/worlds/${effectiveWorldId}/config` ? ' we-topbar-item--active' : ''}`}
            onClick={() => navigate(`/worlds/${effectiveWorldId}/config`)}
            aria-label="进入配置页"
          >
            配置
          </button>
        </>
      )}

      <div className="we-topbar-spacer" />

      {/* 写卡助手 */}
      <button
        className={`we-topbar-item${isAssistantOpen ? ' we-topbar-item--active' : ''}`}
        onClick={toggleAssistant}
        title="写卡助手"
        aria-label={isAssistantOpen ? '关闭写卡助手' : '打开写卡助手'}
        aria-pressed={isAssistantOpen}
      >
        ✦ 助手
      </button>

      <span className="we-topbar-sep">·</span>

      {/* 设置 */}
      <button
        className="we-topbar-item we-topbar-settings-btn"
        aria-label="打开设置"
        onClick={() => {
          const realBackground = location.state?.backgroundLocation ?? location;
          navigate('/settings', {
            state: {
              backgroundLocation: realBackground,
              from: {
                pathname: location.pathname,
                search: location.search,
                hash: location.hash,
                state: location.state,
              },
            },
          });
        }}
        title="设置"
      >
        <Icon size={16} strokeWidth="1.8" className="we-topbar-settings-icon">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </Icon>
      </button>
    </div>
  );
}
