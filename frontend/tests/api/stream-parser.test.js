import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));

vi.mock('../../src/core/utils/logger.js', () => ({
  log: {
    warn: (...args) => mocks.logWarn(...args),
  },
}));

import { parseSSEStream } from '../../src/core/api/stream-parser.js';

describe('parseSSEStream', () => {
  it('遇到 malformed event 时记录日志并继续处理后续事件', async () => {
    const onDone = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"broken"\n'));
        controller.enqueue(new TextEncoder().encode('data: {"done":true,"assistant":{"id":"asst-1"}}\n'));
        controller.close();
      },
    }));

    await parseSSEStream(response, { onDone });

    expect(mocks.logWarn).toHaveBeenCalledWith(
      'sse.malformed_event',
      expect.objectContaining({ preview: '{"broken"' }),
    );
    expect(onDone).toHaveBeenCalledWith({ id: 'asst-1' }, [], null);
  });
});
