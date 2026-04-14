import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCharactersByWorld,
  createCharacter,
  deleteCharacter,
  reorderCharacters,
} from '../api/characters';
import { getWorld } from '../api/worlds';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import useStore from '../store/index';
import { importCharacter, readJsonFile } from '../api/importExport';
import { getPersona, updatePersona } from '../api/personas';
import StateFieldList from '../components/state/StateFieldList';
import {
  listPersonaStateFields, createPersonaStateField,
  updatePersonaStateField, deletePersonaStateField, reorderPersonaStateFields,
} from '../api/personaStateFields';

function PersonaEditModal({ worldId, onClose }) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getPersona(worldId).then((p) => {
      setName(p.name ?? '');
      setSystemPrompt(p.system_prompt ?? '');
      setLoaded(true);
    });
  }, [worldId]);

  async function handleSave() {
    setSaving(true);
    try {
      await updatePersona(worldId, { name, system_prompt: systemPrompt });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-h)]">编辑玩家</h2>
        </div>
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {!loaded ? (
            <p className="text-sm text-[var(--text)] opacity-50">加载中…</p>
          ) : (
            <>
              <div>
                <label className="block text-sm text-[var(--text)] mb-1">名字</label>
                <input
                  className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="你在这个世界里的名字"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text)] mb-1">人设</label>
                <textarea
                  className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
                  rows={4}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="你的身份、背景等"
                />
              </div>
              <div className="border-t border-[var(--border)] pt-4">
                <StateFieldList
                  scope="persona"
                  worldId={worldId}
                  listFn={listPersonaStateFields}
                  createFn={createPersonaStateField}
                  updateFn={updatePersonaStateField}
                  deleteFn={deletePersonaStateField}
                  reorderFn={reorderPersonaStateFields}
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
            disabled={saving || !loaded}
            className="px-5 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonaCard({ worldId, onEdit }) {
  const [persona, setPersona] = useState(null);

  useEffect(() => {
    if (!worldId) return;
    getPersona(worldId).then(setPersona).catch(() => {});
  }, [worldId]);

  if (!persona || (!persona.name && !persona.system_prompt)) {
    return (
      <div className="mb-6 group relative bg-[var(--code-bg)] border border-[var(--border)] rounded-xl px-5 py-4">
        <p className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide opacity-50 mb-1">玩家</p>
        <p className="text-xs text-[var(--text)] opacity-30 italic">尚未设置人设</p>
        <button
          onClick={onEdit}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--border)] transition-colors text-xs"
          title="编辑玩家"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 group relative bg-[var(--code-bg)] border border-[var(--border)] rounded-xl px-5 py-4">
      <p className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide opacity-50 mb-2">玩家</p>
      <div className="flex flex-col gap-1 pr-8">
        {persona.name && (
          <p className="text-sm font-medium text-[var(--text-h)]">{persona.name}</p>
        )}
        {persona.system_prompt && (
          <p className="text-xs text-[var(--text)] line-clamp-2">{persona.system_prompt}</p>
        )}
      </div>
      <button
        onClick={onEdit}
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--border)] transition-colors text-xs opacity-0 group-hover:opacity-100"
        title="编辑玩家"
      >
        ✎
      </button>
    </div>
  );
}

function AvatarCircle({ character, size = 'md' }) {
  const url = getAvatarUrl(character.avatar_path);
  const color = getAvatarColor(character.id);
  const initial = (character.name || '?')[0].toUpperCase();

  const sizeClass = size === 'lg'
    ? 'w-16 h-16 text-2xl'
    : 'w-12 h-12 text-base';

  if (url) {
    return (
      <img
        src={url}
        alt={character.name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  );
}

function CreateCharacterModal({ worldId, onSave, onClose }) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) {
      setError('名称为必填项');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), system_prompt: systemPrompt });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-h)]">创建角色</h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">名称 <span className="text-red-400">*</span></label>
            <input
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="角色的名字"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">System Prompt</label>
            <textarea
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="角色的性格、背景、说话风格……"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
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
            {saving ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteCharacterModal({ character, onConfirm, onClose }) {
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
          即将删除角色 <span className="font-medium text-[var(--text-h)]">「{character.name}」</span>。
        </p>
        <p className="text-sm text-red-400 mb-5">此操作将同时删除该角色的所有会话记录，且无法恢复。</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text)] hover:text-[var(--text-h)] transition-colors">取消</button>
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

