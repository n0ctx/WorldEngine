import { useEffect, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SectionTabs from '../ui/SectionTabs.jsx';

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
import useStore from '../../core/state/index.js';
import {
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  resetSessionCharacterStateValues,
  patchSessionStateValue,
} from '../../core/api/session-state-values.js';
import { fetchDiaryContent } from '../../core/api/daily-entries.js';
import { getWorld } from '../../core/api/worlds.js';
import { getConfig } from '../../core/api/config.js';
import { useSessionState } from '../../core/hooks/useSessionState.js';
import StatusSection from './StatusSection.jsx';
import PanelCard from '../ui/PanelCard.jsx';
import { log } from '../../core/utils/logger.js';


const MotionDiv = motion.div;

const RECENT_LIMIT = 5;

function RefreshIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 4 21 10 15 10" />
    </svg>
  );
}

function EmptyStateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 0 4 21z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 1 20 21z" />
    </svg>
  );
}

// ── 日记条目 ────────────────────────────────────────────────
function DiaryEntry({ entry, index, selected, onSelect }) {
  return (
    <div
      className={`we-timeline-entry we-diary-entry${selected ? ' we-diary-entry--selected' : ''}`}
      style={{
        animationDelay: `${index * 50}ms`,
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
  const queuedTick = useStore((s) => s.stateQueuedRefreshTick);
  const failedTick = useStore((s) => s.stateFailedTick);
  const {
    stateData,
    setStateData,
    diaryEntries,
    stateError,
    diaryError,
    stateJustChanged,
    isUpdating,
    retryStateLoad,
  } = useSessionState(sessionId, tick, tick, queuedTick, failedTick);

  const worldRows = useMemo(() => pinDiaryTimeFirst(stateData?.world ?? null), [stateData?.world]);

  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);
  const [charResetting, setCharResetting] = useState(false);
  const [worldName, setWorldName] = useState(null);
  const [diaryEnabled, setDiaryEnabled] = useState(true);
  const templateCtx = useMemo(() => ({
    user: persona?.name ?? '',
    char: character?.name ?? '',
    world: worldName ?? '',
  }), [persona?.name, character?.name, worldName]);

  const [diaryExpanded, setDiaryExpanded] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!worldId) {
      const timeoutId = setTimeout(() => {
        if (!cancelled) setWorldName(null);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }
    getWorld(worldId).then((w) => {
      if (!cancelled) setWorldName(w?.name ?? null);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getConfig().then((c) => {
        if (!cancelled) setDiaryEnabled(c?.diary?.chat?.enabled !== false);
      }).catch(() => {});
    };
    load();
    const onConfigUpdated = (e) => {
      const next = e?.detail;
      if (next && typeof next === 'object' && next.diary) {
        setDiaryEnabled(next?.diary?.chat?.enabled !== false);
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

  // ── 重置处理 ──────────────────────────────────────────────
  async function handleResetWorld() {
    if (!sessionId || worldResetting) return;
    setWorldResetting(true);
    try {
      const newState = await resetSessionWorldStateValues(sessionId);
      setStateData(newState);
    } catch (e) { log.error('state.world.reset_failed', e, { toast: e.message || '重置世界状态失败' }); }
    finally { setWorldResetting(false); }
  }

  async function handleResetPersona() {
    if (!sessionId || personaResetting) return;
    setPersonaResetting(true);
    try {
      const newState = await resetSessionPersonaStateValues(sessionId);
      setStateData(newState);
    } catch (e) { log.error('state.player.reset_failed', e, { toast: e.message || '重置玩家状态失败' }); }
    finally { setPersonaResetting(false); }
  }

  async function handleResetChar() {
    if (!sessionId || charResetting) return;
    setCharResetting(true);
    try {
      const newState = await resetSessionCharacterStateValues(sessionId);
      setStateData(newState);
    } catch (e) { log.error('state.character.reset_failed', e, { toast: e.message || '重置角色状态失败' }); }
    finally { setCharResetting(false); }
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

  async function handleSaveCharacter(fieldKey, valueJson, characterId) {
    try {
      await patchSessionStateValue(sessionId, 'character', fieldKey, valueJson, characterId ?? character?.id);
      setStateData((prev) => prev ? {
        ...prev,
        character: prev.character.map((r) => r.field_key === fieldKey ? { ...r, effective_value_json: valueJson, runtime_value_json: valueJson } : r),
      } : prev);
    } catch (e) { log.error('state.character.update_failed', e, { toast: e.message || '更新角色状态失败' }); }
  }

  // ── 日记点击注入 ─────────────────────────────────────────
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

  useEffect(() => {
    const timeoutId = setTimeout(() => setSelectedEntry(null), 0);
    return () => clearTimeout(timeoutId);
  }, [sessionId]);

  const hasDiary = Array.isArray(diaryEntries) && diaryEntries.length > 0;
  const reversedDiary = hasDiary ? [...diaryEntries].reverse() : [];
  const recentDiary = reversedDiary.slice(0, RECENT_LIMIT);
  const olderDiary = reversedDiary.slice(RECENT_LIMIT);
  const hasMore = olderDiary.length > 0;

  const renderResetAction = (onClick, busy) => (
    <button
      type="button"
      className="we-state-reset"
      onClick={(e) => { e.stopPropagation(); if (!busy) onClick(); }}
      disabled={busy}
      aria-label="重置本区状态"
      title="重置本区状态"
    >
      {busy ? '…' : (<><RefreshIcon /><span>重置</span></>)}
    </button>
  );

  const renderStateEmpty = (hint) => (
    <div className="we-state-empty">
      <EmptyStateIcon />
      <span className="we-state-empty-hint">{hint}</span>
    </div>
  );

  const renderLoadError = (message) => (
    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
      <p className="text-sm text-[var(--we-color-text-danger)]">{message}</p>
      <button
        type="button"
        className="we-panel-card-action we-panel-card-action--chip"
        onClick={retryStateLoad}
      >
        重试
      </button>
    </div>
  );

  const worldTab = (
    <section className="we-state-block we-state-block--world">
      <header className="we-state-block-head">
        <span className="we-state-block-label">{worldName || '世界'}</span>
        <span className="we-section-rule" />
        {renderResetAction(handleResetWorld, worldResetting)}
      </header>
      {stateError ? renderLoadError('世界状态加载失败') : (
        <StatusSection
          headerless
          gridLayout
          className="we-status-world"
          rows={worldRows}
          onSave={handleSaveWorld}
          templateCtx={templateCtx}
          emptyContent={renderStateEmpty('世界状态会随剧情逐步记录')}
        />
      )}
    </section>
  );

  const playerTab = (
    <div className="we-panel-tab-body">
      <PanelCard variant="headerless">
        {stateError ? renderLoadError('玩家状态加载失败') : (
          <StatusSection
            headerless
            gridLayout
            className="we-status-player"
            rows={stateData?.persona ?? null}
            onSave={handleSavePersona}
            templateCtx={templateCtx}
            emptyContent={renderStateEmpty('玩家状态会随剧情逐步记录')}
          />
        )}
      </PanelCard>
    </div>
  );

  const characterTab = (
    <div className="we-panel-tab-body">
      <PanelCard variant="headerless">
        {character ? (
          stateError ? renderLoadError('角色状态加载失败') : (
            <StatusSection
              headerless
              gridLayout
              className="we-status-character"
              rows={stateData?.character ?? null}
              onSave={handleSaveCharacter}
              templateCtx={templateCtx}
              emptyContent={renderStateEmpty('角色状态会随剧情逐步记录')}
            />
          )
        ) : (
          <p className="we-section-empty">尚未选择角色</p>
        )}
      </PanelCard>
    </div>
  );

  const diaryTab = (
    <div className="we-panel-tab-body">
      <PanelCard variant="headerless">
      <div className="we-timeline we-timeline--in-card">
        {diaryEntries === null ? (
          <div className="we-state-skeleton-list">
            {[85, 65, 90].map((w, i) => (
              <div key={i} className="we-skel we-state-skeleton-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : diaryError ? (
          renderLoadError('日记加载失败')
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
                  className="we-diary-more"
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

  const sections = [
    {
      key: 'player',
      label: persona?.name || '玩家',
      content: playerTab,
      actions: renderResetAction(handleResetPersona, personaResetting),
    },
    {
      key: 'character',
      label: character?.name || '角色',
      content: characterTab,
      actions: renderResetAction(handleResetChar, charResetting),
    },
    ...(diaryEnabled
      ? [{ key: 'diary', label: '日记', content: diaryTab }]
      : []),
  ];

  return (
    <div className="we-state-panel">
      <div className="we-state-spine" />

      <div className="we-state-scroll">
        {worldTab}
        <div className="we-state-divider" aria-hidden="true" />
        <section className="we-state-block we-state-block--cast">
          <SectionTabs sections={sections} defaultKey="player" />
        </section>
      </div>

      <AnimatePresence>
        {(isUpdating || stateJustChanged) && (
          <MotionDiv
            key="state-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="we-state-change-overlay"
          >
            <AnimatePresence mode="wait">
              {isUpdating ? (
                <MotionDiv
                  key="updating"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="we-state-change-chip"
                >
                  <span className="we-state-change-text">整理中</span>
                </MotionDiv>
              ) : (
                <MotionDiv
                  key="done"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="we-state-change-chip"
                >
                  <span className="we-state-change-text">已整理</span>
                </MotionDiv>
              )}
            </AnimatePresence>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
