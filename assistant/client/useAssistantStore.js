/**
 * 写卡助手 Zustand Store（localStorage 持久化）
 *
 * 消息类型：
 *   user      — 用户发送的消息
 *   assistant — 助手文字回复
 *   proposal  — 子代理生成的变更提案卡
 *   routing   — 路由提示（正在调用子代理）
 *   error     — 错误消息
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_MESSAGES = 60;

export const useAssistantStore = create(
  persist(
    (set) => ({
      isOpen: false,
      messages: [],
      isStreaming: false,
      // worldRef 依赖解析表：{ [taskId]: createdEntityId }
      resolvedIds: {},

      // ─── 面板开关 ───────────────────────────────────────────────
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),

      // ─── 消息操作 ───────────────────────────────────────────────
      addMessage: (msg) =>
        set((s) => ({
          messages: [
            ...s.messages,
            { id: `${Date.now()}-${Math.random()}`, timestamp: Date.now(), ...msg },
          ].slice(-MAX_MESSAGES),
        })),

      /** 追加文字到最后一条 assistant 消息（流式增量） */
      appendToLastAssistant: (text) =>
        set((s) => {
          const msgs = [...s.messages];
          const idx = msgs.findLastIndex((m) => m.role === 'assistant' && m.streaming);
          if (idx >= 0) {
            msgs[idx] = { ...msgs[idx], content: (msgs[idx].content || '') + text };
          }
          return { messages: msgs };
        }),

      /** 标记最后一条 assistant 消息流式结束 */
      finalizeLastAssistant: () =>
        set((s) => {
          const msgs = [...s.messages];
          const idx = msgs.findLastIndex((m) => m.role === 'assistant' && m.streaming);
          if (idx >= 0) {
            msgs[idx] = { ...msgs[idx], streaming: false };
          }
          return { messages: msgs };
        }),

      /** 将对应 taskId 的 routing 消息替换为 proposal 消息 */
      replaceRoutingWithProposal: (taskId, token, proposal) =>
        set((s) => {
          const msgs = [...s.messages];
          // 优先按 taskId 匹配，回退到最后一条 routing
          const idx = taskId
            ? msgs.findLastIndex((m) => m.role === 'routing' && m.taskId === taskId)
            : msgs.findLastIndex((m) => m.role === 'routing');
          const proposalMsg = {
            id: `${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            role: 'proposal',
            taskId,
            token,
            proposal,
            applied: false,
          };
          if (idx >= 0) {
            msgs[idx] = proposalMsg;
          } else {
            msgs.push(proposalMsg);
          }
          return { messages: msgs };
        }),

      /** 记录已应用的 create 提案结果 ID（供 worldRef 依赖解析） */
      setResolvedId: (taskId, entityId) =>
        set((s) => ({ resolvedIds: { ...s.resolvedIds, [taskId]: entityId } })),

      /** 标记提案已应用 */
      markProposalApplied: (id) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, applied: true } : m)),
        })),

      /** 编辑某条消息内容 */
      editMessage: (id, content) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, content } : m)),
        })),

      /** 截断到某条消息（不含该条）——重新生成用 */
      truncateToMessage: (id) =>
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === id);
          if (idx <= 0) return s;
          return { messages: s.messages.slice(0, idx) };
        }),

      /** 删除某条消息 */
      deleteMessage: (id) =>
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== id),
        })),

      setStreaming: (val) => set({ isStreaming: val }),

      clearMessages: () => set({ messages: [], resolvedIds: {}, isStreaming: false }),
    }),
    {
      name: 'we-assistant-v1',
      // 只持久化消息历史，不持久化 isOpen/isStreaming
      partialize: (s) => ({ messages: s.messages }),
    },
  ),
);
