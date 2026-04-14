const BASE = '/api';

async function request(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${res.status}`);
  }
  return res.json();
}

export function getCharacterStateValues(characterId) {
  return request(`${BASE}/characters/${characterId}/state-values`);
}
