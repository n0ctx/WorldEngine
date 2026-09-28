import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import useStore from '../../core/state/index.js';
import { resetSessionCharacterStateValues } from '../../core/api/session-state-values.js';
import { useStateMemory, useStateMemorySchema } from '../../core/hooks/useStateMemory.js';
import SessionStatePanel from './SessionStatePanel.jsx';
import StateChangeCard from './StateChangeCard.jsx';
import StateMemoryDynamicState from './StateMemoryDynamicState.jsx';
import useEntitySections from './useEntitySections.jsx';
import PanelCard from '../ui/PanelCard.jsx';
import { ResetAction, StateEmpty } from './panel-parts.jsx';
import { log } from '../../core/utils/logger.js';

const CLASS_NAMES = {
  panel: 'we-state-panel',
  scroll: 'we-state-scroll',
  diaryEntry: 'we-diary-entry',
  diaryMore: 'we-diary-more',
  overlayKey: 'state-overlay',
  overlay: 'we-state-change-overlay',
  overlayChip: 'we-state-change-chip',
  overlayText: 'we-state-change-text',
};

/** 主角色页签的档案组：身份信息以卡片为准，只给一行提示 + 跳转编辑入口 */
function MainCharacterProfileNote({ character }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="we-state-section we-main-character-profile">
      <div className="we-state-section-title">
        <span className="we-section-label">档案</span>
      </div>
      <p className="we-settings-toggle-hint we-sm-card-note">
        身份信息以角色卡为准。
        {character && (
          <button
            type="button"
            className="we-state-section-reset we-main-character-edit-link"
            onClick={() => navigate(`/characters/${character.id}/edit`, { state: { backgroundLocation: location } })}
          >
            编辑角色卡
          </button>
        )}
      </p>
    </div>
  );
}

export default function StatePanel({ sessionId, character, worldId, persona, onDiaryInject }) {
  const tick = useStore((s) => s.memoryRefreshTick);
  const queuedTick = useStore((s) => s.stateQueuedRefreshTick);
  const failedTick = useStore((s) => s.stateFailedTick);
  const [charResetting, setCharResetting] = useState(false);

  const { data: stateMemory, reload: reloadStateMemory } = useStateMemory(sessionId, tick);
  const { schema } = useStateMemorySchema();
  const mainCharacterEntity = stateMemory?.entities?.find((e) => e.card_id === character?.id) ?? null;

  const { sections: npcSections, modals: npcModals } = useEntitySections({
    sessionId,
    worldId,
    stateMemory,
    reload: reloadStateMemory,
    schema,
    mainCharacterId: character?.id ?? null,
  });

  // 角色区块是对话模式独有：写作模式的角色在「附近角色」里按人分 tab
  const extraSections = useCallback(({ stateData, setStateData, stateDiff, stateDiffReady, stateError, templateCtx, renderLoadError, saveStateValue }) => {
    async function handleResetChar() {
      if (!sessionId || charResetting) return;
      setCharResetting(true);
      try {
        setStateData(await resetSessionCharacterStateValues(sessionId));
      } catch (e) { log.error('state.character.reset_failed', e, { toast: e.message || '重置角色状态失败' }); }
      finally { setCharResetting(false); }
    }

    return [{
      key: 'character',
      label: character?.name || '角色',
      actions: <ResetAction onClick={handleResetChar} busy={charResetting} />,
      content: (
        <div className="we-panel-tab-body">
          <PanelCard variant="headerless">
            {character ? (
              <>
                <MainCharacterProfileNote character={character} />
                {mainCharacterEntity && (
                  <div className="we-entity-dynamic">
                    <StateMemoryDynamicState sessionId={sessionId} entity={mainCharacterEntity} reload={reloadStateMemory} />
                  </div>
                )}
                <div className="we-state-section-title">
                  <span className="we-section-label">用户字段</span>
                </div>
                {stateError ? renderLoadError('角色状态加载失败') : (
                  <StateChangeCard
                    className="we-status-character"
                    rows={stateData?.character ?? null}
                    changes={stateDiff.character}
                    hasBaseline={stateDiffReady}
                    onSave={(fieldKey, valueJson, characterId) =>
                      saveStateValue('character', fieldKey, valueJson, characterId ?? character?.id)}
                    templateCtx={templateCtx}
                    emptyContent={<StateEmpty hint="角色状态会随剧情逐步记录" />}
                  />
                )}
              </>
            ) : (
              <p className="we-section-empty">尚未选择角色</p>
            )}
          </PanelCard>
        </div>
      ),
    }, ...npcSections];
  }, [character, charResetting, sessionId, mainCharacterEntity, reloadStateMemory, npcSections]);

  return (
    <SessionStatePanel
      sessionId={sessionId}
      worldId={worldId}
      persona={persona}
      charName={character?.name ?? ''}
      ticks={{ state: tick, diary: tick, queued: queuedTick, failed: failedTick }}
      diaryScope="chat"
      classNames={CLASS_NAMES}
      extraSections={extraSections}
      belowTabs={npcModals}
      onDiaryInject={onDiaryInject}
    />
  );
}
