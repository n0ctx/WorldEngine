import StreamingMarkdown, { StreamCaret } from '../chat/StreamingMarkdown.jsx';
import InterruptedMark from '../chat/InterruptedMark.jsx';

export default function MessageBlockList({
  blocks,
  interrupted,
  showThinking,
  isStreaming,
  showCaret,
  trailingCaret,
  ThinkBlock,
  remarkPlugins,
  rehypePlugins,
  components,
}) {
  const lastBlockIndex = blocks.length - 1;

  return (
    <>
      {blocks.map((block, i) => {
        const isLast = i === lastBlockIndex;
        if (block.type === 'thinking') {
          if (!showThinking) return interrupted && isLast ? <InterruptedMark key={i} /> : null;
          return (
            <ThinkBlock
              key={i}
              content={block.content}
              open={isStreaming && block.open}
              streaming={isStreaming}
              caret={showCaret && isStreaming && isLast && block.open}
              interrupted={interrupted && isLast}
            />
          );
        }
        return (
          <div key={i}>
            {block.content && (
              <StreamingMarkdown
                streaming={isStreaming}
                caret={showCaret && isLast}
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={components}
              >
                {block.content}
              </StreamingMarkdown>
            )}
            {interrupted && isLast && <InterruptedMark />}
          </div>
        );
      })}
      {trailingCaret && <div><StreamCaret /></div>}
    </>
  );
}
