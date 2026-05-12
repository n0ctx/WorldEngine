import { request } from './request.js';

const BASE = '/api/themes';
export const DEFAULT_THEME_ID = 'classic-parchment';

export function listThemes() {
  return request(BASE);
}

export async function fetchThemeCss(id) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/css`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${res.status}`);
  }
  return res.text();
}

export function setActiveTheme(id) {
  return request(`${BASE}/active`, {
    method: 'PUT',
    body: JSON.stringify({ id }),
  });
}

export function importTheme(data) {
  return request(`${BASE}/import`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function exportTheme(id) {
  return request(`${BASE}/${encodeURIComponent(id)}/export`);
}

export function deleteTheme(id) {
  return request(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function downloadTheme(id, filename) {
  const data = await exportTheme(id);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${id}.wetheme.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function refreshThemeCss(id, options = {}) {
  try {
    const css = await fetchThemeCss(id);
    let el = document.getElementById('we-theme-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'we-theme-css';
      const customCss = document.getElementById('we-custom-css');
      document.head.insertBefore(el, customCss || null);
    }
    el.textContent = css;
    window.dispatchEvent(new CustomEvent('we:theme-updated', { detail: { id } }));
  } catch (err) {
    // 主题加载失败时保留核心样式，不阻塞应用启动。
    if (!options.silent) {
      throw err;
    }
  }
}
