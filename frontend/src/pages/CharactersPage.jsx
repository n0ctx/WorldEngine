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
import { getPersona, updatePersona, uploadPersonaAvatar } from '../api/personas';
import { getPersonaStateValues, updatePersonaStateValue } from '../api/personaStateValues';
import MarkdownEditor from '../components/ui/MarkdownEditor';

function StateValueField({ field, onSave }) {
  const parseValue = (vj) => {
    try { return vj != null ? JSON.parse(vj) : null; }
    catch { return vj ?? null; }
  };
  const [local, setLocal] = useState(() => parseValue(field.value_json));

  function saveValue(val) {
    onSave(field.field_key, JSON.stringify(val));
  }

  const inputClass = 'w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent';

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={!!local}
        onChange={(e) => { setLocal(e.target.checked); saveValue(e.target.checked); }}
        className="accent-accent w-4 h-4"
      />
    );
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={local ?? ''}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => saveValue(local === '' || local == null ? null : Number(local))}
        className={inputClass}
      />
    );
  }
  if (field.type === 'enum') {
    const options = (() => { try { return JSON.parse(field.enum_options || '[]'); } catch { return []; } })();
    return (
      <select
        value={local ?? ''}
        onChange={(e) => { setLocal(e.target.value); saveValue(e.target.value); }}
        className={inputClass}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'list') {
    const displayValue = Array.isArray(local) ? local.join(', ') : (local ?? '');
    return (
      <input
        type="text"
        value={displayValue}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const arr = String(local).split(',').map((s) => s.trim()).filter(Boolean);
          saveValue(arr);
        }}
        placeholder="逗号分隔多个条目"
        className={inputClass}
      />
    );
  }
  // text (default)
  return (
    <input
      type="text"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => saveValue(String(local ?? ''))}
      className={inputClass}
    />
  );
}

