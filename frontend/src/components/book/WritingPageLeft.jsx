import WritingSessionList from './WritingSessionList.jsx';
import { useNavigate } from 'react-router-dom';

export default function WritingPageLeft({
  worldId,
  currentSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
}) {
  const navigate = useNavigate();

  return (
    <div className="we-page-left">
      <WritingSessionList
        worldId={worldId}
        currentSessionId={currentSessionId}
        onSessionSelect={onSessionSelect}
        onSessionCreate={onSessionCreate}
        onSessionDelete={onSessionDelete}
        onBack={() => navigate(`/worlds/${worldId}`)}
      />

      {/* 右侧书脊阴影 */}
      <div className="we-page-left-spine" />
    </div>
  );
}
