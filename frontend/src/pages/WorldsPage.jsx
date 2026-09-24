import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import { Download, Ellipsis, PencilLine, Plus, Trash2, Upload } from 'lucide-react';
import { getWorlds, deleteWorld, reorderWorlds, updateWorld } from '../core/api/worlds';
import SortableGrid from '../components/ui/SortableGrid';
import { getCharactersByWorld } from '../core/api/characters';
import useStore from '../core/state/index';
import { downloadWorldCard, importWorld, readJsonFile } from '../core/api/import-export';
import { extractAccentColorFromImageSrc } from '../core/utils/extractAccentColor.js';
import { getAvatarUrl } from '../core/utils/avatar';
import { buildWorldScene } from '../core/utils/worldScene.js';
import { relativeTime } from '../core/utils/time';
import ConfirmModal from '../components/ui/ConfirmModal';
import EmptyState from '../components/ui/EmptyState.jsx';
import AvatarCircle from '../components/ui/AvatarCircle.jsx';
import WorldSceneArt from '../components/ui/WorldSceneArt.jsx';
import Button from '../components/ui/Button.jsx';
import { log } from '../core/utils/logger.js';
import { useMotion } from '../core/hooks/useMotion.js';
import { STAGGER } from '../core/utils/motion.js';

// 首屏入场只错开前几张，后面的卡与第 8 张同时落定，避免长列表拖出长尾
const ENTER_STAGGER_CAP = 8;
// 入口上用头像表达角色数量：最多露出这么多张脸，其余折成 +N
const CAST_PREVIEW = 4;

// 跟随光出现时的透明度（取自 Magic UI MagicCard 的 gradientOpacity；半径 200px 写在 pages.css）
const GLOW_OPACITY = 0.8;

