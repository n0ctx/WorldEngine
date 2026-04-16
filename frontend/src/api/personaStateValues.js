const BASE = '/api';

export async function getPersonaStateValues(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona-state-values`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updatePersonaStateValue(worldId, fieldKey, valueJson) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona-state-values/${fieldKey}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: valueJson }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function resetPersonaStateValues(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona-state-values/reset`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `重置失败：${res.status}`);
  }
  return res.json();
}
