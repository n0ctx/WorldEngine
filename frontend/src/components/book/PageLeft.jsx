/* DESIGN.md §5.3 §8.2 */
import SessionListPanel from './SessionListPanel.jsx';

export default function PageLeft({
  character,
  currentSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
  memoryRecalling = false,
  memoryExpanding = false,
  memoryWriting = false,
  recallSummary = null,
  className = '',
}) {
  const recallParts = [];
  if (recallSummary?.recalled > 0) recallParts.push(`召回 ${recallSummary.recalled} 条`);
  if (recallSummary?.expanded > 0) recallParts.push(`展开 ${recallSummary.expanded} 条`);
  const isActive = memoryRecalling || memoryExpanding || memoryWriting;
  const showStatic = !isActive && recallParts.length > 0;

  const dots = (
    <>
      <span className="typing-dot typing-dot-accent" />
      <span className="typing-dot typing-dot-accent" />
      <span className="typing-dot typing-dot-accent" />
    </>
  );

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

      {/* 记忆状态指示器 */}
      <div className="pointer-events-none flex items-center justify-center gap-2 py-2 min-h-[32px] text-xs">
        {memoryRecalling ? (
          <>{dots}<span className="text-accent/75">正在检索记忆…</span></>
        ) : memoryExpanding ? (
          <>{dots}<span className="text-accent/75">{recallParts.length > 0 ? `${recallParts[0]} · 正在翻阅…` : '正在翻阅历史对话…'}</span></>
        ) : memoryWriting ? (
          <>{dots}<span className="text-accent/75">正在记录记忆…</span></>
        ) : showStatic ? (
          <span className="text-text-secondary opacity-55">{recallParts.join(' · ')}</span>
        ) : null}
      </div>

      {/* 右侧书脊阴影 — 让中栏更像微微凸起的纸页 */}
      <div className="we-page-left-spine" />
    </div>
  );
}
