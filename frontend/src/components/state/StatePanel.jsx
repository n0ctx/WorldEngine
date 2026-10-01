import { useCallback, useState } from 'react';

import useStore from '../../core/state/index.js';
import { resetSessionCharacterStateValues } from '../../core/api/session-state-values.js';
import { useStateMemoryPanelData } from '../../core/hooks/useStateMemory.js';
import SessionStatePanel from './SessionStatePanel.jsx';
import EntityStateBlock from './EntityStateBlock.jsx';
import StateMemoryDynamicState from './StateMemoryDynamicState.jsx';
import useEntitySections from './useEntitySections.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { ResetAction } from './panel-parts.jsx';
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

export default function StatePanel({ sessionId, character, worldId, persona, onDiaryInject }) {
  const tick = useStore((s) => s.memoryRefreshTick);
  const queuedTick = useStore((s) => s.stateQueuedRefreshTick);
  const failedTick = useStore((s) => s.stateFailedTick);
  const [charResetting, setCharResetting] = useState(false);

  const {
    stateMemory, reloadStateMemory, stateMemorySchema: schema, entityDiff,
  } = useStateMemoryPanelData(sessionId, tick);
  const mainCharacterEntity = stateMemory?.entities?.find((e) => e.card_id === character?.id) ?? null;

  const { sections: npcSections, modals: npcModals } = useEntitySections({
    sessionId,
    worldId,
    stateMemory,
    reload: reloadStateMemory,
    schema,
    diffKeys: entityDiff,
    mainCharacterId: character?.id ?? null,
  });

  // 角色区块是对话模式独有：写作模式的角色在「附近角色」里按人分 tab
  const extraSections = useCallback(({ stateData, setStateData, stateDiff, stateError, templateCtx, renderLoadError, saveStateValue }) => {
    async function handleResetChar() {
      if (!sessionId || charResetting) return;
      setCharResetting(true);
      try {
        setStateData(await resetSessionCharacterStateValues(sessionId));
      } catch (e) { log.error('state.character.reset_failed', e, { toast: e.message || '重置角色状态失败' }); }
      finally { setCharResetting(false); }
    }

    const userProps = {
      userRows: stateData?.character ?? [],
      userChangedKeys: new Set(stateDiff.character.map((change) => change.row.field_key)),
      onSaveUserRow: (fieldKey, valueJson, characterId) =>
        saveStateValue('character', fieldKey, valueJson, characterId ?? character?.id),
      templateCtx,
    };

    function renderCharacterBody() {
      if (stateError) return renderLoadError('角色状态加载失败');
      if (!mainCharacterEntity) {
        return <StateMemoryDynamicState {...userProps} gridLayout />;
      }
      return (
        <EntityStateBlock
          sessionId={sessionId}
          entity={mainCharacterEntity}
          schema={schema}
          entities={stateMemory.entities}
          relations={stateMemory.relations ?? []}
          diffKeys={entityDiff}
          reload={reloadStateMemory}
          {...userProps}
        />
      );
    }

    return [{
      key: 'character',
      label: character?.name || '角色',
      actions: <ResetAction onClick={handleResetChar} busy={charResetting} />,
      content: (
        <div className="we-panel-tab-body">
          <div className="p-1">
            {character ? renderCharacterBody() : <EmptyState size="sm" title="尚未选择角色" />}
          </div>
        </div>
      ),
    }, ...npcSections];
  }, [character, charResetting, sessionId, mainCharacterEntity, stateMemory, schema, entityDiff, reloadStateMemory, npcSections]);

  return (
    <SessionStatePanel
      sessionId={sessionId}
      worldId={worldId}
      persona={persona}
      charName={character?.name ?? ''}
      ticks={{ state: tick, diary: tick, queued: queuedTick, failed: failedTick }}
      diaryScope="chat"
      classNames={CLASS_NAMES}
      stateMemory={stateMemory}
      reloadStateMemory={reloadStateMemory}
      stateMemorySchema={schema}
      entityDiff={entityDiff}
      extraSections={extraSections}
      belowTabs={npcModals}
      onDiaryInject={onDiaryInject}
    />
  );
}
