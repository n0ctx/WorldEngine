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
  approveTask,
  cancelTask,
  truncateFrom as apiTruncateFrom,
  deleteMessage as apiDeleteMessage,
} from './api.js';
import MessageList from './MessageList.jsx';
import InputBox from './InputBox.jsx';
import PlanDocViewer from '../../frontend/src/components/assistant/PlanDocViewer.jsx';
import useStore from '../../frontend/src/store/index.js';
import { getWorld } from '../../frontend/src/api/worlds.js';
import { getCharacter } from '../../frontend/src/api/characters.js';
import { getConfig } from '../../frontend/src/api/config.js';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export default function AssistantPanel() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const close = useAssistantStore((s) => s.close);
  const taskId = useAssistantStore((s) => s.taskId);
  const status = useAssistantStore((s) => s.status);
  const planDoc = useAssistantStore((s) => s.planDoc);
  const messages = useAssistantStore((s) => s.messages);
  const error = useAssistantStore((s) => s.error);
  const ingestEvent = useAssistantStore((s) => s.ingestEvent);
  const pushUserMessage = useAssistantStore((s) => s.pushUserMessage);
  const reset = useAssistantStore((s) => s.reset);

  const currentWorldId = useStore((s) => s.currentWorldId);
  const currentCharacterId = useStore((s) => s.currentCharacterId);

  const [input, setInput] = useState('');
  const abortRef = useRef(null);

  // 页面刷新后任务态被清；store 不持久化任务字段，这里仅做防御
  useEffect(() => {
    return () => abortRef.current?.abort?.();
  }, []);

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

  const handleSend = useCallback(
    async (overrideText) => {
      const useOverride = typeof overrideText === 'string';
      const text = (useOverride ? overrideText : input).trim();
      if (!text) return;
      if (!useOverride) setInput('');
      const messageId = `msg-${
        globalThis.crypto?.randomUUID?.().slice(0, 8) ??
        Math.random().toString(36).slice(2, 10)
      }`;
      pushUserMessage(text, messageId);
      const context = await buildContext();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
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
          ingestEvent({ type: 'task_failed', error: err?.message || '请求失败' });
        }
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [input, taskId, buildContext, ingestEvent, pushUserMessage],
  );

  const handleEdit = useCallback(
    async (msgId, newContent) => {
      if (!taskId || !msgId) return;
      try {
        await apiTruncateFrom(taskId, msgId);
      } catch (err) {
        ingestEvent({ type: 'task_failed', error: err?.message || '截断失败' });
        return;
      }
      useAssistantStore.getState().truncateFromId(msgId);
      await handleSend(newContent);
    },
    [taskId, ingestEvent, handleSend],
  );

  const handleDelete = useCallback(
    async (msgId) => {
      if (!taskId || !msgId) return;
      try {
        await apiDeleteMessage(taskId, msgId);
      } catch (err) {
        ingestEvent({ type: 'task_failed', error: err?.message || '删除失败' });
        return;
      }
      useAssistantStore.getState().deleteMessage(msgId);
    },
    [taskId, ingestEvent],
  );

  const handleRegenerate = useCallback(
    async (assistantMsgId) => {
      if (!taskId || !assistantMsgId) return;
      const msgs = useAssistantStore.getState().messages;
      const idx = msgs.findIndex((m) => m.id === assistantMsgId);
      if (idx <= 0) return;
      const prev = msgs[idx - 1];
      if (prev?.role !== 'user' || !prev.content) return;
      // 截断到 prev.id（含），既丢掉 assistant 又丢掉对应 user，避免后续重发造成重复
      try {
        await apiTruncateFrom(taskId, prev.id);
      } catch (err) {
        ingestEvent({ type: 'task_failed', error: err?.message || '截断失败' });
        return;
      }
      useAssistantStore.getState().truncateFromId(prev.id);
      await handleSend(prev.content);
    },
    [taskId, ingestEvent, handleSend],
  );

  const handleApprove = useCallback(() => {
    if (!taskId) return;
    approveTask(taskId).catch(() => {});
  }, [taskId]);

  const handleCancel = useCallback(() => {
    if (!taskId) return;
    cancelTask(taskId).catch(() => {});
    abortRef.current?.abort?.();
  }, [taskId]);

  const handleReset = useCallback(() => {
    abortRef.current?.abort?.();
    reset();
  }, [reset]);

  const inputDisabled = TERMINAL_STATUSES.has(status);

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="关闭助手"
          onClick={close}
          className="fixed inset-0 z-[199] cursor-default bg-black/20"
        />
      )}
      <aside
        aria-hidden={!isOpen}
        className={`fixed right-0 bottom-0 top-[40px] z-[200] flex w-[400px] flex-col border-l border-black/10 bg-[var(--we-paper-base)] shadow-2xl transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
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
          />
          {planDoc && (
            <div className="flex-shrink-0 border-t border-black/5">
              <PlanDocViewer content={planDoc} />
            </div>
          )}
          {error && status === 'failed' && (
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
          disabled={inputDisabled}
        />
      </aside>
    </>
  );
}
