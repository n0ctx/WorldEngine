import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';
import { variants, transitions } from '../../utils/motion.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { useDisplaySettingsStore } from '../../store/displaySettings.js';
import { applyRules } from '../../utils/regex-runner.js';
import ActivatedEntriesRow from '../chat/ActivatedEntriesRow.jsx';

const MotionDiv = motion.div;

const REMARK_PLUGINS_W = [remarkGfm];
const REHYPE_PLUGINS_W = [rehypeRaw, rehypeSanitize];
const THINK_REMARK_PLUGINS_W = [remarkGfm];
const THINK_REHYPE_PLUGINS_W = [rehypeSanitize];

function formatTokens(n) {
  if (n == null || Number.isNaN(n)) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
  return n.toLocaleString();
}

function calcCost(usage, pricing) {
  if (!pricing || (!pricing.inputPrice && !pricing.outputPrice)) return null;
  const inp = ((usage.prompt_tokens ?? 0) * pricing.inputPrice) / 1_000_000;
  const out = ((usage.completion_tokens ?? 0) * pricing.outputPrice) / 1_000_000;
  const cacheRead = pricing.cacheReadPrice
    ? ((usage.cache_read_tokens ?? 0) * pricing.cacheReadPrice) / 1_000_000
    : 0;
  const cacheWrite = pricing.cacheWritePrice
    ? ((usage.cache_creation_tokens ?? 0) * pricing.cacheWritePrice) / 1_000_000
    : 0;
  return inp + out + cacheRead + cacheWrite;
}

function formatCost(usd) {
  if (usd == null) return null;
  if (usd < 0.000001) return '<$0.000001';
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

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
  const autoCollapse = useDisplaySettingsStore((s) => s.autoCollapseThinking);
  const [expanded, setExpanded] = useState(!autoCollapse);

  return (
    <div className="we-writing-think">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="we-writing-think-toggle"
      >
        <Icon size={16} className={`we-writing-think-icon${expanded ? ' we-writing-think-icon--expanded' : ''}`}>
          <polyline points="9 18 15 12 9 6" />
        </Icon>
        思考过程{open && <span className="we-writing-think-open">…</span>}
      </button>
      {expanded && (
        <div className="we-writing-think-body">
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
      <Icon size={16}>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </Icon>
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
      className={confirming ? 'we-message-action-danger' : undefined}
    >
      <Icon size={16}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </Icon>
      {confirming ? '确认？' : '删除'}
    </button>
  );
}

export default function WritingMessageItem({
  message,
  isStreaming = false,
  onEdit,
  onRegenerate,
  onEditAssistant,
  onDelete,
  onMakeCard,
  worldId,
}) {
  const rawContent = message.content || '';
  const isUser = message.role === 'user';
  const showThinking = useDisplaySettingsStore((s) => s.showThinking);
  const showTokenUsage = useDisplaySettingsStore((s) => s.showTokenUsage);
  const currentModelPricing = useDisplaySettingsStore((s) => s.currentWritingModelPricing);

  let displayContent = isStreaming ? rawContent : rawContent;
  if (!isStreaming) {
    displayContent = applyRules(displayContent, 'display_only', worldId ?? null, 'writing');
  }
  const blocks = parseStreamingBlocks(displayContent);
  const content = displayContent;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);
  const editInitContentRef = useRef('');

  const [editingAI, setEditingAI] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const aiTextareaRef = useRef(null);

  function startEdit() { editInitContentRef.current = message.content; setDraft(message.content); setEditing(true); }
  function confirmEdit() {
    const trimmed = draft.trim();
    if (trimmed) onEdit?.(message.id, trimmed);
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

  if (!content && !isStreaming) return null;

  /* ── 玩家输入：朱砂左线批注风格 ── */
  if (isUser) {
    return (
      <MotionDiv
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
              <button className="primary" onClick={confirmEdit}>确认</button>
            </div>
          </div>
        ) : (
          <>
            <span>{content}</span>
            {!isStreaming && (
              <div className="we-message-actions">
                <CopyBtn getText={() => content} />
                <button onClick={startEdit}>
                  <Icon size={16}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </Icon>
                  编辑
                </button>
                {onDelete && <DeleteBtn onDelete={() => onDelete(message.id)} />}
              </div>
            )}
          </>
        )}
      </MotionDiv>
    );
  }

  /* ── 助手叙事：书页正文散文风格 ── */
  return (
    <MotionDiv
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
                <Icon size={16}>
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                </Icon>
                重新生成
              </button>
              <button onClick={startEditAI}>
                <Icon size={16}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </Icon>
                编辑
              </button>
              {onMakeCard && (
                <button onClick={() => onMakeCard(message.id)} aria-label="从此轮次提取角色并制卡">
                  <Icon size={16}>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </Icon>
                  制卡
                </button>
              )}
              {onDelete && <DeleteBtn onDelete={() => onDelete(message.id)} />}
            </div>
          )}
          {!editingAI && !isStreaming && message.token_usage && showTokenUsage && (
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
            </div>
          )}
          {!editingAI && !isStreaming && message.activated_entries?.length > 0 && (
            <ActivatedEntriesRow entries={message.activated_entries} />
          )}
        </>
      )}
    </MotionDiv>
  );
}
