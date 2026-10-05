import { describe, expect, it } from 'vitest';

import { getAvatarColor, getAvatarUrl } from '../../src/core/utils/avatar.js';

describe('avatar utils', () => {
  it('空 id 使用默认颜色，同一 id 颜色稳定', () => {
    expect(getAvatarColor()).toContain('var(--we-color-accent)');
    expect(getAvatarColor('char-1')).toBe(getAvatarColor('char-1'));
    expect(getAvatarColor('char-1')).not.toBe(getAvatarColor('char-2'));
  });

  it('颜色都从主题主色派生，色相只在主色附近偏移', () => {
    const colors = new Set(Array.from({ length: 64 }, (_, i) => getAvatarColor(`id-${i}`)));
    expect(colors.size).toBe(8);
    for (const color of colors) {
      expect(color).toMatch(/^oklch\(from var\(--we-color-accent\) 0\.\d+ 0\.09 calc\(h \+ -?\d+(\.\d+)?\)\)$/);
      const offset = Number(color.match(/calc\(h \+ (-?[\d.]+)\)/)[1]);
      expect(Math.abs(offset)).toBeLessThanOrEqual(52.5);
    }
  });

  it('区分绝对路径和相对上传路径', () => {
    expect(getAvatarUrl(null)).toBeNull();
    expect(getAvatarUrl('avatars/a.png')).toBe('/api/uploads/avatars/a.png');
    expect(getAvatarUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(getAvatarUrl('/api/uploads/avatars/a.png')).toBe('/api/uploads/avatars/a.png');
  });
});
