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

export async function updateCharacterStateValue(characterId, fieldKey, valueJson) {
  const res = await fetch(`${BASE}/characters/${characterId}/state-values/${fieldKey}`, {
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
