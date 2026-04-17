import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { getAvatarUrl } from '../../utils/avatar.js';
import { applyRules } from '../../utils/regex-runner.js';

import QuillCursor from '../book/QuillCursor.jsx';
import CharacterSeal from '../book/CharacterSeal.jsx';
import { INK_RISE } from '../../utils/motion.js';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

/* ── Parchment-styled Markdown components ──────────────── */

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

/* ── Helpers ───────────────────────────────────────────── */

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

/* ── Persona Seal ──────────────────────────────────────── */

function PersonaSeal({ persona, size = 40 }) {
  const avatarUrl = getAvatarUrl(persona?.avatar_path);
  const char1 = (persona?.name || '玩')[0];

  if (avatarUrl) {
    return (
      <div style={{ width: size, height: size, position: 'relative', display: 'inline-block', flexShrink: 0 }}>
        <img
          src={avatarUrl}
          alt={persona?.name || ''}
          style={{
            position: 'absolute',
            top: '3.95%', left: '3.95%',
            width: '92.1%', height: '92.1%',
            objectFit: 'cover',
          }}
        />
        <svg viewBox="0 0 76 76" fill="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <rect x="3" y="3" width="70" height="70" rx="2" stroke="var(--we-amber)" strokeWidth="2.5" />
        </svg>
      </div>
    );
  }

  return (
    <svg viewBox="0 0 76 76" fill="none" style={{ width: size, height: size, flexShrink: 0 }}>
      <rect x="3" y="3" width="70" height="70" rx="2" stroke="var(--we-amber)" strokeWidth="2.5" />
      <rect x="7.5" y="7.5" width="61" height="61" rx="1" stroke="var(--we-amber)" strokeWidth="0.8" strokeDasharray="4 2.5" opacity="0.55" />
      <text x="38" y="45" textAnchor="middle" fontFamily="ZCOOL XiaoWei, LXGW WenKai TC, serif" fontSize="22" fill="var(--we-amber)">{char1}</text>
    </svg>
  );
}

/* ── Main Component ────────────────────────────────────── */

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
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);

  const [editingAI, setEditingAI] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const aiTextareaRef = useRef(null);

  const isUser = message.role === 'user';

  const speakerName = isUser
    ? (persona?.name || '玩家').toUpperCase()
    : (character?.name || '旁白').toUpperCase();

  let displayContent = message.content || '';
  let interrupted = false;
  if (displayContent.includes('[已中断]')) {
    displayContent = displayContent.replace(/\n?\n?\[已中断\]/, '').trimEnd();
    interrupted = true;
  }
  if (!isStreaming) {
    displayContent = applyRules(displayContent, 'display_only', worldId ?? null);
  }

  /* ── 用户消息编辑 ── */
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

  /* ── AI 消息编辑 ── */
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

  /* ── 打点等待态 ── */
  if (isStreaming && !streamingText) {
    return (
      <motion.div
        className="we-message-row we-message-assistant"
        {...INK_RISE}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <CharacterSeal character={character} size={40} />
          <div style={{ minWidth: 0 }}>
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

  /* ── 用户消息（右侧气泡 + 玩家印章） ── */
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
              </div>
            )}
          </div>
          <PersonaSeal persona={persona} size={32} />
        </div>
      </motion.div>
    );
  }

  /* ── 助手消息（左侧印章 + 气泡） ── */
  return (
    <motion.div
      className="we-message-row we-message-assistant"
      {...INK_RISE}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <CharacterSeal character={character} size={40} />
        <div style={{ minWidth: 0 }}>
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
                  <span style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--we-font-serif)', fontSize: 'var(--we-text-base)', lineHeight: 'var(--we-leading-loose)', color: 'var(--we-ink-primary)' }}>
                    {streamingText || ''}
                    <QuillCursor visible={true} />
                  </span>
                ) : (
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MD_COMPONENTS}>
                    {displayContent}
                  </ReactMarkdown>
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
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
