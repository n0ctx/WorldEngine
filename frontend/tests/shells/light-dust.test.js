import { describe, expect, it, vi } from 'vitest';
import { approachColor, createMoteSprite, releaseMoteSprite } from '../../src/shells/book-spread/atmosphere/lightDust.js';

describe('光尘贴图', () => {
  it('颜色缓动跨过整数时换贴图，同一整数内复用', () => {
    const frames = [];
    let color = { r: 10, g: 20, b: 30 };
    const target = { r: 12.4, g: 20, b: 30 };
    let sprite = null;
    let key = '';
    let created = 0;
    const doc = {
      createElement: () => {
        created += 1;
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            createRadialGradient: () => ({ addColorStop: () => {} }),
            fillRect: () => {},
            clearRect: () => {},
          }),
        };
      },
    };

    for (let i = 0; i < 40; i += 1) {
      color = approachColor(color, target, 1 / 60);
      const next = `${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)}`;
      if (next !== key) {
        releaseMoteSprite(sprite);
        sprite = createMoteSprite(color, doc);
        key = next;
      }
      frames.push(key);
    }

    expect(created).toBe(new Set(frames).size);
    expect(created).toBeLessThan(5);
    expect(sprite.width).toBe(64);
  });

  it('释放后把贴图宽高清零', () => {
    const clearRect = vi.fn();
    const sprite = {
      width: 64,
      height: 64,
      getContext: () => ({ clearRect }),
    };
    releaseMoteSprite(sprite);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 64, 64);
    expect(sprite.width).toBe(0);
    expect(sprite.height).toBe(0);
  });
});
