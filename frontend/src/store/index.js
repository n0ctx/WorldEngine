import { create } from 'zustand';

const useStore = create((set) => ({
  currentWorldId: null,
  currentCharacterId: null,
  currentSessionId: null,

  setCurrentWorldId: (id) => set({ currentWorldId: id }),
  setCurrentCharacterId: (id) => set({ currentCharacterId: id }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
}));

export default useStore;
