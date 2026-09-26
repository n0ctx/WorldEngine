import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getCharactersByWorld, deleteCharacter, reorderCharacters } from '../core/api/characters';
import { getWorld, updateWorld } from '../core/api/worlds';
import { loadWorldContent } from '../core/data/loadWorldContent.js';
import useStore from '../core/state/index';
import { importCharacter, importPersona, readJsonFile } from '../core/api/import-export';
import { listCharacterStateFields } from '../core/api/character-state-fields';
import { listPersonas, activatePersona, deletePersona, reorderPersonas } from '../core/api/personas';
import { getWorldTimeline } from '../core/api/sessions';
import { createWritingSession } from '../core/api/writing-sessions';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfirmModal, SortableList } from '../components';
import CharacterSeal from '../components/chat/CharacterSeal.jsx';
import DragHandle from '../components/ui/DragHandle.jsx';
import Icon from '../components/ui/Icon.jsx';
import { relativeTime } from '../core/utils/time.js';
import { log } from '../core/utils/logger.js';
import { useMotion } from '../core/hooks/useMotion.js';
import { storylineTitle, useOpenStoryline } from '../core/hooks/storyline.js';
import Folder from '../components/motion/Folder.jsx';
import TaskList from '../components/motion/TaskList.jsx';

function saveItemOrder(items, reorder) {
  const orderedItems = items.map((item, index) => ({ id: item.id, sort_order: index }));
  return reorder(orderedItems);
}

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

  // 键盘激活不走拖动判定：Enter / Space 直接触发。
  // 卡片内部的编辑/删除按钮也会冒泡 keydown，用 target 判断挡掉，避免一次按键触发两个动作。
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    onClick?.(e);
  };

  return { onMouseDown, onClick: handleClick, onKeyDown };
}

// ── PersonaCard（内联组件）─────────────────────────────────────────────────

