import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from '../../core/utils/markdown-sanitize.js';
import { stripNextPromptBlocks } from '../../core/utils/next-prompt.js';
import { useDisplaySettingsStore } from '../../core/state/displaySettings.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';
import { Copy, Trash2 } from 'lucide-react';
import InterruptedMark from './InterruptedMark.jsx';
import StreamingMarkdown, { StreamCaret } from './StreamingMarkdown.jsx';
import { useCopyFeedback, useDeleteConfirmation } from '../message/useMessageHooks.js';
import MessageBlockList from '../message/MessageBlockList.jsx';

const THINK_REMARK_PLUGINS = [remarkGfm];
const THINK_REHYPE_PLUGINS = [[rehypeSanitize, markdownSanitizeSchema]];

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]];

function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const lang = className?.replace('language-', '') || '';

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="we-code-block">
      <div className="we-code-block-header">
        <span className="we-code-block-lang">
          {lang || 'code'}
        </span>
        <button
          onClick={copy}
          className="we-code-block-copy"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const MD_COMPONENTS = {
  code({ inline, className, children, ...props }) {
    if (inline) {
      return <code className="we-inline-code" {...props}>{children}</code>;
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
};

export function MarkdownContent({ children }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MD_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

function ThinkBlock({ content, open = false, streaming = false, caret = false, interrupted = false }) {
  const autoCollapse = useDisplaySettingsStore((s) => s.autoCollapseThinking);
  const [userToggled, setUserToggled] = useState(false);
  const [userExpanded, setUserExpanded] = useState(!autoCollapse);
  const expanded = userToggled ? userExpanded : (open || !autoCollapse);
  const cleanContent = stripNextPromptBlocks(content);

  return (
    <div className="we-think-block">
      <button
        onClick={() => { setUserExpanded(!expanded); setUserToggled(true); }}
        aria-label={expanded ? '折叠思考过程' : '展开思考过程'}
        aria-expanded={expanded}
        className="we-think-block-toggle"
      >
        <Icon
          size={16}
          className={`we-think-block-chevron${expanded ? ' we-think-block-chevron--expanded' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </Icon>
        思考过程
        {open
          ? <span className="we-think-block-dots">…</span>
          : <span className="we-think-block-status">已完成</span>}
        {caret && !expanded && <StreamCaret />}
      </button>
      <div className={`we-think-block-body-wrap${expanded ? ' we-think-block-body-wrap--open' : ''}`}>
        <div className="we-think-block-body-inner">
          <div className="we-think-block-body">
            <StreamingMarkdown streaming={streaming} caret={caret} remarkPlugins={THINK_REMARK_PLUGINS} rehypePlugins={THINK_REHYPE_PLUGINS}>
              {cleanContent}
            </StreamingMarkdown>
            {interrupted && <InterruptedMark />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssistantMessageContent({
  blocks,
  interrupted,
  showThinking,
  isStreaming,
  showCaret,
  trailingCaret,
}) {
  return (
    <MessageBlockList
      blocks={blocks}
      interrupted={interrupted}
      showThinking={showThinking}
      isStreaming={isStreaming}
      showCaret={showCaret}
      trailingCaret={trailingCaret}
      ThinkBlock={ThinkBlock}
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={MD_COMPONENTS}
    />
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function MessageTime({ createdAt }) {
  return <span className="we-action-time">{formatTime(createdAt)}</span>;
}

export function AttachmentThumbnail({ src }) {
  const [enlarged, setEnlarged] = useState(false);
  const [failed, setFailed] = useState(false);
  useEscapeKey(() => setEnlarged(false), enlarged);
  const url = `/api/uploads/${src}`;
  if (failed) {
    return (
      <div className="we-attachment-thumbnail flex items-center justify-center we-type-caption opacity-60">
        图片加载失败
      </div>
    );
  }
  return (
    <>
      <img
        src={url}
        alt="附件"
        className="we-attachment-thumbnail"
        onClick={() => setEnlarged(true)}
        onError={() => setFailed(true)}
      />
      {enlarged && (
        <div
          className="we-attachment-overlay"
          onClick={() => setEnlarged(false)}
        >
          <img src={url} alt="附件" className="we-attachment-overlay-img" onError={() => setFailed(true)} />
        </div>
      )}
    </>
  );
}

export function CopyButton({ getText }) {
  const { copied, copy } = useCopyFeedback(getText);
  return (
    <button onClick={copy} aria-label={copied ? '已复制到剪贴板' : '复制消息内容'}>
      <Copy size={16} />
      {copied ? '已复制' : '复制'}
    </button>
  );
}

export function DeleteButton({ onDelete }) {
  const { confirming, handleClick } = useDeleteConfirmation(onDelete);

  return (
    <button
      onClick={handleClick}
      aria-label={confirming ? '确认删除消息' : '删除消息'}
      className={confirming ? 'we-delete-btn--confirming' : undefined}
    >
      <Trash2 size={16} />
      {confirming ? '确认？' : '删除'}
    </button>
  );
}
