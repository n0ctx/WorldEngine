import { describe, it, expect } from 'vitest';
import { extractIds, resolveTopbarPathname, isBookshelfPathname } from '../worldScope.js';

function loc(pathname, backgroundLocation) {
  return {
    pathname,
    state: backgroundLocation ? { backgroundLocation: { pathname: backgroundLocation } } : undefined,
  };
}

describe('resolveTopbarPathname', () => {
  it('全局设置：从世界内页面打开（bg 是世界页面）也不落入世界作用域（缺陷一）', () => {
    const pathname = resolveTopbarPathname(loc('/settings', '/worlds/w1'));
    expect(isBookshelfPathname(pathname)).toBe(true);
  });

  it('全局设置：从书架打开表现一致', () => {
    const pathname = resolveTopbarPathname(loc('/settings', '/'));
    expect(isBookshelfPathname(pathname)).toBe(true);
  });

  it('编辑世界页：唯一入口是书架卡片（bg 恒为 "/"），仍按 URL 里的 :worldId 落进该世界（缺陷二）', () => {
    const pathname = resolveTopbarPathname(loc('/worlds/w1/edit', '/'));
    expect(pathname).toBe('/worlds/w1/edit');
    expect(extractIds(pathname).worldId).toBe('w1');
    expect(isBookshelfPathname(pathname)).toBe(false);
  });

  it('编辑角色页：从世界内角色列表打开，bg 已带 worldId，按 bg 落进该世界（同类 overlay，行为合理，不需要改）', () => {
    const pathname = resolveTopbarPathname(loc('/characters/c1/edit', '/worlds/w1'));
    expect(extractIds(pathname).worldId).toBe('w1');
  });

  it('直接刷新 /worlds/new（无 bg）仍落到书架层', () => {
    const pathname = resolveTopbarPathname(loc('/worlds/new'));
    expect(isBookshelfPathname(pathname)).toBe(true);
  });

  it('普通世界内页面原样返回', () => {
    const pathname = resolveTopbarPathname(loc('/worlds/w1/writing'));
    expect(pathname).toBe('/worlds/w1/writing');
  });
});
