import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
  publishProviderSafetySignal: vi.fn(),
}));

vi.mock('../../src/core/api/provider-safety-events.js', () => ({
  publishProviderSafetySignal: (...args) => mocks.publishProviderSafetySignal(...args),
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

/** 把若干事件对象喂进 parseSSEStream，返回被调用的回调记录 */
async function dispatch(events, callbackNames) {
  const calls = [];
  const callbacks = {};
  for (const name of callbackNames) {
    callbacks[name] = (...args) => calls.push([name, ...args]);
  }
  const response = new Response(new ReadableStream({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(evt)}\n`));
      }
      controller.close();
    },
  }));
  await parseSSEStream(response, callbacks);
  return calls;
}

describe('parseSSEStream 的事件分发表', () => {
  const ALL_CALLBACKS = [
    'onDelta', 'onDone', 'onAborted', 'onError', 'onTitleUpdated', 'onUserSaved',
    'onMemoryRecallStart', 'onMemoryRecallDone', 'onMemoryExpandStart', 'onMemoryExpandDone',
    'onSavedRecallDone', 'onChapterTitleUpdated', 'onStateQueued', 'onStateUpdated',
    'onStateUpdateFailed', 'onPostprocessFailed', 'onDiaryUpdated',
    'onSuggestionFallbackStarted', 'onSuggestionFallbackSucceeded', 'onSuggestionFallbackFailed',
    'onStateRolledBack', 'onEntriesActivated', 'onDanmaku', 'onStreamSnapshot',
    'onProviderSafetySignal', 'onEvent',
  ];

  it.each([
    [{ delta: '片段' }, ['onDelta', '片段']],
    [{ type: 'error', error: '炸了' }, ['onError', '炸了']],
    [{ type: 'title_updated', title: '新标题' }, ['onTitleUpdated', '新标题']],
    [{ type: 'user_saved', id: 'msg-1' }, ['onUserSaved', 'msg-1']],
    [{ type: 'memory_recall_start' }, ['onMemoryRecallStart']],
    [{ type: 'state_queued' }, ['onStateQueued']],
    [{ type: 'state_updated' }, ['onStateUpdated']],
    [{ type: 'diary_updated' }, ['onDiaryUpdated']],
    [{ type: 'state_rolled_back' }, ['onStateRolledBack']],
  ])('%j 分发到对应回调', async (evt, expected) => {
    expect(await dispatch([evt], ALL_CALLBACKS)).toEqual([expected]);
  });

  it('done / aborted 携带默认值', async () => {
    expect(await dispatch([{ done: true }], ALL_CALLBACKS)).toEqual([['onDone', null, [], null]]);
    expect(await dispatch([{ aborted: true }], ALL_CALLBACKS)).toEqual([['onAborted', null]]);

    const usage = { total: 1 };
    expect(await dispatch(
      [{ done: true, assistant: { id: 'a' }, options: ['x'], usage }],
      ALL_CALLBACKS,
    )).toEqual([['onDone', { id: 'a' }, ['x'], usage]]);
  });

  it('整个事件对象原样透传的回调', async () => {
    const events = [
      { type: 'memory_recall_done', hit: 2 },
      { type: 'memory_expand_start', candidates: [] },
      { type: 'memory_expand_done', expanded: ['t1'] },
      { type: 'saved_recall_done', hit: 1, ids: ['n1'], mode: 'judge' },
      { type: 'state_update_failed', error: 'e' },
      { type: 'postprocess_failed', label: 'title' },
      { type: 'suggestion_fallback_started', mode: 'fallback' },
      { type: 'suggestion_fallback_succeeded', mode: 'fallback' },
      { type: 'suggestion_fallback_failed', mode: 'fallback', reason: 'r' },
    ];
    const calls = await dispatch(events, ALL_CALLBACKS);
    expect(calls).toEqual([
      ['onMemoryRecallDone', events[0]],
      ['onMemoryExpandStart', events[1]],
      ['onMemoryExpandDone', events[2]],
      ['onSavedRecallDone', events[3]],
      ['onStateUpdateFailed', events[4]],
      ['onPostprocessFailed', events[5]],
      ['onSuggestionFallbackStarted', events[6]],
      ['onSuggestionFallbackSucceeded', events[7]],
      ['onSuggestionFallbackFailed', events[8]],
    ]);
  });

  it('chapter_title_updated 拆成两个位置参数', async () => {
    expect(await dispatch(
      [{ type: 'chapter_title_updated', chapterIndex: 3, title: '第三章' }],
      ALL_CALLBACKS,
    )).toEqual([['onChapterTitleUpdated', 3, '第三章']]);
  });

  it('列表型事件缺字段时回落空数组，stream_snapshot 回落 null', async () => {
    expect(await dispatch([{ type: 'entries_activated' }], ALL_CALLBACKS)).toEqual([['onEntriesActivated', []]]);
    expect(await dispatch([{ type: 'danmaku' }], ALL_CALLBACKS)).toEqual([['onDanmaku', []]]);
    expect(await dispatch([{ type: 'stream_snapshot' }], ALL_CALLBACKS)).toEqual([['onStreamSnapshot', null]]);
  });

  it('provider_safety_signal 同时发布到总线并回调', async () => {
    mocks.publishProviderSafetySignal.mockClear();
    const signal = { kind: 'blocked' };
    const calls = await dispatch([{ type: 'provider_safety_signal', signal }], ALL_CALLBACKS);
    expect(calls).toEqual([['onProviderSafetySignal', signal]]);
    expect(mocks.publishProviderSafetySignal).toHaveBeenCalledWith(signal);
  });

  it('未知事件类型回落到 onEvent', async () => {
    const evt = { type: '未来才有的事件' };
    expect(await dispatch([evt], ALL_CALLBACKS)).toEqual([['onEvent', evt]]);
  });

  it('delta 优先于 done：同时带两者时只当作 delta', async () => {
    expect(await dispatch([{ delta: '', done: true }], ALL_CALLBACKS)).toEqual([['onDelta', '']]);
  });

  it('未注册的回调不会抛错', async () => {
    await expect(dispatch([{ type: 'danmaku', comments: ['a'] }], [])).resolves.toEqual([]);
  });

  it('残留的不完整缓冲区会被记录', async () => {
    mocks.logWarn.mockClear();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"state_updated"}\ndata: {"half"'));
        controller.close();
      },
    }));
    await parseSSEStream(response, {});
    expect(mocks.logWarn).toHaveBeenCalledWith(
      'sse.trailing_buffer',
      expect.objectContaining({ preview: 'data: {"half"' }),
    );
  });
});
