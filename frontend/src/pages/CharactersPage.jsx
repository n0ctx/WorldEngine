import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  getCharactersByWorld,
  deleteCharacter,
  reorderCharacters,
} from '../core/api/characters';
import useStore from '../core/state/index';
import { importCharacter, importPersona, readJsonFile } from '../core/api/import-export';
import { listCharacterStateFields } from '../core/api/character-state-fields';
import {
  listPersonas,
  activatePersona,
  deletePersona,
  reorderPersonas,
} from '../core/api/personas';
import { listWorldEntries } from '../core/api/prompt-entries';
import { listWorldStateFields } from '../core/api/world-state-fields';
import { getWorldTimeline } from '../core/api/sessions';
import { createWritingSession } from '../core/api/writing-sessions';
import { ConfirmModal, BackButton, AvatarCircle, SortableList } from '../components';
import DragHandle from '../components/ui/DragHandle.jsx';
import Icon from '../components/ui/Icon.jsx';
import { relativeTime } from '../core/utils/time.js';
import { formatDateLiterary } from '../core/utils/date-format.js';
import { log } from '../core/utils/logger.js';

// ── 拖动感知点击 hook ──────────────────────────────────────────────────────

function useDragAwareClick(onClick) {
  const posRef = useRef(null);

  const onMouseDown = (e) => {
    posRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e) => {
    if (!posRef.current) return;
    const dx = e.clientX - posRef.current.x;
    const dy = e.clientY - posRef.current.y;
    posRef.current = null;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      onClick?.(e);
    }
  };

  return { onMouseDown, onClick: handleClick };
}

// ── PersonaCard（内联组件）─────────────────────────────────────────────────

function PersonaCard({ persona, dragHandleProps, onActivate, onEdit, onDelete, onCardClick }) {
  const isActive = !!persona.is_active;
  // 写作 session 与玩家卡强绑定：只有激活的玩家卡可点击进入写作页
  const clickProps = useDragAwareClick(isActive ? onCardClick : undefined);

  return (
    <div
      className={`we-persona-card${isActive ? ' we-persona-card--active' : ' we-persona-card--inactive'}`}
      onMouseDown={isActive ? clickProps.onMouseDown : undefined}
      onClick={isActive ? clickProps.onClick : undefined}
      aria-disabled={isActive ? undefined : true}
      title={isActive ? undefined : '先激活该玩家卡再进入写作'}
      style={isActive ? undefined : { cursor: 'not-allowed' }}
    >
      <div className="we-character-card-body">
        {dragHandleProps && <span className="we-char-drag" {...dragHandleProps}><DragHandle /></span>}
        <AvatarCircle
          id={persona.id}
          name={persona.name}
          avatarPath={persona.avatar_path}
          size="sm"
        />
        <div className="we-character-card-info">
          <div className="we-persona-card-name-row">
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
            <Icon size={16}>
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
          <Icon size={16}>
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
          <Icon size={16}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </Icon>
        </button>
      </div>
    </div>
  );
}

// ── CharacterCard（内联组件，紧凑变体）──────────────────────────────────────

function CharacterCard({ char, dragHandleProps, onCardClick, onEdit, onDelete }) {
  const clickProps = useDragAwareClick(onCardClick);

  return (
    <div
      className="we-character-card we-character-card--compact"
      onMouseDown={clickProps.onMouseDown}
      onClick={clickProps.onClick}
    >
      <div className="we-character-card-body">
        <span className="we-char-drag" {...dragHandleProps}><DragHandle /></span>
        <AvatarCircle
          id={char.id}
          name={char.name}
          avatarPath={char.avatar_path}
          size="sm"
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
          onClick={onEdit}
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
          onClick={onDelete}
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
  );
}

// ── StorylineItem / ContinueCard（内联组件）─────────────────────────────────

function StorylineModeBadge({ mode }) {
  return (
    <span className={`we-storyline-mode we-storyline-mode--${mode}`}>
      {mode === 'writing' ? '写作' : '对话'}
    </span>
  );
}

