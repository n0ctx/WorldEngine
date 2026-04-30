import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createWritingSession,
  editAndRegenerateWriting,
  generate,
  listActiveCharacters,
} from '../../src/api/writing-sessions.js';

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
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: 'char-1' }]) });

    await expect(createWritingSession('world-1')).resolves.toEqual({ id: 'writing-1' });
    await expect(listActiveCharacters('world-1', 'writing-1')).resolves.toEqual([{ id: 'char-1' }]);
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

  it('generate 在 HTTP 错误时只触发 onError，不触发 onStreamEnd', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: '爆炸了' }),
    });

    const calls = [];
    generate('world-3', 'session-3', '失败', {
      onError: (error) => calls.push(['error', error]),
      onStreamEnd: () => calls.push(['end']),
    });

    await vi.waitFor(() => {
      expect(calls).toEqual([['error', '爆炸了']]);
    });
  });

  it('editAndRegenerateWriting 会先编辑消息，再解析 regenerate SSE 并收尾', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg-2' }),
      })
      .mockResolvedValueOnce(createSseResponse([
        { delta: '续' },
        { done: true, assistant: { id: 'asst-2', content: '续写完成' }, options: [] },
      ]));

    const calls = [];
    await new Promise((resolve) => {
      editAndRegenerateWriting('world-9', 'session-9', 'msg-1', '新内容', {
        onDelta: (delta) => calls.push(['delta', delta]),
        onDone: (assistant) => calls.push(['done', assistant.content]),
        onStreamEnd: () => {
          calls.push(['end']);
          resolve();
        },
      });
    });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/messages/msg-1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ content: '新内容' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/world-9/writing-sessions/session-9/regenerate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ afterMessageId: 'msg-2' }),
    }));
    expect(calls).toEqual([
      ['delta', '续'],
      ['done', '续写完成'],
      ['end'],
    ]);
  });

  it('editAndRegenerateWriting 在编辑失败时触发 onError', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const calls = [];
    editAndRegenerateWriting('world-4', 'session-4', 'msg-x', '内容', {
      onError: (error) => calls.push(['error', error]),
      onStreamEnd: () => calls.push(['end']),
    });

    await vi.waitFor(() => {
      expect(calls).toEqual([['error', 'editMessage failed: 500']]);
    });
  });
});
