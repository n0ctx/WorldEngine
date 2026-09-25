import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from '../../core/utils/markdown-sanitize.js';
import { applyRules } from '../../core/utils/regex-runner.js';
import { stripNextPromptBlocks } from '../../core/utils/next-prompt.js';
import { needsTrailingCaret, parseStreamingBlocks } from '../../core/utils/think-blocks.js';
import { useDisplaySettingsStore } from '../../core/state/displaySettings.js';
import { useMessageEditing } from '../../core/hooks/useMessageEditing.js';
import { formatTokens, calcCost, formatCost } from '../../core/utils/token-usage.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';

import { Copy, PencilLine, RotateCcw, Trash2 } from 'lucide-react';
import InterruptedMark from './InterruptedMark.jsx';
import ActivatedEntriesRow from './ActivatedEntriesRow.jsx';
import StreamingMarkdown, { StreamCaret } from './StreamingMarkdown.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';
import { DURATION } from '../../core/utils/motion.js';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';

const MotionDiv = motion.div;

/**
 * open=true：think 块正在流式输出并自动展开
 * open=false：think 块已完成，折叠状态由 autoCollapseThinking 决定
 */
function ThinkBlock({ content, open = false, streaming = false, caret = false, interrupted = false }) {
  const autoCollapse = useDisplaySettingsStore((s) => s.autoCollapseThinking);
  // 用户是否手动改过展开/折叠;一旦改过就完全尊重用户选择,流式结束也不强制变更
  const [userToggled, setUserToggled] = useState(false);
  const [userExpanded, setUserExpanded] = useState(!autoCollapse);
  // 默认态:流式进行中(open)展开让用户看到实时思考;结束后回落到 autoCollapse 设置
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

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]];
// think block 用轻量插件（不需要 rehypeRaw，避免 XSS 风险）
const THINK_REMARK_PLUGINS = [remarkGfm];
const THINK_REHYPE_PLUGINS = [[rehypeSanitize, markdownSanitizeSchema]];

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


