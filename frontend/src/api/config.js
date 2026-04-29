import { request } from './request.js';

const BASE = '/api/config';

export function getConfig() {
  return request(BASE);
}

export function updateConfig(patch) {
  return request(BASE, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

/** 写入指定 provider 的 API Key 到顶层共享池（所有 LLM/Embedding section 共用） */
export function updateProviderKey(provider, key) {
  return request(`${BASE}/provider-key`, {
    method: 'PUT',
    body: JSON.stringify({ provider, api_key: key }),
  });
}

export function fetchModels() {
  return request(`${BASE}/models`);
}

export function fetchEmbeddingModels() {
  return request(`${BASE}/embedding-models`);
}

export function testConnection() {
  return request(`${BASE}/test-connection`);
}

export function testEmbeddingConnection() {
  return request(`${BASE}/test-embedding`);
}

export function fetchAuxModels() {
  return request(`${BASE}/aux/models`);
}

export function testAuxConnection() {
  return request(`${BASE}/aux/test-connection`);
}

export function fetchWritingModels() {
  return request(`${BASE}/writing/models`);
}

export function testWritingConnection() {
  return request(`${BASE}/writing/test-connection`);
}

export function fetchWritingAuxModels() {
  return request(`${BASE}/writing-aux/models`);
}

export function testWritingAuxConnection() {
  return request(`${BASE}/writing-aux/test-connection`);
}
