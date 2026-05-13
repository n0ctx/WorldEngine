/**
 * 写卡助手侧边面板（单 /agent 接口模型）
 *
 * 布局：消息列表 → 计划文档（如有） → 审批按钮（awaiting_approval）→ 输入框
 * 旧版 ChangeProposalCard / 计划面板 / step 审批 UI 已全部删除。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAssistantStore } from './useAssistantStore.js';
import {
  streamAgent,
  resumeTask,
  subscribeTask,
  fetchTask,
  recoverTask,
  approveTask,
  cancelTask,
  truncateFrom as apiTruncateFrom,
  deleteMessage as apiDeleteMessage,
} from './api.js';
import MessageList from './MessageList.jsx';
import InputBox from './InputBox.jsx';
import DragHandle from './DragHandle.jsx';
import { findRegenerateSource } from './message-helpers.js';
import { SSE_EVENTS } from '../server/sse-events.js';
import useStore from '../../frontend/src/store/index.js';
import { getWorld } from '../../frontend/src/api/worlds.js';
import { getCharacter } from '../../frontend/src/api/characters.js';
import { getConfig } from '../../frontend/src/api/config.js';
import { log } from '../../frontend/src/utils/logger.js';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const ACTIVE_CANCELABLE_STATUSES = new Set(['running', 'awaiting_approval', 'paused']);
const RECOVERABLE_TERMINAL_ERROR = 'interrupted by restart';
const HARNESS_ERROR_PREFIX = 'agent loop error: ';

function isRestartInterrupted(error) {
  return error === RECOVERABLE_TERMINAL_ERROR;
}
function isHarnessSoftFail(error) {
  return typeof error === 'string' && error.startsWith(HARNESS_ERROR_PREFIX);
}

export default function AssistantPanel() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const width = useAssistantStore((s) => s.width);
  const setWidth = useAssistantStore((s) => s.setWidth);
  const close = useAssistantStore((s) => s.close);
  const taskId = useAssistantStore((s) => s.taskId);
  const status = useAssistantStore((s) => s.status);
  const planDoc = useAssistantStore((s) => s.planDoc);
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
  const abortRef = useRef(null);
  const recoveringRef = useRef(false);
  const recoveryToastKeyRef = useRef('');

  // 只有"服务重启被打断"才需要自动恢复 + 重新订阅 SSE；harness 软失败仅放开输入框。
  const isRestartRecoverable = status === 'failed' && isRestartInterrupted(error);
  const isHarnessRecoverable = status === 'failed' && isHarnessSoftFail(error);
  const isRecoverableTerminal = isRestartRecoverable || isHarnessRecoverable;

  // 页面刷新后任务态被清；store 不持久化任务字段，这里仅做防御
  useEffect(() => {
    return () => abortRef.current?.abort?.();
  }, []);

  // 面板重新打开时若任务处于终态，仅重置任务态（保留消息），避免输入框一直禁用
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (!prevIsOpenRef.current && isOpen && TERMINAL_STATUSES.has(status) && !isRecoverableTerminal) {
      resetTask();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, status, resetTask, isRecoverableTerminal]);

  // 主界面刷新事件已改为按 tool_call_completed 实时派发（见 useAssistantStore），
  // 不再等到 task_completed 才统一通知，避免 awaiting_approval/running 阶段已经写入
  // 但列表迟迟不更新的体验问题。

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
    async (nextTaskId, mode = 'subscribe') => {
      if (!nextTaskId) return;
      abortRef.current?.abort?.();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setIsStreaming(mode === 'resume');
      try {
        if (mode === 'resume') {
          await resumeTask({
            taskId: nextTaskId,
            onEvent: ingestEvent,
            signal: ctrl.signal,
          });
        } else {
          await subscribeTask({
            taskId: nextTaskId,
            onEvent: ingestEvent,
            signal: ctrl.signal,
          });
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          log.error(`assistant.resume.${mode}_failed`, err, {
            toast: err?.message || (mode === 'resume' ? '断点续传恢复失败' : '断点续传订阅失败'),
          });
          ingestEvent({ type: SSE_EVENTS.TASK_FAILED, error: err?.message || '恢复订阅失败' });
        }
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [ingestEvent],
  );

  const attachRecoveryStream = useCallback(
    async (nextTaskId) => {
      await openRecoveryStream(nextTaskId, 'subscribe');
    },
    [openRecoveryStream],
  );

  useEffect(() => {
    if (!isOpen || recoveringRef.current || isStreaming) return;
    const shouldRecover =
      Boolean(taskId) ||
      status === 'awaiting_approval' ||
      status === 'paused' ||
      status === 'running' ||
      isRestartRecoverable;
    if (!shouldRecover) return;

    recoveringRef.current = true;
    (async () => {
      try {
        let task = null;
        let recoveryMode = 'existing';
        if (taskId) {
          task = await fetchTask(taskId).catch(() => null);
        }
        if (!task) {
          task = await recoverTask().catch(() => null);
          recoveryMode = 'latest';
        }
        if (!task) {
          if (taskId) resetTask();
          return;
        }
        replaceTaskSnapshot(task);
        const toastKey = `${task.id}:${task.updatedAt ?? ''}:${task.status}:${task.error ?? ''}`;
        const shouldToastRecovery =
          task.status === 'running' ||
          task.status === 'paused' ||
          task.status === 'awaiting_approval' ||
          (task.status === 'failed' && isRestartInterrupted(task.error));
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
          task.status === 'running' ||
          task.status === 'paused' ||
          (task.status === 'failed' && isRestartInterrupted(task.error));
        if (shouldAutoResume) {
          await openRecoveryStream(task.id, 'resume');
        } else if (task.status === 'awaiting_approval') {
          await attachRecoveryStream(task.id);
        }
      } finally {
        recoveringRef.current = false;
      }
    })();
  }, [isOpen, isStreaming, taskId, status, isRestartRecoverable, replaceTaskSnapshot, attachRecoveryStream, openRecoveryStream, resetTask]);

  const handleSend = useCallback(
    async (overrideText, opts = {}) => {
      const useOverride = typeof overrideText === 'string';
      const text = (useOverride ? overrideText : input).trim();
      if (!text) return;
      if (!useOverride) setInput('');
      const messageId =
        opts.messageId ??
        `msg-${
          globalThis.crypto?.randomUUID?.().slice(0, 8) ??
          Math.random().toString(36).slice(2, 10)
        }`;
      if (!opts.skipPush) pushUserMessage(text, messageId);
      if (taskId) beginUserTurn(taskId);
      const context = await buildContext();
      // 关键：开新流前先 abort 上一条尚未关闭的 SSE 连接，
      // 否则旧的 fetch reader 仍订阅 sseClients，会和新流并行收到同一份 delta
      // → 文本字符级双写（"你你好好…"）
      abortRef.current?.abort?.();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setIsStreaming(true);
      try {
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
        if (abortRef.current === ctrl) abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [input, taskId, buildContext, ingestEvent, pushUserMessage, beginUserTurn],
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

  const handleApprove = useCallback(() => {
    if (!taskId) return;
    approveTask(taskId).catch(() => {});
  }, [taskId]);

  const handleCancel = useCallback(() => {
    if (!taskId) return;
    cancelTask(taskId).catch(() => {});
    abortRef.current?.abort?.();
    setIsStreaming(false);
  }, [taskId]);

  const handleStop = useCallback(() => {
    // 先 abort 本地 SSE：阻止后续 delta 涌入；
  // 因 abort 后 SSE 不再回传 task_cancelled，需本地注入终态事件，
  // 否则 status 会卡在 running → pendingAssistant 仍为 true → 输入气泡的省略号不消失
    abortRef.current?.abort?.();
    setIsStreaming(false);
    if (taskId) {
      cancelTask(taskId).catch(() => {});
    }
    ingestEvent({ type: SSE_EVENTS.TASK_CANCELLED, taskId });
  }, [taskId, ingestEvent]);

  const handleReset = useCallback(() => {
    // 必须先通知后端 cancel：仅 abort 本地 SSE 不会中断后端 runParentAgent 的工具循环，
    // 残留循环会继续调用 apply_* 等落库工具，造成"清空后旧任务仍在执行"的错觉
    if (taskId && ACTIVE_CANCELABLE_STATUSES.has(status)) {
      cancelTask(taskId).catch(() => {});
    }
    abortRef.current?.abort?.();
    setIsStreaming(false);
    reset();
  }, [taskId, status, reset]);

  const inputDisabled =
    status === 'cancelled' ||
    (status === 'failed' && !isRecoverableTerminal);
  const hasRunningItem = messages.some(
    (m) => m.status === 'running' || m.streaming === true,
  );
  // 省略号气泡仅在「LLM 真的在吐 token」的极短窗口出现：
  // - isStreaming：本地 SSE fetch 仍在进行
  // - !hasRunningItem：没有"运行中"占位（step / tool_call）抢眼
  // - status === 'running'：仅 running 阶段会有自由文本流式输出；进入
  //   awaiting_approval / paused / 终态后 LLM 不再吐 token，
  //   省略号必须立刻消失（之前 awaiting_approval 长连接保持时 isStreaming 一直为 true,
  //   导致省略号常驻，造成"还在跑"的错觉）。
  const pendingAssistant = isStreaming && !hasRunningItem && status === 'running';


  return (
    <>
      {/* 背景遮罩：虚化底层内容，点击可关闭抽屉 */}
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-[40px] z-[199] cursor-default bg-black/20"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        aria-hidden={!isOpen}
        style={{ width: `${width}px` }}
        className={`fixed right-0 bottom-0 top-[40px] z-[200] flex flex-col border-l border-black/10 bg-[var(--we-paper-base)] shadow-2xl transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* 左边沿拖拽手柄 */}
        <DragHandle
          value={width}
          onChange={setWidth}
          min={320}
          max={720}
          orientation="vertical"
          inverted
          ariaLabel="拖动调整助手宽度"
          className="absolute -left-1 top-0 h-full w-2"
        />
        {/* 标题栏 */}
        <header className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-black/10 bg-[var(--we-paper-aged)] px-3">
          <span
            className="flex-1 text-[14px] italic text-[var(--we-ink-primary)]"
            style={{ fontFamily: 'var(--we-font-display)' }}
          >
            写卡助手
          </span>
          {(messages.length > 0 || planDoc || taskId) && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded px-2 py-0.5 text-[11px] text-[var(--we-ink-muted)] hover:bg-black/5"
              title="清空对话"
            >
              清空
            </button>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="rounded px-2 py-0.5 text-[16px] leading-none text-[var(--we-ink-muted)] hover:bg-black/5"
          >
            ×
          </button>
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
          {error && status === 'failed' && !isRecoverableTerminal && (
            <div className="mx-3 my-2 rounded border border-[var(--we-vermilion)]/20 bg-[var(--we-vermilion)]/10 px-3 py-2 text-[12px] text-[var(--we-vermilion)]">
              {error}
            </div>
          )}
          {status === 'awaiting_approval' && (
            <div className="flex flex-shrink-0 gap-2 border-t border-black/5 px-3 py-2">
              <button
                type="button"
                onClick={handleApprove}
                className="rounded bg-[var(--we-vermilion)] px-3 py-1.5 text-[12px] text-white hover:opacity-90"
              >
                确认执行
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded border border-black/15 px-3 py-1.5 text-[12px] text-[var(--we-ink-primary)] hover:bg-black/5"
              >
                取消
              </button>
            </div>
          )}
        </div>

        {/* 输入框 */}
        <InputBox
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          disabled={inputDisabled}
          isStreaming={isStreaming}
        />
      </aside>
    </>
  );
}
