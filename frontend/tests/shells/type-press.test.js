import { describe, expect, it, vi } from 'vitest';
import { drawPress, poolsFrom, stepPress } from '../../src/shells/book-spread/atmosphere/typePress.js';

const colors = { foil: { r: 217, g: 181, b: 106 }, shade: { r: 20, g: 12, b: 6 }, seal: { r: 162, g: 59, b: 46 } };

function markAt(t) {
  return { kind: 'glyph', glyph: '印', font: '700 300px serif', x: 20, y: 150, w: 300, h: 300, size: 300, fall: 0.9, life: 10, t, rot: 0 };
}

function stateWith(marks) {
  return { rand: () => 0.5, width: 1200, height: 800, marks, dust: [], colors };
}

function mockCtx() {
  return {
    getTransform: () => ({ a: 2 }),
    clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
  };
}

describe('素压', () => {
  it('印落到桌面的那一帧挤出一小撮尘，淡出完就收走', () => {
    const state = stateWith([markAt(0.89), markAt(0.9 + 10 + 3 - 0.01)]);
    stepPress(state, 0.02);
    expect(state.dust).toHaveLength(10);
    expect(state.marks).toHaveLength(1);
  });

  it('下落中只画影子不画字，落定后画出凹痕', () => {
    const falling = mockCtx();
    drawPress(falling, stateWith([markAt(0.5)]), {});
    expect(falling.fill).toHaveBeenCalledTimes(1);
    expect(falling.fillText).not.toHaveBeenCalled();
    const landed = mockCtx();
    drawPress(landed, stateWith([markAt(3)]), {});
    expect(landed.fillText).toHaveBeenCalledTimes(4);
  });

  it('从名字里挑字：汉字逐字取、西文取词首大写、标点和数字不取；纯汉字名刻成印，三个字的补「印」', () => {
    const { glyphs, seals } = poolsFrom(['雾都', 'Alice Grey', '林青雨', '7号·K']);
    expect(new Set(glyphs)).toEqual(new Set(['雾', '都', '林', '青', '雨', '号', 'A', 'G', 'K']));
    expect(seals).toEqual(['雾都', '林青雨印']);
  });

  it('挑不出字时用默认字和默认印文', () => {
    const { glyphs, seals } = poolsFrom(['42', '…']);
    expect(glyphs.length).toBeGreaterThan(10);
    expect(seals).toContain('世界之印');
  });
});
