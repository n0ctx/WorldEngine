import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../layout/PageLayout.jsx';
import NearbyPanel from './components/NearbyPanel.jsx';
import WorldTimelinePanel from '../../components/session/WorldTimelinePanel.jsx';
import Icon from '../../components/ui/Icon.jsx';
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

  const { memoryRecalling, memoryExpanding, memoryWriting, recallSummary } = memory;

  const stream = useWritingStream({ worldId, messageListRef, inputBoxRef, memory });
  const lifecycle = useWritingSpaceLifecycle({ worldId, stream, log });
  const { persona } = lifecycle;
  const {
    currentSession, setCurrentSession, setPendingDiaryInject, stateTick, diaryTick,
    stateQueuedTick, stateFailedTick, savedRecallTick, savedRecallHits,
  } = stream;

  return (
    <PageLayout
      leftLabel="会话列表"
      rightLabel="附近角色与状态"
      left={(
        <WorldTimelinePanel
          worldId={worldId}
          currentMode="writing"
          currentSessionId={currentSession?.id}
          onActiveSessionDeleted={lifecycle.handleActiveWritingSessionDeleted}
          onActiveSessionRenamed={(title) => setCurrentSession((prev) => (prev ? { ...prev, title } : prev))}
          headerRight={(
            <button onClick={lifecycle.handleCreateWritingSession} className="we-session-list-create" aria-label="新建会话">
              <Icon size={16} strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </Icon>
              新建会话
            </button>
          )}
        />
      )}
      recall={{ memoryRecalling, memoryExpanding, memoryWriting, recallSummary }}
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
          savedRecallTick={savedRecallTick}
          savedRecallHits={savedRecallHits}
          persona={persona}
          onDiaryInject={setPendingDiaryInject}
        />
      )}
    />
  );
}
