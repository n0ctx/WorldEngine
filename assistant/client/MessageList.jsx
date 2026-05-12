/**
 * 写卡助手消息列表 — 卷宗条目（Scroll Entries）
 *
 * 所有消息（user / assistant / step / tool_call / plan_doc / error）共用同一卡片原子
 * `.we-asst-entry`，通过左侧细竖线区分语义；不再用气泡 + 紧凑工具条混排。
 *
 * 交互保留：
 *   - 入场动效（we-bubble-in）
 *   - 流式光标（首字到达后）
 *   - hover 显示按钮：user → 复制/编辑/删除；assistant → 复制/重新生成/删除
 *   - 编辑 user 消息确认后自动重新生成（由 AssistantPanel.handleEdit 实现）
 *   - 删除两段确认（首次"确认？"，2 秒内再次点击才真正删除）
 */

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PlanDocViewer from '../../frontend/src/components/assistant/PlanDocViewer.jsx';
import { stripToolCallLeakage } from './useAssistantStore.js';

const TOOL_LABELS = {
  preview_card: '预览卡片',
  list_resources: '列出资源',
  read_file: '读取文件',
  apply_world_card: '写入世界卡',
  apply_character_card: '写入角色卡',
  apply_persona_card: '写入用户卡',
  apply_global_config: '写入全局设置',
  apply_css_snippet: '写入 CSS 片段',
  apply_regex_rule: '写入正则规则',
  write_plan_doc: '编写计划',
  edit_plan_doc: '更新计划',
  dispatch_subagent: '派发子任务',
  delete_plan_doc: '清除计划',
  finalize_task: '完成任务',
};

const TOOL_EMOJI = {
  preview_card: '👁',
  list_resources: '📋',
  read_file: '📖',
  apply_world_card: '🌍',
  apply_character_card: '🧑',
  apply_persona_card: '👤',
  apply_global_config: '⚙️',
  apply_css_snippet: '🎨',
  apply_regex_rule: '🔧',
  write_plan_doc: '📝',
  edit_plan_doc: '✏️',
  dispatch_subagent: '📤',
  delete_plan_doc: '🗑',
  finalize_task: '✅',
};

const STATUS_TEXT = {
  running: '运行中…',
  done: '已完成',
  error: '失败',
};

