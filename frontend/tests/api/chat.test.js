import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/api/sessions.js', () => ({
  editMessage: vi.fn(async (messageId, content) => ({ id: `${messageId}-edited`, content })),
}));

import { clearMessages, continueGeneration, retitle, sendMessage } from '../../src/api/chat.js';

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

describe('chat api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('sendMessage 会解析 SSE 事件并在结束后触发 onStreamEnd', async () => {
    const calls = [];
    fetch.mockResolvedValue(createSseResponse([
      { type: 'user_saved', id: 'msg-user' },
      { type: 'memory_recall_start' },
      { delta: '你' },
      { delta: '好' },
      { type: 'memory_recall_done', recalled: 1 },
      { done: true, assistant: { id: 'msg-asst', content: '你好' }, options: ['继续'] },
    ]));

    await new Promise((resolve) => {
      sendMessage('session-1', '嗨', [], {
        onUserSaved: (id) => calls.push(['user_saved', id]),
        onMemoryRecallStart: () => calls.push(['memory_recall_start']),
        onMemoryRecallDone: (evt) => calls.push(['memory_recall_done', evt.recalled]),
        onDelta: (delta) => calls.push(['delta', delta]),
        onDone: (assistant, options) => calls.push(['done', assistant.content, options[0]]),
        onStreamEnd: resolve,
      });
    });

    expect(calls).toEqual([
      ['user_saved', 'msg-user'],
      ['memory_recall_start'],
      ['delta', '你'],
      ['delta', '好'],
      ['memory_recall_done', 1],
      ['done', '你好', '继续'],
    ]);
  });

  it('continueGeneration 与普通 JSON 接口会在 HTTP 错误时抛出或回调错误', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'continue failed' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'clear failed' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'retitle failed' }),
      });

    await new Promise((resolve) => {
      continueGeneration('session-2', {
        onError: (msg) => {
          expect(msg).toBe('continue failed');
          resolve();
        },
        onStreamEnd: () => {},
      });
    });

    await expect(clearMessages('session-2')).rejects.toThrow('clear failed');
    await expect(retitle('session-2')).rejects.toThrow('retitle failed');
  });
});
