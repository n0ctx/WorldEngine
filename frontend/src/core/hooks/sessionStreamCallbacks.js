import { buildPostgenToast } from '../api/postgen-error-toast.js';
import { log } from '../utils/logger.js';
import { areOptionsEqual, parseContinuationText, parseNextPromptStream } from '../utils/next-prompt.js';
import { toDanmakuBand } from '../utils/danmaku.js';

function handleDelta(isLive, isContinuation, text, options, delta) {
  if (!isLive()) return;
  if (isContinuation) {
    const next = text.continuingTextRef.current + delta;
    text.continuingTextRef.current = next;
    const parsed = parseContinuationText(next, true);
    if (parsed.options.length > 0) options.setCurrentOptions(parsed.options);
    text.setContinuingText(parsed.content);
    return;
  }
  const next = text.streamingTextRef.current + delta;
  text.streamingTextRef.current = next;
  const { display, options: parsedOptions } = parseNextPromptStream(next, true);
  text.setStreamingText(display);
  if (parsedOptions.length > 0) {
    options.streamingOptionsRef.current = parsedOptions;
    options.setCurrentOptions((prev) => (areOptionsEqual(prev, parsedOptions) ? prev : parsedOptions));
  }
}

function handleUserSaved(isLive, messages, realId) {
  if (!isLive()) return;
  const tempId = messages.tempUserIdRef.current;
  if (!tempId || !realId || tempId === realId) return;
  if (messages.messageListRef.current?.updateMessages) {
    messages.messageListRef.current.updateMessages((prev) =>
      prev.map((message) => message.id === tempId
        ? { ...message, _key: message._key ?? tempId, id: realId }
        : message)
    );
  }
  messages.tempUserIdRef.current = realId;
}

function handleDone(isLive, isContinuation, runId, streamKey, text, optionsState, messages, entries, memory, setGenerating, assistant, options) {
  if (!isLive()) return;
  if (options?.length) {
    optionsState.pendingOptionsRef.current = options;
    optionsState.setCurrentOptions(options);
  }
  if (assistant && entries.pendingEntriesRef.current.length > 0) {
    assistant = { ...assistant, activated_entries: entries.pendingEntriesRef.current };
  }
  if (assistant && !text.continuingMessageIdRef.current && messages.messageListRef.current?.appendMessage) {
    messages.messageListRef.current.appendMessage({ ...assistant, _key: streamKey });
    messages.assistantAppendedEarlyRef.current = true;
  } else if (assistant) {
    messages.pendingAssistantRef.current = assistant;
  }
  if (!isContinuation) setGenerating(false);
  memory.startMemoryWriting(isContinuation ? undefined : runId);
}

function handleDanmaku(isLive, setDanmakuBand, comments) {
  if (!isLive()) return;
  const arr = Array.isArray(comments) ? comments.filter((comment) => typeof comment === 'string' && comment.trim()) : [];
  if (arr.length === 0) return;
  setDanmakuBand(toDanmakuBand(arr));
}

function handleSuggestionFallback(isLive, mode, result) {
  if (!isLive()) return;
  if (result === 'started') {
    log.warn(`${mode}.suggestion_fallback_started`, null, { toast: '本轮选项缺失，正在补全…' });
  } else if (result === 'succeeded') {
    log.info(`${mode}.suggestion_fallback_succeeded`, null, { toast: '选项补全成功' });
  } else {
    log.error(`${mode}.suggestion_fallback_failed`, null, { toast: '选项补全失败' });
  }
}

function handleAborted(isLive, isContinuation, text, options, messages, memory, assistant) {
  if (!isLive()) return;
  if (!isContinuation) {
    options.pendingOptionsRef.current = [];
    options.streamingOptionsRef.current = [];
    options.setCurrentOptions([]);
    text.streamingTextRef.current = '';
  }
  memory.cancelMemoryWriting();
  if (assistant) messages.pendingAssistantRef.current = assistant;
}

function handleError(isLive, isContinuation, text, setErrorBubble, setGenerating, stopRef, mode, err) {
  if (!isLive()) return;
  const partial = isContinuation ? '' : text.streamingTextRef.current;
  const errMsg = typeof err === 'string' ? err : (err?.message || '生成失败');
  text.streamingTextRef.current = '';
  setErrorBubble({ partialContent: partial, errorMsg: errMsg });
  if (isContinuation) log.error(`${mode}.continue_failed`, err, { toast: errMsg });
  setGenerating(false);
  text.setStreamingText('');
  stopRef.current = null;
}

function handleTitleUpdated(callbackSessionId, isSameSession, sessionListBridge, setCurrentSession, title) {
  if (callbackSessionId) sessionListBridge.updateTitle?.(callbackSessionId, title);
  if (isSameSession()) setCurrentSession((prev) => (prev ? { ...prev, title } : prev));
}

function handleStateUpdated(isSameSession, isContinuation, runId, memory, signalState) {
  memory.stopMemoryWriting(isContinuation ? undefined : runId);
  if (isSameSession()) signalState('updated');
}

function handleStateUpdateFailed(isSameSession, isContinuation, runId, memory, signalState, evt) {
  memory.stopMemoryWriting(isContinuation ? undefined : runId);
  if (!isSameSession()) return;
  signalState('failed');
  log.error('state.update_failed', evt?.error, { toast: buildPostgenToast(evt, 'state') });
}

