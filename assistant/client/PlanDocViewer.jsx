/**
 * PlanDocViewer —— 只读渲染助手任务的计划文档（markdown + GFM checkbox）
 *
 * 由父代理通过 SSE `plan_doc_updated` 事件持续推送 markdown 全文，
 * 包含 `- [ ]` / `- [x]` 步骤列表；本组件仅负责渲染，不可编辑。
 */

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 统计 markdown 中 `- [ ]` / `- [x]` 复选框数量，用于顶部进度条。
function countCheckboxes(md) {
  const text = String(md ?? '');
  let total = 0;
  let done = 0;
  const re = /^\s*-\s*\[\s*([ x])\s*\]/gim;
  let match;
  while ((match = re.exec(text)) !== null) {
    total += 1;
    if (match[1].toLowerCase() === 'x') done += 1;
  }
  return { total, done };
}

export default function PlanDocViewer({ content, variant = 'card' }) {
  const { total, done } = useMemo(() => countCheckboxes(content), [content]);
  if (!content) return null;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
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
          // 在已完成的步骤行（含 [x]）整体加灰色 + 删除线，让用户一眼看出进度。
          li: ({ children, className }) => {
            const cls = className || '';
            const checked = cls.includes('task-list-item') &&
              Array.isArray(children) &&
              children.some((c) => c?.props?.checked === true);
            const tone = checked ? ' text-[var(--we-ink-muted)] line-through opacity-70' : '';
            return <li className={`${cls} mb-0.5 leading-snug we-plan-step we-plan-step--in${tone}`}>{children}</li>;
          },
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
  const progressHeader = total > 0 ? (
    <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--we-ink-muted)]">
      <span className="font-medium text-[var(--we-ink-primary)]">已完成 {done}/{total}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
        <div
          className="absolute inset-y-0 left-0 bg-[var(--we-vermilion)] transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{pct}%</span>
    </div>
  ) : null;
  if (variant === 'plain') return (
    <>
      {progressHeader}
      {inner}
    </>
  );
  return (
    <div className="we-plan-doc mx-3 my-2 rounded-lg bg-[var(--we-paper-aged)] p-3 text-[12px] leading-relaxed text-[var(--we-ink-primary)] ring-1 ring-black/10">
      {progressHeader}
      {inner}
    </div>
  );
}
