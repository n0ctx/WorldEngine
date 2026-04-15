import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWorlds, deleteWorld } from '../api/worlds';
import useStore from '../store/index';
import { downloadWorldCard, importWorld, readJsonFile } from '../api/importExport';

function DeleteConfirmModal({ world, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-canvas border border-border rounded-2xl shadow-whisper w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-text mb-2">确认删除</h2>
        <p className="text-sm text-text-secondary mb-1">
          即将删除世界 <span className="font-medium text-text">「{world.name}」</span>。
        </p>
        <p className="text-sm text-red-400 mb-5">
          此操作将同时删除其下所有角色和会话，且无法恢复。
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-5 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
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
  const setCurrentWorldId = useStore((s) => s.setCurrentWorldId);

  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingWorld, setDeletingWorld] = useState(null);
  const [exportingWorldId, setExportingWorldId] = useState(null);
  const [importingWorld, setImportingWorld] = useState(false);
  const worldImportRef = useRef(null);

  async function loadWorlds() {
    try {
      const data = await getWorlds();
      setWorlds(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadWorlds(); }, []);

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
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="max-w-4xl mx-auto">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif font-semibold text-text tracking-tight">世界</h1>
            <p className="text-sm text-text-secondary mt-0.5">选择或创建一个世界，开始你的故事</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="px-4 py-2 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors"
            >
              设置
            </button>
            <button
              onClick={() => worldImportRef.current?.click()}
              disabled={importingWorld}
              className="px-4 py-2 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
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
              onClick={() => navigate('/worlds/new')}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
            >
              + 创建世界
            </button>
          </div>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="text-center text-text-secondary py-20">加载中…</div>
        ) : worlds.length === 0 ? (
          <div className="text-center text-text-secondary py-20">
            <p className="text-4xl mb-4">✦</p>
            <p className="text-base">还没有世界，点击右上角创建第一个</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {worlds.map((world) => (
              <div
                key={world.id}
                className="we-world-card group relative bg-ivory border border-border rounded-xl p-5 cursor-pointer hover:border-accent/40 hover:shadow-ring transition-all"
                onClick={() => handleEnterWorld(world)}
              >
                <h3 className="font-medium text-text mb-1.5 pr-16">{world.name}</h3>
                {world.system_prompt ? (
                  <p className="text-sm text-text-secondary line-clamp-2">{world.system_prompt}</p>
                ) : (
                  <p className="text-sm text-text-secondary opacity-40 italic">暂无描述</p>
                )}

                {/* 操作按钮 */}
                <div
                  className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => handleExportWorld(world, e)}
                    disabled={exportingWorldId === world.id}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text hover:bg-sand transition-colors text-xs disabled:opacity-50"
                    title="导出世界卡"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => navigate(`/worlds/${world.id}/edit`)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text hover:bg-sand transition-colors text-xs"
                    title="编辑"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeletingWorld(world)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-red-400 hover:bg-sand transition-colors text-xs"
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
