import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { getAvatarColor, getAvatarUrl } from '../../utils/avatar.js';
import { applyRules } from '../../utils/regex-runner.js';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

const MD_COMPONENTS = {
  code({ node, inline, className, children, ...props }) {
    if (inline) {
      return (
        <code className="px-1 py-0.5 rounded bg-border font-mono text-xs" {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-accent pl-3 opacity-75 italic my-2">
        {children}
      </blockquote>
    );
  },
};

function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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
    <div className="relative my-3 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-ivory border-b border-border">
        <span className="text-xs opacity-50 font-mono">{lang || 'code'}</span>
        <button
          onClick={copy}
          className="text-xs opacity-60 hover:opacity-100 transition-opacity"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm font-mono bg-ivory leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function AttachmentThumbnail({ src }) {
  const [enlarged, setEnlarged] = useState(false);
  const url = `/api/uploads/${src}`;

  return (
    <>
      <img
        src={url}
        alt="附件"
        className="h-20 w-20 object-cover rounded-lg cursor-pointer border border-border hover:opacity-90 transition-opacity"
        onClick={() => setEnlarged(true)}
      />
      {enlarged && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
          onClick={() => setEnlarged(false)}
        >
          <img src={url} alt="附件" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </>
  );
}

// 复制按钮（通用）
function CopyButton({ getText }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 text-text-secondary"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {copied ? '已复制' : '复制'}
    </button>
  );
}

export default function MessageItem({ message, character, persona, worldId, isStreaming, streamingText, onEdit, onRegenerate, onEditAssistant }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);

  const [editingAI, setEditingAI] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const aiTextareaRef = useRef(null);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  let displayContent = message.content || '';
  let interrupted = false;
  if (displayContent.includes('[已中断]')) {
    displayContent = displayContent.replace(/\n?\n?\[已中断\]/, '').trimEnd();
    interrupted = true;
  }

  if (!isStreaming) {
    displayContent = applyRules(displayContent, 'display_only', worldId ?? null);
  }

  // ── 用户消息编辑 ──
  function startEdit() {
    setDraft(message.content);
    setEditing(true);
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

  function confirmEdit() {
    if (draft.trim() && draft !== message.content) {
      onEdit(message.id, draft.trim());
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') cancelEdit();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
  }

  // ── AI 消息编辑 ──
  function startEditAI() {
    setAiDraft(message.content);
    setEditingAI(true);
  }

  useEffect(() => {
    if (editingAI && aiTextareaRef.current) {
      aiTextareaRef.current.focus();
      aiTextareaRef.current.style.height = 'auto';
      aiTextareaRef.current.style.height = aiTextareaRef.current.scrollHeight + 'px';
    }
  }, [editingAI]);

  function confirmEditAI() {
    if (aiDraft.trim() && aiDraft !== message.content) {
      onEditAssistant?.(message.id, aiDraft.trim());
    }
    setEditingAI(false);
  }

  function cancelEditAI() {
    setEditingAI(false);
  }

  function handleKeyDownAI(e) {
    if (e.key === 'Escape') cancelEditAI();
  }

  const avatarColor = getAvatarColor(character?.id);
  const avatarUrl = getAvatarUrl(character?.avatar_path);
  const personaAvatarColor = getAvatarColor(persona?.id);
  const personaAvatarUrl = getAvatarUrl(persona?.avatar_path);
  const personaInitial = (persona?.name || '玩')[0].toUpperCase();

  // 打点动画
  if (isStreaming && !streamingText) {
    return (
      <div className="flex items-start gap-3 mb-4">
        <div
          className="flex-none w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: avatarColor }}
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
            : (character?.name?.[0] || '?')}
        </div>
        <div className="flex flex-col gap-1 max-w-[75%]">
          <span className="text-xs opacity-50 mb-0.5">{character?.name}</span>
          <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-ivory border border-border flex items-center gap-1" style={{ minHeight: '44px' }}>
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      </div>
    );
  }

  // 流式追加
  if (isStreaming) {
    return (
      <div className="flex items-start gap-3 mb-4">
        <div
          className="flex-none w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden"
          style={{ background: avatarColor }}
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="w-6 h-6 object-cover" />
            : (character?.name?.[0] || '?')}
        </div>
        <div className="flex flex-col gap-1 max-w-[75%]">
          <span className="text-xs opacity-50 mb-0.5">{character?.name}</span>
          <div className="we-chat-bubble px-4 py-3 rounded-2xl rounded-tl-sm bg-ivory border border-border text-text text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              components={MD_COMPONENTS}
            >
              {streamingText}
            </ReactMarkdown>
            <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-pulse align-middle" />
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="we-chat-message we-chat-message-user flex items-end gap-3 mb-4 group justify-end">
        <div className="flex-1 min-w-0 flex flex-col items-end">
          {editing ? (
            <div className="w-full max-w-[75%]">
              <textarea
                ref={textareaRef}
                className="w-full px-4 py-3 rounded-2xl rounded-tr-sm bg-accent/10 border border-accent/40 text-text text-sm leading-relaxed resize-none outline-none"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={cancelEdit}
                  className="text-xs px-3 py-1 rounded border border-border hover:bg-sand transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmEdit}
                  className="text-xs px-3 py-1 rounded bg-accent text-white hover:opacity-90 transition-opacity"
                >
                  确认
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-[75%]">
              <div className="we-chat-bubble px-4 py-3 rounded-2xl rounded-tr-sm bg-accent/10 border border-accent/40 text-text text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
              {message.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 justify-end">
                  {message.attachments.map((att, i) => (
                    <AttachmentThumbnail key={i} src={att} />
                  ))}
                </div>
              )}
              {/* 下方悬停操作区 */}
              <div className="flex justify-end items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                <span className="text-xs opacity-40">{formatTime(message.created_at)}</span>
                <CopyButton getText={() => message.content} />
                <button
                  onClick={startEdit}
                  className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 text-text-secondary"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  编辑
                </button>
              </div>
            </div>
          )}
        </div>
        {/* 玩家头像 */}
        <div
          className="flex-none w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden"
          style={{ background: personaAvatarColor }}
        >
          {personaAvatarUrl
            ? <img src={personaAvatarUrl} alt="" className="w-6 h-6 object-cover" />
            : personaInitial}
        </div>
      </div>
    );
  }

  // assistant 消息
  return (
    <div className="we-chat-message we-chat-message-ai flex items-start gap-3 mb-4 group">
      <div
        className="flex-none w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden"
        style={{ background: avatarColor }}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt="" className="w-6 h-6 object-cover" />
          : (character?.name?.[0] || '?')}
      </div>
      <div className="flex flex-col gap-1 max-w-[75%]">
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-50">{character?.name}</span>
          {interrupted && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">
              已中断
            </span>
          )}
        </div>

        {editingAI ? (
          <div>
            <textarea
              ref={aiTextareaRef}
              className="w-full px-4 py-3 rounded-2xl rounded-tl-sm bg-ivory border border-accent/40 text-text text-sm leading-relaxed resize-none outline-none"
              value={aiDraft}
              onChange={(e) => {
                setAiDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={handleKeyDownAI}
              rows={4}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={cancelEditAI}
                className="text-xs px-3 py-1 rounded border border-border hover:bg-sand transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmEditAI}
                className="text-xs px-3 py-1 rounded bg-accent text-white hover:opacity-90 transition-opacity"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="we-chat-bubble px-4 py-3 rounded-2xl rounded-tl-sm bg-ivory border border-border text-text text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              components={MD_COMPONENTS}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        )}

        {message.attachments?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {message.attachments.map((att, i) => (
              <AttachmentThumbnail key={i} src={att} />
            ))}
          </div>
        )}

        {/* 下方悬停操作区 */}
        {!editingAI && (
          <div className="flex items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
            <span className="text-xs opacity-40">{formatTime(message.created_at)}</span>
            <button
              onClick={() => onRegenerate(message.id)}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 text-text-secondary"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
              </svg>
              重新生成
            </button>
            <CopyButton getText={() => displayContent} />
            <button
              onClick={startEditAI}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 text-text-secondary"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              编辑
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
