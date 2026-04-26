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
  const editInitContentRef = useRef('');

  function startEdit() { editInitContentRef.current = msg.content; setDraft(msg.content); setEditing(true); }
  function confirmEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== editInitContentRef.current.trim()) onEdit?.(msg.id, trimmed);
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
              <ActionBtn onClick={confirmEdit}>确认</ActionBtn>
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
            {msg.streaming && !msg.content ? (
              // 流式开始但首字未到：显示 typing dots（与对话"AI输出中"一致）
              <div className="we-typing-dots">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            ) : (
              <>
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
              </>
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

const TARGET_LABELS = {
  'world-card': '世界卡',
  'character-card': '角色卡',
  'persona-card': '玩家卡',
  'global-prompt': '全局设置',
  'css-snippet': '自定义 CSS',
  'regex-rule': '正则规则',
};

const TOOL_LABELS = {
  preview_card: '正在查询卡片',
  read_file: '正在读取文件',
};

function MainAgentThinking({ toolName }) {
  const label = (toolName && TOOL_LABELS[toolName]) || '正在处理';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 2px',
        margin: '4px 0',
        fontSize: '11px',
        color: 'var(--we-ink-muted, #9c8a7e)',
        fontStyle: 'italic',
      }}
    >
      <span className="typing-dot" style={{ background: 'var(--we-vermilion, #8a5e4a)', opacity: 0.75 }} />
      <span className="typing-dot" style={{ background: 'var(--we-vermilion, #8a5e4a)', opacity: 0.75 }} />
      <span className="typing-dot" style={{ background: 'var(--we-vermilion, #8a5e4a)', opacity: 0.75 }} />
      <span>{label}…</span>
    </div>
  );
}

function RoutingMessage({ msg }) {
  const label = TARGET_LABELS[msg.target] || msg.target;
  const isDeepThinking = !!msg.lastThinkingAt;
  const verb = isDeepThinking ? '正在构建' : '正在分析';
  // msg.task 是主代理传入的自然语言任务描述，截取前 36 字显示
  const taskHint = msg.task ? msg.task.slice(0, 36) : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 2px',
        margin: '4px 0',
        fontSize: '11px',
        color: 'var(--we-ink-muted, #9c8a7e)',
        fontStyle: 'italic',
      }}
    >
      <span className="typing-dot" style={{ background: 'var(--we-vermilion, #8a5e4a)', opacity: 0.75 }} />
      <span className="typing-dot" style={{ background: 'var(--we-vermilion, #8a5e4a)', opacity: 0.75 }} />
      <span className="typing-dot" style={{ background: 'var(--we-vermilion, #8a5e4a)', opacity: 0.75 }} />
      <span>
        {verb} {label}
        {taskHint ? `：${taskHint}${msg.task.length > 36 ? '…' : ''}` : '…'}
      </span>
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