function parseStreamingBlocks(rawText) {
  const text = stripToolCallLeakage(rawText);
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

function previewLine(text) {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 78)}…` : flat;
}

function ThinkLine({ content, open = false }) {
  const [expanded, setExpanded] = useState(false);
  const preview = previewLine(content) || '思考中…';
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? '折叠思考过程' : '展开思考过程'}
        className="we-asst-think-line"
      >
        <span className="we-asst-think-line__mark" aria-hidden="true">◦</span>
        <span className="we-asst-think-line__label">思考</span>
        {!expanded && (
          <span className="we-asst-think-line__preview">
            {preview}
            {open && '…'}
          </span>
        )}
      </button>
      {expanded && (
        <div className="we-asst-think-line__body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ onClick, danger, children, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`we-asst-entry__action${danger ? ' we-asst-entry__action--danger' : ''}`}
    >
      {children}
    </button>
  );
}

function CopyBtn({ getText }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  function copy() {
    try {
      navigator.clipboard?.writeText?.(getText());
    } catch {
      // 静默失败：浏览器无 clipboard 权限
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return (
    <ActionBtn onClick={copy} ariaLabel="复制">
      {copied ? '已复制' : '复制'}
    </ActionBtn>
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
    <ActionBtn onClick={handleClick} danger ariaLabel="删除">
      {confirming ? '确认？' : '删除'}
    </ActionBtn>
  );
}

function StatusDot({ status }) {
  if (status === 'done') {
    return <span className="we-asst-entry__dot we-asst-entry__dot--done" aria-label="已完成" />;
  }
  if (status === 'error') {
    return <span className="we-asst-entry__dot we-asst-entry__dot--error" aria-label="失败" />;
  }
  return null;
}

function UserEntry({ msg, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const taRef = useRef(null);

  function startEdit() {
    setDraft(msg.content);
    setEditing(true);
  }
  function confirmEdit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== (msg.content || '').trim()) {
      onEdit?.(msg.id, trimmed);
    }
  }
  function cancelEdit() {
    setEditing(false);
  }

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.style.height = 'auto';
      taRef.current.style.height = `${taRef.current.scrollHeight}px`;
    }
  }, [editing]);

  return (
    <div className="we-asst-row we-asst-row--user">
      {editing ? (
        <>
          <div className="we-asst-bubble we-asst-bubble--user">
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  confirmEdit();
                }
              }}
              rows={2}
              className="we-asst-bubble__edit"
            />
          </div>
          <div className="we-asst-bubble__actions we-asst-bubble__actions--visible">
            <ActionBtn onClick={cancelEdit} ariaLabel="取消编辑">取消</ActionBtn>
            <ActionBtn onClick={confirmEdit} ariaLabel="确认编辑">确认</ActionBtn>
          </div>
        </>
      ) : (
        <>
          <div className="we-asst-bubble we-asst-bubble--user">
            <div className="we-asst-bubble__body we-asst-bubble__body--pre">
              {msg.content}
            </div>
          </div>
          <div className="we-asst-bubble__actions">
            <CopyBtn getText={() => msg.content || ''} />
            {onEdit && <ActionBtn onClick={startEdit} ariaLabel="编辑">编辑</ActionBtn>}
            {onDelete && msg.id && <DeleteBtn onDelete={() => onDelete(msg.id)} />}
          </div>
        </>
      )}
    </div>
  );
}

function AssistantEntry({ msg, onRegenerate, onDelete }) {
  const blocks = msg.streaming && !msg.content
    ? null
    : parseStreamingBlocks(msg.content || '');
  const hasActions = !msg.streaming && msg.id && (onRegenerate || onDelete);
  const showActions = !msg.streaming && msg.content && (msg.id || true);
  return (
    <div className="we-asst-row we-asst-row--assistant">
      <div className="we-asst-bubble we-asst-bubble--assistant">
        {blocks === null ? (
          <div className="we-asst-bubble__body">
            <span className="we-asst-entry__pending" aria-label="助手正在思考">
              <span className="typing-dot typing-dot-accent" />
              <span className="typing-dot typing-dot-accent" />
              <span className="typing-dot typing-dot-accent" />
            </span>
          </div>
        ) : (
          blocks.map((block, i) =>
            block.type === 'thinking' ? (
              <ThinkLine key={i} content={block.content} open={!!msg.streaming && block.open} />
            ) : (
              <div key={i} className="we-asst-bubble__body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
              </div>
            ),
          )
        )}
        {msg.streaming && msg.content && (
          <span className="we-asst-stream-cursor" aria-hidden="true" />
        )}
      </div>
      {showActions && (
        <div className="we-asst-bubble__actions">
          <CopyBtn getText={() => msg.content || ''} />
          {hasActions && onRegenerate && msg.id && (
            <ActionBtn onClick={() => onRegenerate(msg.id)} ariaLabel="重新生成">
              重新生成
            </ActionBtn>
          )}
          {hasActions && onDelete && msg.id && (
            <DeleteBtn onDelete={() => onDelete(msg.id)} />
          )}
        </div>
      )}
    </div>
  );
}

function ToolEntry({ msg }) {
  const isStep = msg.role === 'step';
  const title = isStep
    ? (msg.title ?? msg.stepId)
    : (TOOL_LABELS[msg.toolName] ?? msg.toolName);
  const isRunning = msg.status === 'running';
  const isError = msg.status === 'error';
  const sub = msg.subtitle ?? STATUS_TEXT[msg.status] ?? '';
  const emoji = isStep ? '◦' : (TOOL_EMOJI[msg.toolName] ?? '🔹');
  const variantClass = isError
    ? 'we-asst-entry--error'
    : isRunning
      ? 'we-asst-entry--tool-running'
      : 'we-asst-entry--tool';
  return (
    <div
      className={`we-asst-entry ${variantClass}`}
      role={isRunning ? 'status' : undefined}
      aria-live={isRunning ? 'polite' : undefined}
    >
      <div className="we-asst-entry__head">
        <span className="we-asst-tool__icon" aria-hidden="true">{emoji}</span>
        <span className="we-asst-entry__title">{title}</span>
        {sub && <span className="we-asst-entry__sub">{sub}</span>}
        <StatusDot status={msg.status} />
      </div>
    </div>
  );
}

function ErrorEntry({ msg }) {
  return (
    <div className="we-asst-entry we-asst-entry--error" role="alert">
      <div className="we-asst-entry__head">
        <span className="we-asst-entry__title">出错</span>
        <StatusDot status="error" />
      </div>
      <div className="we-asst-entry__body">{msg.content}</div>
    </div>
  );
}

function PlanEntry({ content }) {
  return (
    <div className="we-asst-entry we-asst-entry--plan">
      <div className="we-asst-entry__head">
        <span className="we-asst-entry__title">任务计划</span>
      </div>
      <div className="we-asst-entry__fleuron" aria-hidden="true">❦</div>
      <div className="we-asst-entry__body">
        <PlanDocViewer content={content} variant="plain" />
      </div>
    </div>
  );
}

function PendingEntry() {
  return (
    <div className="we-asst-row we-asst-row--assistant" role="status" aria-label="助手正在思考">
      <div className="we-asst-bubble we-asst-bubble--assistant">
        <div className="we-asst-bubble__body">
          <span className="we-asst-entry__pending">
            <span className="typing-dot typing-dot-accent" />
            <span className="typing-dot typing-dot-accent" />
            <span className="typing-dot typing-dot-accent" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MessageList({ messages, onEdit, onDelete, onRegenerate, pending }) {
  const bottomRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (pending) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pending]);

  if (messages.length === 0) {
    return (
      <div className="we-assistant-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="we-asst-empty">
          <div className="we-asst-empty__title">写卡助手</div>
          <div className="we-asst-empty__hint">
            可以帮你写世界卡、角色卡、全局设置，或回答关于 WorldEngine 的问题
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="we-assistant-scroll we-asst-stream min-h-0 flex-1 overflow-y-auto">
      {messages.map((msg, i) => {
        const key = msg.id ?? `${msg.role}-${i}`;
        if (msg.role === 'step' || msg.role === 'tool_call') {
          return <ToolEntry key={key} msg={msg} />;
        }
        if (msg.role === 'user') {
          return <UserEntry key={key} msg={msg} onEdit={onEdit} onDelete={onDelete} />;
        }
        if (msg.role === 'assistant') {
          return (
            <AssistantEntry
              key={key}
              msg={msg}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
            />
          );
        }
        if (msg.role === 'error') return <ErrorEntry key={key} msg={msg} />;
        if (msg.role === 'plan_doc') return <PlanEntry key={key} content={msg.content} />;
        return null;
      })}
      {pending && <PendingEntry />}
      <div ref={bottomRef} />
    </div>
  );
}
