import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME_ID,
  VISUAL_THEMES,
  applyVisualTheme,
  resolveThemeId,
} from '../visualThemes.js';

describe('visualThemes', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('收录内置主题包，不收模板，元信息里不带 CSS', () => {
    const ids = VISUAL_THEMES.map((theme) => theme.id);
    expect(ids).toEqual(expect.arrayContaining(['nocturne', 'classic-parchment', 'dice-table']));
    expect(ids.some((id) => id.startsWith('_'))).toBe(false);
    expect(VISUAL_THEMES.every((theme) => !('css' in theme))).toBe(true);
  });

  it('未知主题 id 回落默认主题', () => {
    expect(resolveThemeId('classic-parchment')).toBe('classic-parchment');
    expect(resolveThemeId('ghost')).toBe(DEFAULT_THEME_ID);
    expect(resolveThemeId(undefined)).toBe(DEFAULT_THEME_ID);
  });

  it('applyVisualTheme 写入 we-theme-css 并派发事件', () => {
    const listener = vi.fn();
    window.addEventListener('we:theme-updated', listener);

    applyVisualTheme('classic-parchment');

    expect(document.getElementById('we-theme-css')).not.toBeNull();
    expect(document.documentElement.dataset.theme).toBe('classic-parchment');
    expect(listener.mock.calls[0][0].detail).toEqual({ id: 'classic-parchment' });
    window.removeEventListener('we:theme-updated', listener);
  });

  it('applyVisualTheme 遇到未知 id 套用默认主题', () => {
    const listener = vi.fn();
    window.addEventListener('we:theme-updated', listener);

    applyVisualTheme('ghost');

    expect(listener.mock.calls[0][0].detail).toEqual({ id: DEFAULT_THEME_ID });
    window.removeEventListener('we:theme-updated', listener);
  });
});
