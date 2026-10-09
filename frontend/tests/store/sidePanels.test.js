import { afterEach, describe, expect, it, vi } from 'vitest';

// 默认态在模块加载时按视口算一次，所以每个用例重新加载模块
function stubViewport(wide) {
  const listeners = [];
  const query = {
    matches: wide,
    addEventListener: (type, listener) => listeners.push(listener),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return (nextWide) => {
    query.matches = nextWide;
    for (const listener of listeners) listener({ matches: nextWide });
  };
}

async function loadStore() {
  vi.resetModules();
  return (await import('../../src/core/state/sidePanels.js')).default;
}

describe('两侧抽屉的默认开合', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('宽屏三栏常驻：两侧默认展开', async () => {
    stubViewport(true);
    const store = await loadStore();
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1181px)');
    expect(store.getState()).toMatchObject({ leftOpen: true, rightOpen: true });
  });

  it('窄屏两侧盖在正文上：默认收起', async () => {
    stubViewport(false);
    const store = await loadStore();
    expect(store.getState()).toMatchObject({ leftOpen: false, rightOpen: false });
  });

  it('手动收起后保留；窗口跨过断点时回到该宽度的默认态', async () => {
    const resize = stubViewport(true);
    const store = await loadStore();

    store.getState().toggleLeft();
    expect(store.getState()).toMatchObject({ leftOpen: false, rightOpen: true });

    resize(false);
    expect(store.getState()).toMatchObject({ leftOpen: false, rightOpen: false });
    resize(true);
    expect(store.getState()).toMatchObject({ leftOpen: true, rightOpen: true });
  });
});
