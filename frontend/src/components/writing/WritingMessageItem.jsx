import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import QuillCursor from '../book/QuillCursor.jsx';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

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

export default function WritingMessageItem({
  message,
  isStreaming = false,
  persona,
  onEdit,
  onRegenerate,
  onEditAssistant,
}) {
  const content = message.content || '';
  const isUser = message.role === 'user';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);

  const [editingAI, setEditingAI] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const aiTextareaRef = useRef(null);

  if (!content && !isStreaming) return null;

  const label = isUser
    ? (persona?.name || '玩家').toUpperCase()
    : '旁白';

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

  return (
    <div className={`we-message-row we-prose-item ${isUser ? 'we-message-user' : 'we-message-assistant'}`}>
      <div className="we-message-label">{label}</div>
      <div style={isUser ? { borderLeft: '2px solid var(--we-amber)', paddingLeft: 16 } : undefined}>
        {isUser ? (
          editing ? (
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
                rows={3}
              />
              <div className="we-message-edit-actions">
                <button onClick={cancelEdit}>取消</button>
                <button className="primary" onClick={confirmEdit}>确认并重新生成</button>
              </div>
            </div>
          ) : (
            <>
              <div className="we-message-content">
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
                  {content}
                </ReactMarkdown>
              </div>
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
                </div>
              )}
            </>
          )
        ) : (
          editingAI ? (
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
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
                  {content}
                </ReactMarkdown>
                {isStreaming && <QuillCursor />}
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
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
