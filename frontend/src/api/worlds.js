const BASE = '/api/worlds';

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

export function getWorlds() {
  return request(BASE);
}

export function getWorld(id) {
  return request(`${BASE}/${id}`);
}

export function createWorld(data) {
  return request(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function updateWorld(id, data) {
  return request(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteWorld(id) {
  return request(`${BASE}/${id}`, { method: 'DELETE' });
}
