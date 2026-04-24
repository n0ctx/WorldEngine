const BASE = '/api';

/** 获取当前世界激活的 persona（兼容旧接口） */
export async function getPersona(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 获取世界下所有 persona 列表（含 is_active 字段） */
export async function listPersonas(worldId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/personas`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 根据 id 获取单条 persona */
export async function getPersonaById(id) {
  const res = await fetch(`${BASE}/personas/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 创建新 persona */
export async function createPersona(worldId, data = {}) {
  const res = await fetch(`${BASE}/worlds/${worldId}/personas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 按 id 更新 persona（name / system_prompt） */
export async function updatePersonaById(id, patch) {
  const res = await fetch(`${BASE}/personas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 兼容旧接口：通过 worldId 更新 active persona */
export async function updatePersona(worldId, patch) {
  const res = await fetch(`${BASE}/worlds/${worldId}/persona`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 设置指定 persona 为激活状态（用于 chat） */
export async function activatePersona(worldId, personaId) {
  const res = await fetch(`${BASE}/worlds/${worldId}/personas/${personaId}/activate`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 删除 persona（不能删除最后一张） */
export async function deletePersona(id) {
  const res = await fetch(`${BASE}/personas/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
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