function TaskBadge({ children, tone = 'default' }) {
  const colors = tone === 'danger'
    ? { bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.2)', color: '#c0392b' }
    : tone === 'success'
      ? { bg: 'rgba(90,138,90,0.1)', border: 'rgba(90,138,90,0.18)', color: '#5a8a5a' }
      : { bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.08)', color: 'var(--we-ink-muted, #9c8a7e)' };
  return (
    <span style={{
      fontSize: '11px',
      padding: '2px 6px',
      borderRadius: '999px',
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: colors.color,
    }}>
      {children}
    </span>
  );
}

function TaskPanel({ task, onApprovePlan, onApproveStep, onCancelTask, onDismissTask }) {
  if (!task) return null;
  const steps = task.plan?.steps || task.graph || [];
  const awaitingStepId = task.awaitingStepId || steps.find((step) => step.status === 'awaiting_approval')?.id || null;
  return (
    <div
      style={{
        margin: '0 0 12px',
        padding: '10px 12px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.45)',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <strong style={{ fontSize: '13px', color: 'var(--we-ink-primary, #3d2e22)' }}>当前任务</strong>
        <TaskBadge tone={task.status === 'failed' ? 'danger' : task.status === 'completed' ? 'success' : 'default'}>
          {task.status}
        </TaskBadge>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--we-ink-primary, #3d2e22)', lineHeight: '1.6' }}>
        {task.goal}
      </div>
      {task.summary && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--we-ink-muted, #9c8a7e)', lineHeight: '1.6' }}>
          {task.summary}
        </div>
      )}
      {Array.isArray(task.pendingQuestions) && task.pendingQuestions.length > 0 && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--we-ink-primary, #3d2e22)' }}>
          {task.pendingQuestions.map((item, index) => (
            <div key={`${task.id}-q-${index}`}>{index + 1}. {item}</div>
          ))}
        </div>
      )}
      {steps.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {steps.map((step) => (
            <div
              key={step.id}
              style={{
                padding: '8px 9px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.03)',
                border: '1px solid rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--we-ink-primary, #3d2e22)', flex: 1 }}>
                  {step.title}
                </span>
                <TaskBadge tone={step.status === 'failed' ? 'danger' : step.status === 'completed' ? 'success' : 'default'}>
                  {step.status}
                </TaskBadge>
              </div>
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', lineHeight: '1.5' }}>
                {step.targetType} · {step.operation}
              </div>
              {step.proposalSummary && (
                <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', lineHeight: '1.5' }}>
                  changes: {step.proposalSummary.changeKeys?.join(', ') || '无'}
                  {step.proposalSummary.entryCount ? ` · 条目 ${step.proposalSummary.entryCount}` : ''}
                  {step.proposalSummary.stateFieldCount ? ` · 字段 ${step.proposalSummary.stateFieldCount}` : ''}
                </div>
              )}
              {awaitingStepId === step.id && step.proposal && (
                <div style={{ marginTop: '8px' }}>
                  <ChangeProposalCard
                    messageId={null}
                    proposal={step.proposal}
                    applied={step.status === 'completed'}
                    onApplyProposal={({ editedProposal }) => onApproveStep?.(step.id, editedProposal)}
                    applyLabel="确认并执行"
                  />
                </div>
              )}
              {awaitingStepId === step.id && !step.proposal && (
                <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                  <ActionBtn onClick={() => onApproveStep?.(step.id)}>确认此步骤</ActionBtn>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {task.status === 'awaiting_plan_approval' && (
          <ActionBtn onClick={onApprovePlan}>确认计划</ActionBtn>
        )}
        {task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'failed' && (
          <ActionBtn onClick={onCancelTask} danger>取消任务</ActionBtn>
        )}
        {(task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') && (
          <ActionBtn onClick={onDismissTask}>关闭</ActionBtn>
        )}
      </div>
    </div>
  );
}

export default function MessageList({
  messages,
  currentTask,
  onUserEdit,
  onAssistantRegenerate,
  onDeleteMessage,
  onApprovePlan,
  onApproveStep,
  onCancelTask,
  onDismissTask,
  isStreaming,
  activeToolCall,
}) {
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

  if (messages.length === 0 && !currentTask) {
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
        @keyframes we-proposal-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <TaskPanel
        task={currentTask}
        onApprovePlan={onApprovePlan}
        onApproveStep={onApproveStep}
        onCancelTask={onCancelTask}
        onDismissTask={onDismissTask}
      />
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
          <div key={msg.id} style={{ animation: 'we-proposal-in 0.28s ease forwards' }}>
            <ChangeProposalCard
              messageId={msg.id}
              taskId={msg.taskId}
              token={msg.token}
              proposal={msg.proposal}
              applied={msg.applied}
            />
          </div>
        );
        if (msg.role === 'error') return <ErrorMessage key={msg.id} msg={msg} />;
        return null;
      })}
      {isStreaming
        && !messages.some((m) => m.role === 'routing')
        && !messages.some((m) => m.role === 'assistant' && m.streaming)
        && <MainAgentThinking toolName={activeToolCall} />}
      <div ref={bottomRef} />
    </div>
  );
}
