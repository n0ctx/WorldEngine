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
    <div
      style={{
        flex: '0 0 18%',
        minWidth: '240px',
        maxWidth: '320px',
        background: 'var(--we-paper-aged)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 0,
        borderRight: '1px solid var(--we-paper-shadow)',
      }}
    >
      {/* 顶部返回按钮行 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '10px 14px 0',
      }}>
        <button
          onClick={() => navigate(`/worlds/${worldId}`)}
          title="返回角色页"
          style={{
            padding: 4, borderRadius: 4,
            color: 'var(--we-ink-faded)',
            background: 'none', border: 'none',
            cursor: 'pointer', opacity: 0.6,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
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
      <div style={{
        position: 'absolute',
        right: 0, top: 0, bottom: 0, width: 12,
        background: 'var(--we-spine-shadow-right)',
        pointerEvents: 'none',
        zIndex: 2,
      }} />
    </div>
  );
}