function handlePostprocessFailed(isSameSession, isContinuation, runId, memory, mode, evt) {
  memory.stopMemoryWriting(isContinuation ? undefined : runId);
  if (!isSameSession()) return;
  log.error(`${mode}.postprocess_failed`, evt?.error, { toast: buildPostgenToast(evt, 'postprocess') });
}

function handleMemoryRecallDone(isLive, stopMemoryRecalling, setRecallSummary, evt) {
  if (!isLive()) return;
  stopMemoryRecalling();
  setRecallSummary({ recalled: evt?.hit ?? 0, expanded: 0 });
}

function handleMemoryExpandDone(isLive, stopMemoryExpanding, setRecallSummary, evt) {
  if (!isLive()) return;
  stopMemoryExpanding();
  const count = Array.isArray(evt?.expanded) ? evt.expanded.length : 0;
  setRecallSummary((prev) => prev ? { ...prev, expanded: count } : { recalled: 0, expanded: count });
}

function handleChapterTitleUpdated(isSameSession, extraCallbacks, chapterIndex, title) {
  if (isSameSession()) extraCallbacks.onChapterTitleUpdated?.(chapterIndex, title);
}

function handleSavedRecallDone(isLive, extraCallbacks, evt) {
  if (isLive()) extraCallbacks.onSavedRecallDone?.(evt);
}

function handleStreamEnd(isLive, isContinuation, runId, memory, finalizeStream) {
  if (!isLive()) {
    if (!isContinuation) memory.stopMemoryWriting(runId);
    return;
  }
  finalizeStream(isContinuation ? null : runId);
}

export function createSessionStreamCallbacks({
  runId,
  sessionIdHint = null,
  continuationToken = null,
  identity,
  text,
  options,
  messages,
  entries,
  memory,
  session,
  setDanmakuBand,
  setErrorBubble,
  setGenerating,
  stopRef,
  signalState,
  extraCallbacks = {},
  mode,
  finalizeStream,
}) {
  const isContinuation = continuationToken !== null;
  const isLive = () => (isContinuation
    ? identity.continuationTokenRef.current === continuationToken
    : identity.isCurrentStreamRun(runId));
  const callbackSessionId = sessionIdHint ?? identity.sessionIdRef.current ?? null;
  const isSameSession = () => (identity.sessionIdRef.current ?? null) === callbackSessionId;

  return {
    onDelta: (delta) => handleDelta(isLive, isContinuation, text, options, delta),
    onUserSaved: (realId) => handleUserSaved(isLive, messages, realId),
    onDone: (assistant, finalOptions) => handleDone(isLive, isContinuation, runId, messages.streamingKey, text, options, messages, entries, memory, setGenerating, assistant, finalOptions),
    onEntriesActivated: (activatedEntries) => {
      if (!isLive()) return;
      entries.pendingEntriesRef.current = Array.isArray(activatedEntries) ? activatedEntries : [];
    },
    onDanmaku: (comments) => handleDanmaku(isLive, setDanmakuBand, comments),
    onSuggestionFallbackStarted: () => handleSuggestionFallback(isLive, mode, 'started'),
    onSuggestionFallbackSucceeded: () => handleSuggestionFallback(isLive, mode, 'succeeded'),
    onSuggestionFallbackFailed: () => handleSuggestionFallback(isLive, mode, 'failed'),
    onAborted: (assistant) => handleAborted(isLive, isContinuation, text, options, messages, memory, assistant),
    onError: (err) => handleError(isLive, isContinuation, text, setErrorBubble, setGenerating, stopRef, mode, err),
    onTitleUpdated: (title) => handleTitleUpdated(callbackSessionId, isSameSession, session.sessionListBridge, session.setCurrentSession, title),
    onStateQueued: () => {
      if (isSameSession()) signalState('queued');
    },
    onStateUpdated: () => handleStateUpdated(isSameSession, isContinuation, runId, memory, signalState),
    onStateUpdateFailed: (evt) => handleStateUpdateFailed(isSameSession, isContinuation, runId, memory, signalState, evt),
    onPostprocessFailed: (evt) => handlePostprocessFailed(isSameSession, isContinuation, runId, memory, mode, evt),
    onStateRolledBack: () => {
      if (isSameSession()) signalState('updated');
    },
    onDiaryUpdated: () => {
      if (isLive()) signalState('diary');
    },
    onMemoryRecallStart: () => {
      if (isLive()) memory.startMemoryRecalling();
    },
    onMemoryRecallDone: (evt) => handleMemoryRecallDone(isLive, memory.stopMemoryRecalling, memory.setRecallSummary, evt),
    onMemoryExpandStart: () => {
      if (isLive()) memory.startMemoryExpanding();
    },
    onMemoryExpandDone: (evt) => handleMemoryExpandDone(isLive, memory.stopMemoryExpanding, memory.setRecallSummary, evt),
    onChapterTitleUpdated: (chapterIndex, title) => handleChapterTitleUpdated(isSameSession, extraCallbacks, chapterIndex, title),
    onSavedRecallDone: (evt) => handleSavedRecallDone(isLive, extraCallbacks, evt),
    onStreamEnd: () => handleStreamEnd(isLive, isContinuation, runId, memory, finalizeStream),
  };
}
