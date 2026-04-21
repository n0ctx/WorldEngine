import { create } from 'zustand';
import { SETTINGS_MODE } from '../components/settings/SettingsConstants';

export const useAppModeStore = create((set) => ({
  appMode: SETTINGS_MODE.CHAT,
  setAppMode: (mode) => set({ appMode: mode }),
}));
