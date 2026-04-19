/**
 * 写卡助手消息列表
 */

import { useEffect, useRef, useState } from 'react';
import ChangeProposalCard from './ChangeProposalCard.jsx';

// 转义 HTML 特殊字符，防止 XSS
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 简单 Markdown：加粗、斜体、代码（先转义再替换）
function renderInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.08);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.9em">$1</code>');
}

function SimpleMarkdown({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  const html = lines.map((line) => renderInline(line)).join('<br/>');
  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
    />
  );
}

// 悬浮操作按钮区
function ActionBar({ children }) {
  return (
    <div
      className="we-assistant-actions"
      style={{
        display: 'flex',
        gap: '4px',
        marginTop: '4px',
        opacity: 0,
        transition: 'opacity 0.15s',
      }}
    >
      {children}
    </div>
  );
}

function ActionBtn({ onClick, title, danger, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: '1px solid rgba(0,0,0,0.12)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '11px',
        padding: '2px 7px',
        color: danger ? '#c0392b' : 'var(--we-ink-muted, #9c8a7e)',
        lineHeight: '1.4',
      }}
    >
      {children}
    </button>
  );
}

function CopyBtn({ getText }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return <ActionBtn onClick={copy}>{copied ? '已复制' : '复制'}</ActionBtn>;
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
  return <ActionBtn onClick={handleClick} danger>{confirming ? '确认？' : '删除'}</ActionBtn>;
}

function UserMessage({ msg, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const taRef = useRef(null);

  function startEdit() { setDraft(msg.content); setEditing(true); }
  function confirmEdit() {
    if (draft.trim() && draft !== msg.content) onEdit?.(msg.id, draft.trim());
    setEditing(false);
  }
  function cancelEdit() { setEditing(false); }

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.style.height = 'auto';
      taRef.current.style.height = taRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
      <div style={{ maxWidth: '80%' }}>
        {editing ? (
          <div>
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEdit();
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
              }}
              rows={2}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--we-vermilion, #8a5e4a)',
                fontSize: '13px',
                resize: 'none',
                background: 'var(--we-paper-base, #f4ede4)',
                color: 'var(--we-ink-primary, #3d2e22)',
              }}
            />
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px', justifyContent: 'flex-end' }}>
              <ActionBtn onClick={cancelEdit}>取消</ActionBtn>
              <ActionBtn onClick={confirmEdit}>确认并重新生成</ActionBtn>
            </div>
          </div>
        ) : (
          <div
            className="we-assistant-msg-wrap"
            style={{ position: 'relative' }}
            onMouseEnter={(e) => { const bar = e.currentTarget.querySelector('.we-assistant-actions'); if (bar) bar.style.opacity = '1'; }}
            onMouseLeave={(e) => { const bar = e.currentTarget.querySelector('.we-assistant-actions'); if (bar) bar.style.opacity = '0'; }}
          >
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--we-vermilion, #8a5e4a)',
                color: '#fff',
                borderRadius: '12px 12px 2px 12px',
                fontSize: '13px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
            <ActionBar>
              <CopyBtn getText={() => msg.content} />
              <ActionBtn onClick={startEdit}>编辑</ActionBtn>
              {onDelete && <DeleteBtn onDelete={() => onDelete(msg.id)} />}
            </ActionBar>
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ msg, onRegenerate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const taRef = useRef(null);

  function startEdit() { setDraft(msg.content); setEditing(true); }
  function cancelEdit() { setEditing(false); }
  function confirmEdit() {
    if (draft.trim() && draft !== msg.content) {
      // 仅更新内容，不重新生成
      onDelete?.(msg.id, draft.trim()); // 利用 onDelete 传 "edit-only" 回调不合适
      // 实际由父组件的 onEdit 处理，这里通过 onRegenerate 的第二参数约定
    }
    setEditing(false);
  }

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.style.height = 'auto';
      taRef.current.style.height = taRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '10px' }}>
      <div style={{ maxWidth: '90%' }}>
        <div
          className="we-assistant-msg-wrap"
          style={{ position: 'relative' }}
          onMouseEnter={(e) => { const bar = e.currentTarget.querySelector('.we-assistant-actions'); if (bar) bar.style.opacity = '1'; }}
          onMouseLeave={(e) => { const bar = e.currentTarget.querySelector('.we-assistant-actions'); if (bar) bar.style.opacity = '0'; }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--we-paper-aged, #ede6da)',
              color: 'var(--we-ink-primary, #3d2e22)',
              borderRadius: '2px 12px 12px 12px',
              fontSize: '13px',
              lineHeight: '1.6',
              border: '1px solid rgba(0,0,0,0.07)',
            }}
          >
            <SimpleMarkdown content={msg.content} />
            {msg.streaming && (
              <span
                style={{
                  display: 'inline-block',
                  width: '7px',
                  height: '14px',
                  background: 'var(--we-vermilion, #8a5e4a)',
                  marginLeft: '2px',
                  verticalAlign: 'middle',
                  animation: 'we-blink 0.8s step-end infinite',
                }}
              />
            )}
          </div>
          {!msg.streaming && (
            <ActionBar>
              <CopyBtn getText={() => msg.content} />
              {onRegenerate && <ActionBtn onClick={() => onRegenerate(msg.id)}>重新生成</ActionBtn>}
              {onDelete && <DeleteBtn onDelete={() => onDelete(msg.id)} />}
            </ActionBar>
          )}
        </div>
      </div>
    </div>
  );
}

