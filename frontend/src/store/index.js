import { create } from 'zustand';

const useStore = create((set) => ({
  currentWorldId: null,
  currentCharacterId: null,
  currentSessionId: null,

  setCurrentWorldId: (id) => set({ currentWorldId: id }),
  setCurrentCharacterId: (id) => set({ currentCharacterId: id }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  memoryRefreshTick: 0,
  triggerMemoryRefresh: () => set((s) => ({ memoryRefreshTick: s.memoryRefreshTick + 1 })),
}));

export default useStore;
