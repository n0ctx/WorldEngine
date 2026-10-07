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
import { dispatchToolRefresh } from './tool-refresh.js';

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

const HEAVY_KEY = 'we-assistant-v2';
const LIVE_KEY = 'we-assistant-v2:live';

// 跟着某段对话走的界面状态；清空对话时一起清
const EMPTY_VIEW_STATE = {
  scrollTop: null,
  expandedThinks: {},
  editingMessageId: null,
  editingDraft: '',
};

export const useAssistantStore = create(
  persist(
    (set) => ({
      // ─── 任务状态 ────────────────────────────────────────────
      taskId: null,
      status: 'idle',
      messages: [], // [{ role, content, streaming? }]
      error: null,
      // 最近一次模型请求前估算的上下文占用 { tokens, limit }
      contextUsage: null,
      // replaceTailWithUser 写入后设置；防止 MESSAGES_CHANGED 广播在 abort 尚未完全生效时吞掉本地 user 消息
      pendingUserMessageId: null,

      // 清空对话；输入栏草稿属于用户还没发出的话，保留
      reset: () =>
        set({
          taskId: null,
          status: 'idle',
          messages: [],
          error: null,
          contextUsage: null,
          pendingUserMessageId: null,
          ...EMPTY_VIEW_STATE,
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
            case SSE_EVENTS.CONTEXT_USAGE:
              return { ...s, contextUsage: evt.usage, messages: [...s.messages, ...evt.appended] };
            case SSE_EVENTS.TOOL_CALL_STARTED:
              return {
                ...s,
                messages: [
                  ...s.messages,
                  { id: evt.callId, role: 'tool_call', toolName: evt.toolName, summary: evt.summary, target: evt.target, targets: evt.targets, status: 'running' },
                ],
              };
            case SSE_EVENTS.TOOL_CALL_COMPLETED: {
              dispatchToolRefresh(s.messages.find((m) => m.id === evt.callId), evt);
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

      // ─── 刷新后要原样回来的界面状态 ────────────────────────────
      // 输入栏打了一半、还没发出去的文字
      draft: '',
      setDraft: (draft) => set({ draft: typeof draft === 'string' ? draft : '' }),
      ...EMPTY_VIEW_STATE,
      // null 表示贴在底部（新消息来了继续跟随），数字是用户停留的位置
      setScrollTop: (scrollTop) => set({ scrollTop }),
      // 思考块展开态，key 见 thinkKey；顺手剔除已不在列表里的消息，避免越积越多
      toggleThink: (key) => set((s) => ({ expandedThinks: toggleExpandedThink(s.expandedThinks, s.messages, key) })),
      // 用户消息的行内编辑：同一时间只编辑一条
      startEditing: (messageId, content) => set({ editingMessageId: messageId, editingDraft: content ?? '' }),
      setEditingDraft: (editingDraft) => set({ editingDraft }),
      stopEditing: () => set({ editingMessageId: null, editingDraft: '' }),
    }),
    {
      name: HEAVY_KEY,
      // 写盘拆成两块，见 createSplitStorage
      storage: createSplitStorage(),
      // 持久化面板偏好 + 最小恢复态；真正任务真相源仍以后端 task snapshot 为准。
      // messages 原样交给 storage，只在真的写重块时才清洗，避免每个 DELTA 帧都遍历一遍。
      partialize: (s) => ({
        isOpen: s.isOpen,
        width: s.width,
        taskId: s.taskId,
        status: s.status,
        messages: s.messages,
        error: s.error,
        contextUsage: s.contextUsage,
        draft: s.draft,
        scrollTop: s.scrollTop,
        expandedThinks: s.expandedThinks,
        editingMessageId: s.editingMessageId,
        editingDraft: s.editingDraft,
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

// 自定义持久化存储，把一份 state 拆成两块写 localStorage：
// - 重块 HEAVY_KEY 只放 messages。流式（status==='running'）期间不写：每个 DELTA 帧都
//   JSON.stringify 整个 messages 成本是 O(n²)；保留上一次终态写入的历史，刷新后由
//   后端任务快照补齐。
// - 轻块 LIVE_KEY 放其余字段（taskId、状态、输入栏草稿、滚动位置等），都是小值，
//   流式期间照写。否则任务跑起来后的新 taskId、正在打的字都要等任务结束才落盘，
//   中途刷新就找不回。
// 读的时候两块合并，轻块优先。
function createSplitStorage() {
  return {
    getItem: () => {
      const heavy = readJson(HEAVY_KEY);
      const live = readJson(LIVE_KEY);
      if (!heavy && !live) return null;
      return { state: { ...heavy?.state, ...live?.state }, version: live?.version ?? heavy?.version ?? 0 };
    },
    setItem: (_name, value) => {
      const { messages, ...rest } = value?.state ?? {};
      writeJson(LIVE_KEY, { state: rest, version: value?.version });
      if (rest.status === 'running') return;
      writeJson(HEAVY_KEY, { state: { messages: sanitizeMessagesForPersist(messages) }, version: value?.version });
    },
    removeItem: () => {
      try {
        globalThis.localStorage?.removeItem(HEAVY_KEY);
        globalThis.localStorage?.removeItem(LIVE_KEY);
      } catch {
        // 静默失败
      }
    },
  };
}

function readJson(key) {
  try {
    const str = globalThis.localStorage?.getItem(key);
    return str ? JSON.parse(str) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // 静默失败：localStorage 不可用（隐私模式 / 配额满）
  }
}

// 思考块展开态的 key：消息 id + 该消息里第几块
export function thinkKey(messageId, index) {
  return `${messageId}:${index}`;
}

function toggleExpandedThink(expanded, messages, key) {
  const live = new Set(messages.map((m) => m.id));
  const next = {};
  for (const k of Object.keys(expanded)) {
    if (k !== key && live.has(k.slice(0, k.lastIndexOf(':')))) next[k] = true;
  }
  if (!expanded[key]) next[key] = true;
  return next;
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
    .filter((m) => m && ['user', 'assistant', 'tool_call', 'compaction'].includes(m.role))
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
    // 服务端重启后快照里没有占用值，沿用上次的显示
    contextUsage: task.contextUsage ?? state.contextUsage,
  };
}

export const __testables = {
  HEAVY_KEY,
  LIVE_KEY,
  createSplitStorage,
  appendDelta,
  adoptUserMessageId,
  clearStreamingFlag,
  sanitizeMessagesForPersist,
  applyTaskSnapshot,
  stripToolCallLeakage,
};
