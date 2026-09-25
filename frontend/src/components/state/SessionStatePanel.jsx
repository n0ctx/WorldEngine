import { useEffect, useMemo, useState } from 'react';

import SectionTabs from '../ui/SectionTabs.jsx';
import PanelCard from '../ui/PanelCard.jsx';
import StateChangeCard from './StateChangeCard.jsx';
import {
  DiaryEntry,
  ResetAction,
  StateBusyOverlay,
  StateEmpty,
} from './panel-parts.jsx';
import {
  DIARY_RECENT_LIMIT,
  pinDiaryTimeFirst,
  splitDiaryEntries,
  useDiarySelection,
} from './panel-utils.js';
import { getWorld } from '../../core/api/worlds.js';
import { getConfig } from '../../core/api/config.js';
import {
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  patchSessionStateValue,
} from '../../core/api/session-state-values.js';
import { useSessionState } from '../../core/hooks/useSessionState.js';
import { useStateDiff } from '../../core/hooks/useStateDiff.js';
import { log } from '../../core/utils/logger.js';

function useWorldName(worldId) {
  const [worldName, setWorldName] = useState(null);

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
    getWorld(worldId).then((world) => {
      if (!cancelled) setWorldName(world?.name ?? null);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  return worldName;
}

function useDiaryEnabled(diaryScope) {
  const [diaryEnabled, setDiaryEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const readEnabled = (config) => config?.diary?.[diaryScope]?.enabled !== false;
    const load = () => {
      getConfig().then((config) => {
        if (!cancelled) setDiaryEnabled(readEnabled(config));
      }).catch(() => {});
    };
    load();
    const onConfigUpdated = (event) => {
      const next = event?.detail;
      if (next && typeof next === 'object' && next.diary) setDiaryEnabled(readEnabled(next));
      else load();
    };
    window.addEventListener('we:global-config-updated', onConfigUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('we:global-config-updated', onConfigUpdated);
    };
  }, [diaryScope]);

  return diaryEnabled;
}

function StateLoadError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
      <p className="text-sm text-[var(--we-color-text-danger)]">{message}</p>
      <button
        type="button"
        className="we-panel-card-action we-panel-card-action--chip"
        onClick={onRetry}
      >
        重试
      </button>
    </div>
  );
}

