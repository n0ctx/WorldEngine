/* book-spread shell top bar — three-level breadcrumb + shell chrome */
import { useState, useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Settings, Sparkles } from 'lucide-react';
import { useMotion } from '../../../core/hooks/useMotion.js';
import { useClickOutside } from '../../../core/hooks/useClickOutside.js';
import { useEscapeKey } from '../../../core/hooks/useEscapeKey.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorlds } from '../../../core/api/worlds.js';
import { getCharacter } from '../../../core/api/characters.js';
import useStore from '../../../core/state/index.js';
import useCurrentStoryStore from '../../../core/state/currentStory.js';
import { useAssistantPanel } from '../../../core/features/assistant/index.js';
import DanmakuLayer from '../../../components/chat/DanmakuLayer.jsx';
import { useDanmakuBandStore } from '../../../core/state/danmakuBand.js';
import { useDisplaySettingsStore } from '../../../core/state/displaySettings';
import { useAppModeStore } from '../../../core/state/appMode';
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
  const menuId = useId();

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
  useEscapeKey(() => setDropdownOpen(false), dropdownOpen);

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
        aria-controls={dropdownOpen ? menuId : undefined}
        aria-current={isCurrentLevel ? 'page' : undefined}
      >
        <span className="we-topbar-world-name">{currentWorld?.name ?? '选择世界'}</span>
        <motion.span
          className="we-topbar-caret"
          animate={{ rotate: dropdownOpen ? 180 : 0 }}
          transition={m.transition('press')}
          aria-hidden="true"
        >
          <ChevronDown size={16} />
        </motion.span>
      </button>

      <AnimatePresence>
        {dropdownOpen && (
          <motion.div
            id={menuId}
            className="we-menu we-topbar-dropdown we-on-shell"
            variants={m.variant('enter')}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={m.transition('enter')}
          >
            {worldsLoading ? (
              <div className="we-menu__empty">加载中…</div>
            ) : worlds.length === 0 ? (
              <div className="we-menu__empty">暂无世界记录</div>
            ) : null}
            {!worldsLoading && worlds.map((world) => (
              <button
                key={world.id}
                className="we-menu__item"
                aria-current={world.id === effectiveWorldId ? 'true' : undefined}
                onClick={() => {
                  setDropdownOpen(false);
                  setCurrentWorldId(world.id);
                  setCurrentCharacterId(null);
                  setCurrentSessionId(null);
                  navigate(`/worlds/${world.id}`);
                }}
              >
                <span className="we-menu__label">{world.name}</span>
                {world.id === effectiveWorldId && <Check size={14} className="we-menu__check" aria-hidden="true" />}
              </button>
            ))}
            {!worldsLoading && <div className="we-menu__divider" />}
            <button
              className="we-menu__item"
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
  const writingDanmakuSpeed = useDisplaySettingsStore((s) => s.writingDanmakuSpeed);
  const appMode = useAppModeStore((s) => s.appMode);

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
          <DanmakuLayer comments={danmakuComments} speed={appMode === 'writing' ? writingDanmakuSpeed : danmakuSpeed} />
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
          <Sparkles size={20} />
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
          <Settings size={20} className="we-topbar-settings-icon" />
        </motion.button>
      </div>
    </div>
  );
}
