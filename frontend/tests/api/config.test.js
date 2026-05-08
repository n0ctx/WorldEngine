import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAuxModels,
  fetchEmbeddingModels,
  fetchModels,
  fetchWritingModels,
  getConfig,
  testAuxConnection,
  testConnection,
  testEmbeddingConnection,
  testWritingConnection,
  updateConfig,
  updateProviderKey,
} from '../../src/api/config.js';

describe('config api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('发送配置读写、模型拉取和连接测试请求', async () => {
    await getConfig();
    await updateConfig({ llm: { provider: 'openai' } });
    await updateProviderKey('openai', 'main-key');
    await fetchModels();
    await fetchEmbeddingModels();
    await testConnection();
    await testEmbeddingConnection();
    await fetchAuxModels();
    await testAuxConnection();
    await fetchWritingModels();
    await testWritingConnection();

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/config', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/config', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ llm: { provider: 'openai' } }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/config/provider-key', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ provider: 'openai', api_key: 'main-key' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/config/models', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/config/embedding-models', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(6, '/api/config/test-connection', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(7, '/api/config/test-embedding', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(8, '/api/config/aux/models', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(9, '/api/config/aux/test-connection', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(10, '/api/config/writing/models', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(11, '/api/config/writing/test-connection', expect.any(Object));
  });
});
