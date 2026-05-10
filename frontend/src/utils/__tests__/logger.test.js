import { describe, it, expect, vi, beforeEach } from 'vitest';
import { log, __resetLoggerForTest } from '../logger.js';

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
