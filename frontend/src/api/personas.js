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

export function uploadPersonaAvatar(worldId, file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return fetch(`${BASE}/worlds/${worldId}/persona/avatar`, {
    method: 'POST',
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `上传失败：${res.status}`);
    }
    return res.json();
  });
}
