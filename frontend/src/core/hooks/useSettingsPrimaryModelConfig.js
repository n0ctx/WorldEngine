import { useCallback, useState } from 'react';
import { NEEDS_BASE_URL_PROVIDERS, LOCAL_PROVIDERS } from '../constants/settings.js';
import { createModelSectionChangeHandler, readMainModelSettings } from './settingsConfigState.js';

export function useSettingsPrimaryModelConfig(patchConfig) {
  const [llm, setLlm] = useState({});
  const [embedding, setEmbedding] = useState({});
  const [proxyUrl, setProxyUrl] = useState('');

  const applyConfig = useCallback((config) => {
    const settings = readMainModelSettings(config);
    setLlm(settings.llm);
    setEmbedding(settings.embedding);
    setProxyUrl(settings.proxyUrl);
  }, []);

  const handleLlmChange = createModelSectionChangeHandler(patchConfig, setLlm, {
    path: ['llm'],
    providerPatch: (value) => (LOCAL_PROVIDERS.includes(value) ? { provider: value } : { provider: value, base_url: '' }),
    empty: '',
  });
  const handleEmbeddingChange = createModelSectionChangeHandler(patchConfig, setEmbedding, {
    path: ['embedding'],
    providerPatch: (value) => (NEEDS_BASE_URL_PROVIDERS.has(value) ? { provider: value } : { provider: value, base_url: '' }),
    empty: '',
  });

  async function handleProxyUrlSave(url) {
    setProxyUrl(url);
    await patchConfig({ proxy_url: url });
  }

  return {
    modelProps: {
      llm,
      embedding,
      onLlmChange: handleLlmChange,
      onEmbeddingChange: handleEmbeddingChange,
      proxyUrl,
      onProxyUrlSave: handleProxyUrlSave,
    },
    applyConfig,
  };
}
