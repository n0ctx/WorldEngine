import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCharactersByWorld,
  deleteCharacter,
  reorderCharacters,
} from '../api/characters';
import { getWorld } from '../api/worlds';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import useStore from '../store/index';
import { importCharacter, readJsonFile } from '../api/importExport';
import { listCharacterStateFields } from '../api/characterStateFields';
import { getPersona } from '../api/personas';

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
  const [deletingChar, setDeletingChar] = useState(null);
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
      const stateValues = data.character_state_values;
      if (stateValues && stateValues.length > 0) {
        const fields = await listCharacterStateFields(worldId);
        const worldFieldKeys = new Set(fields.map((f) => f.field_key));
        const incompatibleKeys = stateValues
          .filter((sv) => !worldFieldKeys.has(sv.field_key))
          .map((sv) => sv.field_key);
        if (incompatibleKeys.length > 0) {
          alert(`导入失败：该角色卡包含与当前世界不兼容的状态字段：${incompatibleKeys.join('、')}。请在同一世界中导入。`);
          return;
        }
      }
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
              onClick={() => navigate(`/worlds/${worldId}/characters/new`)}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
            >
              + 创建角色
            </button>
          </div>
        </div>

        {/* 玩家人设卡片 */}
        <PersonaCard worldId={worldId} onEdit={() => navigate(`/worlds/${worldId}/persona`)} />

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

      {deletingChar && (
        <DeleteCharacterModal
          character={deletingChar}
          onConfirm={handleDelete}
          onClose={() => setDeletingChar(null)}
        />
      )}
    </div>
  );
}
