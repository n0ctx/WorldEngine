import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteTheme,
  exportTheme,
  fetchThemeCss,
  importTheme,
  listThemes,
  refreshThemeCss,
  setActiveTheme,
} from '../themes.js';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('themes api', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    globalThis.fetch = vi.fn(async (url, init) => {
      if (url === '/api/themes') return jsonResponse({ themes: [], activeTheme: 'classic-parchment' });
      if (url === '/api/themes/active') return jsonResponse({ activeTheme: JSON.parse(init.body).id });
      if (url === '/api/themes/import') return jsonResponse({ id: JSON.parse(init.body).theme.id }, { status: 201 });
      if (url === '/api/themes/demo/export') return jsonResponse({ format: 'worldengine-theme-v1' });
      if (url === '/api/themes/demo') return new Response(null, { status: 204 });
      if (url === '/api/themes/demo/css') return new Response(':root { --we-color-bg-canvas: red; }', { status: 200 });
      return jsonResponse({ error: 'nope' }, { status: 404 });
    });
  });

  it('封装 list/switch/import/export/delete 请求', async () => {
    expect(await listThemes()).toEqual({ themes: [], activeTheme: 'classic-parchment' });
    expect(await setActiveTheme('demo')).toEqual({ activeTheme: 'demo' });
    expect(await importTheme({ format: 'worldengine-theme-v1', theme: { id: 'demo' }, css: '' })).toEqual({ id: 'demo' });
    expect(await exportTheme('demo')).toEqual({ format: 'worldengine-theme-v1' });
    expect(await deleteTheme('demo')).toBeNull();
  });

  it('fetchThemeCss 返回 CSS 文本', async () => {
    await expect(fetchThemeCss('demo')).resolves.toContain('--we-color-bg-canvas');
  });

  it('refreshThemeCss 写入 we-theme-css 并派发事件', async () => {
    const listener = vi.fn();
    window.addEventListener('we:theme-updated', listener);

    await refreshThemeCss('demo');

    expect(document.getElementById('we-theme-css').textContent).toContain('--we-color-bg-canvas');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ id: 'demo' });
  });

  it('refreshThemeCss 默认抛出 CSS 加载错误，silent 模式吞掉启动错误', async () => {
    await expect(refreshThemeCss('missing')).rejects.toThrow('nope');
    await expect(refreshThemeCss('missing', { silent: true })).resolves.toBeUndefined();
    expect(document.getElementById('we-theme-css')).toBeNull();
  });
});
