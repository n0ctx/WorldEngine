/**
 * 写卡助手侧边面板（单 /agent 接口模型）
 *
 * 布局：消息列表 → 审批按钮（awaiting_approval）→ 任务进度 HUD → 输入框
 * 计划文档不再以消息气泡嵌入消息流；任务勾选实时显示在输入框上方的 HUD。
 * 旧版 ChangeProposalCard / 计划面板 / step 审批 UI 已全部删除。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAssistantStore } from './useAssistantStore.js';
import {
  streamAgent,
  resumeTask,
  subscribeTask,
  fetchTask,
  recoverTask,
  listRecoverableTasks,
  approveTask,
  rejectPlan,
  cancelTask,
  truncateFrom as apiTruncateFrom,
  deleteMessage as apiDeleteMessage,
} from './api.js';
import MessageList from './MessageList.jsx';
import InputBox from './InputBox.jsx';
import PlanTaskHud from './PlanTaskHud.jsx';
import DragHandle from './DragHandle.jsx';
import { findRegenerateSource } from './message-helpers.js';
import { SSE_EVENTS } from '../server/sse-events.js';
import useStore from '../../frontend/src/core/state/index.js';
import { getWorld } from '../../frontend/src/core/api/worlds.js';
import { getCharacter } from '../../frontend/src/core/api/characters.js';
import { getConfig } from '../../frontend/src/core/api/config.js';
import { log } from '../../frontend/src/core/utils/logger.js';

const ACTIVE_CANCELABLE_STATUSES = new Set(['running', 'awaiting_approval', 'paused']);
const RECOVERABLE_TERMINAL_ERROR = 'interrupted by restart';
const HARNESS_ERROR_PREFIX = 'agent loop error: ';
const PLAN_REJECTED_PAUSE_REASON = 'plan rejected by user';
// 服务端 pauseForRecoverableHarnessIssue 写入 task.error 的标记；
// 用于让面板把该类暂停视作"等待用户主动输入"，不要自动 resume 死循环。
const HARNESS_RECOVERABLE_PAUSE_REASON = 'harness recoverable pause';

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
  const [reviseInput, setReviseInput] = useState('');
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
        const isUserRejectedPlanPause =
          task.status === 'paused' && task.error === PLAN_REJECTED_PAUSE_REASON;
        const isHarnessRecoverablePause =
          task.status === 'paused' && task.error === HARNESS_RECOVERABLE_PAUSE_REASON;
        const shouldAutoResume =
          task.status === 'running' ||
          (task.status === 'paused' && !isUserRejectedPlanPause && !isHarnessRecoverablePause) ||
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
  }, [isOpen, isStreaming, taskId, status, isRestartRecoverable, replaceTaskSnapshot, attachRecoveryStream, openRecoveryStream, resetTask, currentWorldId, currentCharacterId]);

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
      // 进入 awaiting_approval / paused 时 SSE 仍保持长连，但 LLM 已停止吐 token；
      // 此时 isStreaming 应立即置 false，否则发送按钮卡在"停止"态、省略号常驻。
      const handleEvent = (event) => {
        if (
          event?.type === SSE_EVENTS.AWAITING_APPROVAL ||
          event?.type === SSE_EVENTS.PAUSED
        ) {
          setIsStreaming(false);
        }
        ingestEvent(event);
      };
      try {
        const context = await buildContext();
        await streamAgent({
          taskId,
          message: text,
          messageId,
          context,
          onEvent: handleEvent,
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

  const handleApprove = useCallback(() => {
    if (!taskId) return;
    approveTask(taskId).catch(() => {});
  }, [taskId]);

  const handleRejectPlan = useCallback(() => {
    if (!taskId) return;
    rejectPlan(taskId)
      .then((task) => {
        abortRef.current?.abort?.();
        setIsStreaming(false);
        if (task) replaceTaskSnapshot(task);
      })
      .catch((err) => {
        log.warn('assistant.reject_plan_failed', err, { toast: err?.message || '拒绝计划失败' });
      });
  }, [taskId, replaceTaskSnapshot]);

  const handleRevise = useCallback(async () => {
    const text = reviseInput.trim();
    if (!text || !taskId) return;
    setReviseInput('');
    try {
      const task = await rejectPlan(taskId);
      abortRef.current?.abort?.();
      setIsStreaming(false);
      if (task) replaceTaskSnapshot(task);
    } catch (err) {
      log.warn('assistant.revise_plan_failed', err, { toast: err?.message || '拒绝计划失败' });
      return;
    }
    await handleSend(text, { skipPush: false });
  }, [reviseInput, taskId, replaceTaskSnapshot, handleSend]);

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

  // 后端允许在 paused / completed / failed / cancelled 等状态上继续开新一轮对话；
  // 前端不再用任务状态封锁用户输入。真正终止执行由"停止"与"清空"负责。
  const inputDisabled = false;
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
            <div className="mx-3 my-2 flex items-center gap-2 rounded border border-[var(--we-vermilion)]/20 bg-[var(--we-vermilion)]/10 px-3 py-2 text-[12px] text-[var(--we-vermilion)]">
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={handleRegenerateLastUser}
                className="shrink-0 rounded px-2 py-0.5 hover:bg-[var(--we-vermilion)]/10"
              >
                重新生成
              </button>
            </div>
          )}
          {status === 'awaiting_approval' && (
            <div className="flex flex-shrink-0 flex-col border-t border-black/10 bg-[var(--we-paper-aged)]">
              {/* 计划文档预览区 */}
              {planDoc && (
                <>
                  <div className="flex items-center gap-1.5 border-b border-black/5 px-3 py-1.5">
                    <span className="text-[11px] font-medium tracking-wide text-[var(--we-ink-muted)]" style={{ fontFamily: 'var(--we-font-display)', fontStyle: 'italic' }}>
                      计划草案
                    </span>
                    <span className="ml-auto rounded bg-[var(--we-vermilion)]/10 px-1.5 py-0.5 text-[10px] text-[var(--we-vermilion)]">待审批</span>
                  </div>
                  <div className="we-plan-doc-preview max-h-56 overflow-y-auto px-3 py-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{planDoc}</ReactMarkdown>
                  </div>
                </>
              )}
              {/* 确认 / 拒绝 / 修改建议输入 / 确认修改 — 同一行 */}
              <div className="flex items-center gap-2 border-t border-black/10 px-3 py-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  className="flex-shrink-0 rounded bg-[var(--we-vermilion)] px-4 py-1.5 text-[12px] font-medium text-white shadow-sm hover:opacity-90 active:opacity-80"
                >
                  确认执行
                </button>
                <button
                  type="button"
                  onClick={handleRejectPlan}
                  className="flex-shrink-0 rounded border border-black/15 px-3 py-1.5 text-[12px] text-[var(--we-ink-secondary)] hover:bg-black/5"
                >
                  拒绝计划
                </button>
                <textarea
                  value={reviseInput}
                  onChange={(e) => setReviseInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (reviseInput.trim()) handleRevise();
                    }
                  }}
                  placeholder="填写修改建议…"
                  rows={1}
                  className="min-w-0 flex-1 resize-none rounded border border-black/10 bg-[var(--we-paper-base)] px-2 py-1.5 text-[12px] text-[var(--we-ink-primary)] placeholder-[var(--we-ink-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--we-vermilion)]/30"
                />
                <button
                  type="button"
                  onClick={handleRevise}
                  disabled={!reviseInput.trim()}
                  className="flex-shrink-0 rounded border border-black/15 bg-[var(--we-paper-base)] px-2.5 py-1.5 text-[11px] text-[var(--we-ink-secondary)] hover:bg-black/5 disabled:opacity-35"
                >
                  确认修改
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 任务进度 HUD（实时展示 plan_doc 任务勾选，全部完成时自动消失） */}
        <PlanTaskHud />

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