function PersonaCard({ persona, dragHandleProps, onActivate, onEdit, onDelete, onCardClick }) {
  const isActive = !!persona.is_active;
  // 写作 session 与玩家卡强绑定：只有激活的玩家卡可点击进入写作页
  const clickProps = useDragAwareClick(isActive ? onCardClick : undefined);

  return (
    <div
      className={`we-persona-card${isActive ? ' we-persona-card--active' : ' we-persona-card--inactive'}`}
      role={isActive ? 'button' : undefined}
      tabIndex={isActive ? 0 : undefined}
      onMouseDown={isActive ? clickProps.onMouseDown : undefined}
      onClick={isActive ? clickProps.onClick : undefined}
      onKeyDown={isActive ? clickProps.onKeyDown : undefined}
      aria-disabled={isActive ? undefined : true}
      title={isActive ? undefined : '先激活该玩家卡再进入写作'}
      style={isActive ? undefined : { cursor: 'not-allowed' }}
    >
      <div className="we-character-card-body">
        {dragHandleProps && <span className="we-char-drag" {...dragHandleProps}><DragHandle /></span>}
        <CharacterSeal character={persona} size={32} />
        <div className="we-character-card-info">
          <div className="we-persona-card-name-row">
            <p className="we-character-card-name">{persona.name || '（未命名玩家）'}</p>
            {isActive && <span className="we-persona-card__badge">激活</span>}
          </div>
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
      role="button"
      tabIndex={0}
      onMouseDown={clickProps.onMouseDown}
      onClick={clickProps.onClick}
      onKeyDown={clickProps.onKeyDown}
    >
      <div className="we-character-card-body">
        <span className="we-char-drag" {...dragHandleProps}><DragHandle /></span>
        <CharacterSeal character={char} size={32} />
        <div className="we-character-card-info">
          <p className="we-character-card-name">{char.name}</p>
          {char.description ? (
            <p className="we-character-card-desc">{char.description}</p>
          ) : (
            <p className="we-character-card-desc we-character-card-desc--empty">
              为 {char.name} 写一句简介
            </p>
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
      <span className="we-storyline-quick" aria-hidden="true">→</span>
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

// ── NewWorldGuide（新世界搭建引导）──────────────────────────────────────────
//
// 「新世界」判断标准：世界观描述 / 角色 / 规则三项是否都已存在内容，纯客观完成度，
// 不看创建时间——时间阈值会过期（老账号里几分钟前建的世界和半年前建的世界该一视同
// 仁），完成度不会。三项全部完成后引导自动消失，不再占位；未完成时即使用户来回
// 切换页面也会稳定复现，不会像"已读标记"那样过几天自己消失。
//
// 「关闭」与「完成」是两件独立的事：完成是可计算的客观状态，关闭是用户的主观选择
// （persisted 到 worlds.onboarding_dismissed）。关闭后即便三步仍未做完也不再弹出，
// 尊重用户"我知道，不用管我"的意愿；但反过来，只要三步真的做完了，引导必然消失，
// 不依赖是否点过关闭——不会出现「已经把三件事都做完了，却因为没点过关闭一直被打扰」
// 的情况。

const GUIDE_STEPS = [
  {
    key: 'world',
    title: '写一写这个世界观',
    hint: '这个世界是什么样的、发生在哪、有什么背景——写清楚了，AI 之后讲故事才不会跑偏。',
    action: '去填写',
  },
  {
    key: 'character',
    title: '加一个角色',
    hint: '角色是故事里会说话、会行动的人。加一个，你就有了对话或写作的对象。',
    action: '去创建',
  },
  {
    key: 'rule',
    title: '定一条这里的规则',
    hint: '规则是这个世界里「什么是真的」——比如没有魔法、货币是贝壳。定下来，AI 每次讲故事都会记得。',
    action: '去设定',
  },
];

function NewWorldGuide({ completed, onStepClick, onDismiss }) {
  return (
    <div className="we-onboarding-guide" role="region" aria-label="新世界搭建引导">
      <div className="we-onboarding-guide-head">
        <div>
          <h2 className="we-onboarding-guide-title">先做这三件事，这个世界就活了</h2>
          <p className="we-onboarding-guide-subtitle">
            世界观、角色、规则是这个产品最重要的三块拼图，做完之后 AI 才知道该怎么陪你讲故事。
          </p>
        </div>
        <button
          type="button"
          className="we-onboarding-guide-skip"
          onClick={onDismiss}
        >
          跳过引导
        </button>
      </div>

      <TaskList
        className="we-onboarding-steps"
        itemClassName="we-onboarding-step"
        tasks={GUIDE_STEPS.map((step) => ({
          id: step.key,
          title: step.title,
          done: !!completed[step.key],
          onClick: () => onStepClick(step.key),
          detail: <span className="we-onboarding-step-hint">{step.hint}</span>,
          trailing: (
            <span className="we-onboarding-step-action">
              {completed[step.key] ? '回去改改' : step.action}
              <Icon size={16}>
                <polyline points="9 18 15 12 9 6" />
              </Icon>
            </span>
          ),
        }))}
      />
    </div>
  );
}

// ── 世界规则入口卡：悬停时文件夹里的卡片错开，按下时飞出 ──────────────────────

function RulesEntryCard({ entryCount, fieldCount, onOpen }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const folderState = pressed ? 'open' : hovered ? 'hover' : 'rest';
  return (
    <button
      type="button"
      className="we-rules-entry-card"
      onClick={onOpen}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => { setHovered(false); setPressed(false); }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <Folder state={folderState} width={48} />
      <div className="we-rules-entry-info">
        <p className="we-rules-entry-label">规则与状态</p>
        <p className="we-rules-entry-count">
          {entryCount} 条设定 · {fieldCount} 个状态字段
        </p>
      </div>
      <Icon size={16}>
        <polyline points="9 18 15 12 9 6" />
      </Icon>
    </button>
  );
}

// ── CharactersPage（世界层枢纽）──────────────────────────────────────────────

export default function CharactersPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentWritingSessionId = useStore((s) => s.setCurrentWritingSessionId);

  const [world, setWorld] = useState(null);
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
  const m = useMotion();
  // 收放过程中裁掉溢出，落定后放开，避免卡片阴影和拖拽被裁
  const personaSwitchMotion = {
    initial: { height: 0, opacity: 0, overflow: 'hidden' },
    animate: { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } },
    exit: { height: 0, opacity: 0, overflow: 'hidden' },
    transition: m.transition('medium'),
  };
  const [reloadKey, setReloadKey] = useState(0);

  const charImportRef = useRef(null);
  const personaImportRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [w, content, tl] = await Promise.all([
        getWorld(worldId),
        loadWorldContent(worldId),
        getWorldTimeline(worldId),
      ]);
      setWorld(w);
      setCharacters(content.characters);
      setPersonas(content.personas);
      setEntries(content.worldEntries);
      setStateFields(content.worldFields);
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

  // 引导完成度：纯客观判断，不依赖创建时间。三步都做完，引导必然消失。
  const guideCompleted = useMemo(() => ({
    world: !!(world?.description && world.description.trim()),
    character: characters.length > 0,
    rule: entries.length > 0,
  }), [world, characters, entries]);

  const guideAllDone = guideCompleted.world && guideCompleted.character && guideCompleted.rule;
  // 不看 loading：保存后重新拉取期间引导保持挂载，刚完成的一步才能在原地划掉、沉底
  const showGuide = !!world && !guideAllDone && !world.onboarding_dismissed;

  function handleGuideStepClick(stepKey) {
    if (stepKey === 'world') {
      navigate(`/worlds/${worldId}/edit`, { state: { backgroundLocation: location } });
    } else if (stepKey === 'character') {
      navigate(`/worlds/${worldId}/characters/new`, { state: { backgroundLocation: location } });
    } else if (stepKey === 'rule') {
      navigate(`/worlds/${worldId}/rules`);
    }
  }

  async function handleDismissGuide() {
    // 乐观更新：不等接口返回就先隐藏，避免用户点了「跳过」还要再等一次网络往返。
    setWorld((w) => (w ? { ...w, onboarding_dismissed: 1 } : w));
    try {
      await updateWorld(worldId, { onboarding_dismissed: 1 });
    } catch (err) {
      log.error('world.onboarding_dismiss_failed', err, { toast: `关闭引导失败：${err.message}` });
      setWorld((w) => (w ? { ...w, onboarding_dismissed: 0 } : w));
    }
  }

  const handleStorylineClick = useOpenStoryline(worldId);

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
    await saveItemOrder(finalChars, reorderCharacters);
  }

  async function handlePersonaReorderEnd(finalPersonas) {
    await saveItemOrder(finalPersonas, reorderPersonas);
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
      {/* 返回导航已收口到顶栏面包屑（TopBar），此页不再自带返回按钮 */}

      {/* 新世界搭建引导：三步未完成且未被手动关闭时，取代下方整套空态 */}
      {showGuide && (
        <NewWorldGuide
          completed={guideCompleted}
          onStepClick={handleGuideStepClick}
          onDismiss={handleDismissGuide}
        />
      )}

      {/* 世界层三栏：故事线 / 角色 / 我扮演 + 世界规则 */}
      {!showGuide && (
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
                  title={storylineTitle(continueItem, charactersById)}
                  onClick={() => handleStorylineClick(continueItem)}
                />
              )}
              {restTimeline.length > 0 && (
                <div className="we-storyline-list">
                  {restTimeline.map((item) => (
                    <StorylineItem
                      key={item.id}
                      item={item}
                      title={storylineTitle(item, charactersById)}
                      onClick={() => handleStorylineClick(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 中栏：角色 ── */}
        <div className="we-worldhub-cast">
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

        </div>

        {/* ── 右栏：我扮演 / 世界规则 ── */}
        <div className="we-worldhub-side">
          <div className="we-worldhub-section">
            <div className="we-worldhub-section-header">
              <span className="we-worldhub-section-title">我扮演</span>
            </div>

            {/* 收起行与展开列表同时收放高度，读作同一块区域平滑长高 / 缩回 */}
            <AnimatePresence initial={false}>
              {!personaExpanded ? (
                <motion.div key="persona-row" {...personaSwitchMotion}>
                  <div className="we-persona-switch-row">
                    {activePersona ? (
                      <>
                        <CharacterSeal character={activePersona} size={32} />
                        <span className="we-persona-switch-name">
                          {activePersona.name || '（未命名玩家）'}
                        </span>
                      </>
                    ) : (
                      <span className="we-persona-switch-name we-persona-switch-name--empty">
                        {loading ? '' : '暂无玩家卡'}
                      </span>
                    )}
                    {activePersona && (
                      <button
                        type="button"
                        className="we-persona-switch-btn"
                        onClick={() => navigate(
                          `/worlds/${worldId}/personas/${activePersona.id}/edit`,
                          { state: { backgroundLocation: location } }
                        )}
                      >
                        编辑
                      </button>
                    )}
                    <button
                      type="button"
                      className="we-persona-switch-btn"
                      onClick={() => setPersonaExpanded(true)}
                    >
                      切换
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="persona-panel" {...personaSwitchMotion}>
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 世界规则 */}
          <div className="we-worldhub-section">
            <div className="we-worldhub-section-header">
              <span className="we-worldhub-section-title">世界规则</span>
            </div>
            <RulesEntryCard
              entryCount={entries.length}
              fieldCount={stateFields.length}
              onOpen={() => navigate(`/worlds/${worldId}/rules`)}
            />
          </div>

        </div>
      </div>
      )}

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
