import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorlds, deleteWorld } from '../api/worlds';
import { getCharactersByWorld } from '../api/characters';
import useStore from '../store/index';
import { downloadWorldCard, importWorld, readJsonFile } from '../api/import-export';
import { getAvatarColor } from '../utils/avatar';
import { relativeTime } from '../utils/time';
import ConfirmModal from '../components/ui/ConfirmModal';
import Icon from '../components/ui/Icon.jsx';

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
          <button
            onClick={() => navigate('/worlds/new', { state: { backgroundLocation: location } })}
            className="we-worlds-create-btn"
          >
            + 创建世界
          </button>
        </div>
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="we-worlds-loading">检索卷宗中…</div>
      ) : loadError ? (
        <div className="we-worlds-empty">
          <p className="we-worlds-empty-text">世界列表读取失败</p>
          <p className="we-worlds-subtitle we-worlds-error-detail">{loadError}</p>
          <button className="we-worlds-empty-btn" onClick={loadWorlds}>
            重试
          </button>
        </div>
      ) : worlds.length === 0 ? (
        <div className="we-worlds-empty">
          <p className="we-worlds-empty-text">暂无世界记录</p>
          <button className="we-worlds-empty-btn" onClick={() => navigate('/worlds/new', { state: { backgroundLocation: location } })}>
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
                style={{ '--avatar-bg': getAvatarColor(world.id) }}
              />
              <h3 className="we-world-card-name">{world.name}</h3>
              <p className={`we-world-card-desc${!world.description ? ' we-world-card-desc-empty' : ''}`}>
                {world.description || '暂无描述'}
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
          ))}
        </div>
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
