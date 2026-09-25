/**
 * 写卡助手侧边面板（单 /agent 接口模型）
 *
 * 布局：消息列表（含工具调用记录）→ 输入框
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, RotateCcw, Sparkles, X } from 'lucide-react';
import { useAssistantStore } from './useAssistantStore.js';
import {
  streamAgent,
  resumeTask,
  fetchTask,
  recoverTask,
  listRecoverableTasks,
  cancelTask,
  truncateFrom as apiTruncateFrom,
  deleteMessage as apiDeleteMessage,
} from './api.js';
import MessageList from './MessageList.jsx';
import InputBox from './InputBox.jsx';
import DragHandle from './DragHandle.jsx';
import { findRegenerateSource } from './message-helpers.js';
import { SSE_EVENTS } from '../server/sse-events.js';
import useStore from '../../frontend/src/core/state/index.js';
import { getWorld } from '../../frontend/src/core/api/worlds.js';
import { getCharacter } from '../../frontend/src/core/api/characters.js';
import { getConfig } from '../../frontend/src/core/api/config.js';
import { log } from '../../frontend/src/core/utils/logger.js';
import { useEscapeKey } from '../../frontend/src/core/hooks/useEscapeKey.js';

const RECOVERABLE_TERMINAL_ERROR = 'interrupted by restart';

function isRestartInterrupted(error) {
  return error === RECOVERABLE_TERMINAL_ERROR;
}

async function loadAssistantContext(currentWorldId, currentCharacterId) {
  let context = { worldId: currentWorldId, characterId: currentCharacterId };
  try {
    const [world, character, config] = await Promise.all([
      currentWorldId ? getWorld(currentWorldId).catch(() => null) : Promise.resolve(null),
      currentCharacterId ? getCharacter(currentCharacterId).catch(() => null) : Promise.resolve(null),
      getConfig().catch(() => null),
    ]);
    context = { ...context, world, character, config };
  } catch {
    // 上下文拉取失败不阻断
  }
  return context;
}

async function resumeAssistantTask({ nextTaskId, abortRef, setIsStreaming, ingestEvent }) {
  if (!nextTaskId) return;
  abortRef.current?.abort?.();
  const ctrl = new AbortController();
  abortRef.current = ctrl;
  setIsStreaming(true);
  try {
    await resumeTask({ taskId: nextTaskId, onEvent: ingestEvent, signal: ctrl.signal });
  } catch (err) {
    if (err?.name !== 'AbortError') {
      log.error('assistant.resume.resume_failed', err, {
        toast: err?.message || '断点续传恢复失败',
      });
      ingestEvent({ type: SSE_EVENTS.TASK_FAILED, error: err?.message || '恢复订阅失败' });
    }
  } finally {
    // 只对仍活跃的 ctrl 收回 isStreaming，避免覆盖下一轮 handleSend 已设置的 true
    if (abortRef.current === ctrl) {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }
}

async function recoverAssistantTask({ recovery, runtime }) {
  const {
    isOpen,
    isStreaming,
    taskId,
    status,
    isRestartRecoverable,
    currentWorldId,
    currentCharacterId,
  } = recovery;
  const { abortRef, recoveringRef, recoveryToastKeyRef, setIsStreaming } = runtime;
  if (!isOpen || recoveringRef.current || isStreaming) return;
  const shouldRecover = Boolean(taskId) || status === 'running' || isRestartRecoverable;
  if (!shouldRecover) return;

  recoveringRef.current = true;
  try {
    let task = null;
    let recoveryMode = 'existing';
    if (taskId) task = await fetchTask(taskId).catch(() => null);
    if (!task) {
      // 按当前世界 / 角色上下文严格匹配，避免跨上下文串台。
      task = await recoverTask({
        worldId: currentWorldId ?? null,
        characterId: currentCharacterId ?? null,
      }).catch(() => null);
      recoveryMode = 'latest';
    }
    const store = useAssistantStore.getState();
    if (!task) {
      if (taskId) store.resetTask();
      // 当前上下文无可恢复任务时，主动检查其它上下文是否还有未完成任务，给用户一个温和提示。
      try {
        const others = await listRecoverableTasks({
          worldId: currentWorldId ?? null,
          characterId: currentCharacterId ?? null,
        });
        if (others.length > 0) {
          log.info('assistant.resume.other_context', null, {
            toast: `其它世界 / 角色还有 ${others.length} 个未完成的写卡任务，切换上下文后可继续`,
          });
        }
      } catch {
        // 忽略列表查询失败
      }
      return;
    }

    store.replaceTaskSnapshot(task);
    const toastKey = `${task.id}:${task.updatedAt ?? ''}:${task.status}:${task.error ?? ''}`;
    const shouldAutoResume =
      task.status === 'running' || (task.status === 'failed' && isRestartInterrupted(task.error));
    if (shouldAutoResume && recoveryToastKeyRef.current !== toastKey) {
      recoveryToastKeyRef.current = toastKey;
      if (task.status === 'failed' && isRestartInterrupted(task.error)) {
        log.warn('assistant.resume.interrupted', null, {
          toast: '已恢复中断前快照，旧执行因服务重启已停止',
        });
      } else if (recoveryMode === 'latest') {
        log.info('assistant.resume.latest', null, { toast: '已恢复最近的写卡助手任务' });
      } else {
        log.info('assistant.resume.reconnected', null, { toast: '写卡助手已恢复连接' });
      }
    }
    if (shouldAutoResume) {
      await resumeAssistantTask({
        nextTaskId: task.id,
        abortRef,
        setIsStreaming,
        ingestEvent: store.ingestEvent,
      });
    }
  } finally {
    recoveringRef.current = false;
  }
}

function subscribeToRecoverySignals(runRecovery) {
  const onVisible = () => {
    if (document.visibilityState === 'visible') runRecovery();
  };
  const onFocus = () => runRecovery();
  const onOnline = () => runRecovery();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onOnline);
  };
}

async function stopAssistantTask(taskId, abortRef, setIsStreaming) {
  abortRef.current?.abort?.();
  setIsStreaming(false);
  const { ingestEvent, replaceTaskSnapshot } = useAssistantStore.getState();
  if (!taskId) {
    ingestEvent({ type: SSE_EVENTS.TASK_CANCELLED, taskId });
    return;
  }
  try {
    await cancelTask(taskId);
    const task = await fetchTask(taskId).catch(() => null);
    const terminal = task && ['completed', 'failed', 'cancelled'].includes(task.status);
    if (task && terminal) {
      replaceTaskSnapshot(task);
      return;
    }
  } catch {
    // ignore：fall through to local fallback
  }
  ingestEvent({ type: SSE_EVENTS.TASK_CANCELLED, taskId });
}

async function sendAssistantMessage({
  overrideText,
  opts,
  input,
  taskId,
  setInput,
  abortRef,
  setIsStreaming,
  buildContext,
}) {
  const useOverride = typeof overrideText === 'string';
  const text = (useOverride ? overrideText : input).trim();
  if (!text) return;
  // `/stop` 是用户主动终止当前任务的"命令式"输入，不真的发送给 LLM。
  if (!useOverride && text === '/stop') {
    setInput('');
    await stopAssistantTask(taskId, abortRef, setIsStreaming);
    return;
  }
  if (!useOverride) setInput('');
  const messageId =
    opts.messageId ??
    `msg-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)}`;
  const { pushUserMessage, beginUserTurn, ingestEvent } = useAssistantStore.getState();
  if (!opts.skipPush) pushUserMessage(text, messageId);
  if (taskId) beginUserTurn(taskId);
  // 关键：abort + isStreaming 必须在任何 await 之前同步设置，避免恢复快照吞掉刚写入的 user 气泡。
  abortRef.current?.abort?.();
  const ctrl = new AbortController();
  abortRef.current = ctrl;
  setIsStreaming(true);
  try {
    const context = await buildContext();
    await streamAgent({
      taskId,
      message: text,
      messageId,
      context,
      onEvent: ingestEvent,
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err?.name !== 'AbortError') {
      ingestEvent({ type: SSE_EVENTS.TASK_FAILED, error: err?.message || '请求失败' });
    }
  } finally {
    // 只对仍活跃的 ctrl 收回 isStreaming（见 resumeAssistantTask）
    if (abortRef.current === ctrl) {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }
}

async function editAssistantMessage({ taskId, msgId, newContent, abortRef, handleSend }) {
  if (!taskId || !msgId) return;
  // 截断会广播 messages_changed，必须先 abort 旧 SSE，避免旧快照吞掉替换后的 user 消息。
  abortRef.current?.abort?.();
  try {
    await apiTruncateFrom(taskId, msgId);
  } catch (err) {
    log.warn('assistant.truncate_failed', err, { toast: err?.message || '截断失败' });
    return;
  }
  // 复用原 messageId，保留气泡 DOM 和入场动画状态。
  useAssistantStore.getState().replaceTailWithUser(msgId, newContent, msgId);
  await handleSend(newContent, { skipPush: true, messageId: msgId });
}

async function deleteAssistantMessage(taskId, msgId) {
  if (!taskId || !msgId) return;
  // 局部删除失败只提示，不把整个任务推入 failed 终态。
  try {
    await apiDeleteMessage(taskId, msgId);
  } catch (err) {
    log.warn('assistant.delete_message_failed', err, { toast: err?.message || '删除失败' });
    return;
  }
  useAssistantStore.getState().deleteMessage(msgId);
}

async function regenerateLastAssistantTurn({ taskId, handleSend, abortRef }) {
  if (!taskId) return;
  const msgs = useAssistantStore.getState().messages;
  let lastUserMsg = null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user' && msgs[i].content) {
      lastUserMsg = msgs[i];
      break;
    }
  }
  if (!lastUserMsg?.id || !lastUserMsg.content) return;
  abortRef.current?.abort?.();
  try {
    await apiTruncateFrom(taskId, lastUserMsg.id);
  } catch (err) {
    log.warn('assistant.truncate_failed', err, { toast: err?.message || '截断失败' });
    return;
  }
  useAssistantStore
    .getState()
    .replaceTailWithUser(lastUserMsg.id, lastUserMsg.content, lastUserMsg.id);
  await handleSend(lastUserMsg.content, { skipPush: true, messageId: lastUserMsg.id });
}

async function regenerateAssistantTurn({ taskId, assistantMsgId, handleSend, abortRef }) {
  if (!taskId || !assistantMsgId) return;
  const source = findRegenerateSource(useAssistantStore.getState().messages, assistantMsgId);
  const prev = source?.message;
  if (!prev?.id || !prev.content) return;
  // 截断到 user 消息（含），避免重发时保留旧 assistant 回复或重复追加 user。
  abortRef.current?.abort?.();
  try {
    await apiTruncateFrom(taskId, prev.id);
  } catch (err) {
    log.warn('assistant.truncate_failed', err, { toast: err?.message || '截断失败' });
    return;
  }
  // 单次 store 更新，沿用 user id，避免气泡卸载重挂造成闪烁。
  useAssistantStore.getState().replaceTailWithUser(prev.id, prev.content, prev.id);
  await handleSend(prev.content, { skipPush: true, messageId: prev.id });
}

function resetAssistantConversation({ taskId, status, abortRef, setIsStreaming }) {
  // 必须先通知后端 cancel，避免旧工具循环在清空后继续落库。
  if (taskId && status === 'running') cancelTask(taskId).catch(() => {});
  abortRef.current?.abort?.();
  setIsStreaming(false);
  useAssistantStore.getState().reset();
}

export default function AssistantPanel() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const width = useAssistantStore((s) => s.width);
  const setWidth = useAssistantStore((s) => s.setWidth);
  const close = useAssistantStore((s) => s.close);
  const taskId = useAssistantStore((s) => s.taskId);
  const status = useAssistantStore((s) => s.status);
  const messages = useAssistantStore((s) => s.messages);
  const error = useAssistantStore((s) => s.error);

  const currentWorldId = useStore((s) => s.currentWorldId);
  const currentCharacterId = useStore((s) => s.currentCharacterId);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const asideRef = useRef(null);
  const abortRef = useRef(null);
  const recoveringRef = useRef(false);
  const recoveryToastKeyRef = useRef('');

  // 只有"服务重启被打断"才需要自动恢复 + 重新订阅 SSE。
  const isRestartRecoverable = status === 'failed' && isRestartInterrupted(error);

  // 页面刷新后任务态被清；store 不持久化任务字段，这里仅做防御
  useEffect(() => {
    const activeStreamRef = abortRef;
    return () => activeStreamRef.current?.abort?.();
  }, []);

  // 打开时焦点进输入框，关闭后还给打开前的位置（通常是顶栏的助手按钮）
  useEffect(() => {
    if (!isOpen) return undefined;
    const aside = asideRef.current;
    const returnFocusTo = document.activeElement;
    aside?.querySelector('textarea')?.focus({ preventScroll: true });
    return () => {
      if (aside?.contains(document.activeElement) || document.activeElement === document.body) {
        returnFocusTo?.focus?.({ preventScroll: true });
      }
    };
  }, [isOpen]);

  // Esc 关闭；与其它浮层叠放时只关最上层，消息编辑框自己消费 Esc 时不触发
  useEscapeKey(close, isOpen);

  // 主界面刷新事件按 tool_call_completed 实时派发（见 useAssistantStore），不等 task_completed。

  const buildContext = useCallback(
    () => loadAssistantContext(currentWorldId, currentCharacterId),
    [currentWorldId, currentCharacterId],
  );

  // 通用的恢复入口：开面板时 / 依赖变化时 / 回到前台时都走这里。
  // 重入靠 recoveringRef + isStreaming 守门，可被外部事件（visibility/focus/online）反复触发。
  const runRecovery = useCallback(
    () =>
      recoverAssistantTask({
        recovery: {
          isOpen,
          isStreaming,
          taskId,
          status,
          isRestartRecoverable,
          currentWorldId,
          currentCharacterId,
        },
        runtime: { abortRef, recoveringRef, recoveryToastKeyRef, setIsStreaming },
      }),
    [isOpen, isStreaming, taskId, status, isRestartRecoverable, currentWorldId, currentCharacterId],
  );

  // 依赖（isOpen / taskId / status / 上下文）变化时跑一次。
  useEffect(() => {
    runRecovery();
  }, [runRecovery]);

  // 回到前台 / 重新拿到焦点 / 网络恢复时再跑一次：SSE 长连接被中间层切断或浏览器后台节流后，
  // 仅靠 useEffect 依赖不会再触发；这里补上"用户回来"的钩子，避免出现"看着开着但没反应"。
  useEffect(() => {
    if (!isOpen) return;
    return subscribeToRecoverySignals(runRecovery);
  }, [isOpen, runRecovery]);

  const handleSend = useCallback(
    (overrideText, opts = {}) =>
      sendAssistantMessage({
        overrideText,
        opts,
        input,
        taskId,
        setInput,
        abortRef,
        setIsStreaming,
        buildContext,
      }),
    [input, taskId, buildContext],
  );

  const handleEdit = useCallback(
    (msgId, newContent) =>
      editAssistantMessage({ taskId, msgId, newContent, abortRef, handleSend }),
    [taskId, handleSend],
  );

  const handleDelete = useCallback((msgId) => deleteAssistantMessage(taskId, msgId), [taskId]);

  const handleRegenerateLastUser = useCallback(
    () => regenerateLastAssistantTurn({ taskId, handleSend, abortRef }),
    [taskId, handleSend],
  );

  const handleRegenerate = useCallback(
    (assistantMsgId) =>
      regenerateAssistantTurn({ taskId, assistantMsgId, handleSend, abortRef }),
    [taskId, handleSend],
  );

  const handleReset = useCallback(
    () => resetAssistantConversation({ taskId, status, abortRef, setIsStreaming }),
    [taskId, status],
  );

  // 后端允许在 completed / failed / cancelled 等状态上继续开新一轮对话；
  // 前端不再用任务状态封锁用户输入。真正终止执行由"停止"与"清空"负责。
  const inputDisabled = false;
  const hasRunningItem = messages.some(
    (m) => m.status === 'running' || m.streaming === true,
  );
  // 省略号气泡仅在模型思考、尚无运行中工具占位时出现；终态后立刻消失。
  const pendingAssistant = isStreaming && !hasRunningItem && status === 'running';


  return (
    <>
      {/* 背景遮罩：只盖顶栏以下，点击可关闭抽屉 */}
      {isOpen && <div className="we-asst-backdrop" onClick={close} aria-hidden="true" />}
      <aside
        ref={asideRef}
        aria-label="写卡助手"
        aria-hidden={!isOpen}
        inert={!isOpen}
        style={{ width: `${width}px` }}
        className={`we-asst-drawer${isOpen ? ' we-asst-drawer--open' : ''}`}
      >
        <DragHandle
          value={width}
          onChange={setWidth}
          min={320}
          max={720}
          orientation="vertical"
          inverted
          ariaLabel="拖动调整助手宽度"
          className="we-asst-drawer__resize"
        />
        <div className="we-asst-drawer__surface we-material">
          <header className="we-asst-drawer__header">
            <span className="we-asst-drawer__title">
              <Sparkles size={16} aria-hidden="true" />
              写卡助手
            </span>
            <AssistantStatusIndicator status={status} isStreaming={isStreaming} />
            <div className="we-asst-drawer__actions">
              {(messages.length > 0 || taskId) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="we-asst-drawer__icon-btn"
                  title="清空对话"
                  aria-label="清空对话"
                >
                  <Eraser size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="we-asst-drawer__icon-btn"
                title="关闭 (Esc)"
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {/* 消息流 */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <MessageList
              messages={messages}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRegenerate={handleRegenerate}
              pending={pendingAssistant}
            />
            {error && status === 'failed' && !isRestartRecoverable && (
              <div className="we-asst-error" role="alert">
                <span className="we-asst-error__text">{error}</span>
                <button
                  type="button"
                  onClick={handleRegenerateLastUser}
                  className="we-asst-error__retry"
                >
                  <RotateCcw size={14} />
                  重新生成
                </button>
              </div>
            )}
          </div>

          {/* 输入框（任务执行中也可以继续输入；新消息在服务端排队，输入 `/stop` 终止当前任务） */}
          <InputBox
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={inputDisabled}
          />
        </div>
      </aside>
    </>
  );
}

// 标题栏的"正在处理"微指示：仅在任务运行或本地流仍在进行时显示，其它状态不显示。
function AssistantStatusIndicator({ status, isStreaming }) {
  if (status !== 'running' && !isStreaming) return null;
  return (
    <span
      className="we-asst-drawer__status"
      role="status"
      aria-live="polite"
      title="写卡助手正在处理"
    >
      <span className="we-asst-entry__pending" aria-hidden="true">
        <span className="typing-dot typing-dot-accent" />
        <span className="typing-dot typing-dot-accent" />
        <span className="typing-dot typing-dot-accent" />
      </span>
      <span>正在处理</span>
    </span>
  );
}
