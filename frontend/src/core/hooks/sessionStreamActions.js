import { deleteMessage as deleteMessageApi } from '../api/sessions.js';
import { log } from '../utils/logger.js';
import { latestAssistantDanmaku, toDanmakuBand } from '../utils/danmaku.js';

async function sendSessionMessage(content, attachments, state) {
  if (state.generating) return;
  state.prepareNewRun();

  let targetSessionId = state.sessionIdRef.current;
  if (!targetSessionId) {
    if (!state.createSessionOnDemand) return;
    const newSession = await state.createSessionOnDemand();
    if (!newSession) return;
    state.enterSession(newSession);
    state.sessionListBridge.addSession?.(newSession);
    targetSessionId = newSession.id;
  }

  state.setRecallSummary(null);
  if (content) {
    const tempUserMessage = {
      id: `__temp_${Date.now()}`,
      session_id: targetSessionId,
      role: 'user',
      content,
      attachments: null,
      created_at: Date.now(),
    };
    state.tempUserIdRef.current = tempUserMessage.id;
    if (state.messageListRef.current?.appendMessage) state.messageListRef.current.appendMessage(tempUserMessage);
  } else {
    state.tempUserIdRef.current = null;
  }

  const runId = state.beginStreamRun();
  state.setGenerating(true);
  state.setStreamingText('');
  const inject = state.pendingDiaryInject;
  state.setPendingDiaryInject(null);
  state.stopRef.current = state.api.send(
    targetSessionId,
    content ?? '',
    attachments,
    state.makeCallbacks(runId, targetSessionId),
    inject ? { diaryInjection: inject } : {}
  );
}

function stopSessionGeneration(state) {
  state.streamAbortedRef.current = true;
  const targetSessionId = state.sessionIdRef.current;
  state.api.stop(targetSessionId)
    .then((result) => {
      if (result?.active !== false || state.sessionIdRef.current !== targetSessionId) return;
      state.streamAbortedRef.current = false;
      if (!state.stopRef.current && !state.recoveryStopRef.current) {
        state.finalizeStream();
        return;
      }
      state.stopRef.current?.();
      state.recoveryStopRef.current?.();
    })
    .catch((err) => {
      if (state.sessionIdRef.current === targetSessionId) state.streamAbortedRef.current = false;
      log.error('stream.stop_failed', err, { toast: `停止失败，请重试：${err.message || '网络错误'}` });
    });
}

function editSessionUserMessage(messageId, newContent, state) {
  const targetSessionId = state.sessionIdRef.current;
  if (state.generating || !targetSessionId) return;
  state.prepareNewRun();
  if (state.messageListRef.current?.updateMessages) {
    state.messageListRef.current.updateMessages((prev) => {
      const index = prev.findIndex((message) => message.id === messageId);
      if (index === -1) return prev;
      return [...prev.slice(0, index), { ...prev[index], content: newContent }];
    });
  }
  const runId = state.beginStreamRun({ freezeOptions: false });
  state.setGenerating(true);
  state.setStreamingText('');
  state.stopRef.current = state.api.editAndRegenerate(
    targetSessionId,
    messageId,
    newContent,
    state.makeCallbacks(runId, targetSessionId)
  );
}

function regenerateSessionFrom(afterMessageId, truncateTo, targetSessionId, state) {
  state.messageListRef.current?.updateMessages?.(truncateTo);
  const runId = state.beginStreamRun({ freezeOptions: false });
  state.setGenerating(true);
  state.setStreamingText('');
  state.stopRef.current = state.api.regenerate(
    targetSessionId,
    afterMessageId,
    state.makeCallbacks(runId, targetSessionId)
  );
}

function beginSessionRun(state) {
  const targetSessionId = state.sessionIdRef.current;
  if (state.generating || !targetSessionId) return null;
  state.prepareNewRun();
  return { targetSessionId, messages: state.messageListRef.current?.messagesRef?.current ?? [] };
}

