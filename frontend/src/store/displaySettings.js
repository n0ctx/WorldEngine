import { create } from 'zustand';

export const useDisplaySettingsStore = create((set) => ({
  showThinking: true,
  setShowThinking: (v) => set({ showThinking: v }),
}));
