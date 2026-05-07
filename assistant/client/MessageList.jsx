/**
 * 写卡助手消息列表（单接口模型）
 *
 * 仅渲染 user / assistant / error 三类消息；
 * 计划进度由 PlanDocViewer 单独承载，本组件不再处理 routing/proposal/task 卡。
 *
 * 交互恢复（批 A）：
 *   - 气泡入场动效（we-bubble-in）
 *   - typing dots（流式开始 + 首字未到时）
 *   - 流式光标（首字到达后）
 *   - hover 显示按钮：
 *       user      → 复制 / 编辑 / 删除
 *       assistant → 复制 / 重新生成 / 删除
 *   - 编辑 user 消息确认后自动重新生成（由 AssistantPanel 的 onEdit 实现）
 *   - 删除采用两段确认（首次"确认？"，2 秒内再次点击才真正删除）
 */

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function parseStreamingBlocks(text) {
  const blocks = [];
  const OPEN_TAG = /^<\s*think(?:ing)?\s*>$/i;
  const CLOSE_TAG = /^<\s*\/\s*think(?:ing)?\s*>$/i;
  const segments = text.split(/(<\s*think(?:ing)?\s*>|<\s*\/\s*think(?:ing)?\s*>)/i);
  let inThink = false;
  let current = '';
  for (const seg of segments) {
    if (OPEN_TAG.test(seg)) {
      const trimmed = current.replace(/^\n+/, '');
      if (trimmed) blocks.push({ type: 'text', content: trimmed, open: false });
      current = '';
      inThink = true;
    } else if (CLOSE_TAG.test(seg)) {
      if (inThink) {
        blocks.push({ type: 'thinking', content: current, open: false });
        current = '';
        inThink = false;
      }
    } else {
      current += seg;
    }
  }
  if (inThink) {
    blocks.push({ type: 'thinking', content: current, open: true });
  } else {
    const trimmed = current.replace(/^\n+/, '');
    if (trimmed) blocks.push({ type: 'text', content: trimmed, open: false });
  }
  return blocks.length > 0 ? blocks : [{ type: 'text', content: text, open: false }];
}