function regenerateSessionMessage(assistantMessageId, state) {
  const run = beginSessionRun(state);
  if (!run) return;
  const { targetSessionId, messages } = run;
  const index = messages.findIndex((message) => message.id === assistantMessageId);
  if (index <= 0) return;
  regenerateSessionFrom(messages[index - 1].id, (previous) => {
    const messageIndex = previous.findIndex((message) => message.id === assistantMessageId);
    return messageIndex >= 0 ? previous.slice(0, messageIndex) : previous;
  }, targetSessionId, state);
}

function retryLastSessionMessage(state) {
  const run = beginSessionRun(state);
  if (!run) return;
  const { targetSessionId, messages } = run;
  let lastIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') {
      lastIndex = i;
      break;
    }
  }
  if (lastIndex <= 0) return;
  regenerateSessionFrom(messages[lastIndex - 1].id, (previous) => previous.slice(0, lastIndex), targetSessionId, state);
}

function retrySessionAfterError(state) {
  const run = beginSessionRun(state);
  if (!run) return;
  const { targetSessionId, messages } = run;
  let end = messages.length;
  while (end > 0 && messages[end - 1].role === 'assistant') end -= 1;
  const trimmed = messages.slice(0, end);
  const lastUser = [...trimmed].reverse().find((message) => message.role === 'user');
  if (!lastUser) return;
  regenerateSessionFrom(lastUser.id, () => trimmed, targetSessionId, state);
}

function continueSessionGeneration(state) {
  const run = beginSessionRun(state);
  if (!run) return;
  const { targetSessionId, messages } = run;
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  if (!lastAssistant) return;

  state.clearOptionsState();
  const continuationToken = state.continuationTokenRef.current + 1;
  state.continuationTokenRef.current = continuationToken;
  state.continuingMessageIdRef.current = lastAssistant.id;
  state.continuingTextRef.current = '';
  state.setContinuingMessageId(lastAssistant.id);
  state.setContinuingText('');
  state.setGenerating(true);
  state.stopRef.current = state.api.continueGeneration(
    targetSessionId,
    state.makeCallbacks(null, targetSessionId, continuationToken)
  );
}

async function impersonateSessionUser(state) {
  const targetSessionId = state.sessionIdRef.current;
  if (state.generating || state.impersonating || !targetSessionId) return;
  state.setImpersonating(true);
  try {
    const { content } = await state.api.impersonate(targetSessionId);
    if (content) state.inputBoxRef.current?.fillText(content, { confirmOverwrite: true });
  } catch (err) {
    log.error(`${state.mode}.proxy_failed`, err, { toast: err.message || '代拟失败' });
  } finally {
    state.setImpersonating(false);
  }
}

async function editSessionAssistantMessage(messageId, newContent, state) {
  const targetSessionId = state.sessionIdRef.current;
  if (state.generating || !targetSessionId) return;
  if (state.messageListRef.current?.updateMessages) {
    state.messageListRef.current.updateMessages((previous) =>
      previous.map((message) => message.id === messageId ? { ...message, content: newContent } : message)
    );
  }
  try {
    await state.api.editAssistant(targetSessionId, messageId, newContent);
    log.info(`${state.mode}.message.saved`, null, { toast: '已保存，摘要更新中…' });
  } catch (err) {
    log.error(`${state.mode}.message.save_failed`, err, { toast: err.message || '保存失败' });
    state.refreshMessages();
  }
}

async function deleteSessionMessage(messageId, state) {
  const targetSessionId = state.sessionIdRef.current;
  if (state.generating || !targetSessionId) return;
  try {
    await deleteMessageApi(targetSessionId, messageId);
    if (state.messageListRef.current?.updateMessages) {
      state.messageListRef.current.updateMessages((previous) => {
        const index = previous.findIndex((message) => message.id === messageId);
        if (index === -1) return previous;
        return previous.slice(0, index);
      });
    }
    state.clearOptionsState();
    state.selectedOptionIndexRef.current = -1;
    state.setOptionCollapsed(false);
    state.signalState('updated');
    state.signalState('diary');
  } catch (err) {
    log.error(`${state.mode}.message.delete_failed`, err, { toast: err.message || '删除失败' });
  }
}

