import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { variants, transitions } from '../../utils/motion.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { useDisplaySettingsStore } from '../../store/displaySettings.js';

const REMARK_PLUGINS_W = [remarkGfm];
const REHYPE_PLUGINS_W = [rehypeRaw, rehypeSanitize];
const THINK_REMARK_PLUGINS_W = [remarkGfm];
const THINK_REHYPE_PLUGINS_W = [rehypeSanitize];

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
          <ReactMarkdown remarkPlugins={THINK_REMARK_PLUGINS_W} rehypePlugins={THINK_REHYPE_PLUGINS_W}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function CopyBtn({ getText }) {
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

export default function WritingMessageItem({
  message,
  isStreaming = false,
  persona,
  onEdit,
  onRegenerate,
  onEditAssistant,
  onDelete,
}) {
  const rawContent = message.content || '';
  const isUser = message.role === 'user';
  const showThinking = useDisplaySettingsStore((s) => s.showThinking);

  const displayContent = isStreaming ? rawContent : rawContent;
  const blocks = parseStreamingBlocks(displayContent);
  const content = displayContent;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);

  const [editingAI, setEditingAI] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const aiTextareaRef = useRef(null);

  if (!content && !isStreaming) return null;

  function startEdit() { setDraft(message.content); setEditing(true); }
  function confirmEdit() {
    if (draft.trim() && draft !== message.content) onEdit?.(message.id, draft.trim());
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

  /* ── 玩家输入：朱砂左线批注风格 ── */
  if (isUser) {
    return (
      <motion.div
        className="we-writing-annotation"
        initial="hidden"
        animate="visible"
        variants={variants.inkRise}
        transition={transitions.ink}
      >
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
              rows={2}
            />
            <div className="we-message-edit-actions">
              <button onClick={cancelEdit}>取消</button>
              <button className="primary" onClick={confirmEdit}>确认并重新生成</button>
            </div>
          </div>
        ) : (
          <>
            <span>{content}</span>
            {!isStreaming && (
              <div className="we-message-actions">
                <CopyBtn getText={() => content} />
                <button onClick={startEdit}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  编辑
                </button>
                {onDelete && <DeleteBtn onDelete={() => onDelete(message.id)} />}
              </div>
            )}
          </>
        )}
      </motion.div>
    );
  }

  /* ── 助手叙事：书页正文散文风格 ── */
  return (
    <motion.div
      className="we-writing-prose"
      initial="hidden"
      animate="visible"
      variants={variants.inkRise}
      transition={transitions.ink}
    >
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
            rows={6}
          />
          <div className="we-message-edit-actions">
            <button onClick={cancelEditAI}>取消</button>
            <button className="primary" onClick={confirmEditAI}>保存</button>
          </div>
        </div>
      ) : (
        <>
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
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS_W} rehypePlugins={REHYPE_PLUGINS_W}>
                      {block.content}
                    </ReactMarkdown>
                  )}
                </div>
              );
            })}
          </div>
          {!isStreaming && (
            <div className="we-message-actions">
              <CopyBtn getText={() => content} />
              <button onClick={() => onRegenerate?.(message.id)}>
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
              {onDelete && <DeleteBtn onDelete={() => onDelete(message.id)} />}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
