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

export function updateApiKey(key) {
  return request(`${BASE}/apikey`, {
    method: 'PUT',
    body: JSON.stringify({ api_key: key }),
  });
}

export function updateEmbeddingApiKey(key) {
  return request(`${BASE}/embedding-apikey`, {
    method: 'PUT',
    body: JSON.stringify({ api_key: key }),
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

export function updateAuxApiKey(key) {
  return request(`${BASE}/aux-apikey`, {
    method: 'PUT',
    body: JSON.stringify({ api_key: key }),
  });
}

export function fetchAuxModels() {
  return request(`${BASE}/aux/models`);
}

export function testAuxConnection() {
  return request(`${BASE}/aux/test-connection`);
}

export function updateWritingApiKey(key) {
  return request(`${BASE}/writing-apikey`, {
    method: 'PUT',
    body: JSON.stringify({ api_key: key }),
  });
}

export function fetchWritingModels() {
  return request(`${BASE}/writing/models`);
}

export function testWritingConnection() {
  return request(`${BASE}/writing/test-connection`);
}