async function retitleSession(targetSessionId, state) {
  if (state.generating || !targetSessionId) return;
  try {
    log.info(`${state.mode}.title.generating`, null, { toast: '标题生成中…' });
    const { title } = await state.api.retitle(targetSessionId);
    if (title) {
      state.setCurrentSession((previous) => previous ? { ...previous, title } : previous);
      state.sessionListBridge.updateTitle?.(targetSessionId, title);
      log.info(`${state.mode}.title.updated`, null, { toast: `标题已更新：${title}` });
    } else {
      log.error(`${state.mode}.title.generate_failed`, null, { toast: '标题生成失败' });
    }
  } catch (err) {
    log.error(`${state.mode}.title.generate_failed`, err, { toast: err.message || '标题生成失败' });
  }
}

function createActionStates({ api, mode, session, generation, messages, view }) {
  const prepareNewRun = () => {
    generation.invalidateCurrentRun();
    generation.recoveryStopRef.current?.();
    generation.recoveryStopRef.current = null;
    generation.setErrorBubble(null);
    generation.streamingTextRef.current = '';
  };
  const generationActions = {
    sessionIdRef: session.sessionIdRef,
    generating: generation.generating,
    prepareNewRun,
    messageListRef: messages.messageListRef,
    beginStreamRun: generation.beginStreamRun,
    setGenerating: generation.setGenerating,
    setStreamingText: generation.setStreamingText,
    stopRef: generation.stopRef,
    api,
    makeCallbacks: generation.makeCallbacks,
  };
  const sendAction = {
    ...generationActions,
    createSessionOnDemand: session.createSessionOnDemand,
    enterSession: session.enterSession,
    sessionListBridge: session.sessionListBridge,
    setRecallSummary: view.setRecallSummary,
    tempUserIdRef: messages.tempUserIdRef,
    pendingDiaryInject: view.pendingDiaryInject,
    setPendingDiaryInject: view.setPendingDiaryInject,
  };
  const continuationAction = {
    ...generationActions,
    clearOptionsState: generation.clearOptionsState,
    continuationTokenRef: generation.continuationTokenRef,
    continuingMessageIdRef: generation.continuingMessageIdRef,
    continuingTextRef: generation.continuingTextRef,
    setContinuingMessageId: generation.setContinuingMessageId,
    setContinuingText: generation.setContinuingText,
  };
  const stopAction = {
    api,
    sessionIdRef: session.sessionIdRef,
    streamAbortedRef: generation.streamAbortedRef,
    stopRef: generation.stopRef,
    recoveryStopRef: generation.recoveryStopRef,
    finalizeStream: generation.finalizeStream,
  };
  const impersonateAction = {
    sessionIdRef: session.sessionIdRef,
    generating: generation.generating,
    impersonating: generation.impersonating,
    setImpersonating: generation.setImpersonating,
    api,
    inputBoxRef: view.inputBoxRef,
    mode,
  };
  const assistantEditAction = {
    sessionIdRef: session.sessionIdRef,
    generating: generation.generating,
    messageListRef: messages.messageListRef,
    api,
    mode,
    refreshMessages: view.refreshMessages,
  };
  const deleteMessageAction = {
    sessionIdRef: session.sessionIdRef,
    generating: generation.generating,
    messageListRef: messages.messageListRef,
    clearOptionsState: generation.clearOptionsState,
    selectedOptionIndexRef: messages.selectedOptionIndexRef,
    setOptionCollapsed: view.setOptionCollapsed,
    signalState: view.signalState,
    mode,
  };
  const retitleAction = {
    generating: generation.generating,
    api,
    mode,
    setCurrentSession: view.setCurrentSession,
    sessionListBridge: session.sessionListBridge,
  };
  const optionAction = {
    selectedOptionIndexRef: messages.selectedOptionIndexRef,
  };
  const messagesLoadedAction = {
    setCurrentOptions: view.setCurrentOptions,
    setOptionCollapsed: view.setOptionCollapsed,
    setDanmakuBand: view.setDanmakuBand,
    recoverLiveStream: view.recoverLiveStream,
    sessionIdRef: session.sessionIdRef,
  };

  return {
    sessionDelete: {
      sessionIdRef: session.sessionIdRef,
      onNoSessionsLeft: session.onNoSessionsLeft,
      clearActiveSession: session.clearActiveSession,
      handleSessionSelect: session.handleSessionSelect,
    },
    send: sendAction,
    stop: stopAction,
    editUser: generationActions,
    regenerate: generationActions,
    retry: generationActions,
    continue: continuationAction,
    impersonate: impersonateAction,
    editAssistant: assistantEditAction,
    deleteMessage: deleteMessageAction,
    retitle: retitleAction,
    retitleSessionId: session.sessionIdRef.current,
    selectOption: optionAction,
    messagesLoaded: messagesLoadedAction,
  };
}

