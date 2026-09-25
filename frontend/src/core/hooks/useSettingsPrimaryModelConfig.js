import { useCallback, useState } from 'react';
import { NEEDS_BASE_URL_PROVIDERS, LOCAL_PROVIDERS } from '../constants/settings.js';
import { readMainModelSettings } from './settingsConfigState.js';

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

  async function handleLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = LOCAL_PROVIDERS.includes(value);
      const patch = isLocal ? { provider: value } : { provider: value, base_url: '' };
      const updated = await patchConfig({ llm: patch }, { reload: true });
      setLlm((previous) => ({
        ...previous,
        provider: value,
        base_url: updated.llm?.base_url ?? '',
        model: updated.llm?.model ?? '',
        has_key: updated.llm?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setLlm((previous) => ({ ...previous, has_key: value }));
    } else {
      setLlm((previous) => ({ ...previous, [field]: value }));
      await patchConfig({ llm: { [field]: value } });
    }
  }

  async function handleEmbeddingChange(field, value) {
    if (field === 'provider') {
      const keepBaseUrl = NEEDS_BASE_URL_PROVIDERS.has(value);
      const patch = keepBaseUrl ? { provider: value } : { provider: value, base_url: '' };
      const updated = await patchConfig({ embedding: patch }, { reload: true });
      setEmbedding((previous) => ({
        ...previous,
        provider: value,
        base_url: updated.embedding?.base_url ?? '',
        model: updated.embedding?.model ?? '',
        has_key: updated.embedding?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setEmbedding((previous) => ({ ...previous, has_key: value }));
    } else {
      setEmbedding((previous) => ({ ...previous, [field]: value }));
      await patchConfig({ embedding: { [field]: value } });
    }
  }

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
