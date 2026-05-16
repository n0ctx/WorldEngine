import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import StatusSection from '../../../components/state/StatusSection.jsx';
import PanelCard from '../../../components/ui/PanelCard.jsx';
import NearbyCharacterBlock from './NearbyCharacterBlock.jsx';

import AddSavedNearbyModal from './AddSavedNearbyModal.jsx';
import MakeCardModal from './MakeCardModal.jsx';
import SectionTabs from '../../../components/ui/SectionTabs.jsx';
import { getWorld } from '../../../core/api/worlds.js';
import { getConfig } from '../../../core/api/config.js';
import {
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  patchSessionStateValue,
} from '../../../core/api/session-state-values.js';
import { fetchDiaryContent } from '../../../core/api/daily-entries.js';
import { useSessionState } from '../../../core/hooks/useSessionState.js';
import { fetchNearby, setNearbySaved, removeNearby } from '../../../core/api/session-nearby.js';
import { log } from '../../../core/utils/logger.js';

const MotionDiv = motion.div;
const DIARY_TIME_FIELD_KEY = 'diary_time';
const DIARY_RECENT_LIMIT = 5;

function RefreshIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 4 21 10 15 10" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NotebookIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4z" />
      <line x1="8" y1="4" x2="8" y2="20" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="8" x2="16" y2="16" />
    </svg>
  );
}

