import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  getCharactersByWorld,
  deleteCharacter,
  reorderCharacters,
} from '../api/characters';
import { getWorld } from '../api/worlds';
import useStore from '../store/index';
import { importCharacter, readJsonFile } from '../api/import-export';
import { listCharacterStateFields } from '../api/character-state-fields';
import { ConfirmModal, BackButton, WorldTabNav, buildWorldTabs, PersonaCard, AvatarCircle } from '../components';

export default function CharactersPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);

  const [world, setWorld] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingChar, setDeletingChar] = useState(null);
  const [importingChar, setImportingChar] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const dragIdx = useRef(null);
  const charImportRef = useRef(null);

  async function loadData() {
    setLoading(true);
    setLoadError('');
    try {
      const [w, chars] = await Promise.all([
        getWorld(worldId),
        getCharactersByWorld(worldId),
      ]);
      setWorld(w);
      setCharacters(chars);
    } catch (err) {
      setLoadError(err.message || '读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [worldId, reloadKey]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:world-updated', h);
    window.addEventListener('we:character-updated', h);
    window.addEventListener('we:persona-updated', h);
    return () => {
      window.removeEventListener('we:world-updated', h);
      window.removeEventListener('we:character-updated', h);
      window.removeEventListener('we:persona-updated', h);
    };
  }, []);

  async function handleDelete() {
    try {
      await deleteCharacter(deletingChar.id);
      setDeletingChar(null);
      const chars = await getCharactersByWorld(worldId);
      setCharacters(chars);
    } catch (err) {
      alert(`删除失败：${err.message}`);
    }
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
    const items = characters.map((c, i) => ({ id: c.id, sort_order: i }));
    await reorderCharacters(items);
  }

  if (loading) {
    return <div className="we-characters-loading">加载中…</div>;
  }

  if (loadError) {
    return (
      <div className="we-characters-loading we-characters-error">
        <p className="we-characters-error-text">{loadError}</p>
        <button className="we-characters-create-btn" onClick={loadData}>重试</button>
      </div>
    );
  }

  return (
    <div className="we-characters-canvas">
      {/* 导航 */}
      <BackButton onClick={() => navigate('/')} label="所有世界" />

      {/* 页头 */}
      <div className="we-characters-header">
        <div>
          <h1 className="we-characters-title">{world?.name}</h1>
          <p className="we-characters-subtitle">CHARACTER ROSTER</p>
        </div>
        <div className="we-characters-header-actions">
          <button
            onClick={() => charImportRef.current?.click()}
            disabled={importingChar}
            className="we-characters-action-btn"
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
            onClick={() => navigate(`/worlds/${worldId}/characters/new`, { state: { backgroundLocation: location } })}
            className="we-characters-create-btn"
          >
            + 创建角色
          </button>
        </div>
      </div>

      {/* 三标签导航 */}
      <WorldTabNav
        tabs={buildWorldTabs(worldId)}
        activeTab={location.pathname}
        onTabChange={(path) => navigate(path)}
      />

      {/* 玩家人设卡片 */}
      <PersonaCard
        worldId={worldId}
        refreshKey={reloadKey}
        onEdit={() => navigate(`/worlds/${worldId}/persona`, { state: { backgroundLocation: location } })}
      />

      {/* 角色列表 */}
      {characters.length === 0 ? (
        <div className="we-characters-empty">
          <div className="we-characters-empty-icon">✦</div>
          <p className="we-characters-empty-text">还没有角色，点击右上角创建第一个</p>
        </div>
      ) : (
        <div className="we-characters-grid">
          {characters.map((char, idx) => (
            <div
              key={char.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className="we-character-card"
              onClick={() => {
                setCurrentCharacterId(char.id);
                navigate(`/characters/${char.id}/chat`);
              }}
            >
              <div className="we-character-card-body">
                <AvatarCircle
                  id={char.id}
                  name={char.name}
                  avatarPath={char.avatar_path}
                  size="md"
                />
                <div className="we-character-card-info">
                  <p className="we-character-card-name">{char.name}</p>
                  {char.system_prompt ? (
                    <p className="we-character-card-desc">{char.system_prompt}</p>
                  ) : (
                    <p className="we-character-card-desc we-character-card-desc-empty">暂无描述</p>
                  )}
                </div>
              </div>

              <div
                className="we-character-card-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => navigate(`/characters/${char.id}/edit`, { state: { backgroundLocation: location } })}
                  className="we-character-card-action-btn"
                  title="编辑"
                >
                  ✎
                </button>
                <button
                  onClick={() => setDeletingChar(char)}
                  className="we-character-card-action-btn danger"
                  title="删除"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deletingChar && (
        <ConfirmModal
          title="确认删除"
          message={
            <>
              <p className="we-confirm-msg-line">
                即将删除角色 <span className="we-confirm-msg-name">「{deletingChar.name}」</span>。
              </p>
              <p className="we-confirm-msg-danger">
                此操作将同时删除该角色的所有会话记录，且无法恢复。
              </p>
            </>
          }
          confirmText="确认删除"
          danger
          onConfirm={handleDelete}
          onClose={() => setDeletingChar(null)}
        />
      )}
    </div>
  );
}
