import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { applyRules } from '../../utils/regex-runner.js';
import { useDisplaySettingsStore } from '../../store/displaySettings.js';

import QuillCursor from '../book/QuillCursor.jsx';
import CharacterSeal from '../book/CharacterSeal.jsx';
import { INK_RISE } from '../../utils/motion.js';

/**
 * 将文本按 <think>...</think> 分割为 [{type, content}] 数组
 * type: 'text' | 'thinking'
 */
function parseThinkBlocks(text) {
  const parts = [];
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const t = text.slice(lastIndex, match.index).replace(/^\n+/, '');
      if (t) parts.push({ type: 'text', content: t });
    }
    if (match[1]) parts.push({ type: 'thinking', content: match[1] });
    lastIndex = match.index + match[0].length;
  }
  const remaining = text.slice(lastIndex).replace(/^\n+/, '');
  if (remaining) parts.push({ type: 'text', content: remaining });
  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}

/** 剥除完整及不完整的 <think> 块 */
function stripThinkContent(text) {
  let result = text.replace(/<think>[\s\S]*?<\/think>\n*/g, '');
  const openIdx = result.indexOf('<think>');
  if (openIdx !== -1) result = result.slice(0, openIdx);
  return result;
}

function ThinkBlock({ content }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      margin: '0 0 8px',
      borderLeft: '2px solid var(--we-paper-shadow)',
      borderRadius: '0 4px 4px 0',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          width: '100%',
          background: 'var(--we-paper-aged)',
          border: 'none',
          padding: '4px 10px',
          cursor: 'pointer',
          fontFamily: 'var(--we-font-serif)',
          fontSize: '11px',
          color: 'var(--we-ink-faded)',
          fontStyle: 'italic',
          textAlign: 'left',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        思考过程
      </button>
      {expanded && (
        <div style={{
          padding: '8px 12px',
          fontFamily: 'var(--we-font-serif)',
          fontSize: '12px',
          color: 'var(--we-ink-faded)',
          fontStyle: 'italic',
          lineHeight: '1.7',
          background: 'var(--we-paper-aged)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {content}
        </div>
      )}
    </div>
  );
}

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

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
  code({ node, inline, className, children, ...props }) {
    if (inline) {
      return (
        <code className="we-inline-code" {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  p({ children }) { return <p>{children}</p>; },
  ul({ children }) { return <ul style={{ listStyle: 'disc', paddingLeft: '1.5em', marginBottom: '0.5em' }}>{children}</ul>; },
  ol({ children }) { return <ol style={{ listStyle: 'decimal', paddingLeft: '1.5em', marginBottom: '0.5em' }}>{children}</ol>; },
  blockquote({ children }) {
    return (
      <blockquote style={{ borderLeft: '2px solid var(--we-ink-faded)', paddingLeft: '1em', opacity: 0.78, fontStyle: 'italic', margin: '0.5em 0' }}>
        {children}
      </blockquote>
    );
  },
  h1({ children }) { return <h1 style={{ fontFamily: 'var(--we-font-display)', fontSize: '1.4em', fontWeight: 300, color: 'var(--we-ink-secondary)', marginBottom: '0.4em', letterSpacing: '0.05em' }}>{children}</h1>; },
  h2({ children }) { return <h2 style={{ fontFamily: 'var(--we-font-display)', fontSize: '1.2em', fontWeight: 400, color: 'var(--we-ink-secondary)', marginBottom: '0.3em', letterSpacing: '0.04em' }}>{children}</h2>; },
  h3({ children }) { return <h3 style={{ fontFamily: 'var(--we-font-display)', fontSize: '1.05em', fontWeight: 600, color: 'var(--we-ink-secondary)', marginBottom: '0.25em' }}>{children}</h3>; },
};

function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function AttachmentThumbnail({ src }) {
  const [enlarged, setEnlarged] = useState(false);
  const url = `/api/uploads/${src}`;
  return (
    <>
      <img
        src={url}
        alt="附件"
        style={{ height: '80px', width: '80px', objectFit: 'cover', borderRadius: '2px', cursor: 'pointer', border: '1px solid var(--we-paper-shadow)' }}
        onClick={() => setEnlarged(true)}
      />
      {enlarged && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(42,31,23,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEnlarged(false)}
        >
          <img src={url} alt="附件" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '2px' }} />
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
    <button onClick={copy}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
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
      style={confirming ? { color: 'var(--we-vermilion, #c0392b)' } : undefined}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </svg>
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
  onEdit,
  onRegenerate,
  onEditAssistant,
  onDelete,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);

  const [editingAI, setEditingAI] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const aiTextareaRef = useRef(null);

  const showThinking = useDisplaySettingsStore((s) => s.showThinking);
  const isUser = message.role === 'user';

  const speakerName = isUser
    ? (persona?.name || '玩家').toUpperCase()
    : (character?.name || '旁白').toUpperCase();

  let displayContent = isStreaming ? (streamingText || '') : (message.content || '');
  let interrupted = false;
  if (displayContent.includes('[已中断]')) {
    displayContent = displayContent.replace(/\n?\n?\[已中断\]/, '').trimEnd();
    interrupted = true;
  }
  if (!isStreaming) {
    displayContent = applyRules(displayContent, 'display_only', worldId ?? null);
  }

  // 思考链处理：streaming 时直接剥除/保留；非 streaming 时解析为 blocks
  const thinkBlocks = !isStreaming ? parseThinkBlocks(displayContent) : null;
  const streamingDisplay = isStreaming
    ? (showThinking ? displayContent : stripThinkContent(displayContent))
    : null;

  function startEdit() { setDraft(message.content); setEditing(true); }
  function confirmEdit() {
    if (draft.trim() && draft !== message.content) onEdit(message.id, draft.trim());
    setEditing(false);
  }
  function cancelEdit() { setEditing(false); }
  function handleKeyDown(e) {
    if (e.key === 'Escape') cancelEdit();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
  }

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  function startEditAI() { setAiDraft(message.content); setEditingAI(true); }
  function confirmEditAI() {
    if (aiDraft.trim() && aiDraft !== message.content) onEditAssistant?.(message.id, aiDraft.trim());
    setEditingAI(false);
  }
  function cancelEditAI() { setEditingAI(false); }
  function handleKeyDownAI(e) { if (e.key === 'Escape') cancelEditAI(); }

  useEffect(() => {
    if (editingAI && aiTextareaRef.current) {
      aiTextareaRef.current.focus();
      aiTextareaRef.current.style.height = 'auto';
      aiTextareaRef.current.style.height = aiTextareaRef.current.scrollHeight + 'px';
    }
  }, [editingAI]);

  if (isStreaming && !streamingText) {
    return (
      <motion.div
        className="we-message-row we-message-assistant"
        {...INK_RISE}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <CharacterSeal character={character} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="we-message-label">{speakerName}</div>
            <div className="we-message-bubble-assistant">
              <div className="we-message-content we-typing-dots">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (isUser) {
    return (
      <motion.div
        className="we-message-row we-message-user"
        {...INK_RISE}
        exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
            <div className="we-message-label">
              {speakerName}
              {interrupted && <span className="we-message-interrupted">已中断</span>}
            </div>
            <div className="we-message-bubble-user">
              {editing ? (
                <div className="we-message-edit">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                  />
                  <div className="we-message-edit-actions">
                    <button onClick={cancelEdit}>取消</button>
                    <button className="primary" onClick={confirmEdit}>确认</button>
                  </div>
                </div>
              ) : (
                <div className="we-message-content">
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MD_COMPONENTS}>
                    {displayContent}
                  </ReactMarkdown>
                </div>
              )}
              {message.attachments?.length > 0 && (
                <div className="we-message-attachments">
                  {message.attachments.map((att, i) => <AttachmentThumbnail key={i} src={att} />)}
                </div>
              )}
            </div>
            {!editing && (
              <div className="we-message-actions">
                <span className="we-action-time">{formatTime(message.created_at)}</span>
                <CopyButton getText={() => message.content} />
                <button onClick={startEdit}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  编辑
                </button>
                {onDelete && <DeleteButton onDelete={() => onDelete(message.id)} />}
              </div>
            )}
          </div>
          <CharacterSeal character={persona} size={32} color="var(--we-amber)" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="we-message-row we-message-assistant"
      {...INK_RISE}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <CharacterSeal character={character} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="we-message-label">
            {speakerName}
            {interrupted && <span className="we-message-interrupted">已中断</span>}
          </div>
          <div className="we-message-bubble-assistant">
            {editingAI ? (
              <div className="we-message-edit">
                <textarea
                  ref={aiTextareaRef}
                  value={aiDraft}
                  onChange={(e) => {
                    setAiDraft(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onKeyDown={handleKeyDownAI}
                  rows={4}
                />
                <div className="we-message-edit-actions">
                  <button onClick={cancelEditAI}>取消</button>
                  <button className="primary" onClick={confirmEditAI}>保存</button>
                </div>
              </div>
            ) : (
              <div className="we-message-content">
                {isStreaming ? (
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: '1.7',
                    fontFamily: 'var(--we-font-serif)',
                  }}>
                    {streamingDisplay}<QuillCursor visible={true} />
                  </div>
                ) : (
                  <>
                    {thinkBlocks.map((block, i) =>
                      block.type === 'thinking'
                        ? showThinking ? <ThinkBlock key={i} content={block.content} /> : null
                        : <ReactMarkdown key={i} remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MD_COMPONENTS}>{block.content}</ReactMarkdown>
                    )}
                  </>
                )}
              </div>
            )}
            {message.attachments?.length > 0 && (
              <div className="we-message-attachments">
                {message.attachments.map((att, i) => <AttachmentThumbnail key={i} src={att} />)}
              </div>
            )}
          </div>
          {!editingAI && (
            <div className="we-message-actions">
              <span className="we-action-time">{formatTime(message.created_at)}</span>
              <CopyButton getText={() => displayContent} />
              <button onClick={() => onRegenerate(message.id)}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                </svg>
                重新生成
              </button>
              <button onClick={startEditAI}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                编辑
              </button>
              {onDelete && <DeleteButton onDelete={() => onDelete(message.id)} />}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
