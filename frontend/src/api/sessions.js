const BASE = '/api';

export async function getSessions(characterId, limit = 20, offset = 0) {
  const res = await fetch(`${BASE}/characters/${characterId}/sessions?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`getSessions failed: ${res.status}`);
  return res.json();
}

export async function getSession(id) {
  const res = await fetch(`${BASE}/sessions/${id}`);
  if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
  return res.json();
}

export async function createSession(characterId) {
  const res = await fetch(`${BASE}/characters/${characterId}/sessions`, { method: 'POST' });
  if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
  return res.json();
}

export async function deleteSession(id) {
  const res = await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteSession failed: ${res.status}`);
}

export async function renameSession(id, title) {
  const res = await fetch(`${BASE}/sessions/${id}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`renameSession failed: ${res.status}`);
  return res.json();
}

export async function getMessages(sessionId, limit = 50, offset = 0) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`getMessages failed: ${res.status}`);
  return res.json();
}

export async function editMessage(messageId, content) {
  const res = await fetch(`${BASE}/messages/${messageId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`editMessage failed: ${res.status}`);
  return res.json();
}
