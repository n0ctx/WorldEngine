import { describe, it, expect, vi, beforeEach } from 'vitest';

// Node 25 ships an experimental empty `localStorage`/`sessionStorage` global that
// shadows jsdom's. Replace with a minimal in-memory Storage stub before logger loads.
function makeStorageStub() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}
globalThis.localStorage = makeStorageStub();
globalThis.sessionStorage = makeStorageStub();

const { log, __resetLoggerForTest } = await import('../logger.js');

describe('frontend logger — 基础 API', () => {
  beforeEach(() => { __resetLoggerForTest(); });

  it('log.error 默认派发 we:toast 事件（type=error）', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.error('api.fetch.failed', new Error('boom'), { toast: true });
    expect(handler).toHaveBeenCalled();
    const evt = handler.mock.calls[0][0];
    expect(evt.detail.type).toBe('error');
    expect(evt.detail.message).toBe('boom');
    window.removeEventListener('we:toast', handler);
  });

  it('opts.silent=true 不派发 toast', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.error('a.b', new Error('x'), { silent: true });
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('we:toast', handler);
  });

  it('log.info 默认不派发 toast', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.info('a.b', { foo: 1 });
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('we:toast', handler);
  });

  it('log.warn 自定义 toast 字符串', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.warn('api.retry', { attempt: 2 }, { toast: '重试中' });
    expect(handler.mock.calls[0][0].detail.message).toBe('重试中');
    expect(handler.mock.calls[0][0].detail.type).toBe('warning');
    window.removeEventListener('we:toast', handler);
  });

  it('1500ms 内同 message 去重', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.error('a.b', new Error('boom'), { toast: 'same' });
    log.error('a.b', new Error('boom'), { toast: 'same' });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('we:toast', handler);
  });
});

describe('frontend logger — 上报缓冲', () => {
  beforeEach(() => {
    __resetLoggerForTest();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: 1, dropped: 0 }) });
    localStorage.removeItem('we:log:retry');
  });

  it('error 入队后立即触发 flush', async () => {
    log.error('a.b', new Error('x'), { silent: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/client-logs',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('达到 20 条 warn 触发 flush', async () => {
    for (let i = 0; i < 19; i += 1) log.warn(`evt.${i}`, { i }, { silent: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    log.warn('evt.20', { i: 20 }, { silent: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('fetch 失败时写入 localStorage 重试队列', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    log.error('a.b', new Error('x'), { silent: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const stored = JSON.parse(localStorage.getItem('we:log:retry') || '[]');
    expect(stored.length).toBeGreaterThan(0);
  });
});
