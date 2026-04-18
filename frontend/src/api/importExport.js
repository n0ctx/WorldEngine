const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${res.status}`);
  }
  return res.json();
}

/**
 * 导出角色卡，返回 JSON 数据对象
 */
export function exportCharacter(characterId) {
  return request(`${BASE}/characters/${characterId}/export`);
}

/**
 * 下载角色卡为 .wechar.json 文件
 */
export async function downloadCharacterCard(characterId, filename) {
  const data = await exportCharacter(characterId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'character.wechar.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导入角色卡到指定世界，返回新建角色
 */
export function importCharacter(worldId, data) {
  return request(`${BASE}/worlds/${worldId}/import-character`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 导出世界卡，返回 JSON 数据对象
 */
export function exportWorld(worldId) {
  return request(`${BASE}/worlds/${worldId}/export`);
}

/**
 * 下载世界卡为 .weworld.json 文件
 */
export async function downloadWorldCard(worldId, filename) {
  const data = await exportWorld(worldId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'world.weworld.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导出玩家为角色卡，返回 JSON 数据对象
 */
export function exportPersona(worldId) {
  return request(`${BASE}/worlds/${worldId}/persona/export`);
}

/**
 * 下载玩家卡为 .wechar.json 文件
 */
export async function downloadPersonaCard(worldId, filename) {
  const data = await exportPersona(worldId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'persona.wechar.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导入世界卡，返回新建世界
 */
export function importWorld(data) {
  return request(`${BASE}/worlds/import`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 导出全局设置，返回 JSON 数据对象
 */
export function exportGlobalSettings() {
  return request(`${BASE}/global-settings/export`);
}

/**
 * 下载全局设置为 .weglobal.json 文件
 */
export async function downloadGlobalSettings() {
  const data = await exportGlobalSettings();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'worldengine-global-settings.weglobal.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导入全局设置（追加条目，覆盖 config 字段）
 */
export function importGlobalSettings(data) {
  return request(`${BASE}/global-settings/import`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 从文件中读取 JSON 并返回解析后的对象
 */
export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target.result));
      } catch {
        reject(new Error('文件格式错误，无法解析 JSON'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}
