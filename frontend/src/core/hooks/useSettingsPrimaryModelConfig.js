import { useCallback, useState } from 'react';
import { LOCAL_PROVIDERS } from '../constants/settings.js';
import { createModelSectionChangeHandler, readMainModelSettings } from './settingsConfigState.js';

export function useSettingsPrimaryModelConfig(patchConfig) {
  const [llm, setLlm] = useState({});
  const [proxyUrl, setProxyUrl] = useState('');

  const applyConfig = useCallback((config) => {
    const settings = readMainModelSettings(config);
    setLlm(settings.llm);
    setProxyUrl(settings.proxyUrl);
  }, []);

  const handleLlmChange = createModelSectionChangeHandler(patchConfig, setLlm, {
    path: ['llm'],
    providerPatch: (value) => (LOCAL_PROVIDERS.includes(value) ? { provider: value } : { provider: value, base_url: '' }),
    empty: '',
  });

  async function handleProxyUrlSave(url) {
    setProxyUrl(url);
    await patchConfig({ proxy_url: url });
  }

  return {
    modelProps: {
      llm,
      onLlmChange: handleLlmChange,
      proxyUrl,
      onProxyUrlSave: handleProxyUrlSave,
    },
    applyConfig,
  };
}
