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
import { readAuxiliaryModelSettings, readWritingModelSettings } from './settingsConfigState.js';

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

  async function handleAuxLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = value && LOCAL_PROVIDERS.includes(value);
      const patch = value ? (isLocal ? { provider: value } : { provider: value, base_url: '' }) : { provider: null };
      const updated = await patchConfig({ aux_llm: patch }, { reload: true });
      setAuxLlm((previous) => ({
        ...previous,
        provider: value || null,
        base_url: updated.aux_llm?.base_url ?? null,
        model: updated.aux_llm?.model ?? null,
        has_key: updated.aux_llm?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setAuxLlm((previous) => ({ ...previous, has_key: value }));
    } else {
      setAuxLlm((previous) => ({ ...previous, [field]: value }));
      await patchConfig({ aux_llm: { [field]: value } });
    }
  }

  async function handleWritingAuxLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = value && LOCAL_PROVIDERS.includes(value);
      const patch = value ? (isLocal ? { provider: value } : { provider: value, base_url: '' }) : { provider: null };
      const updated = await patchConfig({ writing: { aux_llm: patch } }, { reload: true });
      setWritingAuxLlm((previous) => ({
        ...previous,
        provider: value || null,
        base_url: updated.writing?.aux_llm?.base_url ?? null,
        model: updated.writing?.aux_llm?.model ?? null,
        has_key: updated.writing?.aux_llm?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setWritingAuxLlm((previous) => ({ ...previous, has_key: value }));
    } else {
      setWritingAuxLlm((previous) => ({ ...previous, [field]: value }));
      await patchConfig({ writing: { aux_llm: { [field]: value } } });
    }
  }

  async function handleWritingLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = value && LOCAL_PROVIDERS.includes(value);
      const patch = value ? (isLocal ? { provider: value } : { provider: value, base_url: '' }) : { provider: null };
      const updated = await patchConfig({ writing: { llm: patch } }, { reload: true });
      setWritingLlm((previous) => ({
        ...previous,
        provider: value || null,
        base_url: updated.writing?.llm?.base_url ?? null,
        model: updated.writing?.llm?.model ?? '',
        has_key: updated.writing?.llm?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setWritingLlm((previous) => ({ ...previous, has_key: value }));
    } else {
      setWritingLlm((previous) => ({ ...previous, [field]: value }));
      await patchConfig({ writing: { llm: { [field]: value } } });
    }
  }

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
