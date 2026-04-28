import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const DIARY_TIME_FIELD_KEY = 'diary_time';

/** 将 diary_time 行排到首位，其余行顺序不变 */
function pinDiaryTimeFirst(rows) {
  if (!Array.isArray(rows)) return rows;
  const idx = rows.findIndex((r) => r.field_key === DIARY_TIME_FIELD_KEY);
  if (idx <= 0) return rows;
  const result = [...rows];
  result.unshift(result.splice(idx, 1)[0]);
  return result;
}
import Icon from '../ui/Icon.jsx';
import CharacterSeal from './CharacterSeal.jsx';
import StatusSection from './StatusSection.jsx';
import ModalShell from '../ui/ModalShell.jsx';
import { getCharactersByWorld } from '../../api/characters.js';
import {
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  fetchSessionCharacterStateValues,
  resetSessionCharacterStateValuesByChar,
  patchSessionStateValue,
} from '../../api/session-state-values.js';
import { fetchDiaryContent } from '../../api/daily-entries.js';
import { useSessionState } from '../../hooks/useSessionState.js';
import { activateCharacter, deactivateCharacter } from '../../api/writing-sessions.js';
import { pushErrorToast } from '../../utils/toast.js';

const MotionDiv = motion.div;

function Chevron({ open }) {
  return (
    <Icon
      size={16}
      viewBox="0 0 10 10"
      strokeWidth="2.5"
      className="we-cast-chevron"
      style={{
        flexShrink: 0,
        transition: 'transform 0.2s ease',
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
      }}
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </Icon>
  );
}

const DIARY_RECENT_LIMIT = 5;

function DiaryEntry({ entry, index, selected, onSelect }) {
  return (
    <div
      className={`we-timeline-entry we-cast-diary-entry${selected ? ' we-cast-diary-entry--selected' : ''}`}
      style={{
        animationDelay: `${index * 50}ms`,
        transition: 'background 0.18s ease',
      }}
      onClick={() => onSelect(entry)}
      title="点击注入下轮提示词"
    >
      <span className="we-timeline-dot">·</span>
      <span className="we-timeline-text">
        <em className="we-timeline-round">{entry.date_display}</em>
        {' '}{entry.summary}
      </span>
    </div>
  );
}

