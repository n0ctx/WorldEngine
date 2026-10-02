import { describe, expect, it, vi } from 'vitest';
import { drawPress, stepPress } from '../../src/shells/book-spread/atmosphere/typePress.js';

function pieceAt(t) {
  return { kind: 'type', glyph: '印', font: '600 40px serif', x: 100, y: 100, w: 48, h: 46, size: 40, fall: 0.5, life: 4, t, rot: 0, rot0: 0.1, alpha: 1, dust: 12, tier: 'medium' };
}

function stateWith(pieces, motes = []) {
  return { rand: () => 0.5, width: 400, height: 300, time: 1, pieces, motes, dust: [], colors: null };
}

function mockCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    getTransform: () => ({ a: 2 }),
    createLinearGradient: () => gradient,
    clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
    beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    fillText: vi.fn(), drawImage: vi.fn(),
  };
}

describe('印台', () => {
  it('块落到桌面的那一帧从四边挤出尘，并把附近的浮尘冲开', () => {
    const mote = { x: 130, y: 100, vx: 0, vy: 0, drift: 0, phase: 0 };
    const state = stateWith([pieceAt(0.49)], [mote]);
    stepPress(state, 0.02);
    expect(state.dust).toHaveLength(12);
    expect(mote.vx).toBeGreaterThan(0);
  });

  it('印淡出完就收走', () => {
    const state = stateWith([pieceAt(0.6 + 4 + 1.8 - 0.01)]);
    stepPress(state, 0.02);
    expect(state.pieces).toHaveLength(0);
  });

  it('块还压着时只画块，抬走后画出印', () => {
    const colors = { foil: { r: 217, g: 181, b: 106 }, shade: { r: 20, g: 12, b: 6 }, seal: { r: 162, g: 59, b: 46 } };
    const pressing = { ...stateWith([pieceAt(0.52)]), colors };
    const ctx = mockCtx();
    drawPress(ctx, pressing, {});
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    const lifted = { ...stateWith([pieceAt(1.5)]), colors };
    const after = mockCtx();
    drawPress(after, lifted, {});
    expect(after.fillText).toHaveBeenCalledTimes(3);
  });
});
