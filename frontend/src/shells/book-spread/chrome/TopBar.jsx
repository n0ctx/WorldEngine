/* book-spread shell top bar — three-level breadcrumb + shell chrome */
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotion } from '../../../core/hooks/useMotion.js';
import { useClickOutside } from '../../../core/hooks/useClickOutside.js';
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

function WorldSelector({ effectiveWorldId, isCurrentLevel }) {
  const navigate = useNavigate();
  const location = useLocation();
  const m = useMotion();
  const setCurrentWorldId = useStore((s) => s.setCurrentWorldId);
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const [worlds, setWorlds] = useState([]);
  const [worldsLoading, setWorldsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  async function loadWorlds() {
    setWorldsLoading(true);
    try {
      setWorlds(await getWorlds());
    } catch {
      setWorlds([]);
    } finally {
      setWorldsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(loadWorlds, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const timeoutId = setTimeout(loadWorlds, 0);
    return () => clearTimeout(timeoutId);
  }, [dropdownOpen]);

  useClickOutside(dropdownRef, () => setDropdownOpen(false));

  useEffect(() => {
    const timeoutId = setTimeout(() => setDropdownOpen(false), 0);
    return () => clearTimeout(timeoutId);
  }, [location.pathname]);

  const currentWorld = worlds.find((world) => world.id === effectiveWorldId);

  return (
    <div ref={dropdownRef} className="we-topbar-world-wrap">
      <button
        className={`we-topbar-item${isCurrentLevel ? ' we-topbar-item--active' : ''}`}
        onClick={() => setDropdownOpen((open) => !open)}
        aria-label={currentWorld ? `切换世界，当前：${currentWorld.name}` : '选择世界'}
        aria-expanded={dropdownOpen}
        aria-haspopup="listbox"
        aria-current={isCurrentLevel ? 'page' : undefined}
      >
        <span className="we-topbar-world-name">{currentWorld?.name ?? '选择世界'}</span>
        <motion.span
          className="we-topbar-caret"
          animate={{ rotate: dropdownOpen ? 180 : 0 }}
          transition={m.transition('quick')}
          aria-hidden="true"
        >
          <Icon size={16} viewBox="0 0 10 10" strokeWidth="1.6"><polyline points="2,3.5 5,6.5 8,3.5" /></Icon>
        </motion.span>
      </button>

      <AnimatePresence>
        {dropdownOpen && (
          <motion.div
            className="we-topbar-dropdown"
            variants={m.variant('overlayEnter')}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={m.spring('overlay')}
          >
            {worldsLoading ? (
              <div className="we-topbar-dropdown-empty">加载中…</div>
            ) : worlds.length === 0 ? (
              <div className="we-topbar-dropdown-empty">暂无世界记录</div>
            ) : null}
            {!worldsLoading && worlds.map((world) => (
              <button
                key={world.id}
                className={`we-topbar-dropdown-item${world.id === effectiveWorldId ? ' we-topbar-dropdown-item--active' : ''}`}
                onClick={() => {
                  setDropdownOpen(false);
                  setCurrentWorldId(world.id);
                  setCurrentCharacterId(null);
                  setCurrentSessionId(null);
                  navigate(`/worlds/${world.id}`);
                }}
              >
                {world.name}
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
  );
}

function getLeafLabel(pathname, worldId, storyTitle) {
  const labels = {
    [`/worlds/${worldId}/rules`]: '规则',
    [`/worlds/${worldId}/edit`]: '编辑世界',
    [`/worlds/${worldId}/writing`]: storyTitle || '写作',
  };
  return /^\/characters\/[\w-]+\/chat$/.test(pathname)
    ? storyTitle || '对话'
    : labels[pathname] ?? null;
}

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const m = useMotion();
  const topbarPathname = resolveTopbarPathname(location);
  const { characterId, worldId } = extractIds(topbarPathname);
  const currentWorldId = useStore((s) => s.currentWorldId);
  const setCurrentWorldId = useStore((s) => s.setCurrentWorldId);
  const storyTitle = useCurrentStoryStore((s) => s.title);
  const toggleAssistant = useAssistantPanel((s) => s.toggle);
  const isAssistantOpen = useAssistantPanel((s) => s.isOpen);
  const danmakuComments = useDanmakuBandStore((s) => s.comments);
  const danmakuSpeed = useDisplaySettingsStore((s) => s.danmakuSpeed);

  const [chatWorldId, setChatWorldId] = useState(null);

  useEffect(() => {
    if (worldId) {
      setCurrentWorldId(worldId);
    }
  }, [worldId, setCurrentWorldId]);

  useEffect(() => {
    let cancelled = false;

    if (!characterId) {
      const timeoutId = setTimeout(() => setChatWorldId(null), 0);
      return () => clearTimeout(timeoutId);
    }

    getCharacter(characterId)
      .catch(() => null)
      .then((character) => {
        if (cancelled) return;
        const nextWorldId = character?.world_id ?? null;
        setChatWorldId(nextWorldId);
        if (nextWorldId) setCurrentWorldId(nextWorldId);
      });

    return () => { cancelled = true; };
  }, [characterId, setCurrentWorldId]);

  const effectiveWorldId = worldId ?? chatWorldId ?? currentWorldId;

  const isWorldsList = topbarPathname === '/';

  // 面包屑第三级（叶子节点）：世界层之下的具体页面。
  // 只在能明确归类到某个已知页面时才显示；否则叶子留空，面包屑到「世界」这一级为止。
  const leafLabel = !isWorldsList && effectiveWorldId
    ? getLeafLabel(topbarPathname, effectiveWorldId, storyTitle)
    : null;
  // 世界层是最后一级时（世界主页本身），用高对比样式标出「当前位置」。
  const worldIsCurrentLevel = !isWorldsList && effectiveWorldId && !leafLabel;

  return (
    <div className="we-topbar">
      {/* 左侧：品牌 + 面包屑导航 */}
      <div className="we-topbar-left">
        {isWorldsList ? (
          <span className="we-topbar-item we-topbar-crumb-current we-topbar-brand" aria-current="page">WorldEngine</span>
        ) : (
          <>
            <motion.button
              className="we-topbar-item"
              onClick={() => navigate('/')}
              aria-label="返回世界列表"
              {...m.gesture('press')}
            >
              世界
            </motion.button>
          </>
        )}

        {!isWorldsList && effectiveWorldId && (
          <>
            <span className="we-topbar-sep" aria-hidden="true">/</span>
            <WorldSelector
              effectiveWorldId={effectiveWorldId}
              isCurrentLevel={worldIsCurrentLevel}
            />
          </>
        )}

        {leafLabel && (
          <>
            <span className="we-topbar-sep" aria-hidden="true">/</span>
            <span className="we-topbar-item we-topbar-crumb-current" aria-current="page">{leafLabel}</span>
          </>
        )}
      </div>

      {/* 中间槽位：有弹幕时单行滚动，无弹幕时作为占位把右侧按钮推到最右 */}
      <div className="we-topbar-center">
        <div className="we-topbar-danmaku-slot">
          <DanmakuLayer comments={danmakuComments} speed={danmakuSpeed} />
        </div>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="we-topbar-actions">
        <motion.button
          className={`we-topbar-item${isAssistantOpen ? ' we-topbar-item--active' : ''}`}
          onClick={toggleAssistant}
          title="写卡助手"
          aria-label={isAssistantOpen ? '关闭写卡助手' : '打开写卡助手'}
          aria-pressed={isAssistantOpen}
          {...m.gesture('press')}
        >
          <Icon size={20} strokeWidth="1.6">
            <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
            <path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z" />
          </Icon>
          <span className="we-topbar-item-label">助手</span>
        </motion.button>

        <motion.button
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
          {...m.gesture('press')}
        >
          <Icon size={20} strokeWidth="1.6" className="we-topbar-settings-icon">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </Icon>
        </motion.button>
      </div>
    </div>
  );
}
