import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { applyRules } from '../../utils/regex-runner.js';
import { useDisplaySettingsStore } from '../../store/displaySettings.js';

import CharacterSeal from '../book/CharacterSeal.jsx';
import { variants, transitions } from '../../utils/motion.js';

/**
 * 将文本解析为 [{type, content, open}] 数组，流式/非流式通用。
 * open=true 表示该 think 块尚未收到 </think>（仍在流式输出中）。
 */
function parseStreamingBlocks(text) {
  const blocks = [];
  const segments = text.split(/(<think>|<\/think>)/);
  let inThink = false;
  let current = '';
  for (const seg of segments) {
    if (seg === '<think>') {
      const trimmed = current.replace(/^\n+/, '');
      if (trimmed) blocks.push({ type: 'text', content: trimmed, open: false });
      current = '';
      inThink = true;
    } else if (seg === '</think>') {
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

/**
 * open=true：think 块正在流式输出并自动展开
 * open=false：think 块已完成，折叠状态由 autoCollapseThinking 决定
 */
function ThinkBlock({ content, open = false }) {
  const autoCollapse = useDisplaySettingsStore((s) => s.autoCollapseThinking);
  const [expanded, setExpanded] = useState(!autoCollapse);

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
        思考过程{open && <span style={{ opacity: 0.4, marginLeft: 4 }}>…</span>}
      </button>
      {expanded && (
        <div style={{
          padding: '8px 12px',
          fontFamily: 'var(--we-font-serif)',
          fontSize: '12px',
          color: 'var(--we-ink-faded)',
          lineHeight: '1.7',
          background: 'var(--we-paper-aged)',
        }}>
          <ReactMarkdown remarkPlugins={THINK_REMARK_PLUGINS} rehypePlugins={THINK_REHYPE_PLUGINS}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];
// think block 用轻量插件（不需要 rehypeRaw，避免 XSS 风险）
const THINK_REMARK_PLUGINS = [remarkGfm];
const THINK_REHYPE_PLUGINS = [rehypeSanitize];

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
  code({ node, inline, className, children, ...props }) {
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
  const editInitContentRef = useRef('');

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

  // 统一解析为 blocks（流式和非流式共用）
  const blocks = parseStreamingBlocks(displayContent);

  function startEdit() { editInitContentRef.current = message.content; setDraft(message.content); setEditing(true); }
  function confirmEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== editInitContentRef.current.trim()) onEdit(message.id, trimmed);
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
        initial="hidden"
        animate="visible"
        variants={variants.inkRise}
        transition={transitions.ink}
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
        initial="hidden"
        animate="visible"
        variants={variants.inkRise}
        transition={transitions.ink}
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
      initial="hidden"
      animate="visible"
      variants={variants.inkRise}
      transition={transitions.ink}
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
                {blocks.map((block, i) => {
                  const isLastBlock = i === blocks.length - 1;
                  if (block.type === 'thinking') {
                    if (!showThinking) return null;
                    return <ThinkBlock key={i} content={block.content} open={isStreaming && block.open} />;
                  }
                  return (
                    <div key={i}>
                      {block.content && (
                        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MD_COMPONENTS}>
                          {block.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  );
                })}
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