function PersonaEditModal({ worldId, onClose, onAvatarChange }) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [avatarPath, setAvatarPath] = useState(null);
  const [personaId, setPersonaId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [stateFields, setStateFields] = useState([]);
  const avatarFileRef = useRef(null);

  useEffect(() => {
    Promise.all([
      getPersona(worldId),
      getPersonaStateValues(worldId),
    ]).then(([p, fields]) => {
      setName(p.name ?? '');
      setSystemPrompt(p.system_prompt ?? '');
      setAvatarPath(p.avatar_path ?? null);
      setPersonaId(p.id);
      setStateFields(fields);
      setLoaded(true);
    });
  }, [worldId]);

  async function handleStateValueSave(fieldKey, valueJson) {
    try {
      await updatePersonaStateValue(worldId, fieldKey, valueJson);
    } catch (err) {
      console.error('状态值保存失败', err);
    }
  }

  async function handleAvatarFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const result = await uploadPersonaAvatar(worldId, file);
      setAvatarPath(result.avatar_path);
      onAvatarChange?.(result.avatar_path);
    } catch (err) {
      alert(`头像上传失败：${err.message}`);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updatePersona(worldId, { name, system_prompt: systemPrompt });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const avatarUrl = getAvatarUrl(avatarPath);
  const avatarColor = getAvatarColor(personaId || worldId);
  const avatarInitial = (name || '玩')[0].toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-canvas border border-border rounded-2xl shadow-whisper w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-serif text-lg font-semibold text-text">编辑玩家</h2>
        </div>
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {!loaded ? (
            <p className="text-sm text-text-secondary opacity-50">加载中…</p>
          ) : (
            <>
              {/* 头像 */}
              <div className="flex flex-col items-center">
                <div
                  className="relative cursor-pointer group"
                  onClick={() => avatarFileRef.current?.click()}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-semibold text-white"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {avatarInitial}
                    </div>
                  )}
                  {avatarUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                      <span className="text-white text-xs">上传中…</span>
                    </div>
                  )}
                  {!avatarUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">更换头像</span>
                    </div>
                  )}
                </div>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
                <p className="text-xs text-text-secondary mt-1.5 opacity-50">点击头像上传图片</p>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">名字</label>
                <input
                  className="w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="你在这个世界里的名字"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">人设</label>
                <MarkdownEditor
                  value={systemPrompt}
                  onChange={setSystemPrompt}
                  placeholder="你的身份、背景等"
                  minHeight={96}
                />
              </div>
              {stateFields.length > 0 && (
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-text-secondary mb-3">当前状态字段值</h3>
                  <div className="flex flex-col gap-3">
                    {stateFields.map((field) => (
                      <div key={field.field_key}>
                        <label className="block text-sm text-text-secondary mb-1">{field.label}</label>
                        <StateValueField field={field} onSave={handleStateValueSave} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !loaded}
            className="px-5 py-2 text-sm bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
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

  const avatarUrl = persona ? getAvatarUrl(persona.avatar_path) : null;
  const avatarColor = getAvatarColor(persona?.id || worldId);
  const avatarInitial = (persona?.name || '玩')[0].toUpperCase();

  if (!persona || (!persona.name && !persona.system_prompt && !persona.avatar_path)) {
    return (
      <div className="mb-6 group relative bg-ivory border border-border rounded-xl px-5 py-4">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide opacity-50 mb-1">玩家</p>
        <p className="text-xs text-text-secondary opacity-30 italic">尚未设置人设</p>
        <button
          onClick={onEdit}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text hover:bg-sand transition-colors text-xs"
          title="编辑玩家"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="we-persona-card mb-6 group relative bg-ivory border border-border rounded-xl px-5 py-4">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide opacity-50 mb-2">玩家</p>
      <div className="flex items-center gap-3 pr-8">
        {/* 头像 */}
        <div className="flex-none">
          {avatarUrl ? (
            <img src={avatarUrl} alt={persona.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white"
              style={{ backgroundColor: avatarColor }}
            >
              {avatarInitial}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          {persona.name && (
            <p className="text-sm font-medium text-text truncate">{persona.name}</p>
          )}
          {persona.system_prompt && (
            <p className="text-xs text-text-secondary line-clamp-2">{persona.system_prompt}</p>
          )}
        </div>
      </div>
      <button
        onClick={onEdit}
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text hover:bg-sand transition-colors text-xs opacity-0 group-hover:opacity-100"
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
      <div className="bg-canvas border border-border rounded-2xl shadow-whisper w-full max-w-md mx-4">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-serif text-lg font-semibold text-text">创建角色</h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">名称 <span className="text-red-400">*</span></label>
            <input
              className="w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="角色的名字"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">System Prompt</label>
            <textarea
              className="w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent resize-none"
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="角色的性格、背景、说话风格……"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
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
      <div className="bg-canvas border border-border rounded-2xl shadow-whisper w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-text mb-2">确认删除</h2>
        <p className="text-sm text-text-secondary mb-1">
          即将删除角色 <span className="font-medium text-text">「{character.name}」</span>。
        </p>
        <p className="text-sm text-red-400 mb-5">此操作将同时删除该角色的所有会话记录，且无法恢复。</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors">取消</button>
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
  const [personaRefreshKey, setPersonaRefreshKey] = useState(0);

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
    return <div className="min-h-screen flex items-center justify-center text-text-secondary">加载中…</div>;
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="max-w-4xl mx-auto">
        {/* 导航 */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors mb-6"
        >
          ← 所有世界
        </button>

        {/* 页头 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif font-semibold text-text tracking-tight">
              {world?.name}
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">选择角色开始对话，或拖拽调整顺序</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/worlds/${worldId}/writing`)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              写作空间
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="px-4 py-2 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors"
            >
              设置
            </button>
            <button
              onClick={() => charImportRef.current?.click()}
              disabled={importingChar}
              className="px-4 py-2 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
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
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
            >
              + 创建角色
            </button>
          </div>
        </div>

        {/* 玩家人设卡片 */}
        <PersonaCard key={personaRefreshKey} worldId={worldId} onEdit={() => setShowPersonaEdit(true)} />

        {/* 角色列表 */}
        {characters.length === 0 ? (
          <div className="text-center text-text-secondary py-20">
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
                className="we-character-card group relative bg-ivory border border-border rounded-xl p-4 cursor-pointer hover:border-accent/40 hover:shadow-ring transition-all select-none"
                onClick={() => {
                  setCurrentCharacterId(char.id);
                  navigate(`/characters/${char.id}/chat`);
                }}
              >
                <div className="flex items-center gap-3">
                  <AvatarCircle character={char} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text truncate">{char.name}</p>
                    {char.system_prompt ? (
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{char.system_prompt}</p>
                    ) : (
                      <p className="text-xs text-text-secondary opacity-40 italic mt-0.5">暂无描述</p>
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
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text hover:bg-sand transition-colors text-xs"
                    title="编辑"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeletingChar(char)}
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
          onClose={() => { setShowPersonaEdit(false); setPersonaRefreshKey((k) => k + 1); }}
          onAvatarChange={() => setPersonaRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