function DiaryTab({
  diary,
  classNames,
  diaryInteraction,
}) {
  const {
    selectedEntry,
    handleDiarySelect,
    expanded,
    setExpanded,
  } = diaryInteraction;
  const { entries, error, retry } = diary;
  const { hasDiary, recentDiary, olderDiary, hasMore } = splitDiaryEntries(entries);
  const renderEntry = (entry, index) => (
    <DiaryEntry
      key={entry.date_str}
      entry={entry}
      index={index}
      selected={selectedEntry?.date_str === entry.date_str}
      onSelect={handleDiarySelect}
      className={classNames.diaryEntry}
      style={classNames.diaryEntryStyle}
    />
  );

  return (
    <div className="we-panel-tab-body">
      <PanelCard variant="headerless">
        <div className="we-timeline we-timeline--in-card">
          {entries === null && !error ? (
            <div className="we-skel-stack" aria-busy="true">
              {[85, 65, 90].map((width, index) => (
                <div key={index} className="we-skel we-skel-line" style={{ '--skel-width': `${width}%` }} />
              ))}
            </div>
          ) : error ? (
            <StateLoadError message="日记加载失败" onRetry={retry} />
          ) : !hasDiary ? (
            <p className="we-section-empty">暂无日记</p>
          ) : (
            <div className="we-timeline-list">
              {recentDiary.map((entry, index) => renderEntry(entry, index))}
              {hasMore && (
                <>
                  {expanded && olderDiary.map((entry, index) => renderEntry(entry, DIARY_RECENT_LIMIT + index))}
                  <button
                    type="button"
                    className={classNames.diaryMore}
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                  >
                    {expanded ? '▲ 收起' : `▼ 展开更多（${olderDiary.length} 条）`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </PanelCard>
    </div>
  );
}

/**
 * 会话状态面板的公共壳：世界区块 + 玩家区块 + 日记区块 + 整理中浮层。
 *
 * 两种模式的差异只剩三处，均由入参注入：
 * - `extraSections`：插在玩家与日记之间的区块（对话是角色，写作是附近角色）
 * - `classNames`：两套外观类名（对话 we-state-*，写作 we-cast-*）
 * - `belowTabs` / `globalActions`：写作侧的已保存角色列表与「从角色卡添加」
 */
export default function SessionStatePanel({
  sessionId,
  worldId,
  persona,
  charName = '',
  ticks,
  diaryScope,
  classNames,
  extraSections,
  globalActions = null,
  belowTabs = null,
  onDiaryInject,
}) {
  const {
    stateData,
    setStateData,
    diaryEntries,
    stateError,
    diaryError,
    stateJustChanged,
    isUpdating,
    retryStateLoad,
  } = useSessionState(sessionId, ticks.state, ticks.diary, ticks.queued, ticks.failed);

  const { diff: stateDiff, ready: stateDiffReady } = useStateDiff(stateData, sessionId);

  const worldRows = useMemo(() => pinDiaryTimeFirst(stateData?.world ?? null), [stateData?.world]);

  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);
  const [diaryExpanded, setDiaryExpanded] = useState(false);
  const worldName = useWorldName(worldId);
  const diaryEnabled = useDiaryEnabled(diaryScope);
  const { selectedEntry, handleDiarySelect } = useDiarySelection(sessionId, onDiaryInject);
  const diaryInteraction = {
    selectedEntry,
    handleDiarySelect,
    expanded: diaryExpanded,
    setExpanded: setDiaryExpanded,
  };

  const templateCtx = useMemo(() => ({
    user: persona?.name ?? '',
    char: charName,
    world: worldName ?? '',
  }), [persona?.name, charName, worldName]);

  async function handleResetWorld() {
    if (!sessionId || worldResetting) return;
    setWorldResetting(true);
    try {
      setStateData(await resetSessionWorldStateValues(sessionId));
    } catch (e) { log.error('state.world.reset_failed', e, { toast: e.message || '重置世界状态失败' }); }
    finally { setWorldResetting(false); }
  }

  async function handleResetPersona() {
    if (!sessionId || personaResetting) return;
    setPersonaResetting(true);
    try {
      setStateData(await resetSessionPersonaStateValues(sessionId));
    } catch (e) { log.error('state.player.reset_failed', e, { toast: e.message || '重置玩家状态失败' }); }
    finally { setPersonaResetting(false); }
  }

  // 保存失败要把异常抛回内联编辑器，使其保留编辑态并就地报错
  async function saveStateValue(scope, fieldKey, valueJson, characterId) {
    try {
      await patchSessionStateValue(sessionId, scope, fieldKey, valueJson, characterId);
      setStateData((prev) => prev ? {
        ...prev,
        [scope]: prev[scope].map((r) => r.field_key === fieldKey
          ? { ...r, effective_value_json: valueJson, runtime_value_json: valueJson }
          : r),
      } : prev);
    } catch (e) {
      const label = { world: '世界', persona: '玩家', character: '角色' }[scope];
      log.error(`state.${scope === 'persona' ? 'player' : scope}.update_failed`, e, {
        toast: e.message || `更新${label}状态失败`,
      });
      throw e;
    }
  }

  const renderLoadError = (message) => <StateLoadError message={message} onRetry={retryStateLoad} />;

  const worldTab = (
    <section className="we-state-block we-state-block--world">
      <header className="we-state-block-head">
        <span className="we-state-block-label">{worldName || '世界'}</span>
        <span className="we-section-rule" />
        <ResetAction onClick={handleResetWorld} busy={worldResetting} />
      </header>
      {stateError ? renderLoadError('世界状态加载失败') : (
        <StateChangeCard
          className="we-status-world"
          rows={worldRows}
          changes={stateDiff.world}
          hasBaseline={stateDiffReady}
          onSave={(fieldKey, valueJson) => saveStateValue('world', fieldKey, valueJson)}
          templateCtx={templateCtx}
          emptyContent={<StateEmpty hint="世界状态会随剧情逐步记录" />}
        />
      )}
    </section>
  );

  const playerTab = (
    <div className="we-panel-tab-body">
      <PanelCard variant="headerless">
        {stateError ? renderLoadError('玩家状态加载失败') : (
          <StateChangeCard
            className="we-status-player"
            rows={stateData?.persona ?? null}
            changes={stateDiff.persona}
            hasBaseline={stateDiffReady}
            onSave={(fieldKey, valueJson) => saveStateValue('persona', fieldKey, valueJson)}
            templateCtx={templateCtx}
            emptyContent={<StateEmpty hint="玩家状态会随剧情逐步记录" />}
          />
        )}
      </PanelCard>
    </div>
  );

  const diaryTab = (
    <DiaryTab
      diary={{ entries: diaryEntries, error: diaryError, retry: retryStateLoad }}
      classNames={classNames}
      diaryInteraction={diaryInteraction}
    />
  );

  const sections = [
    {
      key: 'player',
      label: persona?.name || '玩家',
      content: playerTab,
      actions: <ResetAction onClick={handleResetPersona} busy={personaResetting} />,
    },
    ...(extraSections?.({
      stateData,
      setStateData,
      stateDiff,
      stateDiffReady,
      stateError,
      templateCtx,
      renderLoadError,
      saveStateValue,
    }) ?? []),
    ...(diaryEnabled ? [{ key: 'diary', label: '日记', content: diaryTab }] : []),
  ];

  return (
    <div className={classNames.panel}>
      <div className={classNames.scroll}>
        {worldTab}
        <div className="we-state-divider" aria-hidden="true" />
        <section className="we-state-block we-state-block--cast">
          <SectionTabs sections={sections} defaultKey="player" globalActions={globalActions} />
        </section>
        {belowTabs}
      </div>

      <StateBusyOverlay
        isUpdating={isUpdating}
        justChanged={stateJustChanged}
        overlayKey={classNames.overlayKey}
        overlayClassName={classNames.overlay}
        chipClassName={classNames.overlayChip}
        chipStyle={classNames.overlayChipStyle}
        textClassName={classNames.overlayText}
      />
    </div>
  );
}
