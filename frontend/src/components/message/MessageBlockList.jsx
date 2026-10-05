import StreamingMarkdown, { StreamCaret } from './StreamingMarkdown.jsx';
import InterruptedMark from './InterruptedMark.jsx';

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
  onTypedOut,
}) {
  const lastBlockIndex = blocks.length - 1;
  // 收尾的时机跟着最后一段正文走，生成结束后才交给它；思考块之后没有正文时不收尾
  const lastTextIndex = blocks.findLastIndex((block) => block.type !== 'thinking' && block.content);

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
                onTypedOut={i === lastTextIndex && !isStreaming ? onTypedOut : undefined}
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
