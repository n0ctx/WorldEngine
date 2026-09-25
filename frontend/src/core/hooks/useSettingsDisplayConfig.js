import { useCallback, useState } from 'react';
import { useDisplaySettingsStore } from '../state/displaySettings.js';
import { readDisplaySettings } from './settingsConfigState.js';

export function useSettingsDisplayConfig(patchConfig) {
  const [showThinking, setShowThinkingLocal] = useState(true);
  const setShowThinkingStore = useDisplaySettingsStore((state) => state.setShowThinking);
  const [autoCollapseThinking, setAutoCollapseThinkingLocal] = useState(true);
  const setAutoCollapseThinkingStore = useDisplaySettingsStore((state) => state.setAutoCollapseThinking);
  const [showTokenUsage, setShowTokenUsageLocal] = useState(false);
  const setShowTokenUsageStore = useDisplaySettingsStore((state) => state.setShowTokenUsage);
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
    setCurrentModelPricing(settings.modelPricing);
    setCurrentWritingModelPricing(settings.writingModelPricing);
  }, [
    setAutoCollapseThinkingStore,
    setCurrentModelPricing,
    setCurrentWritingModelPricing,
    setShowThinkingStore,
    setShowTokenUsageStore,
  ]);

  async function handleToggleShowThinking(enabled) {
    setShowThinkingLocal(enabled);
    setShowThinkingStore(enabled);
    await patchConfig({ ui: { show_thinking: enabled } });
  }

  async function handleToggleAutoCollapseThinking(enabled) {
    setAutoCollapseThinkingLocal(enabled);
    setAutoCollapseThinkingStore(enabled);
    await patchConfig({ ui: { auto_collapse_thinking: enabled } });
  }

  async function handleToggleShowTokenUsage(enabled) {
    setShowTokenUsageLocal(enabled);
    setShowTokenUsageStore(enabled);
    await patchConfig({ ui: { show_token_usage: enabled } });
  }

  return {
    displayProps: {
      showThinking,
      onToggleShowThinking: handleToggleShowThinking,
      autoCollapseThinking,
      onToggleAutoCollapseThinking: handleToggleAutoCollapseThinking,
      showTokenUsage,
      onToggleShowTokenUsage: handleToggleShowTokenUsage,
    },
    applyConfig,
  };
}