export function createSessionStreamActions(getRuntime) {
  const withRuntime = (handler) => (...args) => handler(args, createActionStates(getRuntime()));
  return {
    handleSessionDelete: withRuntime(([deletedId, remaining], state) => {
      const activeSessionId = state.sessionDelete.sessionIdRef.current;
      const onNoSessionsLeft = state.sessionDelete.onNoSessionsLeft || state.sessionDelete.clearActiveSession;
      if (deletedId === activeSessionId) {
        if (remaining.length > 0) state.sessionDelete.handleSessionSelect(remaining[0]);
        else onNoSessionsLeft();
        return;
      }
      if (activeSessionId && !remaining.some((session) => session.id === activeSessionId)) onNoSessionsLeft();
    }),
    handleSend: withRuntime(([content, attachments], state) => sendSessionMessage(content, attachments, state.send)),
    handleStop: () => stopSessionGeneration(createActionStates(getRuntime()).stop),
    handleEditMessage: withRuntime(([messageId, newContent], state) => editSessionUserMessage(messageId, newContent, state.editUser)),
    handleRegenerateMessage: withRuntime(([messageId], state) => regenerateSessionMessage(messageId, state.regenerate)),
    handleRetryLast: withRuntime((_, state) => retryLastSessionMessage(state.retry)),
    handleRetryAfterError: withRuntime((_, state) => retrySessionAfterError(state.retry)),
    handleContinue: withRuntime((_, state) => continueSessionGeneration(state.continue)),
    handleImpersonate: withRuntime((_, state) => impersonateSessionUser(state.impersonate)),
    handleEditAssistantMessage: withRuntime(([messageId, newContent], state) => editSessionAssistantMessage(messageId, newContent, state.editAssistant)),
    handleDeleteMessage: withRuntime(([messageId], state) => deleteSessionMessage(messageId, state.deleteMessage)),
    handleRetitle: withRuntime((_, state) => retitleSession(state.retitleSessionId, state.retitle)),
    selectOption: withRuntime(([text, index], state) => {
      state.selectOption.selectedOptionIndexRef.current = index;
      return sendSessionMessage(text, [], state.send);
    }),
    handleMessagesLoaded: withRuntime(([loadedMessages], state) => {
      let lastAssistant = null;
      for (let index = loadedMessages.length - 1; index >= 0; index -= 1) {
        if (loadedMessages[index].role === 'assistant') {
          lastAssistant = loadedMessages[index];
          break;
        }
      }
      const options = lastAssistant?.next_options;
      if (Array.isArray(options) && options.length > 0) {
        state.messagesLoaded.setCurrentOptions(options);
        state.messagesLoaded.setOptionCollapsed(false);
      }
      state.messagesLoaded.setDanmakuBand(toDanmakuBand(latestAssistantDanmaku(loadedMessages)));
      void state.messagesLoaded.recoverLiveStream(state.messagesLoaded.sessionIdRef.current);
    }),
  };
}
