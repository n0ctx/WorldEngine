import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from '../../core/utils/markdown-sanitize.js';
import { useDisplaySettingsStore } from '../../core/state/displaySettings.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';
import { useFocusTrap } from '../../core/hooks/useFocusTrap.js';
import { useCopyFeedback } from '../message/useMessageHooks.js';
import Button from '../ui/Button.jsx';
import ThinkBlock from '../message/ThinkBlock.jsx';
import MessageBlockList from '../message/MessageBlockList.jsx';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]];

function CodeBlock({ children, className }) {
  const code = String(children).replace(/\n$/, '');
  const lang = className?.replace('language-', '') || '';
  const { copied, copy } = useCopyFeedback(() => code);

  return (
    <div className="we-code-block">
      <div className="we-code-block-header">
        <span className="we-code-block-lang">
          {lang || 'code'}
        </span>
        <Button variant="text" size="sm" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </Button>
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

function ChatThinkBlock(props) {
  const autoCollapse = useDisplaySettingsStore((s) => s.autoCollapseThinking);
  return <ThinkBlock {...props} autoCollapse={autoCollapse} />;
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
      ThinkBlock={ChatThinkBlock}
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
  const overlayRef = useRef(null);
  useEscapeKey(() => setEnlarged(false), enlarged);
  const onTab = useFocusTrap(overlayRef, enlarged);
  const url = `/api/uploads/${src}`;
  if (failed) {
    return (
      <div className="we-attachment-thumbnail flex items-center justify-center we-type-caption text-[var(--we-color-text-tertiary)]">
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
      {enlarged && createPortal(
        <div
          ref={overlayRef}
          className="we-attachment-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="查看大图"
          tabIndex={-1}
          onKeyDown={onTab}
          onClick={() => setEnlarged(false)}
        >
          <img src={url} alt="附件" className="we-attachment-overlay-img" onError={() => setFailed(true)} />
        </div>,
        document.body,
      )}
    </>
  );
}
