import Icon from '../../../components/ui/Icon.jsx';
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
            <button onClick={onCreateSession} className="we-session-list-create">
              <Icon size={16} strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </Icon>
              新建会话
            </button>
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
