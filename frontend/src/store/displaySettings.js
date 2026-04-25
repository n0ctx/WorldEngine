import { create } from 'zustand';

export const useDisplaySettingsStore = create((set) => ({
  showThinking: true,
  setShowThinking: (v) => set({ showThinking: v }),
  autoCollapseThinking: true,
  setAutoCollapseThinking: (v) => set({ autoCollapseThinking: v }),
  showTokenUsage: false,
  setShowTokenUsage: (v) => set({ showTokenUsage: v }),
  currentModelPricing: null,
  setCurrentModelPricing: (v) => set({ currentModelPricing: v }),
  currentWritingModelPricing: null,
  setCurrentWritingModelPricing: (v) => set({ currentWritingModelPricing: v }),
}));
