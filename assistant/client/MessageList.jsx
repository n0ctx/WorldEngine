/**
 * 写卡助手消息列表（单接口模型）
 *
 * 仅渲染 user / assistant / error 三类消息；
 * 计划进度由 PlanDocViewer 单独承载，本组件不再处理 routing/proposal/task 卡。
 */

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function SimpleMarkdown({ content }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-1 break-words leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="my-1 text-[14px] font-semibold">{children}</h1>,
        h2: ({ children }) => <h2 className="my-1 text-[13px] font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="my-1 text-[12px] font-semibold">{children}</h3>,
        ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5 leading-snug">{children}</li>,
        code: ({ inline, children }) =>
          inline ? (
            <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px]">{children}</code>
          ) : (
            <pre className="my-1 overflow-x-auto rounded bg-black/5 p-2 font-mono text-[11px]">
              <code>{children}</code>
            </pre>
          ),
        blockquote: ({ children }) => (
          <blockquote className="my-1 border-l-2 border-[var(--we-vermilion)] pl-3 italic text-[var(--we-ink-muted)]">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-2 border-t border-black/10" />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--we-vermilion)] underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function UserMessage({ msg }) {
  return (
    <div className="mb-2 flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-[12px_12px_2px_12px] bg-[var(--we-vermilion)] px-3 py-2 text-[13px] leading-relaxed text-white">
        {msg.content}
      </div>
    </div>
  );
}

function AssistantMessage({ msg }) {
  return (
    <div className="mb-2 flex justify-start">
      <div className="max-w-[90%] rounded-[2px_12px_12px_12px] border border-black/10 bg-[var(--we-paper-aged)] px-3 py-2 text-[13px] leading-relaxed text-[var(--we-ink-primary)]">
        {msg.streaming && !msg.content ? (
          <div className="we-typing-dots">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : (
          <SimpleMarkdown content={msg.content} />
        )}
      </div>
    </div>
  );
}

function ErrorMessage({ msg }) {
  return (
    <div className="my-2 rounded border border-[rgba(192,57,43,0.2)] bg-[rgba(192,57,43,0.08)] px-3 py-2 text-[12px] text-[#c0392b]">
      {msg.content}
    </div>
  );
}

export default function MessageList({ messages }) {
  const bottomRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-6 text-center text-[13px] text-[var(--we-ink-muted)]">
        <div
          className="text-[14px] italic"
          style={{ fontFamily: 'var(--we-font-display)' }}
        >
          写卡助手
        </div>
        <div className="max-w-[240px] text-[12px] leading-relaxed">
          可以帮你写世界卡、角色卡、全局设置，或回答关于 WorldEngine 的问题
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {messages.map((msg, idx) => {
        const key = msg.id || `${msg.role}-${idx}`;
        if (msg.role === 'user') return <UserMessage key={key} msg={msg} />;
        if (msg.role === 'assistant') return <AssistantMessage key={key} msg={msg} />;
        if (msg.role === 'error') return <ErrorMessage key={key} msg={msg} />;
        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
