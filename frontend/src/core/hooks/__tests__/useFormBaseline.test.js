import { describe, it, expect } from 'vitest';
import { keepEdited } from '../useFormBaseline.js';

describe('keepEdited', () => {
  it('首次加载（没有基准）一律取新值', () => {
    expect(keepEdited(null, 'name', { name: '新' })('')).toBe('新');
  });

  it('当前值与基准相同（没改过）时换成新值，改过时保留当前输入', () => {
    const base = { name: '旧' };
    expect(keepEdited(base, 'name', { name: '新' })('旧')).toBe('新');
    expect(keepEdited(base, 'name', { name: '新' })('正在输入')).toBe('正在输入');
  });
});
