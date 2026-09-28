import { useCallback, useState } from 'react';
import { useDisplaySettingsStore } from '../state/displaySettings.js';
import { readDisplaySettings } from './settingsConfigState.js';
import { modePatch, modeValue } from './settingsModeValue.js';

export function useSettingsDisplayConfig(patchConfig, settingsMode) {
  const isWriting = settingsMode === 'writing';
  const [showThinking, setShowThinkingLocal] = useState(true);
  const [writingShowThinking, setWritingShowThinkingLocal] = useState(true);
  const setShowThinkingStore = useDisplaySettingsStore((state) => state.setShowThinking);
  const setWritingShowThinkingStore = useDisplaySettingsStore((state) => state.setWritingShowThinking);
  const [autoCollapseThinking, setAutoCollapseThinkingLocal] = useState(true);
  const [writingAutoCollapseThinking, setWritingAutoCollapseThinkingLocal] = useState(true);
  const setAutoCollapseThinkingStore = useDisplaySettingsStore((state) => state.setAutoCollapseThinking);
  const setWritingAutoCollapseThinkingStore = useDisplaySettingsStore((state) => state.setWritingAutoCollapseThinking);
  const [showTokenUsage, setShowTokenUsageLocal] = useState(false);
  const [writingShowTokenUsage, setWritingShowTokenUsageLocal] = useState(false);
  const setShowTokenUsageStore = useDisplaySettingsStore((state) => state.setShowTokenUsage);
  const setWritingShowTokenUsageStore = useDisplaySettingsStore((state) => state.setWritingShowTokenUsage);
  const setCurrentModelPricing = useDisplaySettingsStore((state) => state.setCurrentModelPricing);
  const setCurrentWritingModelPricing = useDisplaySettingsStore((state) => state.setCurrentWritingModelPricing);

  const applyConfig = useCallback((config) => {
    const settings = readDisplaySettings(config);
    setShowThinkingLocal(settings.showThinking);
    setShowThinkingStore(settings.showThinking);
    setAutoCollapseThinkingLocal(settings.autoCollapseThinking);
    setAutoCollapseThinkingStore(settings.autoCollapseThinking);
    setShowTokenUsageLocal(settings.showTokenUsage);
    setShowTokenUsageStore(settings.showTokenUsage);
    setWritingShowThinkingLocal(settings.writingShowThinking);
    setWritingShowThinkingStore(settings.writingShowThinking);
    setWritingAutoCollapseThinkingLocal(settings.writingAutoCollapseThinking);
    setWritingAutoCollapseThinkingStore(settings.writingAutoCollapseThinking);
    setWritingShowTokenUsageLocal(settings.writingShowTokenUsage);
    setWritingShowTokenUsageStore(settings.writingShowTokenUsage);
    setCurrentModelPricing(settings.modelPricing);
    setCurrentWritingModelPricing(settings.writingModelPricing);
  }, [
    setAutoCollapseThinkingStore,
    setCurrentModelPricing,
    setCurrentWritingModelPricing,
    setShowThinkingStore,
    setShowTokenUsageStore,
    setWritingShowThinkingStore,
    setWritingAutoCollapseThinkingStore,
    setWritingShowTokenUsageStore,
  ]);

  async function saveDisplaySetting(key, enabled, chatLocal, writingLocal, chatStore, writingStore) {
    modeValue(isWriting, chatLocal, writingLocal)(enabled);
    modeValue(isWriting, chatStore, writingStore)(enabled);
    await patchConfig(modePatch(isWriting, key, enabled, 'ui'));
  }

  return {
    displayProps: {
      showThinking: modeValue(isWriting, showThinking, writingShowThinking),
      onToggleShowThinking: (enabled) => saveDisplaySetting('show_thinking', enabled, setShowThinkingLocal, setWritingShowThinkingLocal, setShowThinkingStore, setWritingShowThinkingStore),
      autoCollapseThinking: modeValue(isWriting, autoCollapseThinking, writingAutoCollapseThinking),
      onToggleAutoCollapseThinking: (enabled) => saveDisplaySetting('auto_collapse_thinking', enabled, setAutoCollapseThinkingLocal, setWritingAutoCollapseThinkingLocal, setAutoCollapseThinkingStore, setWritingAutoCollapseThinkingStore),
      showTokenUsage: modeValue(isWriting, showTokenUsage, writingShowTokenUsage),
      onToggleShowTokenUsage: (enabled) => saveDisplaySetting('show_token_usage', enabled, setShowTokenUsageLocal, setWritingShowTokenUsageLocal, setShowTokenUsageStore, setWritingShowTokenUsageStore),
    },
    applyConfig,
  };
}