// 仅保留 code 的自定义渲染（CodeBlock 带语言标签和复制按钮），其余元素全由 CSS 控制
const MD_COMPONENTS = {
  code({ inline, className, children, ...props }) {
    if (inline) {
      return <code className="we-inline-code" {...props}>{children}</code>;
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
};

function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function AttachmentThumbnail({ src }) {
  const [enlarged, setEnlarged] = useState(false);
  const [failed, setFailed] = useState(false);
  useEscapeKey(() => setEnlarged(false), enlarged);
  const url = `/api/uploads/${src}`;
  if (failed) {
    return (
      <div className="we-attachment-thumbnail flex items-center justify-center text-xs opacity-60">
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

function CopyButton({ getText }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} aria-label={copied ? '已复制到剪贴板' : '复制消息内容'}>
      <Copy size={16} />
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function DeleteButton({ onDelete }) {
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

export default function MessageItem({
  message,
  character,
  persona,
  worldId,
  isStreaming,
  streamingText,
  showCaret = true,
  onEdit,
  onRegenerate,
  onEditAssistant,
  onDelete,
  isGreeting = false,
}) {
  const {
    editing, draft, setDraft, startEdit, confirmEdit, cancelEdit, handleKeyDown,
    editingAI, aiDraft, setAiDraft, startEditAI, confirmEditAI, cancelEditAI, handleKeyDownAI,
  } = useMessageEditing(message, { onEdit, onEditAssistant });

  const showThinking = useDisplaySettingsStore((s) => s.showThinking);
  const showTokenUsage = useDisplaySettingsStore((s) => s.showTokenUsage);
  const currentModelPricing = useDisplaySettingsStore((s) => s.currentModelPricing);
  const isUser = message.role === 'user';
  const m = useMotion();
  // 入场像角色走上台：短回弹后静止；离场只收透明度，不牵动相邻正文
  const enterProps = {
    variants: m.variant('messageEnter'),
    initial: 'hidden',
    animate: 'visible',
    transition: m.spring('message'),
    exit: { opacity: 0, transition: m.transition('retract') },
  };

  const speakerName = isUser
    ? (persona?.name || '玩家')
    : (character?.name || '旁白');

  let displayContent = isStreaming ? (streamingText || '') : (message.content || '');
  let interrupted = false;
  if (/\n{0,2}\[已中断\]\s*$/.test(displayContent)) {
    displayContent = displayContent.replace(/\n{0,2}\[已中断\]\s*$/, '');
    interrupted = true;
  }
  displayContent = applyRules(displayContent, 'display_only', worldId ?? null);

  // 统一解析为 blocks（流式和非流式共用）;中断标记挂到最后一个 block。
  const blocks = useMemo(
    () => parseStreamingBlocks(displayContent, { isStreaming }),
    [displayContent, isStreaming],
  );
  const lastBlockIndex = blocks.length - 1;
  const trailingCaret = showCaret && isStreaming && needsTrailingCaret(blocks, showThinking);

  if (isStreaming && !streamingText) {
    // 角色等玩家这句落定后再上台，同一时刻只有一个主运动
    return (
      <MotionDiv
        data-message-id={message?.id}
        className="we-message-row we-message-assistant"
        {...enterProps}
        transition={m.spring('message', { delay: DURATION.base })}
      >
        <div className="we-message-row-inner">
          <div className="we-message-body--assistant">
            <div className="we-message-label">{speakerName}</div>
            <div className="we-message-bubble-assistant">
              <div className="we-message-content">
                {showCaret && <StreamCaret />}
              </div>
            </div>
          </div>
        </div>
      </MotionDiv>
    );
  }

  if (isUser) {
    return (
      <MotionDiv
        data-message-id={message?.id}
        className="we-message-row we-message-user"
        {...enterProps}
      >
        <div className="we-message-row-inner">
          <div className="we-message-body">
            <div className="we-message-label">
              {speakerName}
            </div>
            <div className={`we-message-bubble-user${editing ? ' we-message-bubble--editing' : ''}`}>
              <SeamlessEditableSurface
                editing={editing}
                selectEnd
                trackValue={draft}
                readClassName="we-message-content"
                renderRead={() => (
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MD_COMPONENTS}>
                    {displayContent}
                  </ReactMarkdown>
                )}
                renderEditor={({ editorRef, syncLayout }) => (
                  <textarea
                    ref={editorRef}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      syncLayout();
                    }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className="we-seamless-edit__textarea we-message-edit__textarea"
                  />
                )}
              />
              {message.attachments?.length > 0 && (
                <div className="we-message-attachments">
                  {message.attachments.map((att, i) => <AttachmentThumbnail key={i} src={att} />)}
                </div>
              )}
            </div>
            <div className="we-message-actions">
              {editing ? (
                <div className="we-message-edit-actions">
                  <button onClick={cancelEdit}>取消</button>
                  <button className="primary" onClick={confirmEdit}>确认</button>
                </div>
              ) : (
                <>
                  <span className="we-action-time">{formatTime(message.created_at)}</span>
                  <CopyButton getText={() => message.content} />
                  <button onClick={startEdit} aria-label="编辑消息">
                    <PencilLine size={16} />
                    编辑
                  </button>
                  {onDelete && <DeleteButton onDelete={() => onDelete(message.id)} />}
                </>
              )}
            </div>
          </div>
        </div>
      </MotionDiv>
    );
  }

  return (
    <MotionDiv
      data-message-id={message?.id}
      className="we-message-row we-message-assistant"
      {...enterProps}
    >
      <div className="we-message-row-inner">
        <div className="we-message-body--assistant">
          <div className="we-message-label">
            {speakerName}
            {interrupted && <span className="we-message-interrupted">已中断</span>}
          </div>
          <div className={`we-message-bubble-assistant${editingAI ? ' we-message-bubble--editing' : ''}`}>
            <SeamlessEditableSurface
              editing={editingAI}
              trackValue={aiDraft}
              readClassName="we-message-content"
              renderRead={() => (
                <>
                  {blocks.map((block, i) => {
                    const isLast = i === lastBlockIndex;
                    if (block.type === 'thinking') {
                      // 关闭思考显示时,若消息正是在思考块里被中断的,仍要留住「已中断」标记
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
                            remarkPlugins={REMARK_PLUGINS}
                            rehypePlugins={REHYPE_PLUGINS}
                            components={MD_COMPONENTS}
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
              )}
              renderEditor={({ editorRef, syncLayout }) => (
                <textarea
                  ref={editorRef}
                  value={aiDraft}
                  onChange={(e) => {
                    setAiDraft(e.target.value);
                    syncLayout();
                  }}
                  onKeyDown={handleKeyDownAI}
                  rows={4}
                  className="we-seamless-edit__textarea we-message-edit__textarea"
                />
              )}
            />
            {message.attachments?.length > 0 && (
              <div className="we-message-attachments">
                {message.attachments.map((att, i) => <AttachmentThumbnail key={i} src={att} />)}
              </div>
            )}
          </div>
          {(() => {
            const tokenRowVisible = !editingAI && !isStreaming && message.token_usage && showTokenUsage;
            const hasEntries = !editingAI && message.activated_entries?.length > 0;
            const entriesGoWithToken = tokenRowVisible && hasEntries;
            const entriesGoWithActions = !tokenRowVisible && hasEntries && !editingAI;
            return (
              <>
                {tokenRowVisible && (
                  <div className="we-token-usage">
                    <span title="输入 tokens">↑{formatTokens(message.token_usage.prompt_tokens)}</span>
                    <span title="输出 tokens">↓{formatTokens(message.token_usage.completion_tokens)}</span>
                    {message.token_usage.cache_read_tokens != null && message.token_usage.cache_read_tokens > 0 && (
                      <span title="缓存命中 tokens">命中 {formatTokens(message.token_usage.cache_read_tokens)}</span>
                    )}
                    {message.token_usage.cache_creation_tokens != null && message.token_usage.cache_creation_tokens > 0 && (
                      <span title="缓存写入 tokens">写入 {formatTokens(message.token_usage.cache_creation_tokens)}</span>
                    )}
                    <span className="we-token-usage-unit">tokens</span>
                    {formatCost(calcCost(message.token_usage, currentModelPricing)) && (
                      <span className="we-token-usage-cost" title="本条消息估算费用（美元）">
                        {formatCost(calcCost(message.token_usage, currentModelPricing))}
                      </span>
                    )}
                    {entriesGoWithToken && (
                      <ActivatedEntriesRow entries={message.activated_entries} />
                    )}
                  </div>
                )}
                {!isGreeting && (
                <div className="we-message-actions">
                  {editingAI ? (
                    <div className="we-message-edit-actions">
                      <button onClick={cancelEditAI}>取消</button>
                      <button className="primary" onClick={confirmEditAI}>保存</button>
                    </div>
                  ) : (
                    <div className="we-message-actions-buttons">
                      <span className="we-action-time">{formatTime(message.created_at)}</span>
                      <CopyButton getText={() => displayContent} />
                      <button onClick={() => onRegenerate(message.id)} aria-label="重新生成 AI 回复">
                        <RotateCcw size={16} />
                        重新生成
                      </button>
                      <button onClick={startEditAI} aria-label="编辑 AI 回复">
                        <PencilLine size={16} />
                        编辑
                      </button>
                      {onDelete && <DeleteButton onDelete={() => onDelete(message.id)} />}
                    </div>
                  )}
                  {entriesGoWithActions && !editingAI && (
                    <ActivatedEntriesRow entries={message.activated_entries} />
                  )}
                </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </MotionDiv>
  );
}
