import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => mocks.useReducedMotion(),
}));

import { useMotion } from '../../src/hooks/useMotion.js';

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
});
