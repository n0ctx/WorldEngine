const BASE = '/api';

export async function listPersonaStateFields(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona-state-fields`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createPersonaStateField(worldId, data) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona-state-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updatePersonaStateField(id, patch) {
  const res = await fetch(`${BASE}/persona-state-fields/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deletePersonaStateField(id) {
  const res = await fetch(`${BASE}/persona-state-fields/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export async function reorderPersonaStateFields(worldId, orderedIds) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona-state-fields/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
