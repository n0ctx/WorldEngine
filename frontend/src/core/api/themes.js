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

if (import.meta.hot) {
  import.meta.hot.on('we:theme-css-changed', () => {
    refreshThemeCss(activeThemeId, { silent: true });
  });
}

// 把一份 theme.css 套到页面上。设计实验室的草稿主题也走这里，草稿不会成为「当前主题」
export function applyThemeCss(css, id) {
  let el = document.getElementById('we-theme-css');
  if (!el) {
    el = document.createElement('style');
    el.id = 'we-theme-css';
    const customCss = document.getElementById('we-custom-css');
    document.head.insertBefore(el, customCss || null);
  }
  el.textContent = css;
  window.dispatchEvent(new CustomEvent('we:theme-updated', { detail: { id } }));
}

export async function refreshThemeCss(id, options = {}) {
  try {
    const css = await fetchThemeCss(id);
    activeThemeId = id;
    applyThemeCss(css, id);
  } catch (err) {
    // 主题加载失败时保留核心样式，不阻塞应用启动。
    if (!options.silent) {
      throw err;
    }
  }
}
