import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  getCharactersByWorld,
  deleteCharacter,
  reorderCharacters,
} from '../api/characters';
import useStore from '../store/index';
import { importCharacter, readJsonFile } from '../api/import-export';
import { listCharacterStateFields } from '../api/character-state-fields';
import {
  listPersonas,
  activatePersona,
  deletePersona,
  createPersona,
} from '../api/personas';
import { ConfirmModal, BackButton, AvatarCircle } from '../components';
import Icon from '../components/ui/Icon.jsx';

// ── PersonaCard（内联组件）─────────────────────────────────────────────────

function PersonaCard({ persona, onActivate, onEdit, onDelete, onCardClick }) {
  const isActive = !!persona.is_active;

  return (
    <div
      className={`we-persona-card${isActive ? ' we-persona-card--active' : ''}`}
      onClick={onCardClick}
    >
      <div className="we-character-card-body">
        <AvatarCircle
          id={persona.id}
          name={persona.name}
          avatarPath={persona.avatar_path}
          size="sm"
        />
        <div className="we-character-card-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <p className="we-character-card-name">{persona.name || '（未命名玩家）'}</p>
            {isActive && <span className="we-persona-card__badge">激活</span>}
          </div>
          {persona.description ? (
            <p className="we-character-card-desc">{persona.description}</p>
          ) : (
            <p className="we-character-card-desc we-character-card-desc-empty">暂无简介</p>
          )}
        </div>
      </div>

      <div
        className="we-character-card-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {!isActive && (
          <button
            onClick={onActivate}
            className="we-persona-card__activate-btn"
            title="设为激活（对话用）"
            aria-label="激活玩家卡"
          >
            <Icon size={15}>
              <polyline points="20 6 9 17 4 12" />
            </Icon>
          </button>
        )}
        <button
          onClick={onEdit}
          className="we-character-card-action-btn"
          title="编辑"
          aria-label="编辑玩家卡"
        >
          <Icon size={15}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </Icon>
        </button>
        <button
          onClick={onDelete}
          className="we-character-card-action-btn danger"
          title="删除"
          aria-label="删除玩家卡"
          disabled={persona._isLast}
        >
          <Icon size={15}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </Icon>
        </button>
      </div>
    </div>
  );
}

// ── CharactersPage ────────────────────────────────────────────────────────────

