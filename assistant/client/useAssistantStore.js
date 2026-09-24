/**
 * 写卡助手 Zustand Store（单接口模型）
 *
 * 状态机：idle → running → (completed|failed|cancelled)
 *
 * 服务端 SSE 事件由 ingestEvent 集中消费，
 * UI 仅订阅 taskId/status/messages/error。
 *
 * 兼容字段：isOpen / open / close / toggle 仅用于面板抽屉显隐，
 *           不参与任务状态机；持久化以避免页面刷新后丢面板偏好。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SSE_EVENTS } from '../server/sse-events.js';

// 写入成功 → 主界面 reload 事件：按工具操作的资源类型实时派发，
// 让主界面列表不必等到 task_completed 才刷新。
const WRITE_TOOLS = new Set(['create', 'update', 'edit', 'set_state', 'delete']);
const TARGET_REFRESH_EVENTS = {
  world: 'we:world-updated',
  entry: 'we:world-updated',
  field: 'we:world-updated',
  character: 'we:character-updated',
  persona: 'we:persona-updated',
  css: 'we:css-updated',
  regex: 'we:regex-updated',
  config: 'we:global-config-updated',
};

// 移除模型在普通文本流里泄漏的工具调用 token / XML。
// 触发场景：工具循环触顶后退到无工具补全，模型仍想调用工具，把内部 function-call 文本
// （DSML 特殊 token / 裸 <tool_calls>/<invoke>/<parameter>）直接吐到普通文本里；
// 本地小模型 / 非 function-call provider 也可能出现。
export function stripToolCallLeakage(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  // DeepSeek 等模型使用 <｜DSML｜...｜> 特殊 token 包裹 function-call 段（｜是全角竖线 U+FF5C）
  out = out.replace(/<｜[\s\S]*?｜>/g, '');
  // 裸 XML 工具调用块（含跨段）
  out = out.replace(/<tool_calls>[\s\S]*?<\/tool_calls>/gi, '');
  out = out.replace(/<invoke\b[\s\S]*?<\/invoke>/gi, '');
  out = out.replace(/<parameter\b[\s\S]*?<\/parameter>/gi, '');
  // 未闭合的尾巴（流式中段时常见）：扫到行尾切掉
  out = out.replace(/<tool_calls>[\s\S]*$/i, '');
  out = out.replace(/<invoke\b[\s\S]*$/i, '');
  return out;
}

export const useAssistantStore = create(
  persist(
    (set) => ({
      // ─── 任务状态 ────────────────────────────────────────────
      taskId: null,
      status: 'idle',
      messages: [], // [{ role, content, streaming? }]
      error: null,
      // replaceTailWithUser 写入后设置；防止 MESSAGES_CHANGED 广播在 abort 尚未完全生效时吞掉本地 user 消息
      pendingUserMessageId: null,

      reset: () =>
        set({
          taskId: null,
          status: 'idle',
          messages: [],
          error: null,
          pendingUserMessageId: null,
        }),

      // 仅重置任务态，保留消息历史（面板重开时使用）
      resetTask: () =>
        set((s) => ({
          ...s,
          taskId: null,
          status: 'idle',
          error: null,
        })),

      replaceTaskSnapshot: (task) =>
        set((s) => applyTaskSnapshot(s, task)),

      beginUserTurn: (taskId) =>
        set((s) => ({
          ...s,
          taskId: taskId ?? s.taskId,
          status: 'running',
          error: null,
        })),

      ingestEvent: (evt) =>
        set((s) => {
          switch (evt.type) {
            case SSE_EVENTS.TASK_CREATED:
              return { ...s, taskId: evt.taskId, status: 'running', error: null, pendingUserMessageId: null };
            case SSE_EVENTS.TASK_SNAPSHOT:
              return applyTaskSnapshot(s, evt.task);
            case SSE_EVENTS.TASK_COMPLETED:
              return {
                ...s,
                status: 'completed',
              };
            case SSE_EVENTS.TASK_FAILED:
              return { ...s, status: 'failed', error: evt.error };
            case SSE_EVENTS.TASK_CANCELLED:
              return { ...s, status: 'cancelled' };
            case SSE_EVENTS.DELTA:
              return { ...s, pendingUserMessageId: null, messages: appendDelta(s.messages, evt.delta, evt.messageId) };
            case SSE_EVENTS.USER_MESSAGE:
              // 服务端落库后回传 messageId；把最近一条无 id 的 user 消息补 id（一般本地已带 id 时直接命中）
              return { ...s, pendingUserMessageId: null, messages: adoptUserMessageId(s.messages, evt.messageId) };
            case SSE_EVENTS.MESSAGES_CHANGED: {
              if (!Array.isArray(evt.messages)) return s;
              const newMessages = sanitizeMessagesForPersist(evt.messages);
              if (s.pendingUserMessageId && !newMessages.some((m) => m.id === s.pendingUserMessageId)) {
                // 服务端尚未收到 pending user 消息时，把它追加回去防止被吞
                const pendingMsg = s.messages.find((m) => m.id === s.pendingUserMessageId);
                return { ...s, messages: pendingMsg ? [...newMessages, pendingMsg] : newMessages };
              }
              return { ...s, messages: newMessages, pendingUserMessageId: null };
            }
            case SSE_EVENTS.TOOL_CALL_STARTED:
              return {
                ...s,
                messages: [
                  ...s.messages,
                  { id: evt.callId, role: 'tool_call', toolName: evt.toolName, summary: evt.summary, target: evt.target, status: 'running' },
                ],
              };
            case SSE_EVENTS.TOOL_CALL_COMPLETED: {
              const call = s.messages.find((m) => m.id === evt.callId);
              const eventName = evt.success && WRITE_TOOLS.has(call?.toolName) ? TARGET_REFRESH_EVENTS[call?.target] : null;
              if (eventName && typeof window !== 'undefined') {
                window.dispatchEvent(new Event(eventName));
              }
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === evt.callId ? { ...m, status: evt.success ? 'done' : 'error', error: evt.success ? undefined : evt.error } : m,
                ),
              };
            }
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

      // 重新生成 / 重发：原子地"截断到 prevId 并立即用同 id-不同 newId 的 user 消息替换尾部"。
      // 单次 set，避免 truncate→render(空)→push→render(填回) 的中间空帧导致页面闪烁跳动。
      replaceTailWithUser: (prevId, content, id) =>
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === prevId);
          if (idx < 0) return s;
          return {
            ...s,
            pendingUserMessageId: id,
            messages: [
              ...s.messages.slice(0, idx),
              { id, role: 'user', content },
            ],
          };
        }),

      replaceMessages: (msgs) =>
        set((s) => ({ ...s, messages: Array.isArray(msgs) ? msgs : s.messages })),

      // ─── 面板抽屉显隐 + 宽度（不属于任务状态机） ──────────────
      isOpen: false,
      width: 400,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setWidth: (w) =>
        set(() => ({ width: Math.min(Math.max(Math.round(w), 320), 720) })),
    }),
    {
      name: 'we-assistant-v2',
      // 流式期间不写盘：每个 DELTA 帧都会触发一次 partialize + JSON.stringify(messages)，
      // 累积文本越长每帧成本越高（O(n²)）。这里提供自定义 PersistStorage，在 status==='running'
      // 时于 stringify 之前直接 early-return，跳过整条写盘链；任务进入终态或 idle 时才落盘一次。
      // 注意：必须早退而非在 partialize 里省略 messages —— 后者每帧仍会用不含 messages 的
      // 整体 blob 覆盖 localStorage，导致流式中刷新丢失全部历史。
      storage: createSkipWhileRunningStorage(),
      // 持久化面板偏好 + 最小恢复态；真正任务真相源仍以后端 task snapshot 为准。
      partialize: (s) => ({
        isOpen: s.isOpen,
        width: s.width,
        taskId: s.taskId,
        status: s.status,
        messages: sanitizeMessagesForPersist(s.messages),
        error: s.error,
      }),
      // rehydrate 时再过一次清洗：兼容旧版本写入的脏数据，保证刷新后不残留
      // streaming 标志和"运行中"占位行。
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.messages)) {
          state.messages = sanitizeMessagesForPersist(state.messages);
        }
      },
    },
  ),
);

// 自定义持久化存储：流式（status==='running'）期间跳过 setItem，避免每个 DELTA 帧
// 同步 JSON.stringify 整个 messages 写 localStorage。zustand 在 stringify 之前调用本
// setItem(name, value)，其中 value 为 { state, version }，因此可在序列化之后、写盘之前
// 读 value.state.status 决定是否落盘。读/删保持原生行为。
function createSkipWhileRunningStorage() {
  return {
    getItem: (name) => {
      try {
        const str = globalThis.localStorage?.getItem(name);
        return str ? JSON.parse(str) : null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      // 流式期间不写盘：直接早退，保留上一次终态写入的历史不被覆盖
      if (value?.state?.status === 'running') return;
      try {
        globalThis.localStorage?.setItem(name, JSON.stringify(value));
      } catch {
        // 静默失败：localStorage 不可用（隐私模式 / 配额满）
      }
    },
    removeItem: (name) => {
      try {
        globalThis.localStorage?.removeItem(name);
      } catch {
        // 静默失败
      }
    },
  };
}

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
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === 'assistant' && msg.streaming) {
      return messages.map((m, idx) => (idx === i ? { ...m, streaming: false } : m));
    }
  }
  return messages;
}

// 持久化用清洗：保留可回放的对话和助手 UI 记录；刷新后不能恢复真实运行态，
// 因此把残留 running 标为 error，避免显示一条永远运行中的工具/步骤。
function sanitizeMessagesForPersist(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && ['user', 'assistant', 'tool_call'].includes(m.role))
    .map((m) => {
      if (m.role === 'assistant' && m.streaming) {
        const rest = { ...m };
        delete rest.streaming;
        return rest;
      }
      if (m.role === 'tool_call' && m.status === 'running') {
        return { ...m, status: 'error', error: m.error ?? '刷新后运行状态已中断' };
      }
      return m;
    });
}

function applyTaskSnapshot(state, task) {
  if (!task || typeof task !== 'object') {
    return {
      ...state,
      taskId: null,
      status: 'idle',
      messages: state.messages,
      error: null,
    };
  }
  return {
    ...state,
    taskId: task.id ?? null,
    status: task.status ?? 'idle',
    messages: sanitizeMessagesForPersist(task.messages),
    error: task.error ?? null,
  };
}

export const __testables = {
  appendDelta,
  adoptUserMessageId,
  clearStreamingFlag,
  sanitizeMessagesForPersist,
  applyTaskSnapshot,
  stripToolCallLeakage,
};
