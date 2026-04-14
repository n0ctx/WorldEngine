const BASE = '/api';

export async function getPersonaStateValues(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona-state-values`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
