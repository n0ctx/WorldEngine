import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWorlds, createWorld, updateWorld, deleteWorld } from '../api/worlds';
import useStore from '../store/index';
import { downloadWorldCard, importWorld, readJsonFile } from '../api/importExport';
import StateFieldList from '../components/state/StateFieldList';
import EntryList from '../components/prompt/EntryList';
import {
  listWorldStateFields, createWorldStateField,
  updateWorldStateField, deleteWorldStateField, reorderWorldStateFields,
} from '../api/worldStateFields';

// 世界表单的初始空值
const EMPTY_FORM = {
  name: '',
  system_prompt: '',
  temperature: 1.0,
  max_tokens: 2048,
  useGlobalTemp: true,
  useGlobalMaxTokens: true,
};

function WorldFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY_FORM;
    return {
      name: initial.name ?? '',
      system_prompt: initial.system_prompt ?? '',
      temperature: initial.temperature ?? 1.0,
      max_tokens: initial.max_tokens ?? 2048,
      useGlobalTemp: initial.temperature == null,
      useGlobalMaxTokens: initial.max_tokens == null,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('名称为必填项');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        system_prompt: form.system_prompt,
        temperature: form.useGlobalTemp ? null : form.temperature,
        max_tokens: form.useGlobalMaxTokens ? null : form.max_tokens,
      };
      await onSave(payload);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-h)]">
            {initial ? '编辑世界' : '创建世界'}
          </h2>
        </div>
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {/* 名称 */}
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">名称 <span className="text-red-400">*</span></label>
            <input
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="世界的名称"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">世界 System Prompt</label>
            <textarea
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
              rows={4}
              value={form.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
              placeholder="描述这个世界的背景、规则、氛围……"
            />
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-[var(--text)]">Temperature</label>
              <label className="flex items-center gap-1.5 text-sm text-[var(--text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.useGlobalTemp}
                  onChange={(e) => set('useGlobalTemp', e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                使用全局默认
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.1" max="2.0" step="0.1"
                value={form.temperature}
                disabled={form.useGlobalTemp}
                onChange={(e) => set('temperature', parseFloat(e.target.value))}
                className="flex-1 accent-[var(--accent)] disabled:opacity-40"
              />
              <span className="w-10 text-right text-sm text-[var(--text-h)] font-mono">
                {form.useGlobalTemp ? '—' : form.temperature.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-[var(--text)]">Max Tokens</label>
              <label className="flex items-center gap-1.5 text-sm text-[var(--text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.useGlobalMaxTokens}
                  onChange={(e) => set('useGlobalMaxTokens', e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                使用全局默认
              </label>
            </div>
            <input
              type="number"
              min="64" max="32000" step="64"
              value={form.max_tokens}
              disabled={form.useGlobalMaxTokens}
              onChange={(e) => set('max_tokens', parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-40"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* 世界 Prompt 条目 / 状态字段模板（仅编辑现有世界时显示） */}
          {initial?.id && (
            <>
              <div className="border-t border-[var(--border)] pt-4">
                <EntryList type="world" scopeId={initial.id} />
              </div>
              <div className="border-t border-[var(--border)] pt-4">
                <StateFieldList
                  scope="world"
                  worldId={initial.id}
                  listFn={listWorldStateFields}
                  createFn={createWorldStateField}
                  updateFn={updateWorldStateField}
                  deleteFn={deleteWorldStateField}
                  reorderFn={reorderWorldStateFields}
                />
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text)] hover:text-[var(--text-h)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
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
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-[var(--text-h)] mb-2">确认删除</h2>
        <p className="text-sm text-[var(--text)] mb-1">
          即将删除世界 <span className="font-medium text-[var(--text-h)]">「{world.name}」</span>。
        </p>
        <p className="text-sm text-red-400 mb-5">
          此操作将同时删除其下所有角色和会话，且无法恢复。
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text)] hover:text-[var(--text-h)] transition-colors"
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
  const [showCreate, setShowCreate] = useState(false);
  const [editingWorld, setEditingWorld] = useState(null);
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

  async function handleCreate(payload) {
    await createWorld(payload);
    await loadWorlds();
  }

  async function handleEdit(payload) {
    await updateWorld(editingWorld.id, payload);
    await loadWorlds();
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
    <div className="min-h-screen bg-[var(--bg)] px-4 py-10">
      <div className="max-w-4xl mx-auto">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-h)] tracking-tight">世界</h1>
            <p className="text-sm text-[var(--text)] mt-0.5">选择或创建一个世界，开始你的故事</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:text-[var(--text-h)] hover:border-[var(--accent-border)] transition-colors"
            >
              设置
            </button>
            <button
              onClick={() => worldImportRef.current?.click()}
              disabled={importingWorld}
              className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:text-[var(--text-h)] hover:border-[var(--accent-border)] transition-colors disabled:opacity-50"
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
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
            >
              + 创建世界
            </button>
          </div>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="text-center text-[var(--text)] py-20">加载中…</div>
        ) : worlds.length === 0 ? (
          <div className="text-center text-[var(--text)] py-20">
            <p className="text-4xl mb-4">✦</p>
            <p className="text-base">还没有世界，点击右上角创建第一个</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {worlds.map((world) => (
              <div
                key={world.id}
                className="group relative bg-[var(--code-bg)] border border-[var(--border)] rounded-xl p-5 cursor-pointer hover:border-[var(--accent-border)] hover:shadow-md transition-all"
                onClick={() => handleEnterWorld(world)}
              >
                <h3 className="font-medium text-[var(--text-h)] mb-1.5 pr-16">{world.name}</h3>
                {world.system_prompt ? (
                  <p className="text-sm text-[var(--text)] line-clamp-2">{world.system_prompt}</p>
                ) : (
                  <p className="text-sm text-[var(--text)] opacity-40 italic">暂无描述</p>
                )}

                {/* 操作按钮 */}
                <div
                  className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => handleExportWorld(world, e)}
                    disabled={exportingWorldId === world.id}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--border)] transition-colors text-xs disabled:opacity-50"
                    title="导出世界卡"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => setEditingWorld(world)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--border)] transition-colors text-xs"
                    title="编辑"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeletingWorld(world)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text)] hover:text-red-400 hover:bg-[var(--border)] transition-colors text-xs"
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

      {showCreate && (
        <WorldFormModal
          initial={null}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editingWorld && (
        <WorldFormModal
          initial={editingWorld}
          onSave={handleEdit}
          onClose={() => setEditingWorld(null)}
        />
      )}
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
