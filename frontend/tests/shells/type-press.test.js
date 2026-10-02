import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPressScene, drawPress, poolsFrom, stepPress } from '../../src/shells/book-spread/atmosphere/typePress.js';

const colors = { foil: { r: 217, g: 181, b: 106 }, shade: { r: 20, g: 12, b: 6 }, seal: { r: 162, g: 59, b: 46 } };

/** 一行竖排的三个字，第二、三个字比第一个晚 0.08、0.16 秒落下 */
function lineAt(t) {
  const units = ['林', '青', '雨'].map((ch, i) => ({ ch, dx: 0, dy: (i - 1) * 36, w: 32, h: 36, delay: i * 0.08, rot: 0 }));
  return { kind: 'line', text: '林青雨', font: '600 32px serif', x: 40, y: 300, w: 35, h: 108, size: 32, fall: 0.5, life: 10, t, units };
}

function stateWith(marks) {
  return { rand: () => 0.5, width: 1200, height: 800, marks, dust: [], colors };
}

function mockCtx() {
  return {
    getTransform: () => ({ a: 2 }),
    measureText: (text) => ({ width: text.length * 16 }),
    clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
  };
}

const textsDrawn = (ctx) => new Set(ctx.fillText.mock.calls.map(([text]) => text));

describe('素压', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('一行里的字依次落下，每个字落到桌面的那一帧各挤出一点尘；整行淡出完就收走', () => {
    const state = stateWith([lineAt(0.49), lineAt(0.5 + 0.16 + 10 + 3 - 0.01)]);
    stepPress(state, 0.02);
    expect(state.dust).toHaveLength(3);
    expect(state.marks).toHaveLength(1);
    stepPress(state, 0.08);
    expect(state.dust).toHaveLength(6);
  });

  it('还在空中的字只画影子，落下的字画成凹痕', () => {
    const ctx = mockCtx();
    drawPress(ctx, stateWith([lineAt(0.55)]), {});
    expect(textsDrawn(ctx)).toEqual(new Set(['林']));
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('汉字名竖排、逐字压下；西文名整行转 90° 压下', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const read = (scene, names) => scene.read((token) => ({
      '--we-atmosphere-color': colors.foil, '--we-atmosphere-shade': colors.shade, '--we-color-accent': colors.seal,
    })[token], () => 'serif', names);

    const han = createPressScene(null, () => 0.6);
    han.resize(1200, 800);
    read(han, ['林青雨']);
    const hanCtx = mockCtx();
    for (let i = 0; i < 40; i++) han.frame(hanCtx, 0.05);
    expect(textsDrawn(hanCtx)).toEqual(new Set(['林', '青', '雨']));

    const latin = createPressScene(null, () => 0.6);
    latin.resize(1200, 800);
    read(latin, ['Alice Grey']);
    const latinCtx = mockCtx();
    for (let i = 0; i < 40; i++) latin.frame(latinCtx, 0.05);
    expect(textsDrawn(latinCtx)).toEqual(new Set(['Alice Grey']));
    expect(latinCtx.rotate).toHaveBeenCalledWith(Math.PI / 2);
  });

  it('名字去掉空白，竖排最长 8 个字、西文最长 24 个字符，没有字母和汉字的不取；纯汉字名刻成印，三个字的补「印」', () => {
    const { lines, seals } = poolsFrom([' 雾都 ', 'Alice Grey', '林青雨', '42', '一二三四五六七八九', 'Bartholomew Montgomery Fitzgerald']);
    expect(lines).toEqual(['雾都', 'Alice Grey', '林青雨', '一二三四五六七八', 'Bartholomew Montgomery']);
    expect(seals).toEqual(['雾都', '林青雨印']);
  });

  it('一个名字都没有时用默认词和默认印文', () => {
    const { lines, seals } = poolsFrom(['…']);
    expect(lines).toContain('世界引擎');
    expect(seals).toContain('世界之印');
  });
});