function CharacterBlock({ char, sessionId, expanded, onToggle, onRemove, stateTick }) {
  const [stateValues, setStateValues] = useState(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!char?.id || !sessionId) return;
    if (!expanded && stateValues !== null) return; // 已加载过则不重置
    if (!expanded) return;
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setStateValues(null);
      try {
        const rows = await fetchSessionCharacterStateValues(sessionId, char.id);
        if (!cancelled) setStateValues(rows);
      } catch {
        if (!cancelled) setStateValues([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [char?.id, sessionId, expanded, stateTick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReset() {
    if (resetting) return;
    setResetting(true);
    try { setStateValues(await resetSessionCharacterStateValuesByChar(sessionId, char.id)); }
    catch (e) { pushErrorToast(e.message || '重置角色状态失败'); }
    finally { setResetting(false); }
  }

  async function handleSave(fieldKey, valueJson) {
    try {
      await patchSessionStateValue(sessionId, 'character', fieldKey, valueJson, char.id);
      setStateValues((prev) => prev
        ? prev.map((r) => r.field_key === fieldKey ? { ...r, effective_value_json: valueJson, runtime_value_json: valueJson } : r)
        : prev
      );
    } catch (e) { pushErrorToast(e.message || '更新角色状态失败'); }
  }

  return (
    <div className="we-cast-character-block we-state-section">
      <div
        className="we-state-section-title"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={onToggle}
      >
        <Chevron open={expanded} />
        <span className="we-section-label">{char.name}</span>
        <span className="we-section-rule" />
        <button
          className="we-state-section-reset"
          onClick={(e) => { e.stopPropagation(); handleReset(); }}
        >
          {resetting ? '…' : '重置'}
        </button>
        <button
          className="we-state-section-reset"
          onClick={(e) => { e.stopPropagation(); onRemove(char.id); }}
          title={`移除 ${char.name}`}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--we-vermilion)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
        >
          移除
        </button>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <StatusSection title="" rows={stateValues} onSave={handleSave} className="we-cast-char-inner" />
        </div>
      </div>
    </div>
  );
}

function AddCharacterModal({ worldId, sessionId, activeCharacters, onAdd, onClose }) {
  const [allChars, setAllChars] = useState([]);
  const [adding, setAdding] = useState(null);
  const activeIds = new Set(activeCharacters.map((c) => c.id));

  useEffect(() => {
    getCharactersByWorld(worldId).then(setAllChars).catch(() => setAllChars([]));
  }, [worldId]);

  const available = allChars.filter((c) => !activeIds.has(c.id));

  async function handleAdd(charId) {
    setAdding(charId);
    try {
      await activateCharacter(worldId, sessionId, charId);
      const char = allChars.find((c) => c.id === charId);
      onAdd(char);
    } catch (e) {
      pushErrorToast(e.message || '添加角色失败');
    } finally {
      setAdding(null);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-sm">
      <div className="we-cast-add-modal-body">
        <p className="we-cast-add-modal-title">
          添加角色
        </p>
        {available.length === 0 && (
          <p className="we-cast-add-modal-empty">
            所有角色均已激活
          </p>
        )}
        {available.map((char) => (
          <div
            key={char.id}
            className="we-cast-add-modal-row"
          >
            <CharacterSeal character={char} size={32} />
            <span className="we-cast-add-modal-name">
              {char.name}
            </span>
            <button
              onClick={() => handleAdd(char.id)}
              disabled={adding === char.id}
              className="we-cast-add-modal-action"
            >
              {adding === char.id ? '…' : '添加'}
            </button>
          </div>
        ))}
      </div>
      <div className="we-cast-add-modal-footer">
        <button
          onClick={onClose}
          className="we-cast-add-modal-close"
        >
          关闭
        </button>
      </div>
    </ModalShell>
  );
}

export default function CastPanel({ worldId, sessionId, activeCharacters, onActiveCharactersChange, stateTick = 0, diaryTick = 0, persona, onDiaryInject }) {
  const { stateData, setStateData, diaryEntries, stateJustChanged, isUpdating } = useSessionState(sessionId, stateTick, diaryTick);

  const worldRows = useMemo(() => pinDiaryTimeFirst(stateData?.world ?? null), [stateData?.world]);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState([]);
  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);

  // 日记折叠/展开
  const [diaryOpen, setDiaryOpen] = useState(true);
  const [diaryExpanded, setDiaryExpanded] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const firstActiveCharacterId = activeCharacters[0]?.id;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (firstActiveCharacterId) {
        setExpandedIds([firstActiveCharacterId]);
      } else {
        setExpandedIds([]);
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [firstActiveCharacterId]);

  // sessionId 变化时清空已选日记
  useEffect(() => {
    const timeoutId = setTimeout(() => setSelectedEntry(null), 0);
    return () => clearTimeout(timeoutId);
  }, [sessionId]);

  async function handleResetWorldState() {
    if (!sessionId || worldResetting) return;
    setWorldResetting(true);
    try {
      setStateData(await resetSessionWorldStateValues(sessionId));
    } catch (e) { pushErrorToast(e.message || '重置世界状态失败'); }
    finally { setWorldResetting(false); }
  }

  async function handleResetPersonaState() {
    if (!sessionId || personaResetting) return;
    setPersonaResetting(true);
    try {
      setStateData(await resetSessionPersonaStateValues(sessionId));
    } catch (e) { pushErrorToast(e.message || '重置玩家状态失败'); }
    finally { setPersonaResetting(false); }
  }

  async function handleSaveWorld(fieldKey, valueJson) {
    try {
      await patchSessionStateValue(sessionId, 'world', fieldKey, valueJson);
      setStateData((prev) => prev ? {
        ...prev,
        world: prev.world.map((r) => r.field_key === fieldKey ? { ...r, effective_value_json: valueJson, runtime_value_json: valueJson } : r),
      } : prev);
    } catch (e) { pushErrorToast(e.message || '更新世界状态失败'); }
  }

  async function handleSavePersona(fieldKey, valueJson) {
    try {
      await patchSessionStateValue(sessionId, 'persona', fieldKey, valueJson);
      setStateData((prev) => prev ? {
        ...prev,
        persona: prev.persona.map((r) => r.field_key === fieldKey ? { ...r, effective_value_json: valueJson, runtime_value_json: valueJson } : r),
      } : prev);
    } catch (e) { pushErrorToast(e.message || '更新玩家状态失败'); }
  }

  async function handleDiarySelect(entry) {
    if (selectedEntry?.date_str === entry.date_str) {
      setSelectedEntry(null);
      onDiaryInject?.(null);
      return;
    }
    setSelectedEntry(entry);
    try {
      const content = await fetchDiaryContent(sessionId, entry.date_str);
      onDiaryInject?.(content);
    } catch (e) {
      pushErrorToast(e.message || '获取日记内容失败');
    }
  }

  function toggleExpand(charId) {
    setExpandedIds((prev) =>
      prev.includes(charId) ? prev.filter((id) => id !== charId) : [...prev, charId]
    );
  }

  async function handleRemove(charId) {
    try {
      await deactivateCharacter(worldId, sessionId, charId);
      onActiveCharactersChange((prev) => prev.filter((c) => c.id !== charId));
    } catch (e) {
      pushErrorToast(e.message || '移除角色失败');
    }
  }

  function handleAdd(char) {
    onActiveCharactersChange((prev) => [...prev, char]);
    setAddModalOpen(false);
  }

  return (
    <div className="we-cast-panel">
      {/* 左侧书脊渐变 */}
      <div className="we-cast-spine" />

      {/* 滚动内容层 */}
      <div className="we-cast-scroll">

        {/* CAST 标题 + 轮询指示 */}
        <div className="we-cast-header">
          <div className="we-cast-header-row">
            <p className="we-cast-title">
              Cast
            </p>
          </div>

          {/* 印章行 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
            {activeCharacters.map((char) => (
              <div
                key={char.id}
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                <CharacterSeal character={char} size={44} />
                <span className="we-cast-seal-name">
                  {char.name}
                </span>
                <button
                  onClick={() => handleRemove(char.id)}
                  title={`移除 ${char.name}`}
                  className="we-cast-seal-remove"
                >
                  ✕
                </button>
              </div>
            ))}

            {/* 添加按钮 */}
            <button
              onClick={() => setAddModalOpen(true)}
              className="we-cast-add-button"
              title="添加角色"
            >
              ＋
            </button>
          </div>
        </div>

        {/* 金箔分隔线 */}
        <div className="we-cast-divider" />

        {/* 世界状态 */}
        <StatusSection
          title="世界"
          rows={worldRows}
          onReset={handleResetWorldState}
          resetting={worldResetting}
          onSave={handleSaveWorld}
          collapsible
        />

        {/* 玩家状态 */}
        <StatusSection
          title={persona?.name || '玩家'}
          rows={stateData?.persona ?? null}
          onReset={handleResetPersonaState}
          resetting={personaResetting}
          onSave={handleSavePersona}
          collapsible
        />

        {/* 逐角色状态区 */}
        <div className="we-cast-characters">
          {activeCharacters.map((char) => (
            <CharacterBlock
              key={char.id}
              char={char}
              sessionId={sessionId}
              expanded={expandedIds.includes(char.id)}
              onToggle={() => toggleExpand(char.id)}
              onRemove={handleRemove}
              stateTick={stateTick}
            />
          ))}
          {activeCharacters.length === 0 && (
            <p className="we-cast-empty">
              暂无激活角色
            </p>
          )}
        </div>

        {/* 日记时间线 */}
        {(() => {
          const hasDiary = Array.isArray(diaryEntries) && diaryEntries.length > 0;
          const reversedDiary = hasDiary ? [...diaryEntries].reverse() : [];
          const recentDiary = reversedDiary.slice(0, DIARY_RECENT_LIMIT);
          const olderDiary = reversedDiary.slice(DIARY_RECENT_LIMIT);
          const hasMore = olderDiary.length > 0;
          return (
            <div className="we-timeline">
              <div
                className="we-state-section-title"
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setDiaryOpen((o) => !o)}
              >
                <Chevron open={diaryOpen} />
                <span className="we-section-label">TIMELINE</span>
                <span className="we-section-rule" />
              </div>
              {selectedEntry && (
                <div className="we-cast-diary-selected-note">
                  已选：{selectedEntry.date_display}（下轮生效，再次点击取消）
                </div>
              )}
              <div style={{
                display: 'grid',
                gridTemplateRows: diaryOpen ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden',
              }}>
                <div style={{ overflow: 'hidden', minHeight: 0 }}>
                  {diaryEntries === null ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[85, 65, 90].map((w, i) => (
                        <div key={i} className="we-skel" style={{ height: 10, width: `${w}%` }} />
                      ))}
                    </div>
                  ) : !hasDiary ? (
                    <p className="we-section-empty">暂无日记</p>
                  ) : (
                    <div className="we-timeline-list">
                      {recentDiary.map((entry, i) => (
                        <DiaryEntry
                          key={entry.date_str}
                          entry={entry}
                          index={i}
                          selected={selectedEntry?.date_str === entry.date_str}
                          onSelect={handleDiarySelect}
                        />
                      ))}
                      {hasMore && (
                        <>
                          {diaryExpanded && olderDiary.map((entry, i) => (
                            <DiaryEntry
                              key={entry.date_str}
                              entry={entry}
                              index={DIARY_RECENT_LIMIT + i}
                              selected={selectedEntry?.date_str === entry.date_str}
                              onSelect={handleDiarySelect}
                            />
                          ))}
                          <div
                            className="we-cast-diary-more"
                            onClick={() => setDiaryExpanded((v) => !v)}
                          >
                            {diaryExpanded ? '▲ 收起' : `▼ 展开更多（${olderDiary.length} 条）`}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        <AnimatePresence>
          {addModalOpen && (
            <AddCharacterModal
              worldId={worldId}
              sessionId={sessionId}
              activeCharacters={activeCharacters}
              onAdd={handleAdd}
              onClose={() => setAddModalOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* 悬浮状态卡 */}
      <AnimatePresence>
        {(isUpdating || stateJustChanged) && (
          <MotionDiv
            key="cast-state-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="we-cast-state-overlay"
          >
            <AnimatePresence mode="wait">
              {isUpdating ? (
                <MotionDiv
                  key="updating"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, userSelect: 'none' }}
                >
                  <span className="we-cast-state-overlay-text">整理中</span>
                </MotionDiv>
              ) : (
                <MotionDiv
                  key="done"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, userSelect: 'none' }}
                >
                  <span className="we-cast-state-overlay-text">已整理</span>
                </MotionDiv>
              )}
            </AnimatePresence>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
