import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useStore from '../../store/index.js';
import {
  fetchSessionStateValues,
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  resetSessionCharacterStateValues,
} from '../../api/session-state-values.js';
import { fetchSessionTimeline } from '../../api/session-timeline.js';
import { getWorld } from '../../api/worlds.js';
import CharacterSeal from './CharacterSeal.jsx';
import StatusSection from './StatusSection.jsx';

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

// ── 折叠箭头（与 CastPanel 一致）────────────────────────────
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

export default function StatePanel({ sessionId, character, worldId, persona }) {
  const tick = useStore((s) => s.memoryRefreshTick);

  // null = 加载中；{ world:[], persona:[], character:[] } = 已加载
  const [stateData, setStateData] = useState(null);
  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);
  const [charResetting, setCharResetting] = useState(false);

  const [timeline, setTimeline] = useState(null);  // null = 加载中
  const [worldName, setWorldName] = useState(null);

  // 折叠状态
  const [timelineOpen, setTimelineOpen] = useState(true);

  // 异步任务状态反馈
  // pollingHasChanged: 本轮轮询中是否已检测到至少一次数据变化，
  // 用于防止"已整理"消隐后回退到"整理中"
  const [isPolling, setIsPolling] = useState(false);
  const [stateJustChanged, setStateJustChanged] = useState(false);
  const [pollingHasChanged, setPollingHasChanged] = useState(false);

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
  // 注意：状态更新（优先级2）和时间线更新（优先级3）在不同时间完成，
  // 不能在检测到状态变化后立即停止轮询，必须持续轮询直到超时，
  // 否则会漏掉后续的时间线更新。
  useEffect(() => {
    if (tick === 0 || !sessionId) return;

    setIsPolling(true);
    setPollingHasChanged(false);  // 新轮次开始时重置
    let currentSnapshot = JSON.stringify([stateData, timeline]);
    let intervalId;
    let timeoutId;
    let changedTimerId;

    intervalId = setInterval(async () => {
      try {
        const [newState, newTimeline] = await Promise.all([
          fetchSessionStateValues(sessionId),
          fetchSessionTimeline(sessionId),
        ]);
        const current = JSON.stringify([newState, newTimeline]);
        if (current !== currentSnapshot) {
          currentSnapshot = current;
          setStateData(newState);
          setTimeline(newTimeline);
          setPollingHasChanged(true);   // 标记已变化，后续不再回退到"整理中"
          setStateJustChanged(true);
          clearTimeout(changedTimerId);
          changedTimerId = setTimeout(() => setStateJustChanged(false), 1800);
        }
      } catch {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        setIsPolling(false);
      }
    }, 3000);

    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      setIsPolling(false);
    }, 30000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      clearTimeout(changedTimerId);
      setIsPolling(false);
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
  // 悬浮卡可见：整理中（且本轮尚无变化）或 已整理（短暂）
  const showFloating = stateJustChanged || (isPolling && !pollingHasChanged);

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
          left: 0, top: 0, bottom: 0, width: 12,
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

        {/* ── 内容区 ── */}
        <div className="we-panel-body">

          {/* 世界状态（可折叠） */}
          <StatusSection
            title="WORLD"
            className="we-status-world"
            rows={stateData?.world ?? null}
            onReset={handleResetWorld}
            resetting={worldResetting}
            collapsible
          />

          {/* 玩家状态（可折叠） */}
          <StatusSection
            title="PLAYER"
            className="we-status-player"
            rows={stateData?.persona ?? null}
            pinnedName={persona?.name}
            onReset={handleResetPersona}
            resetting={personaResetting}
            collapsible
          />

          {/* 角色状态（可折叠） */}
          <StatusSection
            title="CHARACTER"
            className="we-status-character"
            rows={stateData?.character ?? null}
            pinnedName={character?.name}
            onReset={handleResetChar}
            resetting={charResetting}
            collapsible
          />

          {/* 当前会话时间线（可折叠） */}
          <div className="we-timeline">
            <div
              className="we-state-section-title"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setTimelineOpen((o) => !o)}
            >
              <Chevron open={timelineOpen} />
              <span className="we-section-label">TIMELINE</span>
              <span className="we-section-rule" />
            </div>
            <div style={{
              display: 'grid',
              gridTemplateRows: timelineOpen ? '1fr' : '0fr',
              transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
            }}>
              <div style={{ overflow: 'hidden', minHeight: 0 }}>
                {timeline === null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[85, 65, 90].map((w, i) => (
                      <div key={i} className="we-skel" style={{ height: 10, width: `${w}%` }} />
                    ))}
                  </div>
                ) : !hasTimeline ? (
                  <p className="we-section-empty">暂无记录</p>
                ) : (
                  <div className="we-timeline-list">
                    {[...timeline].reverse().map((entry, i) => (
                      <TimelineEntry key={entry.round_index} entry={entry} index={i} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>  {/* 滚动内容层 close */}

      {/* ── 悬浮状态卡：固定在面板正中，不随内容滚动 ── */}
      <AnimatePresence>
        {showFloating && (
          /* 外层遮罩：覆盖整个面板，flex 居中子卡片，带轻微磨砂 */
          <motion.div
            key="state-overlay"
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
              background: 'rgba(184, 168, 130, 0.12)',
              backdropFilter: 'blur(1.5px)',
              WebkitBackdropFilter: 'blur(1.5px)',
            }}
          >
            {/* 纯文字浮层：无背景无边框 */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                userSelect: 'none',
              }}
            >
              <span style={{
                fontFamily: 'var(--we-font-display)',
                fontSize: 12,
                fontStyle: 'italic',
                letterSpacing: '0.18em',
                lineHeight: 1,
                color: stateJustChanged ? 'var(--we-gold-leaf)' : 'var(--we-ink-faded)',
                transition: 'color 0.36s ease',
                whiteSpace: 'nowrap',
              }}>
                {stateJustChanged ? '已整理' : '整理中'}
              </span>

              {/* 跳动三点，已整理时淡出 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                opacity: stateJustChanged ? 0 : 1,
                transition: 'opacity 0.28s ease',
              }}>
                <span className="typing-dot" style={{ background: 'var(--we-ink-faded)', width: 3, height: 3, margin: 0 }} />
                <span className="typing-dot" style={{ background: 'var(--we-ink-faded)', width: 3, height: 3, margin: 0 }} />
                <span className="typing-dot" style={{ background: 'var(--we-ink-faded)', width: 3, height: 3, margin: 0 }} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
