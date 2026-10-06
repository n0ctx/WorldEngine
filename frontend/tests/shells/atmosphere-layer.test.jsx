import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useReducedMotion: vi.fn(),
  dustFrame: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => mocks.useReducedMotion(),
}));

vi.mock('../../src/shells/book-spread/atmosphere/lightDust.js', () => ({
  createDustScene: () => ({ resize: vi.fn(), read: vi.fn(), frame: mocks.dustFrame, dispose: vi.fn() }),
}));

import AtmosphereLayer from '../../src/shells/book-spread/atmosphere/AtmosphereLayer.jsx';

function setHidden(hidden) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('AtmosphereLayer', () => {
  let raf;
  let caf;

  beforeEach(() => {
    mocks.useReducedMotion.mockReturnValue(false);
    raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform: vi.fn() });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('系统要求减少动效时不渲染光尘画布，只留静态光晕层', () => {
    mocks.useReducedMotion.mockReturnValue(true);
    const { container } = render(<AtmosphereLayer />);
    expect(container.querySelector('.we-atmosphere')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
    expect(raf).not.toHaveBeenCalled();
  });

  it('页面隐藏时停掉动画循环，重新可见时恢复', () => {
    const { container } = render(<AtmosphereLayer />);
    expect(container.querySelector('canvas.we-atmosphere-canvas')).toBeTruthy();
    expect(raf).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    expect(caf).toHaveBeenCalledWith(1);

    raf.mockClear();
    act(() => setHidden(false));
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('主题选代码雨时第一帧换成代码雨场景（开始跟随指针），卸载时撤掉监听', () => {
    const computed = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = computed(element);
      return { getPropertyValue: (name) => (name === '--we-atmosphere-kind' ? 'rain' : style.getPropertyValue(name)) };
    });
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    HTMLCanvasElement.prototype.getContext.mockReturnValue({ setTransform: vi.fn(), clearRect: vi.fn() });

    const { unmount } = render(<AtmosphereLayer />);
    act(() => raf.mock.calls[0][0](0));
    expect(add).toHaveBeenCalledWith('pointerdown', expect.any(Function), expect.anything());

    unmount();
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });

  it('画布限到约 30 帧：60Hz 下隔一帧画一次，步进用实际间隔', () => {
    mocks.dustFrame.mockClear();
    HTMLCanvasElement.prototype.getContext.mockReturnValue({ setTransform: vi.fn(), clearRect: vi.fn() });
    render(<AtmosphereLayer />);
    const tick = () => raf.mock.calls.at(-1)[0];
    const frameMs = 1000 / 60;
    for (let i = 1; i <= 6; i++) act(() => tick()(i * frameMs));

    expect(mocks.dustFrame).toHaveBeenCalledTimes(3);
    expect(mocks.dustFrame.mock.calls[1][1]).toBeCloseTo((2 * frameMs) / 1000, 5);
  });

  it('卸载时停掉动画循环', () => {
    const { unmount } = render(<AtmosphereLayer />);
    unmount();
    expect(caf).toHaveBeenCalledWith(1);
  });
});