export default function CharactersPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);

  const [world, setWorld] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingChar, setDeletingChar] = useState(null);
  const [showPersonaEdit, setShowPersonaEdit] = useState(false);
  const [importingChar, setImportingChar] = useState(false);

  // 拖拽状态
  const dragIdx = useRef(null);
  const charImportRef = useRef(null);

  async function loadData() {
    const [w, chars] = await Promise.all([
      getWorld(worldId),
      getCharactersByWorld(worldId),
    ]);
    setWorld(w);
    setCharacters(chars);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [worldId]);

  async function handleCreate(data) {
    await createCharacter(worldId, data);
    const chars = await getCharactersByWorld(worldId);
    setCharacters(chars);
  }

  async function handleDelete() {
    await deleteCharacter(deletingChar.id);
    setDeletingChar(null);
    const chars = await getCharactersByWorld(worldId);
    setCharacters(chars);
  }

  async function handleImportCharFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingChar(true);
    try {
      const data = await readJsonFile(file);
      await importCharacter(worldId, data);
      const chars = await getCharactersByWorld(worldId);
      setCharacters(chars);
    } catch (err) {
      alert(`导入失败：${err.message}`);
    } finally {
      setImportingChar(false);
      e.target.value = '';
    }
  }

  // 拖拽排序
  function handleDragStart(idx) {
    dragIdx.current = idx;
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...characters];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx;
    setCharacters(next);
  }

  async function handleDragEnd() {
    dragIdx.current = null;
    // 持久化新顺序
    const items = characters.map((c, i) => ({ id: c.id, sort_order: i }));
    await reorderCharacters(items);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--text)]">加载中…</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-10">
      <div className="max-w-4xl mx-auto">
        {/* 导航 */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-[var(--text)] hover:text-[var(--text-h)] transition-colors mb-6"
        >
          ← 所有世界
        </button>

        {/* 页头 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-h)] tracking-tight">
              {world?.name}
            </h1>
            <p className="text-sm text-[var(--text)] mt-0.5">选择角色开始对话，或拖拽调整顺序</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => charImportRef.current?.click()}
              disabled={importingChar}
              className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:text-[var(--text-h)] hover:border-[var(--accent-border)] transition-colors disabled:opacity-50"
            >
              {importingChar ? '导入中…' : '导入角色卡'}
            </button>
            <input
              ref={charImportRef}
              type="file"
              accept=".json,.wechar.json"
              className="hidden"
              onChange={handleImportCharFile}
            />
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
            >
              + 创建角色
            </button>
          </div>
        </div>

        {/* 玩家人设卡片 */}
        <PersonaCard worldId={worldId} onEdit={() => setShowPersonaEdit(true)} />

        {/* 角色列表 */}
        {characters.length === 0 ? (
          <div className="text-center text-[var(--text)] py-20">
            <p className="text-4xl mb-4">✦</p>
            <p className="text-base">还没有角色，点击右上角创建第一个</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map((char, idx) => (
              <div
                key={char.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className="group relative bg-[var(--code-bg)] border border-[var(--border)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent-border)] hover:shadow-md transition-all select-none"
                onClick={() => {
                  setCurrentCharacterId(char.id);
                  navigate(`/characters/${char.id}/chat`);
                }}
              >
                <div className="flex items-center gap-3">
                  <AvatarCircle character={char} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--text-h)] truncate">{char.name}</p>
                    {char.system_prompt ? (
                      <p className="text-xs text-[var(--text)] mt-0.5 line-clamp-2">{char.system_prompt}</p>
                    ) : (
                      <p className="text-xs text-[var(--text)] opacity-40 italic mt-0.5">暂无描述</p>
                    )}
                  </div>
                </div>

                {/* 编辑按钮 */}
                <div
                  className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => navigate(`/characters/${char.id}/edit`)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--border)] transition-colors text-xs"
                    title="编辑"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeletingChar(char)}
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
        <CreateCharacterModal
          worldId={worldId}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {deletingChar && (
        <DeleteCharacterModal
          character={deletingChar}
          onConfirm={handleDelete}
          onClose={() => setDeletingChar(null)}
        />
      )}
      {showPersonaEdit && (
        <PersonaEditModal
          worldId={worldId}
          onClose={() => setShowPersonaEdit(false)}
        />
      )}
    </div>
  );
}
