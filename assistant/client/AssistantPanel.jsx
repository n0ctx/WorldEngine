/**
 * 写卡助手侧边面板（单 /agent 接口模型）
 *
 * 布局：消息列表 → 计划文档（如有） → 审批按钮（awaiting_approval）→ 输入框
 * 旧版 ChangeProposalCard / 计划面板 / step 审批 UI 已全部删除。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAssistantStore } from './useAssistantStore.js';
import { streamAgent, approveTask, cancelTask } from './api.js';
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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    pushUserMessage(text);
    const context = await buildContext();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamAgent({
        taskId,
        message: text,
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
  }, [input, taskId, buildContext, ingestEvent, pushUserMessage]);

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
        className={`fixed right-0 bottom-0 top-[40px] z-[200] flex w-[400px] flex-col border-l border-black/10 bg-[var(--we-paper-base)] shadow-[-4px_0_24px_rgba(0,0,0,0.15)] transition-transform duration-200 ease-out ${
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
          <MessageList messages={messages} />
          {planDoc && (
            <div className="flex-shrink-0 border-t border-black/5">
              <PlanDocViewer content={planDoc} />
            </div>
          )}
          {error && status === 'failed' && (
            <div className="mx-3 my-2 rounded border border-[rgba(192,57,43,0.2)] bg-[rgba(192,57,43,0.08)] px-3 py-2 text-[12px] text-[#c0392b]">
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
