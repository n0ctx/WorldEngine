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
  // 弹幕滚动速度（'slow'|'normal'|'fast'）；开关由后端控制是否下发弹幕，前端只需速度
  danmakuSpeed: 'normal',
  setDanmakuSpeed: (v) => set({ danmakuSpeed: v }),
}));
