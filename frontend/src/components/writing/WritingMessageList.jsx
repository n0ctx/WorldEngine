import { useEffect, useRef } from 'react';
import WritingMessageItem from './WritingMessageItem.jsx';

export default function WritingMessageList({ messages, isGenerating, streamingText }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  if (messages.length === 0 && !isGenerating) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary opacity-30">
        <p className="text-sm font-serif italic">输入提示词开始创作…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {messages.map((msg) => (
          <WritingMessageItem key={msg.id} message={msg} />
        ))}
        {isGenerating && (
          <WritingMessageItem
            message={{ id: '__streaming', role: 'assistant', content: '' }}
            isStreaming
            streamingText={streamingText}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
