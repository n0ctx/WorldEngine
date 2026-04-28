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
import { listWorldEntries, updateWorldEntry } from '../api/prompt-entries';
import { ConfirmModal, BackButton, AvatarCircle, SortableList } from '../components';
import Icon from '../components/ui/Icon.jsx';
import { pushErrorToast } from '../utils/toast';

const TRIGGER_LABEL = {
  always: '常驻',
  keyword: '关键词',
  llm: 'AI召回',
  state: '状态',
};

function EntryOrderPanel({ entries, onTokenChange }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.select();
    }
  }, [editingId]);

  function startEdit(entry) {
    setEditingId(entry.id);
    setEditValue(String(entry.token ?? 1));
  }

  function commitEdit(entry) {
    const n = parseInt(editValue, 10);
    const min = entry.trigger_type === 'always' ? 0 : 1;
    const newToken = Number.isFinite(n) && n >= min ? n : entry.token;
    setEditingId(null);
    if (newToken !== entry.token) {
      onTokenChange(entry.id, newToken);
    }
  }

  function handleKeyDown(e, entry) {
    if (e.key === 'Enter') commitEdit(entry);
    if (e.key === 'Escape') setEditingId(null);
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.token !== b.token) return a.token - b.token;
    return a.sort_order - b.sort_order;
  });

  return (
    <div className="we-characters-col-entries">
      <div className="we-characters-col-header">条目顺序</div>
      <div className="we-entry-order-list">
        {sorted.length === 0 ? (
          <p className="we-entry-order-empty">暂无条目</p>
        ) : (
          sorted.map((entry) => {
            const isCached = entry.trigger_type === 'always' && entry.token === 0;
            return (
              <div key={entry.id} className={`we-entry-order-item${isCached ? ' we-entry-order-item--cached' : ''}`}>
                {editingId === entry.id ? (
                  <input
                    ref={inputRef}
                    className="we-entry-order-token-input"
                    type="number"
                    min={entry.trigger_type === 'always' ? 0 : 1}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit(entry)}
                    onKeyDown={(e) => handleKeyDown(e, entry)}
                  />
                ) : (
                  <span
                    className={`we-entry-order-token${isCached ? ' we-entry-order-token--cached' : ''}`}
                    title={isCached ? '点击编辑 token（0 = CACHED LAYER）' : '点击编辑 token'}
                    onClick={() => startEdit(entry)}
                  >
                    {entry.token ?? 1}
                  </span>
                )}
                <div className="we-entry-order-info">
                  <div className="we-entry-order-title" title={entry.title}>
                    {entry.title}
                    {isCached && (
                      <span className="we-entry-cached-badge" title="此条目进入 CACHED LAYER（system 角色，prompt cache 友好）">
                        CACHED
                      </span>
                    )}
                  </div>
                  <div className="we-entry-order-type">{TRIGGER_LABEL[entry.trigger_type] ?? entry.trigger_type}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

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
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingChar, setDeletingChar] = useState(null);
  const [deletingPersona, setDeletingPersona] = useState(null);
  const [importingChar, setImportingChar] = useState(false);
  const [importingPersona, setImportingPersona] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const charImportRef = useRef(null);
  const personaImportRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [chars, ps, ents] = await Promise.all([
        getCharactersByWorld(worldId),
        listPersonas(worldId),
        listWorldEntries(worldId),
      ]);
      setCharacters(chars);
      setPersonas(ps);
      setEntries(ents);
    } catch (err) {
      setLoadError(err.message || '读取失败');
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [loadData, reloadKey]);

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
      pushErrorToast(`删除失败：${err.message}`);
    }
  }

  async function handleDeletePersona() {
    try {
      await deletePersona(deletingPersona.id);
      setDeletingPersona(null);
      const ps = await listPersonas(worldId);
      setPersonas(ps);
    } catch (err) {
      pushErrorToast(`删除失败：${err.message}`);
      setDeletingPersona(null);
    }
  }

  async function handleActivatePersona(personaId) {
    try {
      const ps = await activatePersona(worldId, personaId);
      setPersonas(ps);
    } catch (err) {
      pushErrorToast(`激活失败：${err.message}`);
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
          pushErrorToast(`导入失败：该角色卡包含与当前世界不兼容的状态字段：${incompatibleKeys.join('、')}。请在同一世界中导入。`);
          return;
        }
      }
      await importCharacter(worldId, data);
      const chars = await getCharactersByWorld(worldId);
      setCharacters(chars);
    } catch (err) {
      pushErrorToast(`导入失败：${err.message}`);
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
      await createPersona(worldId, {
        name: data.character?.name ?? data.name ?? data.data?.name ?? '',
        system_prompt: data.character?.system_prompt ?? data.system_prompt ?? data.data?.system_prompt ?? '',
      });
      const ps = await listPersonas(worldId);
      setPersonas(ps);
    } catch (err) {
      pushErrorToast(`导入失败：${err.message}`);
    } finally {
      setImportingPersona(false);
      e.target.value = '';
    }
  }

  async function handleTokenChange(entryId, newToken) {
    try {
      await updateWorldEntry(entryId, { token: newToken });
      const updated = await listWorldEntries(worldId);
      setEntries(updated);
    } catch (err) {
      pushErrorToast(`更新失败：${err.message}`);
    }
  }

  async function handleCharReorderEnd(finalChars) {
    const items = finalChars.map((c, i) => ({ id: c.id, sort_order: i }));
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
          <div className="we-characters-col-header">
            <span>Players</span>
            <div className="we-characters-col-actions">
              <button
                onClick={() => personaImportRef.current?.click()}
                disabled={importingPersona}
                className="we-characters-col-btn"
                title="导入玩家卡"
              >
                {importingPersona ? '…' : '导入'}
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
                className="we-characters-col-btn we-characters-col-btn--primary"
                title="创建玩家"
              >
                + 创建
              </button>
            </div>
          </div>

          <div className="we-characters-col-list">
            {personas.length === 0 ? (
              <p className="we-characters-empty-text we-characters-empty-text--centered">
                暂无玩家卡
              </p>
            ) : (
              personas.map((p) => (
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
        </div>


        {/* ── 右栏：角色卡 ── */}
        <div className="we-characters-col-right">
          <div className="we-characters-col-header">
            <span>Character</span>
            <div className="we-characters-col-actions">
              <button
                onClick={() => charImportRef.current?.click()}
                disabled={importingChar}
                className="we-characters-col-btn"
                title="导入角色卡"
              >
                {importingChar ? '…' : '导入'}
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
                className="we-characters-col-btn we-characters-col-btn--primary"
                title="创建角色"
              >
                + 创建
              </button>
            </div>
          </div>

          <div className="we-characters-col-list">
            {characters.length === 0 ? (
              <div className="we-characters-empty">
                <p className="we-characters-empty-text">暂无角色，点击下方新建</p>
              </div>
            ) : (
              <SortableList
                items={characters}
                onReorder={setCharacters}
                onReorderEnd={handleCharReorderEnd}
                useHandle={true}
                renderItem={(char, dragHandleProps) => (
                  <div
                    className="we-character-card"
                    onClick={() => {
                      setCurrentCharacterId(char.id);
                      navigate(`/characters/${char.id}/chat`);
                    }}
                  >
                    <div className="we-character-card-body">
                      <span className="we-char-drag" {...dragHandleProps}>⠿</span>
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
                )}
                className="we-characters-list"
              />
            )}
          </div>

        </div>

        {/* ── 右侧条目顺序栏 ── */}
        <EntryOrderPanel entries={entries} onTokenChange={handleTokenChange} />
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
