/**
 * 写卡助手消息列表 — 卷宗条目（Scroll Entries）
 *
 * user / assistant 用左右气泡；tool_call / error 用紧凑的过程卡 `.we-asst-entry`，
 * 错误卡靠整圈描边和「出错」标题区分。
 *
 * 交互保留：
 *   - 入场动效（we-bubble-in）
 *   - 流式光标（首字到达后）
 *   - hover 显示按钮：user → 复制/编辑/删除；assistant → 复制/重新生成/删除
 *   - 编辑 user 消息确认后自动重新生成（由 AssistantPanel.handleEdit 实现）
 *   - 删除两段确认（首次"确认？"，2 秒内再次点击才真正删除）
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Check, Copy, PencilLine, RotateCcw, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stripToolCallLeakage } from './useAssistantStore.js';
import { parseStreamingBlocks } from '../../frontend/src/core/utils/think-blocks.js';
import SeamlessEditableSurface from '../../shared/SeamlessEditableSurface.jsx';

const TOOL_LABELS = {
  read: '读取',
  create: '新建',
  update: '修改',
  edit: '编辑',
  set_state: '设置状态',
  delete: '删除',
  find: '搜索',
};

const TOOL_EMOJI = {
  read: '📖',
  create: '✨',
  update: '✏️',
  edit: '✏️',
  set_state: '🎚',
  delete: '🗑',
  find: '🔍',
};

const STATUS_TEXT = {
  running: '运行中…',
  error: '失败',
};

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
    <ActionBtn onClick={copy} ariaLabel={copied ? '已复制到剪贴板' : '复制'}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
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
    <ActionBtn onClick={handleClick} danger={confirming} ariaLabel={confirming ? '确认删除' : '删除'}>
      <Trash2 size={14} />
      {confirming ? '再点一次删除' : '删除'}
    </ActionBtn>
  );
}

function ErrorDot() {
  return <span className="we-asst-entry__dot we-asst-entry__dot--error" aria-label="失败" />;
}

// 比较器基于 msg 对象引用：store 以不可变 .map/.slice 更新 messages，未改动的条目保留
// 同一引用，仅被改写的条目会得到新对象；onEdit/onDelete/onRegenerate 均为父级 useCallback
// 稳定引用。因此 prev.msg === next.msg 即可让非流式历史条目跳过重渲，同时让每帧产生新对象
// 的流式 assistant 条目正常重渲。比 (id+content+status+streaming) 字段表更稳：ToolEntry
// 还依赖 title/subtitle，字段表会漏掉 STEP_STARTED 改 title 而 status 不变的更新。
function sameMsg(prev, next) {
  return prev.msg === next.msg;
}

function UserEntryImpl({ msg, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEdit() {
    setDraft(msg.content);
    setEditing(true);
  }
  function confirmEdit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed) {
      onEdit?.(msg.id, trimmed);
    }
  }
  function cancelEdit() {
    setEditing(false);
  }

  return (
    <div className="we-asst-row we-asst-row--user">
      <div className={`we-asst-bubble we-asst-bubble--user${editing ? ' we-asst-bubble--editing' : ''}`}>
        <SeamlessEditableSurface
          editing={editing}
          selectEnd
          trackValue={draft}
          readClassName="we-asst-bubble__body we-asst-bubble__body--pre"
          renderRead={() => msg.content}
          renderEditor={({ editorRef, syncLayout }) => (
            <textarea
              ref={editorRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                syncLayout();
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
              className="we-seamless-edit__textarea we-asst-bubble__edit"
            />
          )}
        />
      </div>
      <div className={`we-asst-bubble__actions${editing ? ' we-asst-bubble__actions--visible' : ''}`}>
        {editing ? (
          <>
            <ActionBtn onClick={cancelEdit} ariaLabel="取消编辑">取消</ActionBtn>
            <ActionBtn onClick={confirmEdit} ariaLabel="确认编辑">确认</ActionBtn>
          </>
        ) : (
          <>
            <CopyBtn getText={() => msg.content || ''} />
            {onEdit && (
              <ActionBtn onClick={startEdit} ariaLabel="编辑">
                <PencilLine size={14} />
                编辑
              </ActionBtn>
            )}
            {onDelete && msg.id && <DeleteBtn onDelete={() => onDelete(msg.id)} />}
          </>
        )}
      </div>
    </div>
  );
}

const UserEntry = memo(UserEntryImpl, sameMsg);

function AssistantEntryImpl({ msg, onRegenerate, onDelete }) {
  // 对解析结果按 content（及 streaming 占位态）做 useMemo：避免同一条 assistant 在
  // 无关重渲（如父级状态变化）时重复跑 stripToolCallLeakage + parseStreamingBlocks。
  // 注意：流式条目本身每帧 content 变化仍会重算（这是其语义），真正消除"每帧全列表重解析"
  // 的是 sameMsg memo 让非流式历史条目整体跳过。
  const blocks = useMemo(
    () => (msg.streaming && !msg.content
      ? null
      : parseStreamingBlocks(stripToolCallLeakage(msg.content || ''), { isStreaming: !!msg.streaming })),
    [msg.streaming, msg.content],
  );
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
              <RotateCcw size={14} />
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

const AssistantEntry = memo(AssistantEntryImpl, sameMsg);

function ToolEntryImpl({ msg }) {
  const title = [TOOL_LABELS[msg.toolName] ?? msg.toolName, msg.summary].filter(Boolean).join(' ');
  const isRunning = msg.status === 'running';
  const isError = msg.status === 'error';
  const sub = isError && msg.error ? `失败：${msg.error}` : (STATUS_TEXT[msg.status] ?? '');
  const emoji = TOOL_EMOJI[msg.toolName] ?? '🔹';
  const variantClass = isError
    ? 'we-asst-entry--tool we-asst-entry--error'
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
        {isRunning && (
          <span className="we-asst-tool__spinner" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

const ToolEntry = memo(ToolEntryImpl, sameMsg);

function ErrorEntry({ msg }) {
  return (
    <div className="we-asst-entry we-asst-entry--tool we-asst-entry--error" role="alert">
      <div className="we-asst-entry__head">
        <span className="we-asst-entry__title">出错</span>
        <ErrorDot />
      </div>
      <div className="we-asst-entry__body">{msg.content}</div>
    </div>
  );
}

function PendingEntry() {
  return (
    <div className="we-asst-entry we-asst-entry--tool" role="status" aria-label="助手正在思考">
      <div className="we-asst-entry__head">
        <span className="we-asst-entry__pending">
          <span className="typing-dot typing-dot-accent" />
          <span className="typing-dot typing-dot-accent" />
          <span className="typing-dot typing-dot-accent" />
        </span>
      </div>
    </div>
  );
}

const STICKY_BOTTOM_THRESHOLD_PX = 200;

export default function MessageList({ messages, onEdit, onDelete, onRegenerate, pending }) {
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const prevCountRef = useRef(0);
  const [hasUnread, setHasUnread] = useState(false);

  // 用户向上滚出 STICKY_BOTTOM_THRESHOLD_PX 范围后，新消息不再强制滚到底部，
  // 改为右下角弹出"↓ 新消息"按钮；用户主动点击或重新滚回底部时再清除。
  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= STICKY_BOTTOM_THRESHOLD_PX;
  };

  useEffect(() => {
    if (messages.length <= prevCountRef.current) {
      prevCountRef.current = messages.length;
      return;
    }
    const nearBottom = isNearBottom();
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    // 推迟一帧再 setState：满足 react-hooks/set-state-in-effect 不允许在 effect 中同步 setState 的规则，
    // 同时保留"消息增加时根据滚动位置决定是否提示新消息"的语义。
    queueMicrotask(() => setHasUnread(!nearBottom));
    prevCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (pending && isNearBottom()) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pending]);

  const handleScroll = () => {
    if (hasUnread && isNearBottom()) setHasUnread(false);
  };

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setHasUnread(false);
  };

  if (messages.length === 0) {
    return (
      <div className="we-assistant-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="we-asst-empty">
          <div className="we-asst-empty__title">想写点什么？</div>
          <div className="we-asst-empty__hint">
            可以帮你写世界卡、角色卡、全局设置，或回答关于 WorldEngine 的问题
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="we-assistant-scroll we-asst-stream min-h-0 h-full overflow-y-auto"
      >
        {messages.map((msg, i) => {
          const key = msg.id ?? `${msg.role}-${i}`;
          if (msg.role === 'tool_call') return <ToolEntry key={key} msg={msg} />;
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
          return null;
        })}
        {pending && <PendingEntry />}
        <div ref={bottomRef} />
      </div>
      {hasUnread && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="we-asst-new-msg-btn"
          aria-label="跳到最新消息"
        >
          <ArrowDown size={14} className="we-asst-new-msg-arrow" />
          新消息
        </button>
      )}
    </div>
  );
}
