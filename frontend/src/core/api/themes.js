import { downloadJson } from './import-export.js';
import { assertOk, request } from './request.js';

const BASE = '/api/themes';
export const DEFAULT_THEME_ID = 'nocturne';

let activeThemeId = DEFAULT_THEME_ID;

export function listThemes() {
  return request(BASE);
}

export async function fetchThemeCss(id) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/css`);
  await assertOk(res);
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
  downloadJson(data, filename || `${id}.wetheme.json`);
}

if (import.meta.hot) {
  import.meta.hot.on('we:theme-css-changed', () => {
    refreshThemeCss(activeThemeId, { silent: true });
  });
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
    activeThemeId = id;
    window.dispatchEvent(new CustomEvent('we:theme-updated', { detail: { id } }));
  } catch (err) {
    // 主题加载失败时保留核心样式，不阻塞应用启动。
    if (!options.silent) {
      throw err;
    }
  }
}