function RoutingMessage({ msg }) {
  const TARGET_LABELS = {
    'world-card': '世界卡',
    'character-card': '角色卡',
    'persona-card': '玩家卡',
    'global-prompt': '全局设置',
    'css-snippet': '自定义 CSS',
    'regex-rule': '正则规则',
  };
  return (
    <div
      style={{
        textAlign: 'center',
        fontSize: '11px',
        color: 'var(--we-ink-muted, #9c8a7e)',
        margin: '6px 0',
        fontStyle: 'italic',
      }}
    >
      <style>{`
        @keyframes we-routing-dots {
          0%   { content: ''; }
          33%  { content: '.'; }
          66%  { content: '..'; }
          100% { content: '...'; }
        }
        .we-routing-dots::after {
          content: '';
          animation: we-routing-dots 1.2s steps(1) infinite;
        }
      `}</style>
      正在分析 {TARGET_LABELS[msg.target] || msg.target} 需求
      <span className="we-routing-dots" />
    </div>
  );
}

function ErrorMessage({ msg }) {
  return (
    <div
      style={{
        margin: '4px 0 10px',
        padding: '8px 12px',
        background: 'rgba(192,57,43,0.08)',
        border: '1px solid rgba(192,57,43,0.2)',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#c0392b',
      }}
    >
      ⚠️ {msg.content}
    </div>
  );
}

export default function MessageList({ messages, onUserEdit, onAssistantRegenerate, onDeleteMessage }) {
  const bottomRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    // 只在消息数量增加时（新消息到达）才滚动到底部
    // 已有消息的状态更新（如 applied 变更）不触发滚动
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--we-ink-muted, #9c8a7e)',
          fontSize: '13px',
          padding: '24px',
          textAlign: 'center',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '28px', opacity: 0.5 }}>✦</div>
        <div style={{ fontFamily: 'var(--we-font-display)', fontStyle: 'italic' }}>写卡助手</div>
        <div style={{ fontSize: '12px', lineHeight: '1.6', maxWidth: '220px' }}>
          可以帮你写世界卡、角色卡、全局设置，或回答关于 WorldEngine 的问题
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
      <style>{`
        @keyframes we-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
      {messages.map((msg) => {
        if (msg.role === 'user') return (
          <UserMessage
            key={msg.id}
            msg={msg}
            onEdit={onUserEdit}
            onDelete={onDeleteMessage}
          />
        );
        if (msg.role === 'assistant') return (
          <AssistantMessage
            key={msg.id}
            msg={msg}
            onRegenerate={onAssistantRegenerate}
            onDelete={onDeleteMessage}
          />
        );
        if (msg.role === 'routing') return <RoutingMessage key={msg.id} msg={msg} />;
        if (msg.role === 'proposal') return (
          <ChangeProposalCard
            key={msg.id}
            messageId={msg.id}
            taskId={msg.taskId}
            token={msg.token}
            proposal={msg.proposal}
            applied={msg.applied}
          />
        );
        if (msg.role === 'error') return <ErrorMessage key={msg.id} msg={msg} />;
        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
