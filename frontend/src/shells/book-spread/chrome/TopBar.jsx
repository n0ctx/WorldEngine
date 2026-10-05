/* book-spread shell top bar — three-level breadcrumb + shell chrome */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { IconAssistant, IconSettings } from '../../../components/ui/icons.jsx';
import BrandMark from '../../../components/ui/BrandMark.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
import { useOpenSettings } from '../../../core/hooks/useOpenSettings.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorld } from '../../../core/api/worlds.js';
import { getCharacter } from '../../../core/api/characters.js';
import useStore from '../../../core/state/index.js';
import useCurrentStoryStore from '../../../core/state/currentStory.js';
import { useAssistantPanel } from '../../../core/features/assistant/index.js';
import DanmakuLayer from '../../../components/chat/DanmakuLayer.jsx';
import { useDanmakuBandStore } from '../../../core/state/danmakuBand.js';
import { useDisplaySettingsStore } from '../../../core/state/displaySettings';
import { useAppModeStore } from '../../../core/state/appMode';
import { extractIds, resolveTopbarPathname } from '../../../core/utils/worldScope.js';

// 面包屑的世界层：世界页本身是当前位置（不可点），其下的页面点它回到这个世界
function WorldCrumb({ worldId, isCurrentLevel }) {
  const navigate = useNavigate();
  const m = useMotion();
  const [worldName, setWorldName] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () => getWorld(worldId)
      .then((world) => { if (!cancelled) setWorldName(world?.name ?? ''); })
      .catch(() => { if (!cancelled) setWorldName(''); });
    load();
    window.addEventListener('we:world-updated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('we:world-updated', load);
    };
  }, [worldId]);

  const label = <span className="we-topbar-crumb-label">{worldName || '世界'}</span>;
  if (isCurrentLevel) {
    return <span className="we-topbar-item we-topbar-crumb we-topbar-crumb-current" aria-current="page">{label}</span>;
  }
  return (
    <motion.button
      className="we-topbar-item we-topbar-crumb"
      onClick={() => navigate(`/worlds/${worldId}`)}
      aria-label={worldName ? `返回世界：${worldName}` : '返回世界'}
      {...m.gesture('press')}
    >
      {label}
    </motion.button>
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
  const openSettings = useOpenSettings();
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
          <span className="we-topbar-item we-topbar-crumb we-topbar-crumb-current we-topbar-brand" aria-current="page">
            <BrandMark className="we-topbar-brand-mark" />
            WorldEngine
          </span>
        ) : (
          <>
            <motion.button
              className="we-topbar-item we-topbar-crumb"
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
            <WorldCrumb worldId={effectiveWorldId} isCurrentLevel={worldIsCurrentLevel} />
          </>
        )}

        {leafLabel && (
          <>
            <span className="we-topbar-sep" aria-hidden="true">/</span>
            <span className="we-topbar-item we-topbar-crumb we-topbar-crumb-current" aria-current="page">
              <span className="we-topbar-crumb-label">{leafLabel}</span>
            </span>
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
          <IconAssistant size={20} />
          <span className="we-topbar-item-label">助手</span>
        </motion.button>

        <motion.button
          className="we-topbar-item we-topbar-settings-btn"
          aria-label="打开设置"
          onClick={openSettings}
          title="设置"
          {...m.gesture('press')}
        >
          <IconSettings size={20} className="we-topbar-settings-icon" />
        </motion.button>
      </div>
    </div>
  );
}
