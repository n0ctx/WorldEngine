/**
 * 写卡助手 Zustand Store（单接口模型）
 *
 * 状态机：idle → planning → awaiting_approval → executing → (paused|completed|failed|cancelled)
 *           （追问留在 planning 内，由父代理用普通 delta 文本完成，不切独立状态）
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
      currentStepId: null,

      reset: () =>
        set({
          taskId: null,
          status: 'idle',
          planDoc: '',
          messages: [],
          error: null,
          currentStepId: null,
        }),

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
              return { ...s, messages: appendDelta(s.messages, evt.delta, evt.messageId) };
            case 'user_message':
              // 服务端落库后回传 messageId；把最近一条无 id 的 user 消息补 id（一般本地已带 id 时直接命中）
              return { ...s, messages: adoptUserMessageId(s.messages, evt.messageId) };
            case 'messages_changed':
              return { ...s, messages: Array.isArray(evt.messages) ? evt.messages : s.messages };
            case 'step_started':
              return { ...s, currentStepId: evt.stepId };
            case 'step_completed':
              return { ...s, currentStepId: null };
            case 'step_failed':
              return {
                ...s,
                currentStepId: null,
                error: `Step ${evt.stepId} 失败：${evt.error}`,
              };
            default:
              if (evt.done === true) {
                // SSE 末尾的 { done: true } 帧：清除最后一条 assistant 的 streaming 标志，使 ActionBar 可显示
                return { ...s, messages: clearStreamingFlag(s.messages) };
              }
              return s;
          }
        }),

      pushUserMessage: (content, id) =>
        set((s) => ({
          ...s,
          messages: [
            ...s.messages,
            { id: id ?? `msg-${cryptoRandomId()}`, role: 'user', content },
          ],
        })),

      deleteMessage: (id) =>
        set((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== id) })),

      truncateFromId: (id) =>
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === id);
          if (idx < 0) return s;
          return { ...s, messages: s.messages.slice(0, idx) };
        }),

      replaceMessages: (msgs) =>
        set((s) => ({ ...s, messages: Array.isArray(msgs) ? msgs : s.messages })),

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

function cryptoRandomId() {
  try {
    return globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function appendDelta(messages, delta, messageId) {
  const last = messages[messages.length - 1];
  if (last && last.role === 'assistant' && last.streaming) {
    return [
      ...messages.slice(0, -1),
      { ...last, id: messageId ?? last.id, content: (last.content || '') + delta },
    ];
  }
  return [
    ...messages,
    {
      id: messageId ?? `msg-${cryptoRandomId()}`,
      role: 'assistant',
      content: delta,
      streaming: true,
    },
  ];
}

function adoptUserMessageId(messages, messageId) {
  if (!messageId) return messages;
  // 若已存在该 id 直接返回；否则把最近一条无 id 的 user 消息补 id
  if (messages.some((m) => m.id === messageId)) return messages;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user' && !messages[i].id) {
      const next = messages.slice();
      next[i] = { ...messages[i], id: messageId };
      return next;
    }
  }
  return messages;
}

function clearStreamingFlag(messages) {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (!last.streaming) return messages;
  return [...messages.slice(0, -1), { ...last, streaming: false }];
}

export const __testables = { appendDelta, adoptUserMessageId, clearStreamingFlag };
