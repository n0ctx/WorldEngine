import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMessages, createWritingSession, generate, listActiveCharacters } from '../../src/api/writing-sessions.js';

function createSseResponse(events) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  }));
}

describe('writing api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('CRUD 接口会返回 JSON 数据', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'writing-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: 'char-1' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await expect(createWritingSession('world-1')).resolves.toEqual({ id: 'writing-1' });
    await expect(listActiveCharacters('world-1', 'writing-1')).resolves.toEqual([{ id: 'char-1' }]);
    await expect(clearMessages('world-1', 'writing-1')).resolves.toEqual({ success: true });
  });

  it('generate 会解析 SSE 事件并在 AbortError 时触发 onStreamEnd', async () => {
    fetch.mockResolvedValue(createSseResponse([
      { delta: '旁' },
      { delta: '白' },
      { done: true, assistant: { id: 'asst-1', content: '旁白' }, options: ['下一句'] },
    ]));

    const calls = [];
    await new Promise((resolve) => {
      generate('world-2', 'session-2', '开始', {
        onDelta: (delta) => calls.push(['delta', delta]),
        onDone: (assistant, options) => calls.push(['done', assistant.content, options[0]]),
        onStreamEnd: resolve,
      });
    });

    expect(calls).toEqual([
      ['delta', '旁'],
      ['delta', '白'],
      ['done', '旁白', '下一句'],
    ]);
  });
});
