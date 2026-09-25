import { useCallback, useRef } from 'react';
import { getConfig } from '../api/config.js';
import { useSettingsConfigLoader, useSettingsConfigWriter } from './useSettingsConfigSource.js';
import { useSettingsAdditionalModelConfig } from './useSettingsAdditionalModelConfig.js';
import { useSettingsDiaryConfig } from './useSettingsDiaryConfig.js';
import { useSettingsDisplayConfig } from './useSettingsDisplayConfig.js';
import { useSettingsPrimaryModelConfig } from './useSettingsPrimaryModelConfig.js';
import { useSettingsPromptConfig } from './useSettingsPromptConfig.js';

export function useSettingsConfig() {
  const suppressNextReloadRef = useRef(false);
  const patchConfig = useSettingsConfigWriter(suppressNextReloadRef);
  const primaryModelConfig = useSettingsPrimaryModelConfig(patchConfig);
  const additionalModelConfig = useSettingsAdditionalModelConfig(patchConfig);
  const displayConfig = useSettingsDisplayConfig(patchConfig);
  const promptConfig = useSettingsPromptConfig(patchConfig);
  const diaryConfig = useSettingsDiaryConfig(patchConfig);
  const applyPrimaryModelConfig = primaryModelConfig.applyConfig;
  const applyAdditionalModelConfig = additionalModelConfig.applyConfig;
  const applyDisplayConfig = displayConfig.applyConfig;
  const applyPromptConfig = promptConfig.applyConfig;
  const applyDiaryConfig = diaryConfig.applyConfig;
  const applyConfig = useCallback((config) => {
    applyPrimaryModelConfig(config);
    applyAdditionalModelConfig(config);
    applyDisplayConfig(config);
    applyPromptConfig(config);
    applyDiaryConfig(config);
  }, [applyAdditionalModelConfig, applyDiaryConfig, applyDisplayConfig, applyPrimaryModelConfig, applyPromptConfig]);
  const loading = useSettingsConfigLoader(suppressNextReloadRef, applyConfig);

  async function handleImportSuccess() {
    const importedConfig = await getConfig();
    additionalModelConfig.onImportSuccess(importedConfig);
    promptConfig.onImportSuccess(importedConfig);
  }

  return {
    loading,
    llmProps: { ...primaryModelConfig.modelProps, ...additionalModelConfig.modelProps, ...displayConfig.displayProps },
    promptProps: promptConfig.promptProps,
    onImportSuccess: handleImportSuccess,
    diaryProps: diaryConfig.diaryProps,
  };
}
