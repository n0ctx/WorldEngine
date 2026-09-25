import { useCallback, useState } from 'react';
import {
  fetchAuxModels,
  fetchWritingAuxModels,
  fetchWritingModels,
  testAuxConnection,
  testWritingAuxConnection,
  testWritingConnection,
  updateProviderKey,
} from '../api/config.js';
import { LOCAL_PROVIDERS } from '../constants/settings.js';
import { createModelSectionChangeHandler, readAuxiliaryModelSettings, readWritingModelSettings } from './settingsConfigState.js';

/** 可选模型段：清空 provider 表示回退，非本地 provider 同时清空 base_url */
function optionalProviderPatch(value) {
  if (!value) return { provider: null };
  return LOCAL_PROVIDERS.includes(value) ? { provider: value } : { provider: value, base_url: '' };
}

export function useSettingsAdditionalModelConfig(patchConfig) {
  const [auxLlm, setAuxLlm] = useState({});
  const [writingAuxLlm, setWritingAuxLlm] = useState({});
  const [assistantModelSource, setAssistantModelSource] = useState('main');
  const [writingLlm, setWritingLlm] = useState({ provider: null, base_url: null, model: '', temperature: null, max_tokens: null, has_key: false });

  const applyConfig = useCallback((config) => {
    const auxiliarySettings = readAuxiliaryModelSettings(config);
    const writingSettings = readWritingModelSettings(config);
    setAuxLlm(auxiliarySettings.auxLlm);
    setWritingAuxLlm(auxiliarySettings.writingAuxLlm);
    setAssistantModelSource(auxiliarySettings.assistantModelSource);
    setWritingLlm(writingSettings.writingLlm);
  }, []);

  const handleAuxLlmChange = createModelSectionChangeHandler(patchConfig, setAuxLlm, {
    path: ['aux_llm'], providerPatch: optionalProviderPatch, empty: null,
  });
  const handleWritingAuxLlmChange = createModelSectionChangeHandler(patchConfig, setWritingAuxLlm, {
    path: ['writing', 'aux_llm'], providerPatch: optionalProviderPatch, empty: null,
  });
  const handleWritingLlmChange = createModelSectionChangeHandler(patchConfig, setWritingLlm, {
    path: ['writing', 'llm'], providerPatch: optionalProviderPatch, empty: null, emptyModel: '',
  });

  async function handleAssistantModelSourceChange(value) {
    setAssistantModelSource(value);
    await patchConfig({ assistant: { model_source: value } });
  }

  function applyImportedModelSettings(importedConfig) {
    setWritingLlm(readWritingModelSettings(importedConfig).writingLlm);
  }

  return {
    modelProps: {
      auxLlm,
      writingAuxLlm,
      assistantModelSource,
      onAuxLlmChange: handleAuxLlmChange,
      onWritingAuxLlmChange: handleWritingAuxLlmChange,
      onAssistantModelSourceChange: handleAssistantModelSourceChange,
      onAuxApiKeySave: updateProviderKey,
      fetchAuxModels,
      testAuxConnection,
      onWritingAuxApiKeySave: updateProviderKey,
      fetchWritingAuxModels,
      testWritingAuxConnection,
      writingLlm,
      onWritingLlmChange: handleWritingLlmChange,
      onWritingApiKeySave: updateProviderKey,
      fetchWritingModels,
      testWritingConnection,
    },
    onImportSuccess: applyImportedModelSettings,
    applyConfig,
  };
}
