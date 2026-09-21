import { useEffect, useState, useMemo } from 'react';
import SectionTabs from '../ui/SectionTabs.jsx';
import useStore from '../../core/state/index.js';
import {
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  resetSessionCharacterStateValues,
  patchSessionStateValue,
} from '../../core/api/session-state-values.js';
import { getWorld } from '../../core/api/worlds.js';
import { getConfig } from '../../core/api/config.js';
import { useSessionState } from '../../core/hooks/useSessionState.js';
import { useStateDiff } from '../../core/hooks/useStateDiff.js';
import StateChangeCard from './StateChangeCard.jsx';
import PanelCard from '../ui/PanelCard.jsx';
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
import { log } from '../../core/utils/logger.js';

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

  const { diff: stateDiff, ready: stateDiffReady } = useStateDiff(stateData, sessionId);

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
  const { selectedEntry, handleDiarySelect } = useDiarySelection(sessionId, onDiaryInject);

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

  const { hasDiary, recentDiary, olderDiary, hasMore } = splitDiaryEntries(diaryEntries);

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
        {<ResetAction onClick={handleResetWorld} busy={worldResetting} />}
      </header>
      {stateError ? renderLoadError('世界状态加载失败') : (
        <StateChangeCard
          className="we-status-world"
          rows={worldRows}
          changes={stateDiff.world}
          hasBaseline={stateDiffReady}
          onSave={handleSaveWorld}
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
            onSave={handleSavePersona}
            templateCtx={templateCtx}
            emptyContent={<StateEmpty hint="玩家状态会随剧情逐步记录" />}
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
            <StateChangeCard
              className="we-status-character"
              rows={stateData?.character ?? null}
              changes={stateDiff.character}
              hasBaseline={stateDiffReady}
              onSave={handleSaveCharacter}
              templateCtx={templateCtx}
              emptyContent={<StateEmpty hint="角色状态会随剧情逐步记录" />}
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
                className="we-diary-entry"
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
                    className="we-diary-entry"
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
      actions: <ResetAction onClick={handleResetPersona} busy={personaResetting} />,
    },
    {
      key: 'character',
      label: character?.name || '角色',
      content: characterTab,
      actions: <ResetAction onClick={handleResetChar} busy={charResetting} />,
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

      <StateBusyOverlay
        isUpdating={isUpdating}
        justChanged={stateJustChanged}
        overlayKey="state-overlay"
        overlayClassName="we-state-change-overlay"
        chipClassName="we-state-change-chip"
        textClassName="we-state-change-text"
      />
    </div>
  );
}
