import { useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { Download, Ellipsis, PencilLine, Trash2 } from 'lucide-react';
import SortableGrid from '../../components/ui/SortableGrid';
import AvatarCircle from '../../components/ui/AvatarCircle.jsx';
import WorldSceneArt from '../../components/ui/WorldSceneArt.jsx';
import { getAvatarUrl } from '../../core/utils/avatar';
import { relativeTime } from '../../core/utils/time';
import { useMotion } from '../../core/hooks/useMotion.js';
import { STAGGER } from '../../core/utils/motion.js';

const ENTER_STAGGER_CAP = 8;
const GLOW_OPACITY = 0.8;

function PortalGlow() {
  const ref = useRef(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const visible = useMotionValue(0);
  const glowX = useMotionTemplate`${pointerX}px`;
  const glowY = useMotionTemplate`${pointerY}px`;

  useEffect(() => {
    const card = ref.current?.parentElement;
    if (!card) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    const track = (event) => {
      const rect = card.getBoundingClientRect();
      pointerX.set(event.clientX - rect.left);
      pointerY.set(event.clientY - rect.top);
    };
    card.addEventListener('pointerenter', (event) => {
      track(event);
      visible.set(GLOW_OPACITY);
    }, { signal });
    card.addEventListener('pointermove', track, { signal });
    card.addEventListener('pointerleave', () => visible.set(0), { signal });
    return () => controller.abort();
  }, [pointerX, pointerY, visible]);

  return (
    <motion.span
      ref={ref}
      className="we-world-card-glow"
      aria-hidden="true"
      style={{ '--glow-x': glowX, '--glow-y': glowY, '--glow-opacity': visible }}
    >
      <span className="we-world-card-glow-rim" />
    </motion.span>
  );
}

function WorldCard({
  world,
  index,
  isDragging,
  setNodeRef,
  style,
  attributes,
  listeners,
  actionsOpen,
  exportingWorldId,
  reloadKey,
  sceneEnter,
  showGlow,
  motionConfig,
  onEnterWorld,
  onSetLitWorld,
  onSetActionsOpenId,
  onSetDeletingWorld,
  onExportWorld,
  location,
  navigate,
}) {
  // 首位取 SortableGrid 的实时 index，拖动时大门随卡片一起移动。
  const isFeature = index === 0;
  const hiddenCast = world.character_count - world.cast.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`we-world-card-shell${isFeature ? ' we-world-card-shell--feature' : ''}`}
    >
      <motion.div
        data-dragging={isDragging || undefined}
        className={`we-world-card we-material${world.cover_path ? ' we-world-card--has-cover' : ' we-world-card--tinted'}${isFeature ? ' we-world-card--feature' : ''}`}
        role="link"
        tabIndex={0}
        aria-label={world.name}
        onClick={() => { if (!isDragging) onEnterWorld(world); }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
          event.stopPropagation();
          onEnterWorld(world);
        }}
        onMouseEnter={() => onSetLitWorld(world)}
        onMouseLeave={() => { onSetLitWorld(null); onSetActionsOpenId(null); }}
        onFocus={() => onSetLitWorld(world)}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          onSetLitWorld(null);
          onSetActionsOpenId(null);
        }}
        variants={{
          hidden: sceneEnter.hidden,
          visible: {
            ...sceneEnter.visible,
            transition: motionConfig.transition('signal', { delay: Math.min(index, ENTER_STAGGER_CAP) * STAGGER.list }),
          },
        }}
        initial={isDragging ? false : 'hidden'}
        animate="visible"
        {...motionConfig.gesture('portal', { disabled: isDragging })}
      >
        {world.cover_path ? (
          <img src={`${getAvatarUrl(world.cover_path)}?t=${reloadKey}`} alt="" className="we-world-card-bg" />
        ) : (
          <WorldSceneArt name={world.name} className="we-world-card-bg we-world-card-scene" />
        )}
        <div className="we-world-card-overlay" />
        {showGlow && !isDragging ? <PortalGlow /> : null}

        <div className="we-world-card-foot">
          <h3 className="we-world-card-name">{world.name}</h3>
          {world.description ? <p className="we-world-card-desc">{world.description}</p> : null}
          <div className="we-world-card-meta">
            {world.character_count > 0 ? (
              <span className="we-world-card-cast" role="img" aria-label={`${world.character_count} 个角色`}>
                {world.cast.map((character) => (
                  <AvatarCircle
                    key={character.id}
                    id={character.id}
                    name={character.name}
                    avatarPath={character.avatar_path}
                    size="sm"
                  />
                ))}
                {hiddenCast > 0 ? <span className="we-world-card-cast-more">+{hiddenCast}</span> : null}
              </span>
            ) : (
              <span className="we-world-card-cast-empty">还没有角色</span>
            )}
            <span className="we-world-card-time">{relativeTime(world.updated_at)}</span>
          </div>
        </div>

        <div
          className={`we-world-card-actions${actionsOpen ? ' we-world-card-actions--open' : ''}`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') onSetActionsOpenId(null);
          }}
        >
          {actionsOpen ? (
            <>
              <button
                className="we-world-card-action-btn"
                onClick={(event) => onExportWorld(world, event)}
                disabled={exportingWorldId === world.id}
                title="导出世界卡"
                aria-label="导出世界卡"
              >
                <Download size={16} />
              </button>
              <button
                className="we-world-card-action-btn"
                onClick={() => navigate(`/worlds/${world.id}/edit`, { state: { backgroundLocation: location } })}
                title="编辑"
                aria-label="编辑世界"
              >
                <PencilLine size={16} />
              </button>
              <button
                className="we-world-card-action-btn danger"
                onClick={() => onSetDeletingWorld(world)}
                title="删除"
                aria-label="删除世界"
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : null}
          <button
            className="we-world-card-action-btn we-world-card-action-toggle"
            onClick={() => onSetActionsOpenId(actionsOpen ? null : world.id)}
            aria-label={actionsOpen ? '收起世界操作' : '世界操作'}
            aria-expanded={actionsOpen}
            title="更多操作"
          >
            <Ellipsis size={16} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function WorldsGrid({
  worlds,
  onReorderEnd,
  actionsOpenId,
  setActionsOpenId,
  setDeletingWorld,
  exportingWorldId,
  reloadKey,
  handleExportWorld,
  handleEnterWorld,
  setLitWorld,
}) {
  const motionConfig = useMotion();
  const location = useLocation();
  const navigate = useNavigate();
  const sceneEnter = motionConfig.variant('overlayEnter');
  const showGlow = !motionConfig.reduced;

  return (
    <SortableGrid
      items={worlds}
      onReorderEnd={onReorderEnd}
      className="we-worlds-grid"
      renderItem={(world, sortableProps) => (
        <WorldCard
          world={world}
          {...sortableProps}
          actionsOpen={actionsOpenId === world.id}
          exportingWorldId={exportingWorldId}
          reloadKey={reloadKey}
          sceneEnter={sceneEnter}
          showGlow={showGlow}
          motionConfig={motionConfig}
          onEnterWorld={handleEnterWorld}
          onSetLitWorld={setLitWorld}
          onSetActionsOpenId={setActionsOpenId}
          onSetDeletingWorld={setDeletingWorld}
          onExportWorld={handleExportWorld}
          location={location}
          navigate={navigate}
        />
      )}
    />
  );
}