// 跟随指针的光：挂在入口卡片里，监听卡片本身的指针；位置与指针同步，只有出现 / 消失走弹簧，
// 以 CSS 变量交给 pages.css 画边缘光与表面光两层
function PortalGlow({ fade }) {
  const ref = useRef(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const visible = useSpring(0, fade);
  const glowX = useMotionTemplate`${pointerX}px`;
  const glowY = useMotionTemplate`${pointerY}px`;

  useEffect(() => {
    const card = ref.current?.parentElement;
    if (!card) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    const track = (e) => {
      const rect = card.getBoundingClientRect();
      pointerX.set(e.clientX - rect.left);
      pointerY.set(e.clientY - rect.top);
    };
    card.addEventListener('pointerenter', (e) => {
      track(e);
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
      <span className="we-world-card-glow-surface" />
      <span className="we-world-card-glow-rim" />
    </motion.span>
  );
}

// 背景氛围取这个世界的颜色：已存的封面主色 → 本页临时从封面取的色 → 无封面时生成场景的光源色；
// 有封面但取色还没回来时返回 null，先沿用主题默认色
function worldTint(world, coverTints) {
  if (world.accent_color) return world.accent_color;
  if (world.cover_path) return coverTints[world.id] ?? null;
  return buildWorldScene(world.name).light.color;
}

export default function WorldsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentWorldId = useStore((s) => s.setCurrentWorldId);
  const setAmbientTint = useStore((s) => s.setAmbientTint);
  const m = useMotion();
  const sceneEnter = m.variant('sceneEnter');
  const glowFade = m.follow('glowFade');

  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingWorld, setDeletingWorld] = useState(null);
  const [exportingWorldId, setExportingWorldId] = useState(null);
  const [importingWorld, setImportingWorld] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionsOpenId, setActionsOpenId] = useState(null);
  const [litWorld, setLitWorld] = useState(null);
  // 有封面但没存主色的世界：点亮时在本页临时取一次封面主色，只用于氛围，不回写
  const [coverTints, setCoverTints] = useState({});
  const worldImportRef = useRef(null);

  // 悬停/聚焦的入口点亮背景氛围；都没有时由第一扇门（首位世界）定调
  const tintWorld = litWorld ?? worlds[0] ?? null;
  const ambientTint = tintWorld ? worldTint(tintWorld, coverTints) : null;
  useEffect(() => { setAmbientTint(ambientTint); }, [ambientTint, setAmbientTint]);
  useEffect(() => {
    if (!tintWorld?.cover_path || tintWorld.accent_color || tintWorld.id in coverTints) return;
    const { id, cover_path: coverPath } = tintWorld;
    extractAccentColorFromImageSrc(getAvatarUrl(coverPath))
      .then((color) => setCoverTints((prev) => ({ ...prev, [id]: color })));
  }, [tintWorld, coverTints]);
  useEffect(() => () => setAmbientTint(null), [setAmbientTint]);

  async function loadWorlds() {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getWorlds();
      const casts = await Promise.all(
        data.map((w) => getCharactersByWorld(w.id).catch(() => []))
      );
      setWorlds(data.map((w, i) => ({
        ...w,
        character_count: casts[i].length,
        cast: casts[i].slice(0, CAST_PREVIEW).map(({ id, name, avatar_path }) => ({ id, name, avatar_path })),
      })));
    } catch (err) {
      setWorlds([]);
      setLoadError(err.message || '读取世界列表失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadWorlds();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [reloadKey]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:world-updated', h);
    return () => window.removeEventListener('we:world-updated', h);
  }, []);

  function handleEnterWorld(world) {
    setCurrentWorldId(world.id);
    navigate(`/worlds/${world.id}`);
  }

  async function handleDelete() {
    try {
      await deleteWorld(deletingWorld.id);
    } catch (err) {
      log.error('worlds.delete_failed', err, { toast: err.message || '删除世界失败' });
      return;
    }
    setDeletingWorld(null);
    await loadWorlds();
  }

  async function handleExportWorld(world, e) {
    e.stopPropagation();
    setExportingWorldId(world.id);
    try {
      const safeName = world.name.replace(/[^\w一-龥]/g, '_');
      await downloadWorldCard(world.id, `${safeName}.weworld.json`);
    } catch (err) {
      log.error('world.export_failed', err, { toast: `导出失败：${err.message}` });
    } finally {
      setExportingWorldId(null);
    }
  }

  async function handleReorderEnd(finalItems) {
    setWorlds(finalItems);
    try {
      await reorderWorlds(finalItems.map((w, i) => ({ id: w.id, sort_order: i })));
    } catch (err) {
      log.error('world.sort.save_failed', err, { toast: `排序保存失败：${err.message}` });
      await loadWorlds();
    }
  }

  async function handleImportWorldFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingWorld(true);
    try {
      const data = await readJsonFile(file);
      const created = await importWorld(data);
      // 旧格式世界卡没有 accent_color：有封面、且不是手工指定色时，导入完成后
      // 补算一次自动取色并回写，否则「封面即光源」对所有导入世界永久失效
      // （导入世界卡是本产品主要的分享方式）。
      if (created?.cover_path && !created.accent_color && created.accent_source !== 'manual') {
        try {
          const accentColor = await extractAccentColorFromImageSrc(getAvatarUrl(created.cover_path));
          await updateWorld(created.id, { accent_color: accentColor, accent_source: 'auto' });
        } catch (err) {
          log.error('world.import.accent_backfill_failed', err);
        }
      }
      await loadWorlds();
    } catch (err) {
      log.error('world.import_failed', err, { toast: `导入失败：${err.message}` });
    } finally {
      setImportingWorld(false);
      e.target.value = '';
    }
  }

  return (
    <div className="we-worlds-canvas">
      {/* 页头 */}
      <div className="we-worlds-header">
        <div className="we-worlds-heading">
          {worlds.length > 0 ? <p className="we-worlds-eyebrow">{worlds.length} 个世界</p> : null}
          <h1 className="we-worlds-title">世界</h1>
        </div>
        <div className="we-worlds-header-actions">
          <Button
            variant="ghost"
            className="we-worlds-header-btn"
            onClick={() => worldImportRef.current?.click()}
            disabled={importingWorld}
          >
            <Upload size={16} />
            {importingWorld ? '导入中…' : '导入世界卡'}
          </Button>
          <input
            ref={worldImportRef}
            type="file"
            accept=".json,.weworld.json"
            className="hidden"
            onChange={handleImportWorldFile}
          />
          <Button
            variant="ghost"
            className="we-worlds-header-btn we-worlds-header-btn--create"
            onClick={() => navigate('/worlds/new', { state: { backgroundLocation: location } })}
          >
            <Plus size={16} />
            创建世界
          </Button>
        </div>
      </div>

      {/* 内容区：三态或入口 */}
      {loading && worlds.length === 0 ? (
        <div className="we-worlds-grid" role="status" aria-label="加载中">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={`we-world-card-shell${i === 0 ? ' we-world-card-shell--feature' : ''}`}
            >
              <div className="we-skeleton-block we-skeleton-block--card" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="we-worlds-state">
          <EmptyState
            title="世界列表读取失败"
            hint={loadError}
            primaryAction={{ label: '重试', onClick: loadWorlds }}
          />
        </div>
      ) : worlds.length === 0 ? (
        // 空状态：一扇还没点亮的大门，门里是建一个世界的两条路
        <motion.div
          className="we-worlds-door"
          variants={sceneEnter}
          initial="hidden"
          animate="visible"
          transition={m.spring('portal')}
        >
          <div className="we-worlds-door__seam" aria-hidden="true" />
          <EmptyState
            className="we-worlds-door__content"
            title="暂无世界记录"
            hint="一个「世界」是一整套故事设定：背景、角色、这里什么是真的。建好之后你可以在里面对话或写故事，AI 全程按这套设定来。如果手头已经有别人做好的世界卡，也可以直接导入，不用从零开始写。"
            primaryAction={{ label: '新建世界', onClick: () => navigate('/worlds/new', { state: { backgroundLocation: location } }) }}
            secondaryAction={{ label: '导入世界卡', onClick: () => worldImportRef.current?.click() }}
          />
        </motion.div>
      ) : (
        <SortableGrid
          items={worlds}
          onReorderEnd={handleReorderEnd}
          className="we-worlds-grid"
          renderItem={(world, { setNodeRef, style, isDragging, index, attributes, listeners }) => {
            // 大门选取：worlds 列表已由后端按 sort_order → created_at 排序，即用户手工拖拽的顺序。
            // 直接取列表首位而非另算 updated_at 最新项——手工排序表达的是用户主观的重要性，
            // 理应优先于系统猜的"最近打开"；且这样大门位置天然随拖拽结果同步更新，无需额外同步逻辑。
            // 用 SortableGrid 给的实时 index 而非 worlds[0]：拖动中顺序只存在于 SortableGrid，
            // 拿 worlds 判断会让大门在整个拖动过程里钉在旧的那张卡上。
            const isFeature = index === 0;
            const actionsOpen = actionsOpenId === world.id;
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
                  onClick={() => { if (!isDragging) handleEnterWorld(world); }}
                  onKeyDown={(e) => {
                    // 外层 shell 的键盘拖拽也监听 Enter，这里先截住，Enter 只用于进入世界
                    if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
                    e.stopPropagation();
                    handleEnterWorld(world);
                  }}
                  onMouseEnter={() => setLitWorld(world)}
                  onMouseLeave={() => { setLitWorld(null); setActionsOpenId(null); }}
                  onFocus={() => setLitWorld(world)}
                  onBlur={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    setLitWorld(null);
                    setActionsOpenId(null);
                  }}
                  variants={{
                    hidden: sceneEnter.hidden,
                    visible: {
                      ...sceneEnter.visible,
                      transition: m.spring('portal', { delay: Math.min(index, ENTER_STAGGER_CAP) * STAGGER.list }),
                    },
                  }}
                  // DragOverlay 里的拖动副本是新挂载的，不重放入场
                  initial={isDragging ? false : 'hidden'}
                  animate="visible"
                  {...m.gesture('portal', { disabled: isDragging })}
                >
                  {world.cover_path ? (
                    <img src={`${getAvatarUrl(world.cover_path)}?t=${reloadKey}`} alt="" className="we-world-card-bg" />
                  ) : (
                    <WorldSceneArt name={world.name} className="we-world-card-bg we-world-card-scene" />
                  )}
                  <div className="we-world-card-overlay" />
                  {glowFade && !isDragging ? <PortalGlow fade={glowFade} /> : null}

                  <div className="we-world-card-foot">
                    <h3 className="we-world-card-name">{world.name}</h3>
                    {/* 没有描述就不渲染这一行："暂无描述" 不提供任何信息 */}
                    {world.description ? (
                      <p className="we-world-card-desc">{world.description}</p>
                    ) : null}
                    <div className="we-world-card-meta">
                      {world.character_count > 0 ? (
                        <span className="we-world-card-cast" role="img" aria-label={`${world.character_count} 个角色`}>
                          {world.cast.map((c) => (
                            <AvatarCircle key={c.id} id={c.id} name={c.name} avatarPath={c.avatar_path} size="sm" />
                          ))}
                          {hiddenCast > 0 ? <span className="we-world-card-cast-more">+{hiddenCast}</span> : null}
                        </span>
                      ) : (
                        <span className="we-world-card-cast-empty">还没有角色</span>
                      )}
                      <span className="we-world-card-time">{relativeTime(world.updated_at)}</span>
                    </div>
                  </div>

                  {/* 操作位：平时只露一个安静的"⋯"，展开后才出现导出 / 编辑 / 删除 */}
                  <div
                    className={`we-world-card-actions${actionsOpen ? ' we-world-card-actions--open' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape') setActionsOpenId(null);
                    }}
                  >
                    {actionsOpen ? (
                      <>
                        <button
                          className="we-world-card-action-btn"
                          onClick={(e) => handleExportWorld(world, e)}
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
                          onClick={() => setDeletingWorld(world)}
                          title="删除"
                          aria-label="删除世界"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : null}
                    <button
                      className="we-world-card-action-btn we-world-card-action-toggle"
                      onClick={() => setActionsOpenId(actionsOpen ? null : world.id)}
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
          }}
        />
      )}

      {deletingWorld && (
        <ConfirmModal
          title="确认删除"
          message={
            <>
              <p className="we-confirm-msg-line">
                即将删除世界 <span className="we-confirm-msg-name">「{deletingWorld.name}」</span>。
              </p>
              <p className="we-confirm-msg-danger">
                此操作将同时删除其下所有角色和会话，且无法恢复。
              </p>
            </>
          }
          confirmText="确认删除"
          danger
          onConfirm={handleDelete}
          onClose={() => setDeletingWorld(null)}
        />
      )}
    </div>
  );
}
