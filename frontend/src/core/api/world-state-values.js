const BASE = '/api';

async function request(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${res.status}`);
  }
  return res.json();
}

export function getWorldStateValues(worldId) {
  return request(`${BASE}/worlds/${worldId}/state-values`);
}

export async function updateWorldStateValue(worldId, fieldKey, valueJson) {
  const res = await fetch(`${BASE}/worlds/${worldId}/state-values/${fieldKey}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: valueJson }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${res.status}`);
  }
  return res.json();
}

export async function resetWorldStateValues(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/state-values/reset`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `重置失败：${res.status}`);
  }
  return res.json();
}
