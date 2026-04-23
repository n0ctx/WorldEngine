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
      className={['we-page-left', className].filter(Boolean).join(' ')}
    >
      <SessionListPanel
        character={character}
        currentSessionId={currentSessionId}
        onSessionSelect={onSessionSelect}
        onSessionCreate={onSessionCreate}
        onSessionDelete={onSessionDelete}
      />
      {/* 右侧书脊阴影 — 让中栏更像微微凸起的纸页 */}
      <div className="we-page-left-spine" />
    </div>
  );
}
