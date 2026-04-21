import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatAssistant, executeProposal } from '../../../assistant/client/api.js';

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

describe('assistant client api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('chatAssistant 会解析 delta/routing/proposal/done', async () => {
    fetch.mockResolvedValue(createSseResponse([
      { type: 'routing', taskId: 'task-1', target: 'world-card', task: '改世界卡' },
      { delta: '已' },
      { delta: '完成' },
      { type: 'proposal', taskId: 'task-1', token: 'token-1', proposal: { type: 'world-card' } },
      { done: true },
    ]));

    const calls = [];
    await new Promise((resolve) => {
      chatAssistant({ message: 'hi' }, {
        onRouting: (evt) => calls.push(['routing', evt.taskId]),
        onDelta: (delta) => calls.push(['delta', delta]),
        onProposal: (taskId, token) => calls.push(['proposal', taskId, token]),
        onDone: () => calls.push(['done']),
        onStreamEnd: resolve,
      });
    });

    expect(calls).toEqual([
      ['routing', 'task-1'],
      ['delta', '已'],
      ['delta', '完成'],
      ['proposal', 'task-1', 'token-1'],
      ['done'],
    ]);
  });

  it('executeProposal 会在错误时抛出后端 error', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '提案已过期' }),
    });
    await expect(executeProposal('bad-token')).rejects.toThrow('提案已过期');
  });
});
