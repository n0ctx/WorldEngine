import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useStore from '../../store/index.js';
import {
  fetchSessionStateValues,
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  resetSessionCharacterStateValues,
} from '../../api/session-state-values.js';
import { fetchDailyEntries, fetchDiaryContent } from '../../api/daily-entries.js';
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

// ── 折叠箭头 ────────────────────────────────────────────────
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

const RECENT_LIMIT = 5;

// ── 日记条目 ────────────────────────────────────────────────
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

export default function StatePanel({ sessionId, character, worldId, persona, onDiaryInject }) {
  const tick = useStore((s) => s.memoryRefreshTick);

  const [stateData, setStateData] = useState(null);
  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);
  const [charResetting, setCharResetting] = useState(false);

  const [diaryEntries, setDiaryEntries] = useState(null); // null = 加载中
  const [worldName, setWorldName] = useState(null);

  // 折叠状态
  const [diaryOpen, setDiaryOpen] = useState(true);
  const [diaryExpanded, setDiaryExpanded] = useState(false); // 是否展开更多

  // 已选中（待注入）的日记条目
  const [selectedEntry, setSelectedEntry] = useState(null);

  // 异步任务状态反馈
  const [isPolling, setIsPolling] = useState(false);
  const [stateJustChanged, setStateJustChanged] = useState(false);
  const [pollingHasChanged, setPollingHasChanged] = useState(false);

  // ── 初始数据拉取 ──────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setStateData({ world: [], persona: [], character: [] });
      setDiaryEntries([]);
      return;
    }
    setStateData(null);
    setDiaryEntries(null);

    fetchSessionStateValues(sessionId).then(setStateData).catch(() => setStateData({ world: [], persona: [], character: [] }));
    fetchDailyEntries(sessionId).then(setDiaryEntries).catch(() => setDiaryEntries([]));
  }, [sessionId]);

  useEffect(() => {
    if (!worldId) { setWorldName(null); return; }
    getWorld(worldId).then((w) => setWorldName(w?.name ?? null)).catch(() => {});
  }, [worldId]);

  // ── 轮询：AI 回复后感知异步状态更新 ──────────────────────
  useEffect(() => {
    if (tick === 0 || !sessionId) return;

    setIsPolling(true);
    setPollingHasChanged(false);
    let currentSnapshot = JSON.stringify([stateData, diaryEntries]);
    let intervalId;
    let timeoutId;
    let changedTimerId;

    intervalId = setInterval(async () => {
      try {
        const [newState, newDiary] = await Promise.all([
          fetchSessionStateValues(sessionId),
          fetchDailyEntries(sessionId),
        ]);
        const current = JSON.stringify([newState, newDiary]);
        if (current !== currentSnapshot) {
          currentSnapshot = current;
          setStateData(newState);
          setDiaryEntries(newDiary);
          setPollingHasChanged(true);
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

  // ── 日记点击注入 ─────────────────────────────────────────
  async function handleDiarySelect(entry) {
    if (selectedEntry?.date_str === entry.date_str) {
      // 再次点击取消
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

  // 当 sessionId 变化时清空已选
  useEffect(() => { setSelectedEntry(null); }, [sessionId]);

  const hasDiary = Array.isArray(diaryEntries) && diaryEntries.length > 0;
  // 从近到远排列
  const reversedDiary = hasDiary ? [...diaryEntries].reverse() : [];
  const recentDiary = reversedDiary.slice(0, RECENT_LIMIT);
  const olderDiary = reversedDiary.slice(RECENT_LIMIT);
  const hasMore = olderDiary.length > 0;

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
      {/* 书脊阴影 */}
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

        {/* ── 头部 ── */}
        <div className="we-state-panel-header">
          <div className="we-seal-wrap">
            <CharacterSeal character={character} size={80} />
          </div>
          {character ? (
            <>
              <p className="we-panel-char-name">{character.name}</p>
              {worldName && <p className="we-panel-world-name">{worldName}</p>}
            </>
          ) : (
            <p className="we-panel-placeholder">尚未选择角色</p>
          )}
        </div>

        <GoldDivider />

        {/* ── 内容区 ── */}
        <div className="we-panel-body">

          <StatusSection
            title="WORLD"
            className="we-status-world"
            rows={stateData?.world ?? null}
            onReset={handleResetWorld}
            resetting={worldResetting}
            collapsible
          />

          <StatusSection
            title="PLAYER"
            className="we-status-player"
            rows={stateData?.persona ?? null}
            pinnedName={persona?.name}
            onReset={handleResetPersona}
            resetting={personaResetting}
            collapsible
          />

          <StatusSection
            title="CHARACTER"
            className="we-status-character"
            rows={stateData?.character ?? null}
            pinnedName={character?.name}
            onReset={handleResetChar}
            resetting={charResetting}
            collapsible
          />

          {/* ── 日记时间线（可折叠） ── */}
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
                            index={RECENT_LIMIT + i}
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

        </div>
      </div>

      {/* ── 悬浮状态卡 ── */}
      <AnimatePresence>
        {showFloating && (
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
            <motion.div
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
                color: stateJustChanged ? 'var(--we-gold-leaf)' : 'var(--we-ink-faded)',
                transition: 'color 0.36s ease',
                whiteSpace: 'nowrap',
              }}>
                {stateJustChanged ? '已整理' : '整理中'}
              </span>
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
