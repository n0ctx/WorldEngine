import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { IconState, IconSummary } from '../ui/icons.jsx';
import Button from '../ui/Button.jsx';
import MiddleSummaryModal from '../session/MiddleSummaryModal.jsx';
import StateMemoryModal from '../session/StateMemoryModal.jsx';

/** 剧情摘要 / 状态记忆入口，各自打开当前会话的弹窗；放在状态面板侧栏的顶行（和收起按钮同一行） */
export default function SessionTools({ sessionId, worldId }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [stateMemoryOpen, setStateMemoryOpen] = useState(false);
  if (!sessionId) return null;

  return (
    <div className="we-state-panel-tools">
      <Button type="button" variant="secondary" size="sm" onClick={() => setSummaryOpen(true)}>
        <IconSummary size={16} />
        剧情摘要
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => setStateMemoryOpen(true)}>
        <IconState size={16} />
        状态记忆
      </Button>
      <AnimatePresence>
        {summaryOpen && (
          <MiddleSummaryModal key="middle-summary-modal" sessionId={sessionId} onClose={() => setSummaryOpen(false)} />
        )}
        {stateMemoryOpen && (
          <StateMemoryModal key="state-memory-modal" sessionId={sessionId} worldId={worldId} onClose={() => setStateMemoryOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
