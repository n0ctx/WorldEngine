import { create } from 'zustand';
import { SETTINGS_MODE } from '../constants/settings';

export const useAppModeStore = create((set) => ({
  appMode: SETTINGS_MODE.CHAT,
  setAppMode: (mode) => set({ appMode: mode }),
}));
