import WritingSessionList from './WritingSessionList.jsx';
import { useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';

export default function WritingPageLeft({
  worldId,
  currentSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
}) {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-0 flex-[0_0_18%] flex-col overflow-hidden border-r border-[var(--we-paper-shadow)] bg-[var(--we-paper-aged)] min-w-[240px] max-w-[320px]">
      {/* 顶部返回按钮行 */}
      <div className="flex items-center justify-end px-3.5 pt-2.5">
        <button
          onClick={() => navigate(`/worlds/${worldId}`)}
          title="返回角色页"
          className="cursor-pointer rounded border-0 bg-transparent p-1 text-[var(--we-ink-faded)] opacity-60 transition-opacity hover:opacity-100"
        >
          <Icon size={16}>
            <polyline points="15 18 9 12 15 6" />
          </Icon>
        </button>
      </div>

      <WritingSessionList
        worldId={worldId}
        currentSessionId={currentSessionId}
        onSessionSelect={onSessionSelect}
        onSessionCreate={onSessionCreate}
        onSessionDelete={onSessionDelete}
      />

      {/* 右侧书脊阴影 */}
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-[2] w-3 bg-[var(--we-spine-shadow-right)]" />
    </div>
  );
}
