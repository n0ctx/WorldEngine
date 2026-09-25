import { describe, expect, it, vi } from 'vitest';

import { createSessionStreamCallbacks } from '../../src/core/hooks/sessionStreamCallbacks.js';

function createHarness() {
  const currentRunId = { current: 1 };
  const sessionIdRef = { current: 'session-1' };
  const currentOptions = { current: [] };
  const appendedMessages = [];
  const messageListRef = {
    current: {
      appendMessage: vi.fn((message) => appendedMessages.push(message)),
      updateMessages: vi.fn(),
    },
  };
  const memory = {
    setRecallSummary: vi.fn(),
    startMemoryRecalling: vi.fn(),
    stopMemoryRecalling: vi.fn(),
    startMemoryExpanding: vi.fn(),
    stopMemoryExpanding: vi.fn(),
    startMemoryWriting: vi.fn(),
    stopMemoryWriting: vi.fn(),
    cancelMemoryWriting: vi.fn(),
  };
  const state = {
    identity: {
      continuationTokenRef: { current: 0 },
      isCurrentStreamRun: (runId) => currentRunId.current === runId,
      sessionIdRef,
    },
    text: {
      continuingTextRef: { current: '' },
      continuingMessageIdRef: { current: null },
      setContinuingText: vi.fn(),
      streamingTextRef: { current: '' },
      setStreamingText: vi.fn(),
    },
    options: {
      pendingOptionsRef: { current: [] },
      streamingOptionsRef: { current: [] },
      setCurrentOptions: vi.fn((value) => {
        currentOptions.current = typeof value === 'function' ? value(currentOptions.current) : value;
      }),
    },
    messages: {
      tempUserIdRef: { current: 'temp-user' },
      pendingAssistantRef: { current: null },
      assistantAppendedEarlyRef: { current: false },
      messageListRef,
      streamingKey: 'stream-key',
    },
    entries: { pendingEntriesRef: { current: [] } },
    memory,
    session: {
      sessionListBridge: { updateTitle: vi.fn() },
      setCurrentSession: vi.fn(),
    },
    setDanmakuBand: vi.fn(),
    setErrorBubble: vi.fn(),
    setGenerating: vi.fn(),
    stopRef: { current: null },
    signalState: vi.fn(),
  };
  const finalizeStream = vi.fn();
  const callbacks = (runId = 1, continuationToken = null) => createSessionStreamCallbacks({
    runId,
    sessionIdHint: 'session-1',
    continuationToken,
    ...state,
    extraCallbacks: { onChapterTitleUpdated: vi.fn(), onSavedRecallDone: vi.fn() },
    mode: 'chat',
    finalizeStream,
  });
  return { callbacks, currentRunId, state, memory, appendedMessages, finalizeStream };
}

describe('session stream callbacks', () => {
  it('keeps live message keys and activated entries while completing a stream', () => {
    const harness = createHarness();
    const callbacks = harness.callbacks();
    callbacks.onEntriesActivated([{ id: 'entry-1' }]);
    callbacks.onUserSaved('user-1');

    const updateMessages = harness.state.messages.messageListRef.current.updateMessages;
    expect(updateMessages).toHaveBeenCalledTimes(1);
    expect(updateMessages.mock.calls[0][0]([{ id: 'temp-user' }])).toEqual([
      { id: 'user-1', _key: 'temp-user' },
    ]);

    callbacks.onDone({ id: 'assistant-1', content: '答复' }, ['继续']);
    callbacks.onStreamEnd();

    expect(harness.appendedMessages).toEqual([{
      id: 'assistant-1',
      content: '答复',
      activated_entries: [{ id: 'entry-1' }],
      _key: 'stream-key',
    }]);
    expect(harness.state.options.pendingOptionsRef.current).toEqual(['继续']);
    expect(harness.memory.startMemoryWriting).toHaveBeenCalledWith(1);
    expect(harness.finalizeStream).toHaveBeenCalledWith(1);
  });

  it('isolates old stream output while accepting same-session state updates', () => {
    const harness = createHarness();
    const callbacks = harness.callbacks();
    harness.currentRunId.current = 2;

    callbacks.onDelta('迟到的文本');
    callbacks.onStreamEnd();
    callbacks.onStateUpdated();

    expect(harness.state.text.setStreamingText).not.toHaveBeenCalled();
    expect(harness.finalizeStream).not.toHaveBeenCalled();
    expect(harness.memory.stopMemoryWriting).toHaveBeenCalledWith(1);
    expect(harness.state.signalState).toHaveBeenCalledWith('updated');
  });

  it('uses continuation identity and merges through finalization without early append', () => {
    const harness = createHarness();
    harness.state.identity.continuationTokenRef.current = 7;
    harness.state.text.continuingMessageIdRef.current = 'assistant-1';
    const callbacks = harness.callbacks(null, 7);

    callbacks.onDelta('续写内容');
    callbacks.onDone({ id: 'assistant-1', content: '完整答复' }, []);
    callbacks.onStreamEnd();

    expect(harness.state.text.setContinuingText).toHaveBeenCalledWith('续写内容');
    expect(harness.state.messages.pendingAssistantRef.current).toEqual({ id: 'assistant-1', content: '完整答复' });
    expect(harness.appendedMessages).toEqual([]);
    expect(harness.state.setGenerating).not.toHaveBeenCalledWith(false);
    expect(harness.memory.startMemoryWriting).toHaveBeenCalledWith(undefined);
    expect(harness.finalizeStream).toHaveBeenCalledWith(null);
  });
});
