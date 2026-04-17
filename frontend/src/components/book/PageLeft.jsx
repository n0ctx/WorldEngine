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
      {/* 右侧书脊阴影 — DESIGN §8.2 */}
    </div>
  );
}
