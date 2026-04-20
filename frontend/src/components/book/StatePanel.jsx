import { useEffect, useState } from 'react';
import useStore from '../../store/index.js';
import {
  fetchSessionStateValues,
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  resetSessionCharacterStateValues,
} from '../../api/sessionStateValues.js';
import { fetchSessionTimeline } from '../../api/sessionTimeline.js';
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

// ── 时间线条目（当前会话轮次摘要）────────────────────────────
function TimelineEntry({ entry, index }) {
  return (
    <div
      className="we-timeline-entry"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span className="we-timeline-dot">·</span>
      <span className="we-timeline-text">
        <em className="we-timeline-round">第{entry.round_index}轮</em>
        {' '}{entry.summary}
      </span>
    </div>
  );
}

export default function StatePanel({ sessionId, character, worldId, persona, recalledItems = [] }) {
  const tick = useStore((s) => s.memoryRefreshTick);

  // null = 加载中；{ world:[], persona:[], character:[] } = 已加载
  const [stateData, setStateData] = useState(null);
  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);
  const [charResetting, setCharResetting] = useState(false);

  const [timeline, setTimeline] = useState(null);  // null = 加载中
  const [worldName, setWorldName] = useState(null);

  // ── 初始数据拉取 ──────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setStateData({ world: [], persona: [], character: [] });
      setTimeline([]);
      return;
    }
    setStateData(null);
    setTimeline(null);

    fetchSessionStateValues(sessionId).then(setStateData).catch(() => setStateData({ world: [], persona: [], character: [] }));
    fetchSessionTimeline(sessionId).then(setTimeline).catch(() => setTimeline([]));
  }, [sessionId]);

  useEffect(() => {
    if (!worldId) { setWorldName(null); return; }
    getWorld(worldId).then((w) => setWorldName(w?.name ?? null)).catch(() => {});
  }, [worldId]);

  // ── 轮询：AI 回复后感知异步状态更新 ──────────────────────
  useEffect(() => {
    if (tick === 0 || !sessionId) return;

    const snapshot = JSON.stringify([stateData, timeline]);
    let intervalId;
    let timeoutId;

    intervalId = setInterval(async () => {
      try {
        const [newState, newTimeline] = await Promise.all([
          fetchSessionStateValues(sessionId),
          fetchSessionTimeline(sessionId),
        ]);
        const current = JSON.stringify([newState, newTimeline]);
        if (current !== snapshot) {
          setStateData(newState);
          setTimeline(newTimeline);
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
  async function handleResetWorld() {
    if (!sessionId || worldResetting) return;
    setWorldResetting(true);
    try {
      const newState = await resetSessionWorldStateValues(sessionId);
      setStateData(newState);
    } catch (e) { console.error('重置世界状态失败', e); }
    finally { setWorldResetting(false); }
  }

  async function handleResetPersona() {
    if (!sessionId || personaResetting) return;
    setPersonaResetting(true);
    try {
      const newState = await resetSessionPersonaStateValues(sessionId);
      setStateData(newState);
    } catch (e) { console.error('重置玩家状态失败', e); }
    finally { setPersonaResetting(false); }
  }

  async function handleResetChar() {
    if (!sessionId || charResetting) return;
    setCharResetting(true);
    try {
      const newState = await resetSessionCharacterStateValues(sessionId);
      setStateData(newState);
    } catch (e) { console.error('重置角色状态失败', e); }
    finally { setCharResetting(false); }
  }

  const hasTimeline = Array.isArray(timeline) && timeline.length > 0;
  const showRecalled = recalledItems.length > 0;

  return (
    <div
      className="we-state-panel"
      style={{
        flex: '0 0 22%',
        minWidth: '300px',
        maxWidth: '420px',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--we-paper-aged)',
        borderLeft: '1px solid var(--we-paper-shadow)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 书脊阴影固定在外层，不随内容滚动 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 12,
          background: 'var(--we-spine-shadow-left)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      {/* 滚动内容层 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--we-paper-shadow) transparent',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>

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

      {/* ── 内容区：世界 → 玩家 → 角色 ── */}
      <div className="we-panel-body">
        {/* 世界状态 */}
        <StatusSection
          title="WORLD"
          className="we-status-world"
          rows={stateData?.world ?? null}
          onReset={handleResetWorld}
          resetting={worldResetting}
        />

        {/* 玩家状态 */}
        <StatusSection
          title="PLAYER"
          className="we-status-player"
          rows={stateData?.persona ?? null}
          pinnedName={persona?.name}
          onReset={handleResetPersona}
          resetting={personaResetting}
        />

        {/* 角色状态 */}
        <StatusSection
          title="CHARACTER"
          className="we-status-character"
          rows={stateData?.character ?? null}
          pinnedName={character?.name}
          onReset={handleResetChar}
          resetting={charResetting}
        />

        {/* 当前会话时间线 */}
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
              {timeline.map((entry, i) => (
                <TimelineEntry key={entry.round_index} entry={entry} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* 召回批注：仅在有数据时显示 */}
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
      </div>  {/* 滚动内容层 close */}
    </div>
  );
}
