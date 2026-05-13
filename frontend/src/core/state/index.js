import { create } from 'zustand';

const useStore = create((set) => ({
  currentWorldId: null,
  currentCharacterId: null,
  currentSessionId: null,
  // 写作模式下 TopBar「会话」入口下发的目标 session id；
  // WritingSpacePage 消费后须置回 null，避免下次进入页面被旧值劫持。
  currentWritingSessionId: null,

  setCurrentWorldId: (id) => set({ currentWorldId: id }),
  setCurrentCharacterId: (id) => set({ currentCharacterId: id }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setCurrentWritingSessionId: (id) => set({ currentWritingSessionId: id }),

  memoryRefreshTick: 0,
  triggerMemoryRefresh: () => set((s) => ({ memoryRefreshTick: s.memoryRefreshTick + 1 })),

  stateQueuedRefreshTick: 0,
  triggerStateQueued: () => set((s) => ({ stateQueuedRefreshTick: s.stateQueuedRefreshTick + 1 })),

  stateFailedTick: 0,
  triggerStateFailed: () => set((s) => ({ stateFailedTick: s.stateFailedTick + 1 })),
}));

export default useStore;
