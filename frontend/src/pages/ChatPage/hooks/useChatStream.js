import { useCallback, useMemo } from 'react';

import useStore from '../../../core/state/index.js';
import { useSessionStream } from '../../../core/hooks/useSessionStream.js';
import {
  sendMessage,
  stopGeneration,
  regenerate,
  editAndRegenerate,
  continueGeneration,
  impersonate,
  editAssistantMessage,
  retitle,
  recoverChatStream,
  subscribeChatStream,
} from '../../../core/api/chat.js';
import { createSession } from '../../../core/api/sessions.js';
import { chatSessionListBridge } from '../../../core/utils/session-list-bridge.js';

const api = {
  send: sendMessage,
  stop: stopGeneration,
  regenerate,
  editAndRegenerate,
  continueGeneration,
  impersonate,
  editAssistant: editAssistantMessage,
  retitle,
  recoverStream: recoverChatStream,
  subscribeStream: subscribeChatStream,
};

// 对话页的流式运行时：会话身份取自全局 store，状态刷新信号推 store 的三个 tick。
export function useChatStream({ character, messageListRef, inputBoxRef, currentSessionId, setCurrentSessionId, memory }) {
  const sessionIdentity = useMemo(
    () => ({ sessionId: currentSessionId, setSessionId: setCurrentSessionId }),
    [currentSessionId, setCurrentSessionId]
  );

  const onStateSignal = useCallback((kind) => {
    const store = useStore.getState();
    if (kind === 'queued') store.triggerStateQueued();
    else if (kind === 'failed') store.triggerStateFailed();
    // 对话页的状态与日记共用同一个刷新 tick
    else store.triggerMemoryRefresh();
  }, []);

  const createSessionOnDemand = useCallback(
    () => (character ? createSession(character.id) : null),
    [character]
  );

  return useSessionStream({
    mode: 'chat',
    api,
    sessionListBridge: chatSessionListBridge,
    sessionIdentity,
    onStateSignal,
    createSessionOnDemand,
    messageListRef,
    inputBoxRef,
    memory,
  });
}
