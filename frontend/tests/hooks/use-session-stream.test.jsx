import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSessionStream } from '../../src/core/hooks/useSessionStream.js';

function setup() {
  const streams = [];
  const api = {
    send: vi.fn((sessionId, content, attachments, callbacks) => {
      streams.push(callbacks);
      return vi.fn();
    }),
    regenerate: vi.fn(() => vi.fn()),
    stop: vi.fn(),
  };
  const messages = [
    { id: 'u1', role: 'user', content: '你好' },
    { id: 'a1', role: 'assistant', content: '你好呀' },
  ];
  const messageListRef = {
    current: {
      messagesRef: { current: messages },
      appendMessage: (message) => messages.push(message),
      updateMessages: vi.fn(),
    },
  };
  const memory = {
    setRecallSummary: vi.fn(),
    startMemoryRecalling: vi.fn(),
    stopMemoryRecalling: vi.fn(),
    startMemoryWriting: vi.fn(),
    stopMemoryWriting: vi.fn(),
    cancelMemoryWriting: vi.fn(),
    clearMemoryState: vi.fn(),
  };
  const hook = renderHook(() => useSessionStream({
    mode: 'chat',
    api,
    sessionListBridge: {},
    messageListRef,
    inputBoxRef: { current: null },
    memory,
  }));
  act(() => hook.result.current.enterSession({ id: 's1' }));
  return { ...hook, api, streams };
}

describe('useSessionStream', () => {
  it('生成中拿到的重新生成回调，在停止后仍能发起重新生成', async () => {
    const { result, api, streams } = setup();

    await act(() => result.current.handleSend('继续', []));
    expect(result.current.generating).toBe(true);
    const regenerateFromGeneratingRender = result.current.handleRegenerateMessage;

    act(() => {
      streams[0].onAborted(null);
      streams[0].onStreamEnd();
    });
    expect(result.current.generating).toBe(false);

    act(() => regenerateFromGeneratingRender('a1'));
    expect(api.regenerate).toHaveBeenCalledWith('s1', 'u1', expect.any(Object));
    expect(result.current.generating).toBe(true);
  });
});
