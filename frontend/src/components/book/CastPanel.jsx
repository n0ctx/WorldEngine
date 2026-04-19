import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import CharacterSeal from './CharacterSeal.jsx';
import StatusSection from './StatusSection.jsx';
import ModalShell from '../ui/ModalShell.jsx';
import { getCharactersByWorld } from '../../api/characters.js';
import { getCharacterStateValues, resetCharacterStateValues } from '../../api/characterStateValues.js';
import { getWorldStateValues, resetWorldStateValues } from '../../api/worldStateValues.js';
import { getPersonaStateValues, resetPersonaStateValues } from '../../api/personaStateValues.js';
import { getWorldTimeline } from '../../api/worldTimeline.js';
import { activateCharacter, deactivateCharacter } from '../../api/writingSessions.js';
import { getAvatarColor } from '../../utils/avatar.js';

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

function TimelineSection({ rows }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="we-timeline">
      <div
        className="we-state-section-title"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen((o) => !o)}
      >
        <Chevron open={open} />
        <span className="we-section-label">世界时间线</span>
        <span className="we-section-rule" />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          {!rows && <p className="we-section-empty">加载中…</p>}
          {rows && rows.length === 0 && <p className="we-section-empty">暂无记录</p>}
          {rows && rows.length > 0 && (
            <ul className="we-timeline-list">
              {rows.map((row) => (
                <li key={row.id} className={`we-timeline-entry${row.is_compressed === 1 ? ' we-timeline-entry--old' : ''}`}>
                  <span className="we-timeline-dot">·</span>
                  <span className="we-timeline-text">{row.content}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function CharacterBlock({ char, expanded, onToggle, onRemove, refreshTick }) {
  const [stateValues, setStateValues] = useState(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!char?.id) return;
    if (!expanded && stateValues !== null) return; // 已加载过则不重置
    if (!expanded) return;
    setStateValues(null);
    getCharacterStateValues(char.id)
      .then(setStateValues)
      .catch(() => setStateValues([]));
  }, [char?.id, expanded, refreshTick]);

  async function handleReset() {
    if (resetting) return;
    setResetting(true);
    try { setStateValues(await resetCharacterStateValues(char.id)); }
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

export default function CastPanel({ worldId, sessionId, activeCharacters, onActiveCharactersChange, refreshTick = 0, persona }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState([]);

  const [worldState, setWorldState] = useState(null);
  const [worldResetting, setWorldResetting] = useState(false);
  const [personaState, setPersonaState] = useState(null);
  const [personaResetting, setPersonaResetting] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (activeCharacters.length > 0) {
      setExpandedIds([activeCharacters[0].id]);
    } else {
      setExpandedIds([]);
    }
  }, [activeCharacters.length]);

  // 初始加载世界/玩家/时间线
  useEffect(() => {
    if (!worldId) return;
    setWorldState(null);
    setPersonaState(null);
    setTimeline(null);
    getWorldStateValues(worldId).then(setWorldState).catch(() => setWorldState([]));
    getPersonaStateValues(worldId).then(setPersonaState).catch(() => setPersonaState([]));
    getWorldTimeline(worldId, 50).then(setTimeline).catch(() => setTimeline([]));
  }, [worldId]);

  // 轮询：AI 回复后感知异步状态更新
  useEffect(() => {
    if (refreshTick === 0 || !worldId) return;
    setIsPolling(true);
    const snapshot = JSON.stringify([worldState, personaState, timeline]);

    let intervalId;
    let timeoutId;

    intervalId = setInterval(async () => {
      try {
        const [newWorld, newPersona, newTimeline] = await Promise.all([
          getWorldStateValues(worldId),
          getPersonaStateValues(worldId),
          getWorldTimeline(worldId, 50),
        ]);
        const current = JSON.stringify([newWorld, newPersona, newTimeline]);
        if (current !== snapshot) {
          setWorldState(newWorld);
          setPersonaState(newPersona);
          setTimeline(newTimeline);
          setIsPolling(false);
          clearInterval(intervalId);
          clearTimeout(timeoutId);
        }
      } catch {
        setIsPolling(false);
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      }
    }, 3000);

    timeoutId = setTimeout(() => {
      setIsPolling(false);
      clearInterval(intervalId);
    }, 20000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResetWorldState() {
    if (worldResetting) return;
    setWorldResetting(true);
    try { setWorldState(await resetWorldStateValues(worldId)); }
    catch (e) { console.error(e); }
    finally { setWorldResetting(false); }
  }

  async function handleResetPersonaState() {
    if (personaResetting) return;
    setPersonaResetting(true);
    try { setPersonaState(await resetPersonaStateValues(worldId)); }
    catch (e) { console.error(e); }
    finally { setPersonaResetting(false); }
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
            {isPolling && (
              <span style={{
                fontFamily: 'var(--we-font-display)',
                fontStyle: 'italic',
                fontSize: 9.5,
                color: 'var(--we-ink-faded)',
                opacity: 0.6,
                letterSpacing: '0.06em',
              }}>
                更新中…
              </span>
            )}
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
          rows={worldState}
          onReset={handleResetWorldState}
          resetting={worldResetting}
          collapsible
        />

        {/* 玩家状态 */}
        <StatusSection
          title={persona?.name || '玩家'}
          rows={personaState}
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
              expanded={expandedIds.includes(char.id)}
              onToggle={() => toggleExpand(char.id)}
              onRemove={handleRemove}
              refreshTick={refreshTick}
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

        {/* 世界时间线 */}
        <TimelineSection rows={timeline} />

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
    </div>
  );
}
