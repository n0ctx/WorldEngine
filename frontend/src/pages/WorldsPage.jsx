import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorlds, deleteWorld } from '../api/worlds';
import { getCharactersByWorld } from '../api/characters';
import useStore from '../store/index';
import { downloadWorldCard, importWorld, readJsonFile } from '../api/importExport';
import { getAvatarColor } from '../utils/avatar';

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

function DeleteConfirmModal({ world, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div style={{ background: 'var(--we-paper-base)', border: '1px solid var(--we-paper-shadow)' }} className="rounded w-full max-w-sm mx-4 p-6">
        <h2 style={{ fontFamily: 'var(--we-font-display)', fontSize: '18px', color: 'var(--we-ink-primary)' }} className="mb-2 italic font-normal">确认删除</h2>
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-secondary)' }} className="mb-1">
          即将删除世界 <span style={{ color: 'var(--we-ink-primary)', fontWeight: 500 }}>「{world.name}」</span>。
        </p>
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-vermilion)' }} className="mb-5">
          此操作将同时删除其下所有角色和会话，且无法恢复。
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)' }}
            className="px-4 py-2 transition-colors hover:text-[var(--we-ink-primary)]"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', background: 'var(--we-vermilion)', color: 'var(--we-paper-base)', border: 'none', borderRadius: 'var(--we-radius-sm)', padding: '6px 16px' }}
            className="disabled:opacity-50 cursor-pointer"
          >
            {deleting ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}

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

  useEffect(() => { loadWorlds(); }, [reloadKey]);

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
    await deleteWorld(deletingWorld.id);
    setDeletingWorld(null);
    await loadWorlds();
  }

  async function handleExportWorld(world, e) {
    e.stopPropagation();
    setExportingWorldId(world.id);
    try {
      const safeName = world.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
      await downloadWorldCard(world.id, `${safeName}.weworld.json`);
    } catch (err) {
      alert(`导出失败：${err.message}`);
    } finally {
      setExportingWorldId(null);
    }
  }

  async function handleImportWorldFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingWorld(true);
    try {
      const data = await readJsonFile(file);
      await importWorld(data);
      await loadWorlds();
    } catch (err) {
      alert(`导入失败：${err.message}`);
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
          <h1 className="we-worlds-title">博物志 · 卷宗书架</h1>
          <p className="we-worlds-subtitle">WORLDENGINE — ARCHIVES</p>
        </div>
        <div className="we-worlds-header-actions">
          <button
            onClick={() => worldImportRef.current?.click()}
            disabled={importingWorld}
            className="we-worlds-import-btn"
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
        </div>
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="we-worlds-loading">检索卷宗中…</div>
      ) : loadError ? (
        <div className="we-worlds-empty">
          <p className="we-worlds-empty-text">世界列表读取失败</p>
          <p className="we-worlds-subtitle" style={{ marginTop: 8 }}>{loadError}</p>
          <button className="we-worlds-empty-btn" onClick={loadWorlds}>
            重试
          </button>
        </div>
      ) : worlds.length === 0 ? (
        <div className="we-worlds-empty">
          <p className="we-worlds-empty-text">尚无世界记录</p>
          <button className="we-worlds-empty-btn" onClick={() => navigate('/worlds/new')}>
            新建世界
          </button>
        </div>
      ) : (
        <div className="we-worlds-grid">
          {worlds.map((world) => (
            <div
              key={world.id}
              className="we-world-card"
              onClick={() => handleEnterWorld(world)}
            >
              <div
                className="we-world-card-seal"
                style={{ background: getAvatarColor(world.id) }}
              />
              <h3 className="we-world-card-name">{world.name}</h3>
              <p className={`we-world-card-desc${!world.system_prompt ? ' we-world-card-desc-empty' : ''}`}>
                {world.system_prompt || '暂无描述'}
              </p>
              <div className="we-world-card-meta">
                <span>{world.character_count} 角色</span>
                <span>·</span>
                <span>{relativeTime(world.updated_at)}</span>
              </div>

              {/* hover 操作按钮 */}
              <div
                className="we-world-card-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="we-world-card-action-btn"
                  onClick={(e) => handleExportWorld(world, e)}
                  disabled={exportingWorldId === world.id}
                  title="导出世界卡"
                >
                  ↓
                </button>
                <button
                  className="we-world-card-action-btn"
                  onClick={() => navigate(`/worlds/${world.id}/edit`, { state: { backgroundLocation: location } })}
                  title="编辑"
                >
                  ✎
                </button>
                <button
                  className="we-world-card-action-btn danger"
                  onClick={() => setDeletingWorld(world)}
                  title="删除"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建 FAB */}
      <button
        className="we-world-create-fab"
        onClick={() => navigate('/worlds/new')}
        title="新建世界"
      >
        +
      </button>

      {deletingWorld && (
        <DeleteConfirmModal
          world={deletingWorld}
          onConfirm={handleDelete}
          onClose={() => setDeletingWorld(null)}
        />
      )}
    </div>
  );
}
