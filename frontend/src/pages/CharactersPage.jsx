import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  getCharactersByWorld,
  deleteCharacter,
  reorderCharacters,
} from '../api/characters';
import { getWorld } from '../api/worlds';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import useStore from '../store/index';
import { importCharacter, readJsonFile } from '../api/import-export';
import { listCharacterStateFields } from '../api/character-state-fields';
import { getPersona } from '../api/personas';
import { ConfirmModal } from '../components';

function PersonaCard({ worldId, refreshKey, onEdit }) {
  const [persona, setPersona] = useState(null);

  useEffect(() => {
    if (!worldId) return;
    getPersona(worldId).then(setPersona).catch(() => {});
  }, [worldId, refreshKey]);

  const avatarUrl = persona ? getAvatarUrl(persona.avatar_path) : null;
  const avatarColor = getAvatarColor(persona?.id || worldId);
  const avatarInitial = (persona?.name || '玩')[0].toUpperCase();

  if (!persona || (!persona.name && !persona.system_prompt && !persona.avatar_path)) {
    return (
      <div className="we-persona-card-wrap">
        <p className="we-persona-section-label">玩家</p>
        <p className="we-persona-empty-hint">尚未设置人设</p>
        <button
          onClick={onEdit}
          className="we-character-card-action-btn"
          style={{ position: 'absolute', top: 10, right: 10 }}
          title="编辑玩家"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="we-persona-card-wrap">
      <p className="we-persona-section-label">玩家</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 32 }}>
        <div style={{ flexShrink: 0 }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={persona.name}
              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--we-paper-base)',
                backgroundColor: avatarColor,
              }}
            >
              {avatarInitial}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {persona.name && (
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 14, color: 'var(--we-ink-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {persona.name}
            </p>
          )}
          {persona.system_prompt && (
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 12, color: 'var(--we-ink-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {persona.system_prompt}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onEdit}
        className="we-character-card-action-btn"
        style={{ position: 'absolute', top: 10, right: 10 }}
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
  const px = size === 'lg' ? 64 : 48;

  if (url) {
    return (
      <img
        src={url}
        alt={character.name}
        style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size === 'lg' ? 24 : 16,
        color: 'var(--we-paper-base)',
        flexShrink: 0,
        backgroundColor: color,
      }}
    >
      {initial}
    </div>
  );
}


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
      <div className="we-characters-loading" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <p style={{ fontFamily: 'var(--we-font-serif)', color: 'var(--we-vermilion)', margin: 0 }}>{loadError}</p>
        <button className="we-characters-create-btn" onClick={loadData}>重试</button>
      </div>
    );
  }

  return (
    <div className="we-characters-canvas">
      {/* 导航 */}
      <button
        onClick={() => navigate('/')}
        style={{ fontFamily: 'var(--we-font-serif)', fontSize: 13, color: 'var(--we-paper-shadow)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, padding: 0, transition: 'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--we-paper-base)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--we-paper-shadow)'}
      >
        ← 所有世界
      </button>

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
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(200,185,154,0.3)',
        marginBottom: '16px',
      }}>
        {[
          { label: '构建', path: `/worlds/${worldId}/build` },
          { label: '故事', path: `/worlds/${worldId}` },
          { label: '状态', path: `/worlds/${worldId}/state` },
        ].map(({ label, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={label}
              onClick={() => navigate(path)}
              style={{
                padding: '8px 20px',
                fontFamily: 'var(--we-font-serif)',
                fontSize: '14px',
                color: isActive ? 'var(--we-paper-base)' : 'var(--we-paper-shadow)',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: isActive ? '2px solid var(--we-vermilion)' : '2px solid transparent',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

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
                <AvatarCircle character={char} size="md" />
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
