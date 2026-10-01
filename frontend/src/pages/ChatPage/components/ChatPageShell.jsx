import { Plus } from 'lucide-react';
import Button from '../../../components/ui/Button.jsx';
import WorldTimelinePanel from '../../../components/session/WorldTimelinePanel.jsx';
import PageLayout from '../../layout/PageLayout.jsx';
import StatePanel from '../../../components/state/StatePanel.jsx';

export default function ChatPageShell({
  character,
  persona,
  currentSessionId,
  clearActiveSession,
  setCurrentSession,
  onCreateSession,
  memoryRecall,
  onDiaryInject,
  main,
}) {
  return (
    <PageLayout
      leftLabel="会话列表"
      rightLabel="状态面板"
      left={(
        <WorldTimelinePanel
          worldId={character?.world_id ?? null}
          currentMode="chat"
          currentSessionId={currentSessionId}
          onActiveSessionDeleted={clearActiveSession}
          onActiveSessionRenamed={(title) => setCurrentSession((prev) => (prev ? { ...prev, title } : prev))}
          headerRight={(
            <Button size="sm" variant="secondary" className="we-session-list-create" onClick={onCreateSession}>
              <Plus size={16} />
              新建会话
            </Button>
          )}
        />
      )}
      recall={memoryRecall}
      main={main}
      right={(
        <StatePanel
          sessionId={currentSessionId}
          character={character}
          persona={persona}
          worldId={character?.world_id ?? null}
          onDiaryInject={onDiaryInject}
        />
      )}
    />
  );
}