function StorylineItem({ item, title, onClick }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className="we-storyline-item"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <StorylineModeBadge mode={item.mode} />
      <div className="we-storyline-item-info">
        <p className="we-storyline-item-title" title={title}>{title}</p>
        {item.last_message && (
          <p className="we-storyline-item-snippet">{item.last_message}</p>
        )}
      </div>
      <span className="we-storyline-item-time">{relativeTime(item.updated_at)}</span>
    </div>
  );
}

function ContinueCard({ item, title, onClick }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className="we-storyline-continue"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="we-storyline-continue-head">
        <span className="we-storyline-continue-label">继续上次</span>
        <StorylineModeBadge mode={item.mode} />
      </div>
      <p className="we-storyline-continue-title">{title}</p>
      {item.last_message && (
        <p className="we-storyline-continue-snippet">{item.last_message}</p>
      )}
      <p className="we-storyline-continue-time">{relativeTime(item.updated_at)}</p>
    </div>
  );
}

// ── CharactersPage（世界层枢纽）──────────────────────────────────────────────

export default function CharactersPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const setCurrentWritingSessionId = useStore((s) => s.setCurrentWritingSessionId);

  const [characters, setCharacters] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [entries, setEntries] = useState([]);
  const [stateFields, setStateFields] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingChar, setDeletingChar] = useState(null);
  const [deletingPersona, setDeletingPersona] = useState(null);
  const [importingChar, setImportingChar] = useState(false);
  const [importingPersona, setImportingPersona] = useState(false);
  const [personaExpanded, setPersonaExpanded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const charImportRef = useRef(null);
  const personaImportRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [chars, ps, ents, fields, tl] = await Promise.all([
        getCharactersByWorld(worldId),
        listPersonas(worldId),
        listWorldEntries(worldId),
        listWorldStateFields(worldId),
        getWorldTimeline(worldId),
      ]);
      setCharacters(chars);
      setPersonas(ps);
      setEntries(ents);
      setStateFields(fields);
      setTimeline(tl);
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

  const charactersById = useMemo(() => {
    const map = {};
    for (const c of characters) map[c.id] = c;
    return map;
  }, [characters]);

  const activePersona = useMemo(() => personas.find((p) => p.is_active) || null, [personas]);

  function storylineTitle(item) {
    if (item.title) return item.title;
    if (item.mode === 'chat') {
      const c = charactersById[item.character_id];
      return c ? `与 ${c.name} 的对话` : '对话';
    }
    return `${formatDateLiterary(item.created_at)}的写作`;
  }

  function handleStorylineClick(item) {
    if (item.mode === 'writing') {
      setCurrentWritingSessionId(item.id);
      navigate(`/worlds/${worldId}/writing`);
    } else {
      setCurrentCharacterId(item.character_id);
      setCurrentSessionId(item.id);
      navigate(`/characters/${item.character_id}/chat`);
    }
  }

  async function handleCreateStoryline() {
    try {
      const session = await createWritingSession(worldId);
      setCurrentWritingSessionId(session.id);
      navigate(`/worlds/${worldId}/writing`);
    } catch (err) {
      log.error('storyline.create_failed', err, { toast: `创建失败：${err.message}` });
    }
  }

  async function handleDeleteChar() {
    try {
      await deleteCharacter(deletingChar.id);
      setDeletingChar(null);
      const chars = await getCharactersByWorld(worldId);
      setCharacters(chars);
    } catch (err) {
      log.error('character.delete_failed', err, { toast: `删除失败：${err.message}` });
    }
  }

  async function handleDeletePersona() {
    try {
      await deletePersona(deletingPersona.id);
      setDeletingPersona(null);
      const ps = await listPersonas(worldId);
      setPersonas(ps);
    } catch (err) {
      log.error('character.delete_failed', err, { toast: `删除失败：${err.message}` });
      setDeletingPersona(null);
    }
  }

  async function handleActivatePersona(personaId) {
    try {
      const ps = await activatePersona(worldId, personaId);
      setPersonas(ps);
      // 激活切换后写作 session hint 可能指向旧 persona 的 session，清掉避免误命中
      setCurrentWritingSessionId(null);
      setPersonaExpanded(false);
      // 故事线里的写作会话按当前激活 persona 过滤，切换后必须重拉，否则左栏还显示旧 persona 的写作故事线
      const tl = await getWorldTimeline(worldId);
      setTimeline(tl);
    } catch (err) {
      log.error('character.activate_failed', err, { toast: `激活失败：${err.message}` });
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
          log.error('character.import.incompatible', null, { toast: `导入失败：该角色卡包含与当前世界不兼容的状态字段：${incompatibleKeys.join('、')}。请在同一世界中导入。` });
          return;
        }
      }
      await importCharacter(worldId, data);
      const chars = await getCharactersByWorld(worldId);
      setCharacters(chars);
    } catch (err) {
      log.error('character.import_failed', err, { toast: `导入失败：${err.message}` });
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
      await importPersona(worldId, data);
      const ps = await listPersonas(worldId);
      setPersonas(ps);
    } catch (err) {
      log.error('character.import_failed', err, { toast: `导入失败：${err.message}` });
    } finally {
      setImportingPersona(false);
      e.target.value = '';
    }
  }

  async function handleCharReorderEnd(finalChars) {
    const items = finalChars.map((c, i) => ({ id: c.id, sort_order: i }));
    await reorderCharacters(items);
  }

  async function handlePersonaReorderEnd(finalPersonas) {
    const items = finalPersonas.map((p, i) => ({ id: p.id, sort_order: i }));
    await reorderPersonas(items);
  }

  if (loadError) {
    return (
      <div className="we-characters-loading we-characters-error">
        <p className="we-characters-error-text">{loadError}</p>
        <button className="we-characters-create-btn" onClick={loadData}>重试</button>
      </div>
    );
  }

  const continueItem = timeline.length > 0 ? timeline[0] : null;
  const restTimeline = timeline.length > 1 ? timeline.slice(1) : [];

  return (
    <div className="we-characters-canvas">
      {/* 导航 */}
      <BackButton onClick={() => navigate('/')} label="书架" />

      {/* 世界层：左宽（故事线）右窄（角色 / 我扮演 / 世界规则） */}
      <div className="we-worldhub-layout">

        {/* ── 左栏：故事线 ── */}
        <div className="we-worldhub-main">
          <div className="we-worldhub-section-header">
            <span className="we-worldhub-section-title">故事线</span>
            <button
              type="button"
              onClick={handleCreateStoryline}
              className="we-characters-col-btn we-characters-col-btn--primary"
              title="新建写作故事线"
            >
              + 新建
            </button>
          </div>

          {loading ? null : timeline.length === 0 ? (
            <div className="we-storyline-empty">
              <p className="we-characters-empty-text">
                还没有故事线，点击「+ 新建」开始写作，或在右侧选择一个角色开始对话
              </p>
            </div>
          ) : (
            <div className="we-storyline-body">
              {continueItem && (
                <ContinueCard
                  item={continueItem}
                  title={storylineTitle(continueItem)}
                  onClick={() => handleStorylineClick(continueItem)}
                />
              )}
              {restTimeline.length > 0 && (
                <div className="we-storyline-list">
                  {restTimeline.map((item) => (
                    <StorylineItem
                      key={item.id}
                      item={item}
                      title={storylineTitle(item)}
                      onClick={() => handleStorylineClick(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 右栏：角色 / 我扮演 / 世界规则 ── */}
        <div className="we-worldhub-side">

          {/* 角色 */}
          <div className="we-worldhub-section">
            <div className="we-worldhub-section-header">
              <span className="we-worldhub-section-title">角色</span>
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

            <div className="we-characters-col-list we-worldhub-char-list">
              {characters.length === 0 ? (
                loading ? null : (
                  <div className="we-characters-empty">
                    <p className="we-characters-empty-text">暂无角色，点击上方新建</p>
                  </div>
                )
              ) : (
                <SortableList
                  items={characters}
                  onReorder={setCharacters}
                  onReorderEnd={handleCharReorderEnd}
                  useHandle={true}
                  renderItem={(char, dragHandleProps) => (
                    <CharacterCard
                      char={char}
                      dragHandleProps={dragHandleProps}
                      onCardClick={() => {
                        setCurrentCharacterId(char.id);
                        navigate(`/characters/${char.id}/chat`);
                      }}
                      onEdit={() => navigate(`/characters/${char.id}/edit`, { state: { backgroundLocation: location } })}
                      onDelete={() => setDeletingChar(char)}
                    />
                  )}
                  className="we-characters-list"
                />
              )}
            </div>
          </div>

          {/* 我扮演 */}
          <div className="we-worldhub-section">
            <div className="we-worldhub-section-header">
              <span className="we-worldhub-section-title">我扮演</span>
            </div>

            {!personaExpanded ? (
              <div className="we-persona-switch-row">
                {activePersona ? (
                  <>
                    <AvatarCircle
                      id={activePersona.id}
                      name={activePersona.name}
                      avatarPath={activePersona.avatar_path}
                      size="sm"
                    />
                    <span className="we-persona-switch-name">
                      {activePersona.name || '（未命名玩家）'}
                    </span>
                  </>
                ) : (
                  <span className="we-persona-switch-name we-persona-switch-name--empty">
                    {loading ? '' : '暂无玩家卡'}
                  </span>
                )}
                <button
                  type="button"
                  className="we-persona-switch-btn"
                  onClick={() => setPersonaExpanded(true)}
                >
                  切换
                </button>
              </div>
            ) : (
              <div className="we-persona-switch-panel">
                <div className="we-characters-col-actions we-persona-switch-actions">
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
                    accept=".json,.wepersona.json,.wechar.json"
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
                  <button
                    type="button"
                    onClick={() => setPersonaExpanded(false)}
                    className="we-characters-col-btn"
                    title="收起"
                  >
                    收起
                  </button>
                </div>

                <div className="we-characters-col-list we-persona-switch-list">
                  {personas.length === 0 ? (
                    loading ? null : (
                      <p className="we-characters-empty-text we-characters-empty-text--centered">
                        暂无玩家卡
                      </p>
                    )
                  ) : (
                    <SortableList
                      items={personas}
                      onReorder={setPersonas}
                      onReorderEnd={handlePersonaReorderEnd}
                      useHandle={true}
                      renderItem={(p, dragHandleProps) => (
                        <PersonaCard
                          persona={{ ...p, _isLast: personas.length === 1 }}
                          dragHandleProps={dragHandleProps}
                          onCardClick={() => {
                            // 切换 persona 时清掉旧 writing session hint，避免误命中其他 persona 的 session
                            setCurrentWritingSessionId(null);
                            navigate(`/worlds/${worldId}/writing`);
                          }}
                          onActivate={() => handleActivatePersona(p.id)}
                          onEdit={() => navigate(
                            `/worlds/${worldId}/personas/${p.id}/edit`,
                            { state: { backgroundLocation: location } }
                          )}
                          onDelete={() => setDeletingPersona(p)}
                        />
                      )}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 世界规则 */}
          <div className="we-worldhub-section">
            <div className="we-worldhub-section-header">
              <span className="we-worldhub-section-title">世界规则</span>
            </div>
            <button
              type="button"
              className="we-rules-entry-card"
              onClick={() => navigate(`/worlds/${worldId}/config`)}
            >
              <div className="we-rules-entry-info">
                <p className="we-rules-entry-label">规则与状态</p>
                <p className="we-rules-entry-count">
                  {entries.length} 条设定 · {stateFields.length} 个状态字段
                </p>
              </div>
              <Icon size={16}>
                <polyline points="9 18 15 12 9 6" />
              </Icon>
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
