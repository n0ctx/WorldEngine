import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { IconPlus, IconRotateCw } from '../../../components/ui/icons.jsx';

import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import SessionStatePanel from '../../../components/state/SessionStatePanel.jsx';
import useEntitySections from '../../../components/state/useEntitySections.jsx';
import AddEntityFromCardModal from './AddEntityFromCardModal.jsx';
import { useStateMemoryPanelData } from '../../../core/hooks/useStateMemory.js';

const CLASS_NAMES = {
  panel: 'we-cast-panel',
  scroll: 'we-cast-scroll',
  diaryEntry: 'we-diary-entry',
  diaryMore: 'we-cast-diary-more',
  overlayKey: 'nearby-state-overlay',
  overlay: 'we-cast-state-overlay',
  overlayChipStyle: { display: 'flex', alignItems: 'center', gap: 7, userSelect: 'none' },
  overlayText: 'we-cast-state-overlay-text',
};

/** 没有在场或置顶角色时的占位 tab：加载中给骨架，加载失败给重试，否则给一句引导 */
function EmptyNearbyTab({ loading, error, onRetry }) {
  return (
    <div className="we-panel-tab-body">
      <div className="p-1">
        {loading ? (
          <Skeleton lines={[80, 65, 70]} />
        ) : error ? (
          <div className="we-cast-error">
            <p className="we-field-error">{error}</p>
            <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
              <IconRotateCw size={11} /><span>重试</span>
            </Button>
          </div>
        ) : (
          <EmptyState size="sm" title="AI 记录到的在场角色和你置顶的角色会显示在这里" />
        )}
      </div>
    </div>
  );
}

/**
 * 写作模式侧栏：状态栏公共壳 + 「在场 + 置顶」的角色实体页签（useEntitySections，
 * 与对话模式的 NPC 页签共用同一套渲染），外加写作模式独有的「从角色卡添加」全局操作。
 */
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
  const [addModalOpen, setAddModalOpen] = useState(false);

  const {
    stateMemory, stateMemoryError, stateMemoryLoading, reloadStateMemory, stateMemorySchema, entityDiff,
  } = useStateMemoryPanelData(sessionId, stateTick);

  const { sections: npcSections, modals: npcModals } = useEntitySections({
    sessionId,
    worldId,
    stateMemory,
    reload: reloadStateMemory,
    schema: stateMemorySchema,
    diffKeys: entityDiff,
    mainCharacterId: null,
  });

  const addNearbyGlobalAction = (
    <IconButton size="sm" label="从角色卡添加" onClick={() => setAddModalOpen(true)}>
      <IconPlus size={16} />
    </IconButton>
  );

  const extraSections = () => (
    npcSections.length > 0
      ? npcSections
      : [{
        key: 'nearby',
        label: '附近',
        content: <EmptyNearbyTab loading={stateMemoryLoading} error={stateMemoryError} onRetry={reloadStateMemory} />,
      }]
  );

  const belowTabs = (
    <>
      <AnimatePresence>
        {addModalOpen && (
          <AddEntityFromCardModal
            worldId={worldId}
            sessionId={sessionId}
            entities={stateMemory?.entities ?? []}
            onAdded={() => { setAddModalOpen(false); reloadStateMemory(); }}
            onClose={() => setAddModalOpen(false)}
          />
        )}
      </AnimatePresence>
      {npcModals}
    </>
  );

  return (
    <SessionStatePanel
      sessionId={sessionId}
      worldId={worldId}
      persona={persona}
      ticks={{ state: stateTick, diary: diaryTick, queued: stateQueuedTick, failed: stateFailedTick }}
      diaryScope="writing"
      classNames={CLASS_NAMES}
      stateMemory={stateMemory}
      reloadStateMemory={reloadStateMemory}
      stateMemorySchema={stateMemorySchema}
      entityDiff={entityDiff}
      extraSections={extraSections}
      globalActions={addNearbyGlobalAction}
      belowTabs={belowTabs}
      onDiaryInject={onDiaryInject}
    />
  );
}
