import { create } from 'zustand';

export const useAppModeStore = create((set) => ({
  appMode: 'chat',
  setAppMode: (mode) => set({ appMode: mode }),
}));
