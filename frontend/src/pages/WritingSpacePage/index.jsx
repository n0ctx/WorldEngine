import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../layout/PageLayout.jsx';
import NearbyPanel from './components/NearbyPanel.jsx';
import WorldTimelinePanel from '../../components/session/WorldTimelinePanel.jsx';
import { Plus } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { log } from '../../core/utils/logger.js';
import { usePageConfig } from '../../core/hooks/usePageConfig.js';
import { useConversationPageState } from '../../core/hooks/useConversationPageState.js';
import { useWritingStream } from './hooks/useWritingStream.js';
import WritingSpaceConversationPane from './components/WritingSpaceConversationPane.jsx';
import { useWritingSpaceLifecycle, useWritingSpaceMode } from './hooks/useWritingSpaceLifecycle.js';

export default function WritingSpacePage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const config = usePageConfig('writing');
  useWritingSpaceMode();

  const pageState = useConversationPageState();
  const { inputBoxRef, messageListRef, memory } = pageState;

  const { memoryRecalling, memoryWriting, recallSummary } = memory;

  const stream = useWritingStream({ worldId, messageListRef, inputBoxRef, memory });
  const lifecycle = useWritingSpaceLifecycle({ worldId, stream, log });
  const { persona } = lifecycle;
  const {
    currentSession, setCurrentSession, setPendingDiaryInject, stateTick, diaryTick,
    stateQueuedTick, stateFailedTick,
  } = stream;

  return (
    <PageLayout
      leftLabel="故事线列表"
      rightLabel="附近角色与状态"
      left={(
        <WorldTimelinePanel
          worldId={worldId}
          currentMode="writing"
          currentSessionId={currentSession?.id}
          onActiveSessionDeleted={lifecycle.handleActiveWritingSessionDeleted}
          onActiveSessionRenamed={(title) => setCurrentSession((prev) => (prev ? { ...prev, title } : prev))}
          headerRight={(
            <Button size="sm" variant="secondary" className="we-session-list-create" onClick={lifecycle.handleCreateWritingSession} aria-label="新建故事线">
              <Plus size={16} />
              新建故事线
            </Button>
          )}
        />
      )}
      recall={{ memoryRecalling, memoryWriting, recallSummary }}
      main={(
        <WritingSpaceConversationPane
          worldId={worldId}
          navigate={navigate}
          config={config}
          pageState={pageState}
          lifecycle={lifecycle}
          stream={stream}
        />
      )}
      right={(
        <NearbyPanel
          worldId={worldId}
          sessionId={currentSession?.id}
          stateTick={stateTick}
          diaryTick={diaryTick}
          stateQueuedTick={stateQueuedTick}
          stateFailedTick={stateFailedTick}
          persona={persona}
          onDiaryInject={setPendingDiaryInject}
        />
      )}
    />
  );
}
