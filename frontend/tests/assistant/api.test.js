import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamAgent, resumeTask, approveTask } from '../../../assistant/client/api.js';

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

function createOpenSseResponse(events) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
    },
  }));
}

describe('assistant client api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('streamAgent 会逐帧解析 SSE 事件并按序回调', async () => {
    fetch.mockResolvedValue(createSseResponse([
      { type: 'routing', taskId: 'task-1', target: 'world-card', task: '改世界卡' },
      { type: 'delta', delta: '已' },
      { type: 'delta', delta: '完成' },
      { type: 'proposal', taskId: 'task-1', token: 'token-1', proposal: { type: 'world-card' } },
      { type: 'done' },
    ]));

    const events = [];
    await streamAgent({
      message: 'hi',
      onEvent: (evt) => events.push(evt),
    });

    expect(events.map((e) => e.type)).toEqual(['routing', 'delta', 'delta', 'proposal', 'done']);
    expect(events[0].taskId).toBe('task-1');
    expect(events[1].delta).toBe('已');
    expect(events[3].token).toBe('token-1');
  });

  it('resumeTask 会以静默恢复模式请求同一条 SSE 链路', async () => {
    fetch.mockResolvedValue(createSseResponse([
      { type: 'delta', delta: '继续中' },
      { done: true },
    ]));

    const events = [];
    await resumeTask({
      taskId: 'task-1',
      onEvent: (evt) => events.push(evt),
    });

    expect(fetch).toHaveBeenCalledWith('/api/assistant/agent', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1', resume: true }),
      signal: undefined,
    }));
    expect(events.map((e) => e.type ?? (e.done ? 'done' : 'unknown'))).toEqual(['delta', 'done']);
  });

  it('streamAgent 收到 done:true 后不等待网络 EOF', async () => {
    fetch.mockResolvedValue(createOpenSseResponse([
      { type: 'delta', delta: '完成' },
      { done: true },
    ]));

    const events = [];
    await expect(streamAgent({
      message: 'hi',
      onEvent: (evt) => events.push(evt),
    })).resolves.toBeUndefined();

    expect(events.map((e) => e.type ?? (e.done ? 'done' : 'unknown'))).toEqual(['delta', 'done']);
  });

  it('approveTask 会向后端发送 POST 请求', async () => {
    fetch.mockResolvedValue({ ok: true });
    await approveTask('task-1');
    expect(fetch).toHaveBeenCalledWith('/api/assistant/agent/task-1/approve', { method: 'POST' });
  });

  it('approveTask 在后端拒绝时抛错，供前端回滚状态', async () => {
    fetch.mockResolvedValue({ ok: false, status: 400 });
    await expect(approveTask('task-1')).rejects.toThrow('approve failed: 400');
  });
});
