/**
 * PlanDocViewer —— 只读渲染助手任务的计划文档（markdown + GFM checkbox）
 *
 * 由父代理通过 SSE `plan_doc_updated` 事件持续推送 markdown 全文，
 * 包含 `- [ ]` / `- [x]` 步骤列表；本组件仅负责渲染，不可编辑。
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function PlanDocViewer({ content, variant = 'card' }) {
  if (!content) return null;
  const inner = (
    <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          input: ({ checked, type }) =>
            type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={!!checked}
                disabled
                readOnly
                aria-label={checked ? '已完成' : '待执行'}
                className="mr-2 align-middle"
              />
            ) : null,
          h1: ({ children }) => (
            <h1 className="mb-1 mt-2 text-[14px] font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1 mt-2 text-[13px] font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-[12px] font-semibold">{children}</h3>
          ),
          p: ({ children }) => <p className="my-1 break-words">{children}</p>,
          ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
          li: ({ children, className }) => (
            <li className={`${className || ''} mb-0.5 leading-snug`}>{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1 border-l-2 border-[var(--we-vermilion)] pl-3 text-[var(--we-ink-muted)]">
              {children}
            </blockquote>
          ),
          code: ({ inline, children }) =>
            inline ? (
              <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px]">
                {children}
              </code>
            ) : (
              <pre className="my-1 overflow-x-auto rounded bg-black/5 p-2 font-mono text-[11px]">
                <code>{children}</code>
              </pre>
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
  if (variant === 'plain') return inner;
  return (
    <div className="we-plan-doc mx-3 my-2 rounded-lg bg-[var(--we-paper-aged)] p-3 text-[12px] leading-relaxed text-[var(--we-ink-primary)] ring-1 ring-black/10">
      {inner}
    </div>
  );
}
