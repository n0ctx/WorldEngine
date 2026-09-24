import { useCallback, useState } from 'react';

import useStore from '../../core/state/index.js';
import { resetSessionCharacterStateValues } from '../../core/api/session-state-values.js';
import SessionStatePanel from './SessionStatePanel.jsx';
import StateChangeCard from './StateChangeCard.jsx';
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

export default function StatePanel({ sessionId, character, worldId, persona, onDiaryInject }) {
  const tick = useStore((s) => s.memoryRefreshTick);
  const queuedTick = useStore((s) => s.stateQueuedRefreshTick);
  const failedTick = useStore((s) => s.stateFailedTick);
  const [charResetting, setCharResetting] = useState(false);

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
              stateError ? renderLoadError('角色状态加载失败') : (
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
              )
            ) : (
              <p className="we-section-empty">尚未选择角色</p>
            )}
          </PanelCard>
        </div>
      ),
    }];
  }, [character, charResetting, sessionId]);

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
      onDiaryInject={onDiaryInject}
    />
  );
}
