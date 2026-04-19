const BASE = '/api';

export async function listCharacterStateFields(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/character-state-fields`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createCharacterStateField(worldId, data) {
  const res = await fetch(`${BASE}/worlds/${worldId}/character-state-fields`, {
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

export async function updateCharacterStateField(id, patch) {
  const res = await fetch(`${BASE}/character-state-fields/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteCharacterStateField(id) {
  const res = await fetch(`${BASE}/character-state-fields/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export async function reorderCharacterStateFields(worldId, orderedIds) {
  const res = await fetch(`${BASE}/worlds/${worldId}/character-state-fields/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
