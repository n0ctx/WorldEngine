import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CharacterSeal from './CharacterSeal.jsx';
import StatusSection from './StatusSection.jsx';
import ModalShell from '../ui/ModalShell.jsx';
import { getCharactersByWorld } from '../../api/characters.js';
import {
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  fetchSessionCharacterStateValues,
  resetSessionCharacterStateValuesByChar,
} from '../../api/session-state-values.js';
import { fetchDiaryContent } from '../../api/daily-entries.js';
import { useSessionState } from '../../hooks/useSessionState.js';
import { activateCharacter, deactivateCharacter } from '../../api/writing-sessions.js';

const MotionDiv = motion.div;

function Chevron({ open }) {
  return (
    <svg
      width="8" height="8" viewBox="0 0 10 10" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{
        flexShrink: 0,
        color: 'var(--we-ink-faded)',
        opacity: 0.45,
        transition: 'transform 0.2s ease',
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
      }}
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </svg>
  );
}

const DIARY_RECENT_LIMIT = 5;

function DiaryEntry({ entry, index, selected, onSelect }) {
  return (
    <div
      className="we-timeline-entry"
      style={{
        animationDelay: `${index * 50}ms`,
        cursor: 'pointer',
        borderRadius: 4,
        padding: '2px 4px',
        background: selected ? 'var(--we-gold-leaf)' : 'transparent',
        opacity: selected ? 0.9 : 1,
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
    setStateValues(null);
    fetchSessionCharacterStateValues(sessionId, char.id)
      .then(setStateValues)
      .catch(() => setStateValues([]));
  }, [char?.id, sessionId, expanded, stateTick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReset() {
    if (resetting) return;
    setResetting(true);
    try { setStateValues(await resetSessionCharacterStateValuesByChar(sessionId, char.id)); }
    catch (e) { console.error(e); }
    finally { setResetting(false); }
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
          <StatusSection title="" rows={stateValues} className="we-cast-char-inner" />
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
    getCharactersByWorld(worldId).then(setAllChars).catch(console.error);
  }, [worldId]);

  const available = allChars.filter((c) => !activeIds.has(c.id));

  async function handleAdd(charId) {
    setAdding(charId);
    try {
      await activateCharacter(worldId, sessionId, charId);
      const char = allChars.find((c) => c.id === charId);
      onAdd(char);
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(null);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-sm">
      <div style={{ padding: '16px 20px 6px' }}>
        <p style={{
          fontFamily: 'var(--we-font-display)',
          fontSize: 15,
          fontStyle: 'italic',
          color: 'var(--we-ink-primary)',
          marginBottom: 12,
        }}>
          添加角色
        </p>
        {available.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--we-ink-faded)', fontStyle: 'italic', padding: '8px 0 12px' }}>
            所有角色均已激活
          </p>
        )}
        {available.map((char) => (
          <div
            key={char.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderBottom: '1px solid var(--we-paper-shadow)',
            }}
          >
            <CharacterSeal character={char} size={32} />
            <span style={{ flex: 1, fontFamily: 'var(--we-font-serif)', fontSize: 14, color: 'var(--we-ink-primary)' }}>
              {char.name}
            </span>
            <button
              onClick={() => handleAdd(char.id)}
              disabled={adding === char.id}
              style={{
                padding: '3px 10px',
                border: '1.5px dashed var(--we-vermilion)',
                borderRadius: 3,
                background: 'none',
                color: 'var(--we-vermilion)',
                fontFamily: 'var(--we-font-serif)',
                fontSize: 12,
                cursor: 'pointer',
                opacity: adding === char.id ? 0.5 : 1,
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { if (adding !== char.id) e.currentTarget.style.background = 'var(--we-vermilion-bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              {adding === char.id ? '…' : '添加'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 20px 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{ fontFamily: 'var(--we-font-serif)', fontSize: 13, color: 'var(--we-ink-faded)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          关闭
        </button>
      </div>
    </ModalShell>
  );
}

export default function CastPanel({ worldId, sessionId, activeCharacters, onActiveCharactersChange, stateTick = 0, diaryTick = 0, persona, onDiaryInject }) {
  const { stateData, setStateData, diaryEntries, stateJustChanged } = useSessionState(sessionId, stateTick, diaryTick);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState([]);
  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);

  // 日记折叠/展开
  const [diaryOpen, setDiaryOpen] = useState(true);
  const [diaryExpanded, setDiaryExpanded] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    if (activeCharacters.length > 0) {
      setExpandedIds([activeCharacters[0].id]);
    } else {
      setExpandedIds([]);
    }
  }, [activeCharacters.length]);

  // sessionId 变化时清空已选日记
  useEffect(() => { setSelectedEntry(null); }, [sessionId]);

  async function handleResetWorldState() {
    if (!sessionId || worldResetting) return;
    setWorldResetting(true);
    try {
      setStateData(await resetSessionWorldStateValues(sessionId));
    } catch (e) { console.error(e); }
    finally { setWorldResetting(false); }
  }

  async function handleResetPersonaState() {
    if (!sessionId || personaResetting) return;
    setPersonaResetting(true);
    try {
      setStateData(await resetSessionPersonaStateValues(sessionId));
    } catch (e) { console.error(e); }
    finally { setPersonaResetting(false); }
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
      console.error('获取日记内容失败', e);
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
      console.error(e);
    }
  }

  function handleAdd(char) {
    onActiveCharactersChange((prev) => [...prev, char]);
    setAddModalOpen(false);
  }

  return (
    <div
      className="we-cast-panel"
      style={{
        flex: '0 0 22%',
        minWidth: '300px',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--we-paper-aged)',
        borderLeft: '1px solid var(--we-paper-shadow)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 左侧书脊渐变 */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 12,
        background: 'var(--we-spine-shadow-left)',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* 滚动内容层 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* CAST 标题 + 轮询指示 */}
        <div className="we-cast-header">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--we-paper-shadow)',
            paddingBottom: 6, marginBottom: 10,
          }}>
            <p style={{
              fontFamily: 'var(--we-font-display)',
              fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase',
              color: 'var(--we-ink-faded)',
              margin: 0,
            }}>
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
                <span style={{
                  fontSize: 8, fontStyle: 'italic', color: 'var(--we-ink-faded)',
                  maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', textAlign: 'center', marginTop: 3,
                }}>
                  {char.name}
                </span>
                <button
                  onClick={() => handleRemove(char.id)}
                  title={`移除 ${char.name}`}
                  style={{
                    position: 'absolute', top: -2, right: -4,
                    fontSize: 9, color: 'var(--we-ink-faded)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    lineHeight: 1, padding: 2,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--we-vermilion)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--we-ink-faded)'; }}
                >
                  ✕
                </button>
              </div>
            ))}

            {/* 添加按钮 */}
            <button
              onClick={() => setAddModalOpen(true)}
              style={{
                width: 44, height: 44,
                border: '1px dashed var(--we-vermilion)',
                borderRadius: 'var(--we-radius-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, color: 'var(--we-vermilion)',
                background: 'none', cursor: 'pointer',
                transition: 'background 0.12s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--we-vermilion-bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              title="添加角色"
            >
              ＋
            </button>
          </div>
        </div>

        {/* 金箔分隔线 */}
        <div style={{
          height: 1,
          background: 'var(--we-gold-leaf)',
          opacity: 0.4,
          margin: '12px -14px',
        }} />

        {/* 世界状态 */}
        <StatusSection
          title="世界"
          rows={stateData?.world ?? null}
          onReset={handleResetWorldState}
          resetting={worldResetting}
          collapsible
        />

        {/* 玩家状态 */}
        <StatusSection
          title={persona?.name || '玩家'}
          rows={stateData?.persona ?? null}
          onReset={handleResetPersonaState}
          resetting={personaResetting}
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
            <p style={{
              fontSize: 12, fontStyle: 'italic',
              color: 'var(--we-ink-faded)',
              textAlign: 'center', paddingTop: 12,
            }}>
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
                <div style={{
                  fontSize: 10,
                  color: 'var(--we-gold-leaf)',
                  padding: '0 4px 4px',
                  fontStyle: 'italic',
                }}>
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
                            style={{
                              fontSize: 11,
                              color: 'var(--we-ink-faded)',
                              cursor: 'pointer',
                              padding: '4px 4px 2px',
                              userSelect: 'none',
                            }}
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
        {stateJustChanged && (
          <MotionDiv
            key="cast-state-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 30,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb, var(--we-base-paper-400) 12%, transparent)',
            }}
          >
            <MotionDiv
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, userSelect: 'none' }}
            >
              <span style={{
                fontFamily: 'var(--we-font-display)',
                fontSize: 12,
                fontStyle: 'italic',
                letterSpacing: '0.18em',
                lineHeight: 1,
                color: 'var(--we-gold-leaf)',
                whiteSpace: 'nowrap',
              }}>
                已整理
              </span>
            </MotionDiv>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
