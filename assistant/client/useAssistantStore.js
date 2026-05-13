/**
 * 写卡助手 Zustand Store（单接口模型）
 *
 * 状态机：idle → running → awaiting_approval → paused → (completed|failed|cancelled)
 *
 * 服务端 SSE 事件由 ingestEvent 集中消费，
 * UI 仅订阅 taskId/status/planDoc/messages/error。
 *
 * 兼容字段：isOpen / open / close / toggle 仅用于面板抽屉显隐，
 *           不参与任务状态机；持久化以避免页面刷新后丢面板偏好。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SSE_EVENTS } from '../server/sse-events.js';

// 写入类工具 → 主界面 reload 事件：tool_call_completed 时按工具名实时派发，
// 让主界面列表不必等到 task_completed 才刷新（修复"必须刷新才看到新卡"问题）
const TOOL_REFRESH_EVENTS = {
  apply_world_card: 'we:world-updated',
  apply_character_card: 'we:character-updated',
  apply_persona_card: 'we:persona-updated',
  apply_css_snippet: 'we:css-updated',
  apply_regex_rule: 'we:regex-updated',
  apply_global_config: 'we:global-config-updated',
};

// 移除模型在普通文本流里泄漏的工具调用 token / XML。
// 触发场景：父代理 Step 1 工具循环触顶后，Step 2 不再传 tools，模型仍想调用，
// 把内部 function-call 文本（DSML 特殊 token / 裸 <tool_calls>/<invoke>/<parameter>）
// 直接吐到普通文本里。根因已经通过提升 LLM_TOOL_RESOLUTION_MAX_ITERATIONS 缓解，
// 但本函数仍作为渲染前的兜底，避免本地小模型 / 非 function-call provider 再次泄漏。
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
      planDoc: '',
      messages: [], // [{ role, content, streaming? }]
      error: null,
      currentStepId: null,
      // 当前任务在 messages 数组中的起始偏移（task_created 时记录），
      // 用于限制 tool_call_started 复用失败行的查找范围，避免跨任务污染历史
      taskMsgOffset: 0,

      reset: () =>
        set({
          taskId: null,
          status: 'idle',
          planDoc: '',
          messages: [],
          error: null,
          currentStepId: null,
          taskMsgOffset: 0,
        }),

      // 仅重置任务态，保留消息历史（面板重开时使用）
      resetTask: () =>
        set((s) => ({
          ...s,
          taskId: null,
          status: 'idle',
          planDoc: '',
          error: null,
          currentStepId: null,
          taskMsgOffset: 0,
        })),

      replaceTaskSnapshot: (task) =>
        set((s) => applyTaskSnapshot(s, task)),

      beginUserTurn: (taskId) =>
        set((s) => ({
          ...s,
          taskId: taskId ?? s.taskId,
          status: 'running',
          error: null,
          taskMsgOffset: s.messages.length,
        })),

      ingestEvent: (evt) =>
        set((s) => {
          switch (evt.type) {
            case SSE_EVENTS.TASK_CREATED:
              return { ...s, taskId: evt.taskId, status: 'running', error: null, taskMsgOffset: s.messages.length };
            case SSE_EVENTS.TASK_SNAPSHOT:
              return applyTaskSnapshot(s, evt.task);
            case SSE_EVENTS.PLAN_DOC_UPDATED: {
              // 把计划文档注入 messages，让它成为真正的会话流成员（embedded，跟随滚动）。
              // id 必须按 taskId 区分：同一 session 内的第二个任务有自己的 plan_doc，
              // 不能复用上一个任务的 plan_doc 行（否则会就地替换历史上方的旧计划行，
              // 新计划无法出现在当前任务底部，表现为"第二次没显示计划"）。
              const planDocId = `plan-doc-${evt.taskId ?? s.taskId ?? 'unknown'}`;
              const existingIdx = s.messages.findIndex((m) => m.id === planDocId);
              const planDocMsg = { id: planDocId, role: 'plan_doc', content: evt.content };
              const newMessages =
                existingIdx >= 0
                  ? s.messages.map((m, i) => (i === existingIdx ? planDocMsg : m))
                  : [...s.messages, planDocMsg];
              return { ...s, planDoc: evt.content, messages: newMessages };
            }
            case SSE_EVENTS.AWAITING_APPROVAL:
              return { ...s, status: 'awaiting_approval' };
            case SSE_EVENTS.PLAN_APPROVED:
              return { ...s, status: 'running' };
            case SSE_EVENTS.PAUSED:
              return { ...s, status: 'paused' };
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
              return { ...s, messages: appendDelta(s.messages, evt.delta, evt.messageId) };
            case SSE_EVENTS.USER_MESSAGE:
              // 服务端落库后回传 messageId；把最近一条无 id 的 user 消息补 id（一般本地已带 id 时直接命中）
              return { ...s, messages: adoptUserMessageId(s.messages, evt.messageId) };
            case SSE_EVENTS.MESSAGES_CHANGED: {
              if (!Array.isArray(evt.messages)) return s;
              return { ...s, messages: sanitizeMessagesForPersist(evt.messages) };
            }
            case SSE_EVENTS.TOOL_CALL_STARTED: {
              // 若当前任务内同名工具有已失败的条目，复用该条目（重试场景），避免留下永久红色失败标记
              // 仅在 taskMsgOffset 之后搜索，防止跨任务覆盖历史失败记录
              const prevFailedIdx = s.messages.reduce(
                (found, m, i) =>
                  i >= s.taskMsgOffset && m.role === 'tool_call' && m.toolName === evt.toolName && m.status === 'error'
                    ? i
                    : found,
                -1,
              );
              if (prevFailedIdx >= 0) {
                const next = [...s.messages];
                next[prevFailedIdx] = { id: evt.callId, role: 'tool_call', toolName: evt.toolName, status: 'running' };
                return { ...s, messages: next };
              }
              return {
                ...s,
                messages: [
                  ...s.messages,
                  { id: evt.callId, role: 'tool_call', toolName: evt.toolName, status: 'running' },
                ],
              };
            }
            case SSE_EVENTS.TOOL_CALL_COMPLETED: {
              if (evt.success) {
                const toolName = s.messages.find((m) => m.id === evt.callId)?.toolName;
                const eventName = toolName ? TOOL_REFRESH_EVENTS[toolName] : null;
                if (eventName && typeof window !== 'undefined') {
                  window.dispatchEvent(new Event(eventName));
                }
              }
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === evt.callId ? { ...m, status: evt.success ? 'done' : 'error' } : m,
                ),
              };
            }
            case SSE_EVENTS.STEP_STARTED: {
              const stepExists = s.messages.some((m) => m.id === evt.stepId);
              return {
                ...s,
                currentStepId: evt.stepId,
                messages: stepExists
                  ? s.messages.map((m) =>
                      m.id === evt.stepId ? { ...m, title: evt.title, status: 'running' } : m,
                    )
                  : [
                      ...s.messages,
                      { id: evt.stepId, role: 'step', stepId: evt.stepId, title: evt.title, status: 'running' },
                    ],
              };
            }
            case SSE_EVENTS.STEP_COMPLETED:
              return {
                ...s,
                currentStepId: null,
                messages: s.messages.map((m) =>
                  m.id === evt.stepId ? { ...m, status: 'done' } : m,
                ),
              };
            case SSE_EVENTS.STEP_FAILED:
              return {
                ...s,
                currentStepId: null,
                error: `Step ${evt.stepId} 失败：${evt.error}`,
                messages: s.messages.map((m) =>
                  m.id === evt.stepId ? { ...m, status: 'error', error: evt.error } : m,
                ),
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

      // 重新生成 / 重发：原子地"截断到 prevId 并立即用同 id-不同 newId 的 user 消息替换尾部"。
      // 单次 set，避免 truncate→render(空)→push→render(填回) 的中间空帧导致页面闪烁跳动。
      replaceTailWithUser: (prevId, content, id) =>
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === prevId);
          if (idx < 0) return s;
          return {
            ...s,
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
      // 持久化面板偏好 + 最小恢复态；真正任务真相源仍以后端 task snapshot 为准。
      partialize: (s) => ({
        isOpen: s.isOpen,
        width: s.width,
        taskId: s.taskId,
        status: s.status,
        planDoc: s.planDoc,
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
    .filter((m) => m && ['user', 'assistant', 'tool_call', 'step', 'plan_doc'].includes(m.role))
    .map((m) => {
      if (m.role === 'assistant' && m.streaming) {
        const rest = { ...m };
        delete rest.streaming;
        return rest;
      }
      if ((m.role === 'tool_call' || m.role === 'step') && m.status === 'running') {
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
      planDoc: '',
      messages: state.messages,
      error: null,
      currentStepId: null,
      taskMsgOffset: 0,
    };
  }
  const sanitizedMessages = sanitizeMessagesForPersist(task.messages);
  const fallbackPlanDoc = sanitizedMessages.find((m) => m.role === 'plan_doc')?.content ?? '';
  return {
    ...state,
    taskId: task.id ?? null,
    status: task.status ?? 'idle',
    planDoc: typeof task.planDocContent === 'string' ? task.planDocContent : fallbackPlanDoc,
    messages: sanitizedMessages,
    error: task.error ?? null,
    currentStepId: task.currentStepId ?? null,
    taskMsgOffset: 0,
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
