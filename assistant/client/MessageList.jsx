/**
 * 写卡助手消息列表
 */

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChangeProposalCard from './ChangeProposalCard.jsx';

function SimpleMarkdown({ content }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p style={{ margin: '0 0 6px', lineHeight: '1.6', wordBreak: 'break-word' }}>{children}</p>
        ),
        h1: ({ children }) => (
          <h1 style={{ fontSize: '1.1em', fontWeight: 700, margin: '8px 0 4px' }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ fontSize: '1.05em', fontWeight: 700, margin: '8px 0 4px' }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '6px 0 3px' }}>{children}</h3>
        ),
        ul: ({ children }) => (
          <ul style={{ margin: '4px 0 6px', paddingLeft: '18px' }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ margin: '4px 0 6px', paddingLeft: '18px' }}>{children}</ol>
        ),
        li: ({ children }) => (
          <li style={{ marginBottom: '2px', lineHeight: '1.5' }}>{children}</li>
        ),
        code: ({ inline, children }) =>
          inline ? (
            <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9em' }}>
              {children}
            </code>
          ) : (
            <pre style={{ background: 'rgba(0,0,0,0.06)', padding: '8px 10px', borderRadius: '6px', overflowX: 'auto', margin: '6px 0' }}>
              <code style={{ fontFamily: 'monospace', fontSize: '0.88em' }}>{children}</code>
            </pre>
          ),
        blockquote: ({ children }) => (
          <blockquote style={{ borderLeft: '3px solid var(--we-vermilion, #8a5e4a)', margin: '4px 0', paddingLeft: '10px', color: 'var(--we-ink-muted, #9c8a7e)', fontStyle: 'italic' }}>
            {children}
          </blockquote>
        ),
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.12)', margin: '8px 0' }} />,
        strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--we-vermilion, #8a5e4a)', textDecoration: 'underline' }}>
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
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
    const trimmed = draft.trim();
    if (trimmed && trimmed !== msg.content.trim()) onEdit?.(msg.id, trimmed);
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

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed']);

