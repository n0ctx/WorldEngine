/**
 * 写卡助手侧边面板（单 /agent 接口模型）
 *
 * 布局：消息列表（含工具调用记录）→ 输入框
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, RotateCcw, X } from 'lucide-react';
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

export default function AssistantPanel() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const width = useAssistantStore((s) => s.width);
  const setWidth = useAssistantStore((s) => s.setWidth);
  const close = useAssistantStore((s) => s.close);
  const taskId = useAssistantStore((s) => s.taskId);
  const status = useAssistantStore((s) => s.status);
  const messages = useAssistantStore((s) => s.messages);
  const error = useAssistantStore((s) => s.error);
  const ingestEvent = useAssistantStore((s) => s.ingestEvent);
  const pushUserMessage = useAssistantStore((s) => s.pushUserMessage);
  const beginUserTurn = useAssistantStore((s) => s.beginUserTurn);
  const reset = useAssistantStore((s) => s.reset);
  const resetTask = useAssistantStore((s) => s.resetTask);
  const replaceTaskSnapshot = useAssistantStore((s) => s.replaceTaskSnapshot);

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
    return () => abortRef.current?.abort?.();
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

  const buildContext = useCallback(async () => {
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
  }, [currentWorldId, currentCharacterId]);

  const openRecoveryStream = useCallback(
    async (nextTaskId) => {
      if (!nextTaskId) return;
      abortRef.current?.abort?.();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setIsStreaming(true);
      try {
        await resumeTask({
          taskId: nextTaskId,
          onEvent: ingestEvent,
          signal: ctrl.signal,
        });
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
    },
    [ingestEvent],
  );

  // 通用的恢复入口：开面板时 / 依赖变化时 / 回到前台时都走这里。
  // 重入靠 recoveringRef + isStreaming 守门，可被外部事件（visibility/focus/online）反复触发。
  const runRecovery = useCallback(async () => {
    if (!isOpen || recoveringRef.current || isStreaming) return;
    const shouldRecover = Boolean(taskId) || status === 'running' || isRestartRecoverable;
    if (!shouldRecover) return;

    recoveringRef.current = true;
    try {
      let task = null;
      let recoveryMode = 'existing';
      if (taskId) {
        task = await fetchTask(taskId).catch(() => null);
      }
      if (!task) {
        // 按当前世界 / 角色上下文严格匹配，避免跨上下文串台。
        const recoverContext = {
          worldId: currentWorldId ?? null,
          characterId: currentCharacterId ?? null,
        };
        task = await recoverTask(recoverContext).catch(() => null);
        recoveryMode = 'latest';
      }
      if (!task) {
        if (taskId) resetTask();
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
      replaceTaskSnapshot(task);
      const toastKey = `${task.id}:${task.updatedAt ?? ''}:${task.status}:${task.error ?? ''}`;
      const shouldToastRecovery =
        task.status === 'running' || (task.status === 'failed' && isRestartInterrupted(task.error));
      if (shouldToastRecovery && recoveryToastKeyRef.current !== toastKey) {
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
      const shouldAutoResume =
        task.status === 'running' || (task.status === 'failed' && isRestartInterrupted(task.error));
      if (shouldAutoResume) await openRecoveryStream(task.id);
    } finally {
      recoveringRef.current = false;
    }
  }, [isOpen, isStreaming, taskId, status, isRestartRecoverable, replaceTaskSnapshot, openRecoveryStream, resetTask, currentWorldId, currentCharacterId]);

  // 依赖（isOpen / taskId / status / 上下文）变化时跑一次。
  useEffect(() => {
    runRecovery();
  }, [runRecovery]);

  // 回到前台 / 重新拿到焦点 / 网络恢复时再跑一次：SSE 长连接被中间层切断或浏览器后台节流后，
  // 仅靠 useEffect 依赖不会再触发；这里补上"用户回来"的钩子，避免出现"看着开着但没反应"。
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, runRecovery]);

  const handleStop = useCallback(async () => {
    // 用户敲 `/stop` 或外部触发"请求取消"流程：
    // 1) abort 本地 SSE 防止 delta 继续涌入，立即解锁 isStreaming
    // 2) 调用 cancelTask 等后端确认；abort 后本地收不到 SSE，所以再 fetchTask 拿权威终态
    // 3) 仅在后端确实没进入终态时本地注入 TASK_CANCELLED，避免覆盖刚到达的 TASK_COMPLETED
    abortRef.current?.abort?.();
    setIsStreaming(false);
    if (!taskId) {
      ingestEvent({ type: SSE_EVENTS.TASK_CANCELLED, taskId });
      return;
    }
    try {
      await cancelTask(taskId);
      const task = await fetchTask(taskId).catch(() => null);
      const terminal = task && (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled');
      if (task && terminal) {
        replaceTaskSnapshot(task);
        return;
      }
    } catch {
      // ignore：fall through to local fallback
    }
    ingestEvent({ type: SSE_EVENTS.TASK_CANCELLED, taskId });
  }, [taskId, ingestEvent, replaceTaskSnapshot]);

  const handleSend = useCallback(
    async (overrideText, opts = {}) => {
      const useOverride = typeof overrideText === 'string';
      const text = (useOverride ? overrideText : input).trim();
      if (!text) return;
      // `/stop` 是用户主动终止当前任务的"命令式"输入，不真的发送给 LLM。
      // 走和原 handleStop 同样的取消路径，然后清空输入框直接返回。
      if (!useOverride && text === '/stop') {
        setInput('');
        await handleStop();
        return;
      }
      if (!useOverride) setInput('');
      const messageId =
        opts.messageId ??
        `msg-${
          globalThis.crypto?.randomUUID?.().slice(0, 8) ??
          Math.random().toString(36).slice(2, 10)
        }`;
      if (!opts.skipPush) pushUserMessage(text, messageId);
      if (taskId) beginUserTurn(taskId);
      // 关键：abort + isStreaming 必须在任何 await 之前同步设置，
      // 否则 beginUserTurn 触发的 recovery useEffect 在 buildContext() 期间看到
      // isStreaming=false 而执行 replaceTaskSnapshot，把刚写入 store 的 user 气泡吞掉。
      // React 18 会把 beginUserTurn(status:'running') 和 setIsStreaming(true) 批量合并，
      // recovery effect 看到 isStreaming:true 直接跳过。
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
        // 只对仍活跃的 ctrl 收回 isStreaming（见 openRecoveryStream）
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [input, taskId, buildContext, ingestEvent, pushUserMessage, beginUserTurn, handleStop],
  );

  const handleEdit = useCallback(
    async (msgId, newContent) => {
      if (!taskId || !msgId) return;
      // 先 abort 上一条仍挂着的 SSE：truncate 路由会广播 messages_changed
      // 给所有已订阅 sseClients 的连接，旧 fetch 收到后会用服务端"已截断"的
      // 消息数组覆盖本地 store，把刚 replaceTailWithUser 写入的新 user 消息吞掉
      abortRef.current?.abort?.();
      try {
        await apiTruncateFrom(taskId, msgId);
      } catch (err) {
        log.warn('assistant.truncate_failed', err, { toast: err?.message || '截断失败' });
        return;
      }
      // 复用原 messageId：让 React 以同 key 复用 user 气泡 DOM，避免
      // unmount→remount 重新触发 we-bubble-in 入场动画导致的"页面刷新感"
      useAssistantStore.getState().replaceTailWithUser(msgId, newContent, msgId);
      await handleSend(newContent, { skipPush: true, messageId: msgId });
    },
    [taskId, handleSend],
  );

  const handleDelete = useCallback(
    async (msgId) => {
      if (!taskId || !msgId) return;
      // 删除失败（如 400 任务运行中 / 404 消息不存在）只是局部操作失败，
      // 不应把整个任务推入 failed 终态从而封禁输入框。仅 toast 提示并返回。
      try {
        await apiDeleteMessage(taskId, msgId);
      } catch (err) {
        log.warn('assistant.delete_message_failed', err, { toast: err?.message || '删除失败' });
        return;
      }
      useAssistantStore.getState().deleteMessage(msgId);
    },
    [taskId],
  );

  const handleRegenerateLastUser = useCallback(async () => {
    if (!taskId) return;
    const msgs = useAssistantStore.getState().messages;
    let lastUserMsg = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user' && msgs[i].content) { lastUserMsg = msgs[i]; break; }
    }
    if (!lastUserMsg?.id || !lastUserMsg.content) return;
    abortRef.current?.abort?.();
    try {
      await apiTruncateFrom(taskId, lastUserMsg.id);
    } catch (err) {
      log.warn('assistant.truncate_failed', err, { toast: err?.message || '截断失败' });
      return;
    }
    useAssistantStore.getState().replaceTailWithUser(lastUserMsg.id, lastUserMsg.content, lastUserMsg.id);
    await handleSend(lastUserMsg.content, { skipPush: true, messageId: lastUserMsg.id });
  }, [taskId, handleSend]);

  const handleRegenerate = useCallback(
    async (assistantMsgId) => {
      if (!taskId || !assistantMsgId) return;
      const msgs = useAssistantStore.getState().messages;
      const source = findRegenerateSource(msgs, assistantMsgId);
      const prev = source?.message;
      if (!prev?.id || !prev.content) return;
      // 先 abort 上一条仍挂着的 SSE（同 handleEdit 注释），否则 truncate 广播
      // messages_changed 给旧 fetch，会把新 user 消息从本地 store 中吞掉
      abortRef.current?.abort?.();
      // 截断到 prev.id（含），既丢掉 assistant 又丢掉对应 user，避免后续重发造成重复
      try {
        await apiTruncateFrom(taskId, prev.id);
      } catch (err) {
        log.warn('assistant.truncate_failed', err, { toast: err?.message || '截断失败' });
        return;
      }
      // 原子替换：单次 set 完成"丢尾 + push 新 user"，避免中间空帧引起页面闪烁。
      // 复用 prev.id 作为新消息 id：React 以同 key 复用 user 气泡 DOM，
      // 避免 unmount→remount 触发 we-bubble-in 入场动画造成的"页面刷新感"。
      useAssistantStore.getState().replaceTailWithUser(prev.id, prev.content, prev.id);
      await handleSend(prev.content, { skipPush: true, messageId: prev.id });
    },
    [taskId, handleSend],
  );

  const handleReset = useCallback(() => {
    // 必须先通知后端 cancel：仅 abort 本地 SSE 不会中断后端 runAgent 的工具循环，
    // 残留循环会继续落库，造成"清空后旧任务仍在执行"的错觉
    if (taskId && status === 'running') {
      cancelTask(taskId).catch(() => {});
    }
    abortRef.current?.abort?.();
    setIsStreaming(false);
    reset();
  }, [taskId, status, reset]);

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
        <header className="we-asst-drawer__header">
          <span className="we-asst-drawer__title">写卡助手</span>
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
