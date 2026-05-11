import { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import Icon from '../ui/Icon.jsx';
import StatusSection from './StatusSection.jsx';
import NearbyCharacterBlock from './NearbyCharacterBlock.jsx';
import AddSavedNearbyModal from './AddSavedNearbyModal.jsx';
import MakeCardModal from './MakeCardModal.jsx';
import { getWorld } from '../../api/worlds.js';
import {
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  patchSessionStateValue,
} from '../../api/session-state-values.js';
import { fetchDiaryContent } from '../../api/daily-entries.js';
import { useSessionState } from '../../hooks/useSessionState.js';
import { fetchNearby } from '../../api/session-nearby.js';
import { log } from '../../utils/logger.js';

const MotionDiv = motion.div;
const DIARY_TIME_FIELD_KEY = 'diary_time';
const DIARY_RECENT_LIMIT = 5;

/** 将 diary_time 行排到首位，其余行顺序不变 */
function pinDiaryTimeFirst(rows) {
  if (!Array.isArray(rows)) return rows;
  const idx = rows.findIndex((r) => r.field_key === DIARY_TIME_FIELD_KEY);
  if (idx <= 0) return rows;
  const result = [...rows];
  result.unshift(result.splice(idx, 1)[0]);
  return result;
}

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

export default function NearbyPanel({
  worldId,
  sessionId,
  persona,
  stateTick = 0,
  diaryTick = 0,
  stateQueuedTick = 0,
  stateFailedTick = 0,
  onDiaryInject,
}) {
  const { stateData, setStateData, diaryEntries, stateJustChanged, isUpdating } =
    useSessionState(sessionId, stateTick, diaryTick, stateQueuedTick, stateFailedTick);

  const worldRows = useMemo(() => pinDiaryTimeFirst(stateData?.world ?? null), [stateData?.world]);

  const [nearby, setNearby] = useState(null); // null = loading
  const [expandedIds, setExpandedIds] = useState([]);
  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [makeCardOpen, setMakeCardOpen] = useState(false);

  const [diaryOpen, setDiaryOpen] = useState(true);
  const [diaryExpanded, setDiaryExpanded] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [worldName, setWorldName] = useState(null);
  const [nearbySectionOpen, setNearbySectionOpen] = useState(true);

  const reloadNearby = useCallback(() => {
    if (!worldId || !sessionId) {
      setNearby([]);
      return;
    }
    let cancelled = false;
    fetchNearby(worldId, sessionId)
      .then((rows) => {
        if (!cancelled) setNearby(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setNearby([]);
      });
    return () => { cancelled = true; };
  }, [worldId, sessionId]);

  // 拉取 nearby：sessionId / stateTick 变化时
  useEffect(() => {
    let cancelled = false;
    if (!worldId || !sessionId) {
      Promise.resolve().then(() => { if (!cancelled) setNearby([]); });
      return () => { cancelled = true; };
    }
    Promise.resolve().then(() => { if (!cancelled) setNearby(null); });
    fetchNearby(worldId, sessionId)
      .then((rows) => { if (!cancelled) setNearby(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setNearby([]); });
    return () => { cancelled = true; };
  }, [worldId, sessionId, stateTick]);

  useEffect(() => {
    let cancelled = false;
    const p = worldId ? getWorld(worldId) : Promise.resolve(null);
    p.then((w) => { if (!cancelled) setWorldName(worldId ? (w?.name ?? null) : null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [worldId]);

  const templateCtx = useMemo(() => ({
    user: persona?.name ?? '',
    char: '',
    world: worldName ?? '',
  }), [persona?.name, worldName]);

  // sessionId 变化清空已选日记
  useEffect(() => {
    const t = setTimeout(() => setSelectedEntry(null), 0);
    return () => clearTimeout(t);
  }, [sessionId]);

  async function handleResetWorldState() {
    if (!sessionId || worldResetting) return;
    setWorldResetting(true);
    try { setStateData(await resetSessionWorldStateValues(sessionId)); }
    catch (e) { log.error('state.world.reset_failed', e, { toast: e.message || '重置世界状态失败' }); }
    finally { setWorldResetting(false); }
  }

  async function handleResetPersonaState() {
    if (!sessionId || personaResetting) return;
    setPersonaResetting(true);
    try { setStateData(await resetSessionPersonaStateValues(sessionId)); }
    catch (e) { log.error('state.player.reset_failed', e, { toast: e.message || '重置玩家状态失败' }); }
    finally { setPersonaResetting(false); }
  }

  async function handleSaveWorld(fieldKey, valueJson) {
    try {
      await patchSessionStateValue(sessionId, 'world', fieldKey, valueJson);
      setStateData((prev) => prev ? {
        ...prev,
        world: prev.world.map((r) => r.field_key === fieldKey ? { ...r, effective_value_json: valueJson, runtime_value_json: valueJson } : r),
      } : prev);
    } catch (e) { log.error('state.world.update_failed', e, { toast: e.message || '更新世界状态失败' }); }
  }

  async function handleSavePersona(fieldKey, valueJson) {
    try {
      await patchSessionStateValue(sessionId, 'persona', fieldKey, valueJson);
      setStateData((prev) => prev ? {
        ...prev,
        persona: prev.persona.map((r) => r.field_key === fieldKey ? { ...r, effective_value_json: valueJson, runtime_value_json: valueJson } : r),
      } : prev);
    } catch (e) { log.error('state.player.update_failed', e, { toast: e.message || '更新玩家状态失败' }); }
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
      log.error('diary.fetch_failed', e, { toast: e.message || '获取日记内容失败' });
    }
  }

  function toggleExpand(nearbyId) {
    setExpandedIds((prev) =>
      prev.includes(nearbyId) ? prev.filter((id) => id !== nearbyId) : [...prev, nearbyId]
    );
  }

  return (
    <div className="we-cast-panel">
      <div className="we-cast-spine" />

      <div className="we-cast-scroll">

        {/* 世界状态 */}
        <StatusSection
          title="世界"
          rows={worldRows}
          onReset={handleResetWorldState}
          resetting={worldResetting}
          onSave={handleSaveWorld}
          templateCtx={templateCtx}
          collapsible
        />

        {/* 玩家状态 */}
        <StatusSection
          title={persona?.name || '玩家'}
          rows={stateData?.persona ?? null}
          onReset={handleResetPersonaState}
          resetting={personaResetting}
          onSave={handleSavePersona}
          templateCtx={templateCtx}
          collapsible
        />

        {/* 附近 */}
        <div className="we-state-section we-nearby-section">
          <div
            className="we-state-section-title"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setNearbySectionOpen((o) => !o)}
          >
            <Chevron open={nearbySectionOpen} />
            <span className="we-section-label">附近</span>
            <span className="we-section-rule" />
            <button
              type="button"
              className="we-state-section-reset"
              onClick={(e) => { e.stopPropagation(); setAddModalOpen(true); }}
              aria-label="从角色卡添加"
              title="从角色卡添加"
            >
              ＋角色卡
            </button>
            <button
              type="button"
              className="we-state-section-reset"
              onClick={(e) => { e.stopPropagation(); setMakeCardOpen(true); }}
              aria-label="制卡"
              title="制卡"
            >
              制卡
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateRows: nearbySectionOpen ? '1fr' : '0fr',
              transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ overflow: 'hidden', minHeight: 0 }}>
              <div className="we-cast-characters">
                {nearby === null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[80, 65, 70].map((w, i) => (
                      <div key={i} className="we-skel" style={{ height: 12, width: `${w}%` }} />
                    ))}
                  </div>
                )}
                {nearby !== null && nearby.length === 0 && (
                  <p className="we-cast-empty">暂无附近角色</p>
                )}
                {nearby !== null && nearby.map((n) => (
                  <NearbyCharacterBlock
                    key={n.id}
                    worldId={worldId}
                    sessionId={sessionId}
                    nearby={n}
                    expanded={expandedIds.includes(n.id)}
                    onToggle={() => toggleExpand(n.id)}
                    onChange={reloadNearby}
                    templateCtx={templateCtx}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* TIMELINE */}
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
            <AddSavedNearbyModal
              worldId={worldId}
              sessionId={sessionId}
              nearby={nearby ?? []}
              onAdded={() => { setAddModalOpen(false); reloadNearby(); }}
              onClose={() => setAddModalOpen(false)}
            />
          )}
          {makeCardOpen && (
            <MakeCardModal
              worldId={worldId}
              sessionId={sessionId}
              nearby={nearby ?? []}
              onClose={() => setMakeCardOpen(false)}
              onDone={() => { setMakeCardOpen(false); reloadNearby(); }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* 悬浮状态卡（与 CastPanel 一致） */}
      <AnimatePresence>
        {(isUpdating || stateJustChanged) && (
          <MotionDiv
            key="nearby-state-overlay"
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
