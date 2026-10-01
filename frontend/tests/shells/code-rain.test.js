import { afterEach, describe, expect, it, vi } from 'vitest';
import { addWave, createRain, createRainScene, drawRain, stepRain } from '../../src/shells/book-spread/atmosphere/codeRain.js';

function seeded(seed = 7) {
  let state = seed;
  return () => ((state = (state * 16807) % 2147483647) / 2147483647);
}

function recordingContext() {
  const calls = { fillText: 0 };
  const ctx = {
    clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
    fillText: () => { calls.fillText += 1; },
  };
  return { ctx, calls };
}

const COLORS = { system: { r: 57, g: 255, b: 143 }, accent: { r: 255, g: 46, b: 147 } };

describe('代码雨', () => {
  afterEach(() => vi.restoreAllMocks());

  it('落出底部的雨从顶上重来，不会越落越少', () => {
    const rand = seeded();
    const drops = createRain(800, 400, rand);
    for (let i = 0; i < 600; i += 1) stepRain(drops, [], 1 / 30, { width: 800, pointer: null }, rand);
    for (const drop of drops) expect(drop.y - drop.trail).toBeLessThanOrEqual(drop.rows + drop.speed / 30);
    const { ctx, calls } = recordingContext();
    drawRain(ctx, { drops, waves: [], width: 800, height: 400, colors: COLORS, pointer: null }, rand);
    expect(calls.fillText).toBeGreaterThan(100);
  });

  it('冲击波扩散一阵后消失，同时最多留四圈', () => {
    const waves = [];
    for (let i = 0; i < 6; i += 1) addWave(waves, 10 * i, 10);
    expect(waves).toHaveLength(4);
    stepRain([], waves, 2, { width: 800, pointer: null });
    expect(waves).toHaveLength(0);
  });

  it('场景只在拿到颜色、攒够一帧后才画，dispose 撤掉指针监听', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }) };
    const scene = createRainScene(canvas);
    scene.resize(800, 400);
    const { ctx, calls } = recordingContext();

    scene.frame(ctx, 0.1);
    expect(calls.fillText).toBe(0);
    scene.read((token) => (token === '--we-atmosphere-shade' ? COLORS.system : COLORS.accent));
    scene.frame(ctx, 0.01);
    expect(calls.fillText).toBe(0);
    scene.frame(ctx, 0.03);
    expect(calls.fillText).toBeGreaterThan(0);

    const listeners = add.mock.calls.filter(([type]) => type.startsWith('pointer')).map(([type, fn]) => [type, fn]);
    expect(listeners.map(([type]) => type).sort()).toEqual(['pointerdown', 'pointermove']);
    scene.dispose();
    for (const [type, fn] of listeners) expect(remove).toHaveBeenCalledWith(type, fn);
  });
});
