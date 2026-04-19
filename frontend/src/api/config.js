const BASE = '/api/config';

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

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