function ThinkBlock({ content, open = false }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="we-think-block">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? '折叠思考过程' : '展开思考过程'}
        aria-expanded={expanded}
        className="we-think-block-toggle"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`we-think-block-chevron${expanded ? ' we-think-block-chevron--expanded' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        思考过程{open && <span className="we-think-block-dots">…</span>}
      </button>
      <div className={`we-think-block-body-wrap${expanded ? ' we-think-block-body-wrap--open' : ''}`}>
        <div className="we-think-block-body-inner">
          <div className="we-think-block-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

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

function ActionBtn({ onClick, danger, children, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`rounded border border-black/12 bg-transparent px-1.5 py-0.5 text-[11px] leading-tight transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--we-vermilion)] ${
        danger ? 'text-[var(--we-vermilion)]' : 'text-[var(--we-ink-muted)]'
      }`}
    >
      {children}
    </button>
  );
}

function CopyBtn({ getText }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  function copy() {
    try {
      navigator.clipboard?.writeText?.(getText());
    } catch {
      // 静默失败：浏览器无 clipboard 权限
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return (
    <ActionBtn onClick={copy} ariaLabel="复制">
      {copied ? '已复制' : '复制'}
    </ActionBtn>
  );
}

function DeleteBtn({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);
  function handleClick() {
    if (confirming) {
      clearTimeout(timerRef.current);
      setConfirming(false);
      onDelete();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 2000);
    }
  }
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return (
    <ActionBtn onClick={handleClick} danger ariaLabel="删除">
      {confirming ? '确认？' : '删除'}
    </ActionBtn>
  );
}

function ActionBar({ children }) {
  return (
    <div className="mt-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
      {children}
    </div>
  );
}

function UserMessage({ msg, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const taRef = useRef(null);

  function startEdit() {
    setDraft(msg.content);
    setEditing(true);
  }
  function confirmEdit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== (msg.content || '').trim()) {
      onEdit?.(msg.id, trimmed);
    }
  }
  function cancelEdit() {
    setEditing(false);
  }

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.style.height = 'auto';
      taRef.current.style.height = `${taRef.current.scrollHeight}px`;
    }
  }, [editing]);

  return (
    <div className="mb-2 flex animate-[we-bubble-in_0.2s_ease-out] justify-end">
      <div className={editing ? 'w-[85%]' : 'group flex max-w-[80%] flex-col items-end'}>
        {editing ? (
          <div>
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  confirmEdit();
                }
              }}
              rows={2}
              className="w-full resize-none rounded border border-[var(--we-vermilion)] bg-[var(--we-paper-base)] px-2 py-1.5 text-[13px] leading-relaxed text-[var(--we-ink-primary)] outline-none"
            />
            <div className="mt-1 flex justify-end gap-1">
              <ActionBtn onClick={cancelEdit} ariaLabel="取消编辑">取消</ActionBtn>
              <ActionBtn onClick={confirmEdit} ariaLabel="确认编辑">确认</ActionBtn>
            </div>
          </div>
        ) : (
          <>
            <div className="whitespace-pre-wrap break-words rounded-[12px_12px_2px_12px] bg-[var(--we-vermilion)] px-3 py-2 text-[13px] leading-relaxed text-white">
              {msg.content}
            </div>
            <ActionBar>
              <CopyBtn getText={() => msg.content || ''} />
              {onEdit && (
                <ActionBtn onClick={startEdit} ariaLabel="编辑">编辑</ActionBtn>
              )}
              {onDelete && msg.id && <DeleteBtn onDelete={() => onDelete(msg.id)} />}
            </ActionBar>
          </>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ msg, onRegenerate, onDelete }) {
  return (
    <div className="mb-2 flex animate-[we-bubble-in_0.2s_ease-out] justify-start">
      <div className="group max-w-[90%]">
        <div
          className={`rounded-[2px_12px_12px_12px] border border-black/10 bg-[var(--we-paper-aged)] px-3 py-2 text-[13px] leading-relaxed text-[var(--we-ink-primary)] ${
            msg.streaming && msg.content ? 'we-stream-bubble' : ''
          }`}
        >
          {msg.streaming && !msg.content ? (
            <div className="we-typing-dots">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          ) : (
            parseStreamingBlocks(msg.content || '').map((block, i) =>
              block.type === 'thinking' ? (
                <ThinkBlock key={i} content={block.content} open={!!msg.streaming && block.open} />
              ) : (
                <SimpleMarkdown key={i} content={block.content} />
              )
            )
          )}
        </div>
        {!msg.streaming && (
          <ActionBar>
            <CopyBtn getText={() => msg.content || ''} />
            {onRegenerate && msg.id && (
              <ActionBtn onClick={() => onRegenerate(msg.id)} ariaLabel="重新生成">
                重新生成
              </ActionBtn>
            )}
            {onDelete && msg.id && <DeleteBtn onDelete={() => onDelete(msg.id)} />}
          </ActionBar>
        )}
      </div>
    </div>
  );
}

function ErrorMessage({ msg }) {
  return (
    <div className="my-2 animate-[we-bubble-in_0.2s_ease-out] rounded border border-[var(--we-vermilion)]/20 bg-[var(--we-vermilion)]/10 px-3 py-2 text-[12px] text-[var(--we-vermilion)]">
      {msg.content}
    </div>
  );
}

function PendingBubble() {
  return (
    <div className="mb-2 flex animate-[we-bubble-in_0.2s_ease-out] justify-start">
      <div className="rounded-[2px_12px_12px_12px] border border-black/10 bg-[var(--we-paper-aged)] px-3 py-2">
        <div className="we-typing-dots" aria-label="助手正在思考">
          <span className="typing-dot typing-dot-accent" />
          <span className="typing-dot typing-dot-accent" />
          <span className="typing-dot typing-dot-accent" />
        </div>
      </div>
    </div>
  );
}

export default function MessageList({ messages, onEdit, onDelete, onRegenerate, pending }) {
  const bottomRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (pending) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pending]);

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
    <div className="we-assistant-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {messages.map((msg, idx) => {
        const key = msg.id || `${msg.role}-${idx}`;
        if (msg.role === 'user') {
          return <UserMessage key={key} msg={msg} onEdit={onEdit} onDelete={onDelete} />;
        }
        if (msg.role === 'assistant') {
          return (
            <AssistantMessage
              key={key}
              msg={msg}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
            />
          );
        }
        if (msg.role === 'error') return <ErrorMessage key={key} msg={msg} />;
        return null;
      })}
      {pending && <PendingBubble />}
      <div ref={bottomRef} />
    </div>
  );
}
