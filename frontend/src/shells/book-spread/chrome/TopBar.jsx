/* DESIGN.md §5.2 — book-spread shell top bar */
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, EASE } from '../../../core/utils/motion.js';
import Icon from '../../../components/ui/Icon.jsx';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorlds } from '../../../core/api/worlds.js';
import { getCharacter } from '../../../core/api/characters.js';
import useStore from '../../../core/state/index.js';
import useCurrentStoryStore from '../../../core/state/currentStory.js';
import { useAssistantPanel } from '../../../core/features/assistant/index.js';
import DanmakuLayer from '../../../components/chat/DanmakuLayer.jsx';
import { useDanmakuBandStore } from '../../../core/state/danmakuBand.js';
import { useDisplaySettingsStore } from '../../../core/state/displaySettings';
import { extractIds, resolveTopbarPathname } from '../../../core/utils/worldScope.js';

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const topbarPathname = resolveTopbarPathname(location);
  const { characterId, worldId } = extractIds(topbarPathname);
  const currentWorldId = useStore((s) => s.currentWorldId);
  const setCurrentWorldId = useStore((s) => s.setCurrentWorldId);
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const storyTitle = useCurrentStoryStore((s) => s.title);
  const toggleAssistant = useAssistantPanel((s) => s.toggle);
  const isAssistantOpen = useAssistantPanel((s) => s.isOpen);
  const danmakuComments = useDanmakuBandStore((s) => s.comments);
  const danmakuSpeed = useDisplaySettingsStore((s) => s.danmakuSpeed);

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
    const timeoutId = setTimeout(() => {
      loadWorlds();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      const timeoutId = setTimeout(() => {
        loadWorlds();
      }, 0);
      return () => clearTimeout(timeoutId);
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
      const timeoutId = setTimeout(() => {
        if (!cancelled) setChatWorldId(null);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
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

  const currentWorld = worlds.find((w) => w.id === effectiveWorldId);

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
    const timeoutId = setTimeout(() => setDropdownOpen(false), 0);
    return () => clearTimeout(timeoutId);
  }, [location.pathname]);

  const isWorldsList = topbarPathname === '/';

  // 面包屑第三级（叶子节点）：世界层之下的具体页面。
  // 只在能明确归类到某个已知页面时才显示；否则叶子留空，面包屑到「世界」这一级为止。
  let leafLabel = null;
  if (!isWorldsList && effectiveWorldId) {
    if (topbarPathname === `/worlds/${effectiveWorldId}/rules`) {
      leafLabel = '规则';
    } else if (topbarPathname === `/worlds/${effectiveWorldId}/edit`) {
      leafLabel = '编辑世界';
    } else if (/^\/characters\/[\w-]+\/chat$/.test(topbarPathname)) {
      leafLabel = storyTitle || '对话';
    } else if (topbarPathname === `/worlds/${effectiveWorldId}/writing`) {
      leafLabel = storyTitle || '写作';
    }
  }
  // 世界层是最后一级时（世界主页本身），用高对比样式标出「当前位置」。
  const worldIsCurrentLevel = !isWorldsList && effectiveWorldId && !leafLabel;

  return (
    <div className="we-topbar">
      {isWorldsList ? (
        <span className="we-topbar-item we-topbar-crumb-current" aria-current="page">WorldEngine</span>
      ) : (
        <button
          className="we-topbar-item"
          onClick={() => navigate('/')}
          aria-label="返回书架"
        >
          书架
        </button>
      )}

      {!isWorldsList && effectiveWorldId && (
        <>
          <span className="we-topbar-sep" aria-hidden="true">/</span>
          <div ref={dropdownRef} className="we-topbar-world-wrap">
            <button
              className={`we-topbar-item${worldIsCurrentLevel ? ' we-topbar-item--active' : ''}`}
              onClick={() => setDropdownOpen((o) => !o)}
              aria-label={currentWorld ? `切换世界，当前：${currentWorld.name}` : '选择世界'}
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              aria-current={worldIsCurrentLevel ? 'page' : undefined}
            >
              {currentWorld?.name ?? '选择世界'}
              <motion.span
                className="we-topbar-caret"
                animate={{ rotate: dropdownOpen ? 180 : 0 }}
                transition={{ duration: DURATION.quick, ease: EASE.sharp }}
                aria-hidden="true"
              >
                <Icon size={16} viewBox="0 0 10 10" strokeWidth="1.6"><polyline points="2,3.5 5,6.5 8,3.5" /></Icon>
              </motion.span>
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  className="we-topbar-dropdown"
                  initial={{ opacity: 0, scaleY: 0.92, y: -4 }}
                  animate={{ opacity: 1, scaleY: 1,    y: 0 }}
                  exit={{   opacity: 0, scaleY: 0.92, y: -4 }}
                  transition={{ duration: DURATION.quick, ease: EASE.ink }}
                >
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
                    前往世界列表
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {leafLabel && (
        <>
          <span className="we-topbar-sep" aria-hidden="true">/</span>
          <span className="we-topbar-item we-topbar-crumb-current" aria-current="page">{leafLabel}</span>
        </>
      )}

      {/* 中间槽位：有弹幕时单行滚动，无弹幕时作为占位把右侧按钮推到最右 */}
      <div className="we-topbar-danmaku-slot">
        <DanmakuLayer comments={danmakuComments} speed={danmakuSpeed} />
      </div>

      <button
        className={`we-topbar-item${isAssistantOpen ? ' we-topbar-item--active' : ''}`}
        onClick={toggleAssistant}
        title="写卡助手"
        aria-label={isAssistantOpen ? '关闭写卡助手' : '打开写卡助手'}
        aria-pressed={isAssistantOpen}
      >
        助手
      </button>

      <span className="we-topbar-sep">·</span>

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
