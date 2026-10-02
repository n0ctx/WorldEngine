import { describe, expect, it, vi } from 'vitest';
import { approachColor, createMoteSpriteCache, releaseMoteSprite } from '../../src/shells/book-spread/atmosphere/lightDust.js';

describe('光尘贴图', () => {
  it('颜色缓动跨过整数时换贴图，同一整数内复用；释放后清掉最后一张', () => {
    const frames = [];
    let color = { r: 10, g: 20, b: 30 };
    const target = { r: 12.4, g: 20, b: 30 };
    const created = [];
    const doc = {
      createElement: () => {
        const sprite = {
          width: 0,
          height: 0,
          getContext: () => ({
            createRadialGradient: () => ({ addColorStop: () => {} }),
            fillRect: () => {},
            clearRect: () => {},
          }),
        };
        created.push(sprite);
        return sprite;
      },
    };
    const cache = createMoteSpriteCache(doc);

    let sprite = null;
    for (let i = 0; i < 40; i += 1) {
      color = approachColor(color, target, 1 / 60);
      sprite = cache.get(color);
      frames.push(sprite);
    }

    expect(created).toHaveLength(new Set(frames).size);
    expect(created.length).toBeLessThan(5);
    expect(sprite.width).toBe(64);
    expect(created.slice(0, -1).every((old) => old.width === 0)).toBe(true);
    cache.release();
    expect(sprite.width).toBe(0);
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
