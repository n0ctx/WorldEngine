import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/api/sessions.js', () => ({
  editMessage: vi.fn(async (messageId, content) => ({ id: `${messageId}-edited`, content })),
}));

import {
  continueGeneration,
  editAssistantMessage,
  impersonate,
  regenerate,
  retitle,
  sendMessage,
  stopGeneration,
} from '../../src/core/api/chat.js';

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

  it('sendMessage 会分发 postprocess_failed 事件', async () => {
    const calls = [];
    fetch.mockResolvedValue(createSseResponse([
      { done: true, assistant: { id: 'msg-asst', content: '你好' }, options: [] },
      { type: 'postprocess_failed', label: 'title', error: 'timeout', timeout: true },
    ]));

    await new Promise((resolve) => {
      sendMessage('session-1', '嗨', [], {
        onDone: () => calls.push(['done']),
        onPostprocessFailed: (evt) => calls.push(['postprocess_failed', evt.label, evt.timeout]),
        onStreamEnd: resolve,
      });
    });

    expect(calls).toEqual([
      ['done'],
      ['postprocess_failed', 'title', true],
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

    await expect(retitle('session-2')).rejects.toThrow('retitle failed');
  });

  it('editAssistantMessage 成功时返回响应 JSON，失败时优先抛 body.error', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await expect(editAssistantMessage('s1', 'm1', '新内容')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/edit-assistant', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ messageId: 'm1', content: '新内容' }),
    }));

    fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: '编辑失败' }) });
    await expect(editAssistantMessage('s1', 'm1', 'x')).rejects.toThrow('编辑失败');

    fetch.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error('boom'); } });
    await expect(editAssistantMessage('s1', 'm1', 'x')).rejects.toThrow('HTTP 502');
  });

  it('retitle 在 body 解析失败时回退到 HTTP 状态码', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => { throw new Error('parse'); } });
    await expect(retitle('s9')).rejects.toThrow('HTTP 503');
  });

  it('impersonate 成功时返回 content', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ content: '替你说' }) });
    await expect(impersonate('s1')).resolves.toEqual({ content: '替你说' });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/impersonate', expect.objectContaining({ method: 'POST' }));
  });

  it('impersonate 失败时优先 body.error，否则 HTTP 状态', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: '代入失败' }) });
    await expect(impersonate('s1')).rejects.toThrow('代入失败');

    fetch.mockResolvedValueOnce({ ok: false, status: 504, json: async () => { throw new Error('p'); } });
    await expect(impersonate('s1')).rejects.toThrow('HTTP 504');
  });

  it('stopGeneration 调用 stop endpoint', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    await stopGeneration('s1');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/stop', { method: 'POST' });
  });

  it('regenerate 在 HTTP 错误时回调 onError', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: '重新生成失败' }) });
    await new Promise((resolve) => {
      regenerate('s1', 'm1', {
        onError: (msg) => {
          expect(msg).toBe('重新生成失败');
          resolve();
        },
        onStreamEnd: () => {},
      });
    });
  });
});
