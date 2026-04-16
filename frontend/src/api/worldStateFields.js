const BASE = '/api';

export async function listWorldStateFields(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/world-state-fields`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWorldStateField(worldId, data) {
  const res = await fetch(`${BASE}/worlds/${worldId}/world-state-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || await res.text());
  }
  return res.json();
}

export async function updateWorldStateField(id, patch) {
  const res = await fetch(`${BASE}/world-state-fields/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteWorldStateField(id) {
  const res = await fetch(`${BASE}/world-state-fields/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export async function reorderWorldStateFields(worldId, orderedIds) {
  const res = await fetch(`${BASE}/worlds/${worldId}/world-state-fields/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
