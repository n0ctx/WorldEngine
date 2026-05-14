/* 记忆检索状态指示器 — book-spread shell 独有装饰，由 PageLayout
 * 的 recall slot 注入到 left page 底部。 */
const Dots = () => (
  <>
    <span className="typing-dot typing-dot-accent" />
    <span className="typing-dot typing-dot-accent" />
    <span className="typing-dot typing-dot-accent" />
  </>
);

const Wrap = ({ children }) => (
  <div className="we-memory-recall">{children}</div>
);

export default function MemoryRecallOverlay({
  memoryRecalling = false,
  memoryExpanding = false,
  memoryWriting = false,
  recallSummary = null,
}) {
  const recallParts = [];
  if (recallSummary?.recalled > 0) recallParts.push(`召回 ${recallSummary.recalled} 条`);
  if (recallSummary?.expanded > 0) recallParts.push(`展开 ${recallSummary.expanded} 条`);

  if (memoryRecalling) {
    return <Wrap><Dots /><span className="we-memory-recall__label">正在检索记忆…</span></Wrap>;
  }
  if (memoryExpanding) {
    const label = recallParts.length > 0 ? `${recallParts[0]} · 正在翻阅…` : '正在翻阅历史对话…';
    return <Wrap><Dots /><span className="we-memory-recall__label">{label}</span></Wrap>;
  }
  if (memoryWriting) {
    return <Wrap><Dots /><span className="we-memory-recall__label">正在记录记忆…</span></Wrap>;
  }
  if (recallParts.length > 0) {
    return <Wrap><span className="we-memory-recall__summary">{recallParts.join(' · ')}</span></Wrap>;
  }
  return <Wrap>{null}</Wrap>;
}