/** 将 diary_time 行排到首位，其余行顺序不变 */
function pinDiaryTimeFirst(rows) {
  if (!Array.isArray(rows)) return rows;
  const idx = rows.findIndex((r) => r.field_key === DIARY_TIME_FIELD_KEY);
  if (idx <= 0) return rows;
  const result = [...rows];
  result.unshift(result.splice(idx, 1)[0]);
  return result;
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

const isNearbySaved = (n) => Number(n?.is_saved) === 1;

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
  // saved 角色"在场"集合：本轮 LLM 触达过 state（auto-detect）或刚被手动保存（grace 一轮）的 saved 角色按完整 state tab 显示；
  // 其余 saved 角色降级到底部紧凑列表。Map value: { pinnedAt, pinnedAtTick }
  const [pinnedSavedIds, setPinnedSavedIds] = useState(() => new Map());
  // 上一次 nearby 快照里每个角色的 state_updated_at；用于检测"本轮 LLM 是否触达了某 saved 角色"
  const prevStateUpdatedAtRef = useRef(null);
  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [makeCardOpen, setMakeCardOpen] = useState(false);

  const [diaryExpanded, setDiaryExpanded] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [worldName, setWorldName] = useState(null);
  const [diaryEnabled, setDiaryEnabled] = useState(true);

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

  // 切换会话/世界时清空 pin 与 prev 快照（pin 仅在本次会话内有效）
  useEffect(() => {
    prevStateUpdatedAtRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinnedSavedIds((prev) => (prev.size === 0 ? prev : new Map()));
  }, [worldId, sessionId]);

  // 首次观察（prev 为 null）只记录基线、不做判定，避免恢复会话时把旧 state 误判为本轮触达
  useEffect(() => {
    if (!Array.isArray(nearby)) return;
    const prevMap = prevStateUpdatedAtRef.current;
    const curMap = new Map();
    for (const n of nearby) curMap.set(n.id, n);
    prevStateUpdatedAtRef.current = curMap;
    if (prevMap === null) return;

    // 判定依赖外部异步信号（nearby snapshot + prev ref + stateTick），渲染期无法纯派生
    setPinnedSavedIds((prev) => {
      const next = new Map(prev);
      let changed = false;

      // Phase 1: state_updated_at 相对上一 snapshot 推进过的 saved 角色 → 自动 pin
      for (const n of nearby) {
        if (!isNearbySaved(n)) continue;
        const prevAt = prevMap.get(n.id)?.state_updated_at || 0;
        const curAt = n.state_updated_at || 0;
        if (curAt > prevAt) {
          next.set(n.id, { pinnedStateAt: curAt, pinnedAtTick: stateTick });
          changed = true;
        }
      }

      // Phase 2: stateTick 推进过、且本轮没被 Phase 1 刷新过的旧 pin → 过期降级
      for (const [id, pin] of prev) {
        const row = curMap.get(id);
        if (!row || !isNearbySaved(row)) {
          next.delete(id);
          changed = true;
          continue;
        }
        if (stateTick <= pin.pinnedAtTick) continue;
        const refreshed = next.get(id);
        if (refreshed && refreshed.pinnedAtTick === stateTick) continue;
        if ((row.state_updated_at || 0) <= pin.pinnedStateAt) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [nearby, stateTick]);

  useEffect(() => {
    let cancelled = false;
    const p = worldId ? getWorld(worldId) : Promise.resolve(null);
    p.then((w) => { if (!cancelled) setWorldName(worldId ? (w?.name ?? null) : null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [worldId]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getConfig().then((c) => {
        if (!cancelled) setDiaryEnabled(c?.diary?.writing?.enabled !== false);
      }).catch(() => {});
    };
    load();
    const onConfigUpdated = (e) => {
      const next = e?.detail;
      if (next && typeof next === 'object' && next.diary) {
        setDiaryEnabled(next?.diary?.writing?.enabled !== false);
      } else {
        load();
      }
    };
    window.addEventListener('we:global-config-updated', onConfigUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('we:global-config-updated', onConfigUpdated);
    };
  }, []);

  const templateCtx = useMemo(() => ({
    user: persona?.name ?? '',
    char: '',
    world: worldName ?? '',
  }), [persona?.name, worldName]);

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
    try {
      const content = await fetchDiaryContent(sessionId, entry.date_str);
      setSelectedEntry(entry);
      onDiaryInject?.(content);
    } catch (e) {
      log.error('diary.fetch_failed', e, { toast: e.message || '获取日记内容失败' });
    }
  }

  const renderResetAction = (onClick, busy) => (
    <button
      type="button"
      className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
      onClick={(e) => { e.stopPropagation(); if (!busy) onClick(); }}
      disabled={busy}
    >
      {busy ? '…' : (<><RefreshIcon /><span>重置</span></>)}
    </button>
  );

  const worldTab = (
    <div className="we-panel-tab-body">
      <div className="we-world-frame">
        <PanelCard variant="flush" title={worldName || '世界状态'} actions={renderResetAction(handleResetWorldState, worldResetting)}>
          <StatusSection
            headerless
            gridLayout
            rows={worldRows}
            onSave={handleSaveWorld}
            templateCtx={templateCtx}
          />
        </PanelCard>
      </div>
    </div>
  );

  const playerTab = (
    <div className="we-panel-tab-body">
      <PanelCard variant="headerless">
        <StatusSection
          headerless
          gridLayout
          className="we-status-player"
          rows={stateData?.persona ?? null}
          onSave={handleSavePersona}
          templateCtx={templateCtx}
        />
      </PanelCard>
    </div>
  );

  const addNearbyGlobalAction = (
    <button
      type="button"
      className="we-state-section-reset we-panel-card-action we-panel-card-action--chip we-panel-card-action--icon"
      onClick={() => setAddModalOpen(true)}
      aria-label="从角色卡添加"
      title="从角色卡添加"
    >
      <PlusIcon />
    </button>
  );

  const nearbyToolbarBase = (
    <button
      type="button"
      className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
      onClick={() => setMakeCardOpen(true)}
      aria-label="制卡"
      title="制卡"
    >
      <NotebookIcon /><span>制卡</span>
    </button>
  );

  const handleToggleSavedFor = async (n) => {
    const willSave = !n.is_saved;
    try {
      await setNearbySaved(worldId, sessionId, n.id, willSave);
      // 由未保存 → 保存：把角色加入"待观察" pin，下一轮 LLM 若没动它的 state 再降级
      // 由保存 → 取消保存：去 pin（角色回到 transient，下轮如未出场会被后端清理）
      setPinnedSavedIds((prev) => {
        const next = new Map(prev);
        if (willSave) next.set(n.id, { pinnedStateAt: n.state_updated_at || 0, pinnedAtTick: stateTick });
        else next.delete(n.id);
        return next;
      });
      reloadNearby();
    } catch (err) {
      log.error('nearby.toggle_failed', err, { toast: err?.message || '切换保存失败' });
    }
  };
  const handleRemoveFor = async (n) => {
    try {
      await removeNearby(worldId, sessionId, n.id);
      setPinnedSavedIds((prev) => {
        if (!prev.has(n.id)) return prev;
        const next = new Map(prev);
        next.delete(n.id);
        return next;
      });
      reloadNearby();
    } catch (err) {
      log.error('nearby.remove_failed', err, { toast: err?.message || '移除失败' });
    }
  };
  const nearbyToolbarFor = (n) => {
    const isSaved = isNearbySaved(n);
    return (
      <>
        {nearbyToolbarBase}
        <button
          type="button"
          className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
          onClick={() => handleToggleSavedFor(n)}
          title={isSaved
            ? '取消保存（角色回到当前登场池；下轮如未出场会被自动清理）'
            : '保存到附近角色池（之后只在被召回时进入提示词）'}
        >
          {isSaved ? <><CancelIcon /><span>取消保存</span></> : <><SaveIcon /><span>保存</span></>}
        </button>
        <button
          type="button"
          className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
          onClick={() => handleRemoveFor(n)}
          title="移除（物理删除，下轮不再注入）"
        >
          <TrashIcon /><span>移除</span>
        </button>
      </>
    );
  };

  const { fullStateChars, demotedSavedNearby } = useMemo(() => {
    const list = Array.isArray(nearby) ? nearby : [];
    const full = [];
    const demoted = [];
    for (const n of list) {
      if (!isNearbySaved(n) || pinnedSavedIds.has(n.id)) full.push(n);
      else demoted.push(n);
    }
    return { fullStateChars: full, demotedSavedNearby: demoted };
  }, [nearby, pinnedSavedIds]);

  const perCharSections = fullStateChars.map((n) => {
    const name = n.name || '未命名';
    return {
    key: n.id,
    label: name,
    actions: nearbyToolbarFor(n),
    content: (
      <div className="we-panel-tab-body we-nearby-tab">
        <PanelCard variant="headerless">
          <div className="we-cast-characters">
            <NearbyCharacterBlock
              worldId={worldId}
              sessionId={sessionId}
              nearby={n}
              onChange={reloadNearby}
              templateCtx={templateCtx}
            />
          </div>
        </PanelCard>
      </div>
    ),
    };
  });

  const emptyNearbyTab = (
    <div className="we-panel-tab-body we-nearby-tab">
      <PanelCard variant="headerless">
        {nearby === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[80, 65, 70].map((w, i) => (
              <div key={i} className="we-skel" style={{ height: 12, width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <p className="we-cast-empty">暂无附近角色</p>
        )}
      </PanelCard>
    </div>
  );

  const hasDiary = Array.isArray(diaryEntries) && diaryEntries.length > 0;
  const reversedDiary = hasDiary ? [...diaryEntries].reverse() : [];
  const recentDiary = reversedDiary.slice(0, DIARY_RECENT_LIMIT);
  const olderDiary = reversedDiary.slice(DIARY_RECENT_LIMIT);
  const hasMore = olderDiary.length > 0;

  const diaryTab = (
    <div className="we-panel-tab-body">
      <PanelCard variant="headerless">
      <div className="we-timeline we-timeline--in-card">
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
      </PanelCard>
    </div>
  );

  const hasTransient = fullStateChars.length > 0;
  const sections = [
    {
      key: 'player',
      label: persona?.name || '玩家',
      content: playerTab,
      actions: renderResetAction(handleResetPersonaState, personaResetting),
    },
    ...(hasTransient
      ? perCharSections
      : [{ key: 'nearby', label: '附近', content: emptyNearbyTab, actions: nearbyToolbarBase }]),
    ...(diaryEnabled ? [{ key: 'diary', label: '日记', content: diaryTab }] : []),
  ];

  return (
    <div className="we-cast-panel">
      <div className="we-cast-spine" />

      <div className="we-cast-scroll">
        {worldTab}
        <div className="we-cast-fleuron we-chapter-divider we-fleuron--visible" aria-hidden="true">
          <span className="we-fleuron-line" />
          <span className="we-fleuron-symbol">❦</span>
          <span className="we-fleuron-line" />
        </div>
        <div className="we-cast-card">
          <SectionTabs sections={sections} defaultKey="player" globalActions={addNearbyGlobalAction} />
        </div>

        {demotedSavedNearby.length > 0 && (
          <div className="we-saved-nearby">
            <div className="we-saved-nearby-title">已保存角色</div>
            <ul className="we-saved-nearby-list">
              {demotedSavedNearby.map((n) => (
                <li key={n.id} className="we-saved-nearby-item">
                  <span className="we-saved-nearby-name">{n.name || '未命名'}</span>
                  <button
                    type="button"
                    className="we-state-section-reset we-saved-nearby-cancel"
                    onClick={() => handleToggleSavedFor(n)}
                    title="取消保存（角色回到当前登场池；下轮如未出场会被自动清理）"
                    aria-label="取消保存"
                  >
                    <CancelIcon />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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
