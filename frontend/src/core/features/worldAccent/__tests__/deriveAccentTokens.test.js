import { describe, it, expect } from 'vitest';
import { deriveAccentTokens } from '../deriveAccentTokens.js';

describe('deriveAccentTokens', () => {
  it('非法 hex 返回 null', () => {
    expect(deriveAccentTokens('not-a-color')).toBeNull();
    expect(deriveAccentTokens(null)).toBeNull();
  });

  it('派生出完整的一组 accent 系 token，且 accent / border-focus 与输入色一致', () => {
    const tokens = deriveAccentTokens('#7f95a8');
    expect(tokens['--we-color-accent']).toBe('#7f95a8');
    expect(tokens['--we-color-border-focus']).toBe('#7f95a8');
    expect(tokens['--we-color-accent-deep']).toMatch(/^#[0-9a-f]{6}$/);
    expect(tokens['--we-color-accent-bg']).toContain('rgba(127, 149, 168');
    expect(tokens['--we-color-accent-border']).toContain('rgba(127, 149, 168');
    expect(tokens['--we-color-accent-border-sm']).toContain('rgba(127, 149, 168');
  });

  it('accent-deep 比 accent 更暗（用于按钮描边等深色变体）', () => {
    const tokens = deriveAccentTokens('#7f95a8');
    // #7f95a8 → 亮度较高；deep 版本每个通道都应更小或持平
    const deep = tokens['--we-color-accent-deep'];
    const toRgbSum = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    expect(toRgbSum(deep)).toBeLessThan(toRgbSum('#7f95a8'));
  });
});
