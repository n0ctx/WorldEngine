import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => mocks.useReducedMotion(),
}));

import { useMotion } from '../../src/core/hooks/useMotion.js';
import { GESTURE, SPRING, variants } from '../../src/core/utils/motion.js';

describe('useMotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('在普通模式下透传参数', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotion());

    expect(result.current.reduced).toBe(false);
    expect(result.current.duration(0.3)).toBe(0.3);
    expect(result.current.ease([1, 2, 3])).toEqual([1, 2, 3]);
    expect(result.current.blur('2px')).toBe('2px');
  });

  it('在 reduced motion 下清零动效', () => {
    mocks.useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotion());

    expect(result.current.reduced).toBe(true);
    expect(result.current.duration(0.3)).toBe(0);
    expect(result.current.ease([1, 2, 3])).toBe('linear');
    expect(result.current.blur('2px')).toBe('0px');
  });

  it('普通模式下返回命名弹簧、手势与入场 variants', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotion());

    expect(result.current.spring('portal')).toBe(SPRING.portal);
    expect(result.current.gesture('press')).toEqual({ ...GESTURE.press, transition: SPRING.press });
    expect(result.current.variant('messageEnter')).toBe(variants.messageEnter);
    // 禁用时去掉手势目标，但保留弹簧，按下后变禁用的按钮仍能回弹
    expect(result.current.gesture('press', { disabled: true })).toEqual({ transition: SPRING.press });
  });

  it('reduced motion 下关闭回弹、手势与位移缩放', () => {
    mocks.useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotion());

    expect(result.current.spring('portal')).toEqual({ duration: 0 });
    expect(result.current.gesture('portal')).toEqual({});
    expect(result.current.gesture('portal', { disabled: true })).toEqual({});
    expect(result.current.variant('sceneEnter')).toEqual({
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    });
  });
});
