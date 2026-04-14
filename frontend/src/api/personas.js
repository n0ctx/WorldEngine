const BASE = '/api';

export async function getPersona(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updatePersona(worldId, patch) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