const TASK_STATUS_LABELS = {
  pending: '等待中',
  researching: '探索中',
  clarifying: '待澄清',
  planning: '规划中',
  awaiting_plan_approval: '待确认计划',
  executing: '执行中',
  awaiting_step_approval: '待确认步骤',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const STEP_STATUS_LABELS = {
  pending: '待执行',
  running: '执行中',
  awaiting_approval: '待确认',
  completed: '已完成',
  failed: '失败',
  blocked: '等待依赖',
  skipped: '已跳过',
};

function MiniList({ title, items }) {
  const normalized = Array.isArray(items)
    ? items.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  if (normalized.length === 0) return null;
  return (
    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', lineHeight: '1.5' }}>
      <div style={{ color: 'var(--we-ink-primary, #3d2e22)', fontWeight: 600 }}>{title}</div>
      {normalized.slice(0, 3).map((item, index) => (
        <div key={`${title}-${index}`}>- {item}</div>
      ))}
    </div>
  );
}

function TaskPanel({ task, onApprovePlan, onApproveStep, onCancelTask, onDismissTask }) {
  if (!task) return null;

  const steps = task.plan?.steps || task.graph || [];
  const awaitingStepId = task.awaitingStepId || steps.find((step) => step.status === 'awaiting_approval')?.id || null;
  const research = task.research;
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
          {TASK_STATUS_LABELS[task.status] || task.status}
        </TaskBadge>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--we-ink-primary, #3d2e22)', lineHeight: '1.6' }}>
        {task.summary || task.goal}
      </div>
      {research?.summary && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 9px',
            borderRadius: '8px',
            background: 'rgba(138,94,74,0.06)',
            border: '1px solid rgba(138,94,74,0.12)',
            fontSize: '11px',
            color: 'var(--we-ink-muted, #9c8a7e)',
            lineHeight: '1.5',
          }}
        >
          <div style={{ color: 'var(--we-ink-primary, #3d2e22)', fontWeight: 600, marginBottom: '3px' }}>探索依据</div>
          <div>{research.summary}</div>
          <MiniList title="约束" items={research.constraints} />
          <MiniList title="缺口" items={research.gaps} />
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
          {steps.map((step) => {
            const isCompleted = step.status === 'completed';
            const isRunning = step.status === 'running';
            const isFailed = step.status === 'failed';
            return (
            <div
              key={step.id}
              style={{
                padding: '8px 9px',
                borderRadius: '8px',
                background: isCompleted
                  ? 'rgba(90,138,90,0.07)'
                  : isRunning
                    ? 'rgba(138,94,74,0.06)'
                    : isFailed
                      ? 'rgba(192,57,43,0.05)'
                      : 'rgba(0,0,0,0.03)',
                border: isCompleted
                  ? '1px solid rgba(90,138,90,0.18)'
                  : isRunning
                    ? '1px solid rgba(138,94,74,0.15)'
                    : isFailed
                      ? '1px solid rgba(192,57,43,0.15)'
                      : '1px solid rgba(0,0,0,0.05)',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: isCompleted ? 'var(--we-ink-secondary, #6b5a4e)' : 'var(--we-ink-primary, #3d2e22)', flex: 1 }}>
                  {isCompleted && <span style={{ color: '#5a8a5a', marginRight: '4px' }}>✓</span>}
                  {isRunning && <span style={{ marginRight: '4px', opacity: 0.7 }}>⋯</span>}
                  {step.title}
                </span>
                <TaskBadge tone={isFailed ? 'danger' : isCompleted ? 'success' : 'default'}>
                  {STEP_STATUS_LABELS[step.status] || step.status}
                </TaskBadge>
              </div>
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', lineHeight: '1.5' }}>
                {step.targetType} · {step.operation}
              </div>
              {step.rationale && (
                <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', lineHeight: '1.5' }}>
                  目的：{step.rationale}
                </div>
              )}
              {step.expectedOutput && (
                <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', lineHeight: '1.5' }}>
                  产出：{step.expectedOutput}
                </div>
              )}
              <MiniList title="输入" items={step.inputs} />
              <MiniList title="验收" items={step.acceptance} />
              {step.rollbackRisk && (
                <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', lineHeight: '1.5' }}>
                  风险：{step.rollbackRisk}
                </div>
              )}
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
          );
          })}
        </div>
      )}
      <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {task.status === 'awaiting_plan_approval' && (
          <ActionBtn onClick={onApprovePlan}>确认计划</ActionBtn>
        )}
        {task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'failed' && (
          <ActionBtn onClick={onCancelTask} danger>取消任务</ActionBtn>
        )}
        {TERMINAL_STATUSES.has(task.status) && (
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
      {(() => {
        const taskSteps = currentTask?.plan?.steps || currentTask?.graph || [];
        const taskHasHighRisk = taskSteps.some((s) => s.riskLevel === 'high');
        // 需要用户交互（审批/澄清）或步骤数 ≥3 时才渲染任务卡片；
        // 简单任务（status='executing' 且步骤数 <3 且无高风险）静默执行不弹卡
        const shouldShowTaskPanel = !currentTask
          ? false
          : currentTask.status === 'awaiting_plan_approval'
          || currentTask.status === 'awaiting_step_approval'
          || currentTask.status === 'executing'
          || currentTask.status === 'clarifying'
          || TERMINAL_STATUSES.has(currentTask.status)
          || taskSteps.length > 2
          || taskHasHighRisk;
        const taskPanel = shouldShowTaskPanel ? (
          <TaskPanel
            key={`task-${currentTask.id}`}
            task={currentTask}
            onApprovePlan={onApprovePlan}
            onApproveStep={onApproveStep}
            onCancelTask={onCancelTask}
            onDismissTask={onDismissTask}
          />
        ) : null;
        const anchorId = currentTask?.anchorMessageId;
        let taskRendered = false;
        const items = messages.map((msg) => {
          let node = null;
          if (msg.role === 'user') node = (
            <UserMessage
              key={msg.id}
              msg={msg}
              onEdit={onUserEdit}
              onDelete={onDeleteMessage}
            />
          );
          else if (msg.role === 'assistant') node = (
            <AssistantMessage
              key={msg.id}
              msg={msg}
              onRegenerate={onAssistantRegenerate}
              onDelete={onDeleteMessage}
            />
          );
          else if (msg.role === 'routing') node = <RoutingMessage key={msg.id} msg={msg} />;
          else if (msg.role === 'proposal') node = (
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
          else if (msg.role === 'error') node = <ErrorMessage key={msg.id} msg={msg} />;
          if (!node) return null;
          if (taskPanel && anchorId && anchorId === msg.id) {
            // eslint-disable-next-line react-hooks/immutability
            taskRendered = true;
            return [node, taskPanel];
          }
          return node;
        });
        return [items, taskPanel && !taskRendered ? taskPanel : null];
      })()}
      {isStreaming
        && !messages.some((m) => m.role === 'routing')
        && !messages.some((m) => m.role === 'assistant' && m.streaming)
        && <MainAgentThinking toolName={activeToolCall} />}
      <div ref={bottomRef} />
    </div>
  );
}
