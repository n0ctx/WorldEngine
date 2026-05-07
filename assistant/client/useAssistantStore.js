/**
 * 写卡助手 Zustand Store（单接口模型）
 *
 * 状态机：idle → planning → (clarifying|awaiting_approval) → executing → (paused|completed|failed|cancelled)
 *
 * 服务端 SSE 事件由 ingestEvent 集中消费，
 * UI 仅订阅 taskId/status/planDoc/messages/error。
 *
 * 兼容字段：isOpen / open / close / toggle 仅用于面板抽屉显隐，
 *           不参与任务状态机；持久化以避免页面刷新后丢面板偏好。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAssistantStore = create(
  persist(
    (set) => ({
      // ─── 任务状态 ────────────────────────────────────────────
      taskId: null,
      status: 'idle',
      planDoc: '',
      messages: [], // [{ role, content, streaming? }]
      error: null,

      reset: () =>
        set({ taskId: null, status: 'idle', planDoc: '', messages: [], error: null }),

      ingestEvent: (evt) =>
        set((s) => {
          switch (evt.type) {
            case 'task_created':
              return { ...s, taskId: evt.taskId, status: 'planning', error: null };
            case 'plan_doc_updated':
              return { ...s, planDoc: evt.content };
            case 'awaiting_approval':
              return { ...s, status: 'awaiting_approval' };
            case 'plan_approved':
              return { ...s, status: 'executing' };
            case 'paused':
              return { ...s, status: 'paused' };
            case 'task_completed':
              return {
                ...s,
                status: 'completed',
                planDoc: '',
                messages: evt.summary
                  ? [...s.messages, { role: 'assistant', content: evt.summary }]
                  : s.messages,
              };
            case 'task_failed':
              return { ...s, status: 'failed', planDoc: '', error: evt.error };
            case 'task_cancelled':
              return { ...s, status: 'cancelled', planDoc: '' };
            case 'delta':
              return { ...s, messages: appendDelta(s.messages, evt.delta) };
            default:
              return s;
          }
        }),

      pushUserMessage: (content) =>
        set((s) => ({ ...s, messages: [...s.messages, { role: 'user', content }] })),

      // ─── 面板抽屉显隐（不属于任务状态机） ──────────────────────
      isOpen: false,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
    }),
    {
      name: 'we-assistant-v2',
      // 仅持久化面板显隐偏好；任务态在页面刷新后丢失（SSE 流无法恢复）
      partialize: (s) => ({ isOpen: s.isOpen }),
    },
  ),
);

function appendDelta(messages, delta) {
  const last = messages[messages.length - 1];
  if (last && last.role === 'assistant' && last.streaming) {
    return [
      ...messages.slice(0, -1),
      { ...last, content: (last.content || '') + delta },
    ];
  }
  return [...messages, { role: 'assistant', content: delta, streaming: true }];
}

export const __testables = { appendDelta };