export default function CharactersPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentPersonaId = useStore((s) => s.setCurrentPersonaId);

  const [characters, setCharacters] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingChar, setDeletingChar] = useState(null);
  const [deletingPersona, setDeletingPersona] = useState(null);
  const [importingChar, setImportingChar] = useState(false);
  const [importingPersona, setImportingPersona] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const dragIdx = useRef(null);
  const charImportRef = useRef(null);
  const personaImportRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [chars, ps] = await Promise.all([
        getCharactersByWorld(worldId),
        listPersonas(worldId),
      ]);
      setCharacters(chars);
      setPersonas(ps);
    } catch (err) {
      setLoadError(err.message || '读取失败');
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  useEffect(() => { loadData(); }, [loadData, reloadKey]);

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

  async function handleDeleteChar() {
    try {
      await deleteCharacter(deletingChar.id);
      setDeletingChar(null);
      const chars = await getCharactersByWorld(worldId);
      setCharacters(chars);
    } catch (err) {
      alert(`删除失败：${err.message}`);
    }
  }

  async function handleDeletePersona() {
    try {
      await deletePersona(deletingPersona.id);
      setDeletingPersona(null);
      const ps = await listPersonas(worldId);
      setPersonas(ps);
    } catch (err) {
      alert(`删除失败：${err.message}`);
      setDeletingPersona(null);
    }
  }

  async function handleActivatePersona(personaId) {
    try {
      const ps = await activatePersona(worldId, personaId);
      setPersonas(ps);
    } catch (err) {
      alert(`激活失败：${err.message}`);
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

  async function handleImportPersonaFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPersona(true);
    try {
      const data = await readJsonFile(file);
      // persona 导入：只取 name / system_prompt
      // 兼容 worldengine-character-v1 格式（character.name）和裸对象格式
      await createPersona(worldId, {
        name: data.character?.name ?? data.name ?? data.data?.name ?? '',
        system_prompt: data.character?.system_prompt ?? data.system_prompt ?? data.data?.system_prompt ?? '',
      });
      const ps = await listPersonas(worldId);
      setPersonas(ps);
    } catch (err) {
      alert(`导入失败：${err.message}`);
    } finally {
      setImportingPersona(false);
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

      {/* 双栏布局 */}
      <div className="we-characters-layout">

        {/* ── 左栏：玩家卡 ── */}
        <div className="we-characters-col-left">
          <div className="we-characters-col-header">Players</div>

          <div className="we-characters-col-list">
            {personas.length === 0 ? (
              <p className="we-characters-empty-text" style={{ padding: '24px 0', textAlign: 'center' }}>
                暂无玩家卡
              </p>
            ) : (
              personas.map((p, idx) => (
                <PersonaCard
                  key={p.id}
                  persona={{ ...p, _isLast: personas.length === 1 }}
                  worldId={worldId}
                  onCardClick={() => {
                    setCurrentPersonaId(p.id);
                    navigate(`/worlds/${worldId}/writing`);
                  }}
                  onActivate={() => handleActivatePersona(p.id)}
                  onEdit={() => navigate(
                    `/worlds/${worldId}/personas/${p.id}/edit`,
                    { state: { backgroundLocation: location } }
                  )}
                  onDelete={() => setDeletingPersona(p)}
                />
              ))
            )}
          </div>

          <div className="we-characters-col-footer">
            <button
              onClick={() => personaImportRef.current?.click()}
              disabled={importingPersona}
              className="we-characters-action-btn"
            >
              {importingPersona ? '导入中…' : '导入玩家卡'}
            </button>
            <input
              ref={personaImportRef}
              type="file"
              accept=".json,.wechar.json"
              className="hidden"
              onChange={handleImportPersonaFile}
            />
            <button
              onClick={() => navigate(
                `/worlds/${worldId}/personas/new`,
                { state: { backgroundLocation: location } }
              )}
              className="we-characters-create-btn"
            >
              + 创建玩家
            </button>
          </div>
        </div>


        {/* ── 右栏：角色卡 ── */}
        <div className="we-characters-col-right">
          <div className="we-characters-col-header">Character</div>

          <div className="we-characters-col-list">
            {characters.length === 0 ? (
              <div className="we-characters-empty">
                <p className="we-characters-empty-text">暂无角色，点击下方新建</p>
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
                        {char.description ? (
                          <p className="we-character-card-desc">{char.description}</p>
                        ) : (
                          <p className="we-character-card-desc we-character-card-desc-empty">暂无简介</p>
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
                        aria-label="编辑角色"
                      >
                        <Icon size={16}>
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </Icon>
                      </button>
                      <button
                        onClick={() => setDeletingChar(char)}
                        className="we-character-card-action-btn danger"
                        title="删除"
                        aria-label="删除角色"
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
          </div>

          <div className="we-characters-col-footer">
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
      </div>

      {/* 删除角色确认 */}
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
          onConfirm={handleDeleteChar}
          onClose={() => setDeletingChar(null)}
        />
      )}

      {/* 删除玩家卡确认 */}
      {deletingPersona && (
        <ConfirmModal
          title="确认删除"
          message={
            <>
              <p className="we-confirm-msg-line">
                即将删除玩家卡 <span className="we-confirm-msg-name">「{deletingPersona.name || '（未命名玩家）'}」</span>。
              </p>
              <p className="we-confirm-msg-danger">
                此操作无法恢复。
              </p>
            </>
          }
          confirmText="确认删除"
          danger
          onConfirm={handleDeletePersona}
          onClose={() => setDeletingPersona(null)}
        />
      )}
    </div>
  );
}
