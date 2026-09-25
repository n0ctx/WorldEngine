import { parseContinuationText } from '../utils/next-prompt.js';

export function finalizeSessionStream(runId, state) {
  if (runId !== null && !state.isCurrentStreamRun(runId)) return;

  const pending = state.messages.pendingAssistantRef.current;
  const streamKey = state.messages.streamingKeyRef.current;
  state.messages.pendingAssistantRef.current = null;
  const wasContinuing = !!state.text.continuingMessageIdRef.current;
  if (wasContinuing && state.messages.messageListRef.current?.updateMessages) {
    const contId = state.text.continuingMessageIdRef.current;
    const contText = parseContinuationText(state.text.continuingTextRef.current).content;
    state.messages.messageListRef.current.updateMessages((previous) =>
      previous.map((message) => {
        if (message.id !== contId) return message;
        if (pending?.content) return { ...message, ...pending, content: pending.content, _key: message._key ?? message.id };
        if (!contText) return message;
        return { ...message, content: message.content + '\n\n' + contText.replace(/^\n+/, '') };
      })
    );
  }

  let appendedAssistant = state.messages.assistantAppendedEarlyRef.current;
  state.messages.assistantAppendedEarlyRef.current = false;
  if (!wasContinuing && pending && state.messages.messageListRef.current?.appendMessage) {
    state.messages.messageListRef.current.appendMessage({ ...pending, _key: streamKey });
    appendedAssistant = true;
  }
  state.text.continuingMessageIdRef.current = null;
  state.text.continuingTextRef.current = '';
  state.messages.tempUserIdRef.current = null;
  state.text.streamingTextRef.current = '';
  state.setGenerating(false);
  state.text.setStreamingText('');
  state.memory.stopMemoryRecalling();
  state.memory.stopMemoryExpanding();
  state.memory.stopMemoryWriting(runId);
  state.text.setContinuingMessageId(null);
  state.text.setContinuingText('');
  state.stopRef.current = null;

  const wasAborted = state.abortedRef.current;
  const finalOptions = wasAborted
    ? []
    : (state.options.pendingOptionsRef.current.length > 0
      ? state.options.pendingOptionsRef.current
      : state.options.streamingOptionsRef.current);
  if (finalOptions.length > 0) {
    state.options.setCurrentOptions(finalOptions);
    requestAnimationFrame(() => {
      if (!state.mountedRef.current) return;
      state.messages.messageListRef.current?.scrollToBottom?.();
    });
  }
  state.options.pendingOptionsRef.current = [];
  state.options.streamingOptionsRef.current = [];
  state.abortedRef.current = false;
  if (!wasContinuing && !appendedAssistant && !wasAborted) state.refreshMessages();
}
