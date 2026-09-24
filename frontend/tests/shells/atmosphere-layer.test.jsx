import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => mocks.useReducedMotion(),
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

  it('卸载时停掉动画循环', () => {
    const { unmount } = render(<AtmosphereLayer />);
    unmount();
    expect(caf).toHaveBeenCalledWith(1);
  });
});
