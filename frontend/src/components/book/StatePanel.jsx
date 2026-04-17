import { useEffect, useState } from 'react';
import useStore from '../../store/index.js';
import { getWorldStateValues, resetWorldStateValues } from '../../api/worldStateValues.js';
import { getCharacterStateValues, resetCharacterStateValues } from '../../api/characterStateValues.js';
import { getWorldTimeline } from '../../api/worldTimeline.js';
import { getPersonaStateValues, resetPersonaStateValues } from '../../api/personaStateValues.js';
import { getWorld } from '../../api/worlds.js';
import CharacterSeal from './CharacterSeal.jsx';
import StatusSection from './StatusSection.jsx';
import MarginaliaList from './MarginaliaList.jsx';

// ── 金箔装饰分隔线 ──────────────────────────────────────────
function GoldDivider() {
  return (
    <div className="we-panel-divider" aria-hidden="true">
      <span className="we-panel-divider-line" />
      <span className="we-panel-divider-gem">✦</span>
      <span className="we-panel-divider-line" />
    </div>
  );
}

// ── 时间线条目 ─────────────────────────────────────────────
function TimelineEntry({ entry, index }) {
  const compressed = entry.is_compressed === 1;
  return (
    <div
      className={`we-timeline-entry${compressed ? ' we-timeline-entry--old' : ''}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span className="we-timeline-dot">·</span>
      <span className="we-timeline-text">
        {compressed ? <em>旧史 · {entry.content}</em> : entry.content}
      </span>
    </div>
  );
}

export default function StatePanel({ character, worldId, characterId, persona, recalledItems = [] }) {
  const tick = useStore((s) => s.memoryRefreshTick);

  // null = 加载中；[] = 已加载无字段
  const [charState, setCharState] = useState(null);
  const [charResetting, setCharResetting] = useState(false);

  const [personaState, setPersonaState] = useState(null);
  const [personaResetting, setPersonaResetting] = useState(false);

  const [worldState, setWorldState] = useState(null);
  const [worldResetting, setWorldResetting] = useState(false);

  const [timeline, setTimeline] = useState(null);  // null = 加载中
  const [worldName, setWorldName] = useState(null);

  // ── 初始数据拉取 ──────────────────────────────────────────
  useEffect(() => {
    if (!characterId) {
      setCharState([]);
      return;
    }
    setCharState(null); // 重置为加载中
    getCharacterStateValues(characterId).then(setCharState).catch(() => setCharState([]));
  }, [characterId]);

  useEffect(() => {
    if (!worldId) {
      setPersonaState([]);
      setWorldState([]);
      setTimeline([]);
      setWorldName(null);
      return;
    }
    setPersonaState(null);
    setWorldState(null);
    setTimeline(null);

    getPersonaStateValues(worldId).then(setPersonaState).catch(() => setPersonaState([]));
    getWorldStateValues(worldId).then(setWorldState).catch(() => setWorldState([]));
    getWorldTimeline(worldId, 5).then(setTimeline).catch(() => setTimeline([]));
    getWorld(worldId).then((w) => setWorldName(w?.name ?? null)).catch(() => {});
  }, [worldId]);

  // ── 轮询：AI 回复后感知异步状态更新 ──────────────────────
  useEffect(() => {
    if (tick === 0) return;

    const snapshot = JSON.stringify([charState, personaState, worldState, timeline]);
    let intervalId;
    let timeoutId;

    intervalId = setInterval(async () => {
      try {
        const [newChar, newPersona, newWorld, newTimeline] = await Promise.all([
          characterId ? getCharacterStateValues(characterId) : Promise.resolve(null),
          worldId ? getPersonaStateValues(worldId) : Promise.resolve(null),
          worldId ? getWorldStateValues(worldId) : Promise.resolve(null),
          worldId ? getWorldTimeline(worldId, 5) : Promise.resolve(null),
        ]);
        const current = JSON.stringify([newChar, newPersona, newWorld, newTimeline]);
        if (current !== snapshot) {
          if (newChar !== null) setCharState(newChar);
          if (newPersona !== null) setPersonaState(newPersona);
          if (newWorld !== null) setWorldState(newWorld);
          if (newTimeline !== null) setTimeline(newTimeline);
          clearInterval(intervalId);
          clearTimeout(timeoutId);
        }
      } catch {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      }
    }, 3000);

    timeoutId = setTimeout(() => clearInterval(intervalId), 20000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 重置处理 ──────────────────────────────────────────────
  async function handleResetChar() {
    if (!characterId || charResetting) return;
    setCharResetting(true);
    try { setCharState(await resetCharacterStateValues(characterId)); }
    catch (e) { console.error('重置角色状态失败', e); }
    finally { setCharResetting(false); }
  }

  async function handleResetPersona() {
    if (!worldId || personaResetting) return;
    setPersonaResetting(true);
    try { setPersonaState(await resetPersonaStateValues(worldId)); }
    catch (e) { console.error('重置玩家状态失败', e); }
    finally { setPersonaResetting(false); }
  }

  async function handleResetWorld() {
    if (!worldId || worldResetting) return;
    setWorldResetting(true);
    try { setWorldState(await resetWorldStateValues(worldId)); }
    catch (e) { console.error('重置世界状态失败', e); }
    finally { setWorldResetting(false); }
  }

  const hasTimeline = Array.isArray(timeline) && timeline.length > 0;
  const showRecalled = recalledItems.length > 0;

  return (
    <div
      className="we-state-panel"
      style={{
        width: 280,
        flexShrink: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--we-paper-aged)',
        borderLeft: '1px solid var(--we-paper-shadow)',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--we-paper-shadow) transparent',
        position: 'relative',
      }}
    >
      {/* 左侧书脊内阴影 */}
      <div className="we-panel-spine" aria-hidden="true" />

      {/* ── 头部：印章 + 角色名 + 世界名 ── */}
      <div className="we-state-panel-header">
        <div className="we-seal-wrap">
          <CharacterSeal character={character} size={80} />
        </div>

        {character ? (
          <>
            <p className="we-panel-char-name">{character.name}</p>
            {worldName && (
              <p className="we-panel-world-name">{worldName}</p>
            )}
          </>
        ) : (
          <p className="we-panel-placeholder">尚未选择角色</p>
        )}
      </div>

      {/* 金箔分隔线 */}
      <GoldDivider />

      {/* ── 内容区 ── */}
      <div className="we-panel-body">
        {/* 角色状态：pinnedName 不传（头部已显示角色名） */}
        <StatusSection
          title="CURRENT STATE"
          className="we-status-character"
          rows={charState}
          onReset={handleResetChar}
          resetting={charResetting}
        />

        {/* 玩家状态 */}
        <StatusSection
          title="PLAYER"
          className="we-status-player"
          rows={personaState}
          pinnedName={persona?.name}
          onReset={handleResetPersona}
          resetting={personaResetting}
        />

        {/* 世界状态 */}
        <StatusSection
          title="WORLD"
          className="we-status-world"
          rows={worldState}
          onReset={handleResetWorld}
          resetting={worldResetting}
        />

        {/* 世界时间线 */}
        <div className="we-timeline">
          <div className="we-state-section-title">
            <span className="we-section-label">TIMELINE</span>
            <span className="we-section-rule" />
          </div>
          {timeline === null ? (
            /* 加载中 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[85, 65, 90].map((w, i) => (
                <div key={i} className="we-skel" style={{ height: 10, width: `${w}%` }} />
              ))}
            </div>
          ) : !hasTimeline ? (
            <p className="we-section-empty">暂无记录</p>
          ) : (
            <div className="we-timeline-list">
              {timeline.slice(0, 5).map((entry, i) => (
                <TimelineEntry key={entry.id} entry={entry} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* 召回批注：仅在有数据时显示（T66 接入 SSE 后填充） */}
        {showRecalled && (
          <div className="we-state-section we-recalled-section">
            <div className="we-state-section-title">
              <span className="we-section-label">RECALLED</span>
              <span className="we-section-rule" />
            </div>
            <MarginaliaList items={recalledItems} />
          </div>
        )}
      </div>
    </div>
  );
}
