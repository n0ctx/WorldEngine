/* DESIGN.md §5.3 §8.2 */
import SessionListPanel from './SessionListPanel.jsx';

export default function PageLeft({
  character,
  currentSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
  className = '',
}) {
  return (
    <div
      style={{
        width: '260px',
        flexShrink: 0,
        background: 'var(--we-paper-aged)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: 'var(--we-radius-sm) 0 0 var(--we-radius-sm)',
        overflow: 'hidden',
        minHeight: 0,
        borderRight: '1px solid var(--we-paper-shadow)',
      }}
      className={className}
    >
      <SessionListPanel
        character={character}
        currentSessionId={currentSessionId}
        onSessionSelect={onSessionSelect}
        onSessionCreate={onSessionCreate}
        onSessionDelete={onSessionDelete}
      />
      {/* 右侧书脊阴影 — 让中栏更像微微凸起的纸页 */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 12,
          background: 'var(--we-spine-shadow-right)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    </div>
  );
}
