/**
 * 写作空间消息条目
 * - assistant 消息：正常小说散文字体，段落间距，无气泡
 * - user 消息：斜体、低透明度，作为提示词展示
 */
export default function WritingMessageItem({ message, isStreaming = false, streamingText = '' }) {
  const content = isStreaming ? streamingText : message.content;
  const isUser = message.role === 'user';

  if (!content) return null;

  // 将文本按段落分割
  const paragraphs = content.split(/\n{2,}/).filter(Boolean);

  return (
    <div className={`we-writing-message ${isUser ? 'we-writing-user' : 'we-writing-assistant'}`}>
      {isUser ? (
        <p className="text-sm italic text-text-secondary opacity-50 leading-relaxed my-2 px-1">
          {content}
        </p>
      ) : (
        <div className="space-y-4 my-4">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-base text-text leading-[1.9] font-serif">
              {para.split('\n').map((line, j, arr) => (
                <span key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-clay opacity-70 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}
    </div>
  );
}
