import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorlds, deleteWorld, reorderWorlds, updateWorld } from '../core/api/worlds';
import SortableGrid from '../components/ui/SortableGrid';
import { getCharactersByWorld } from '../core/api/characters';
import useStore from '../core/state/index';
import { downloadWorldCard, importWorld, readJsonFile } from '../core/api/import-export';
import { extractAccentColorFromImageSrc } from '../core/utils/extractAccentColor.js';
import { getAvatarColor, getAvatarUrl } from '../core/utils/avatar';
import { relativeTime } from '../core/utils/time';
import ConfirmModal from '../components/ui/ConfirmModal';
import EmptyState from '../components/ui/EmptyState.jsx';
import Icon from '../components/ui/Icon.jsx';
import { log } from '../core/utils/logger.js';

export default function WorldsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentWorldId = useStore((s) => s.setCurrentWorldId);

  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingWorld, setDeletingWorld] = useState(null);
  const [exportingWorldId, setExportingWorldId] = useState(null);
  const [importingWorld, setImportingWorld] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const worldImportRef = useRef(null);

  async function loadWorlds() {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getWorlds();
      const counts = await Promise.all(
        data.map((w) => getCharactersByWorld(w.id).then((chars) => chars.length).catch(() => 0))
      );
      setWorlds(data.map((w, i) => ({ ...w, character_count: counts[i] })));
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
        <div>
          <h1 className="we-worlds-title">书架</h1>
        </div>
        <div className="we-worlds-header-actions">
          <button
            onClick={() => worldImportRef.current?.click()}
            disabled={importingWorld}
            className="we-btn we-btn-ghost"
          >
            {importingWorld ? '导入中…' : '导入世界卡'}
          </button>
          <input
            ref={worldImportRef}
            type="file"
            accept=".json,.weworld.json"
            className="hidden"
            onChange={handleImportWorldFile}
          />
          <button
            onClick={() => navigate('/worlds/new', { state: { backgroundLocation: location } })}
            className="we-btn we-btn-primary"
          >
            + 创建世界
          </button>
        </div>
      </div>

      {/* 内容区：三态或网格，不再套装饰性书架框 */}
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
        <div className="we-worlds-state">
          <EmptyState
            title="暂无世界记录"
            hint="一个「世界」是一整套故事设定：背景、角色、这里什么是真的。建好之后你可以在里面对话或写故事，AI 全程按这套设定来。如果手头已经有别人做好的世界卡，也可以直接导入，不用从零开始写。"
            primaryAction={{ label: '新建世界', onClick: () => navigate('/worlds/new', { state: { backgroundLocation: location } }) }}
            secondaryAction={{ label: '导入世界卡', onClick: () => worldImportRef.current?.click() }}
          />
        </div>
      ) : (
        <SortableGrid
          items={worlds}
          onReorderEnd={handleReorderEnd}
          className="we-worlds-grid"
          renderItem={(world, { setNodeRef, style, isDragging, index, attributes, listeners }) => {
            // 大格选取：worlds 列表已由后端按 sort_order → created_at 排序，即用户手工拖拽的顺序。
            // 直接取列表首位而非另算 updated_at 最新项——手工排序表达的是用户主观的重要性，
            // 理应优先于系统猜的"最近打开"；且这样大格位置天然随拖拽结果同步更新，无需额外同步逻辑。
            // 用 SortableGrid 给的实时 index 而非 worlds[0]：拖动中顺序只存在于 SortableGrid，
            // 拿 worlds 判断会让大格在整个拖动过程里钉在旧的那张卡上。
            const isFeature = index === 0;
            return (
              <div
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
                className={`we-world-card-shell${isFeature ? ' we-world-card-shell--feature' : ''}`}
              >
                <div
                  data-dragging={isDragging || undefined}
                  className={`we-world-card${world.cover_path ? ' we-world-card--has-cover' : ' we-world-card--tinted'}${isFeature ? ' we-world-card--feature' : ''}`}
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
                >
                  {world.cover_path ? (
                    <img src={`${getAvatarUrl(world.cover_path)}?t=${reloadKey}`} alt="" className="we-world-card-bg" />
                  ) : (
                    <div
                      className="we-world-card-block"
                      aria-hidden="true"
                      style={{ '--avatar-bg': getAvatarColor(world.id) }}
                    />
                  )}
                  <div className="we-world-card-overlay" />
                  <h3 className="we-world-card-name">{world.name}</h3>
                  {/* 没有描述就不渲染这一行。"暂无描述" 不提供任何信息，
                      而真实描述是 hover 才浮现的，占位常驻会让最没内容的卡最吵。 */}
                  {world.description ? (
                    <p className="we-world-card-desc">{world.description}</p>
                  ) : null}
                  <div className="we-world-card-meta">
                    <span>{world.character_count} 角色</span>
                    <span>·</span>
                    <span>{relativeTime(world.updated_at)}</span>
                  </div>

                  {/* hover 操作按钮 */}
                  <div
                    className="we-world-card-actions"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      className="we-world-card-action-btn"
                      onClick={(e) => handleExportWorld(world, e)}
                      disabled={exportingWorldId === world.id}
                      title="导出世界卡"
                      aria-label="导出世界卡"
                    >
                      <Icon size={16}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </Icon>
                    </button>
                    <button
                      className="we-world-card-action-btn"
                      onClick={() => navigate(`/worlds/${world.id}/edit`, { state: { backgroundLocation: location } })}
                      title="编辑"
                      aria-label="编辑世界"
                    >
                      <Icon size={16}>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </Icon>
                    </button>
                    <button
                      className="we-world-card-action-btn danger"
                      onClick={() => setDeletingWorld(world)}
                      title="删除"
                      aria-label="删除世界"
                    >
                      <Icon size={16}>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </Icon>
                    </button>
                  </div>
                </div>
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
