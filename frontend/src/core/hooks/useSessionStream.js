import { useCallback, useEffect, useRef, useState } from 'react';

import { useDanmakuBandStore } from '../state/danmakuBand.js';
import { createSessionStreamCallbacks } from './sessionStreamCallbacks.js';
import { createSessionStreamActions } from './sessionStreamActions.js';
import { applyStreamRecoverySnapshot, recoverSessionStream } from './sessionStreamRecovery.js';
import { finalizeSessionStream } from './sessionStreamFinalization.js';
/**
 * 两种模式共用的流式收发 / 中断 / 续写 / 选项 / 断点恢复 + 会话切换运行时。
 * 与 session-view（currentSession / messageListKey / pendingDiaryInject）耦合不可分，故一并收口。
 *
 * 模式差异全部通过入参注入：
 * - `api`：已绑定模式作用域（写作侧的 worldId）的接口集合，签名一律以 sessionId 开头
 * - `sessionIdentity`：会话身份的存放处。对话模式在全局 store，写作模式不传则存在 hook 内
 * - `onStateSignal(kind)`：状态刷新信号，kind 为 'queued' | 'updated' | 'failed' | 'diary'
 * - `extraCallbacks`：模式独有的 SSE 事件（章节标题 / saved 角色召回）
 */
export function useSessionStream({
  mode,
  api,
  sessionListBridge,
  sessionIdentity = null,
  onStateSignal,
  onEnterSession,
  onNoSessionsLeft,
  createSessionOnDemand,
  extraCallbacks = {},
  messageListRef,
  inputBoxRef,
  memory,
}) {
  const {
    setRecallSummary,
    startMemoryRecalling,
    stopMemoryRecalling,
    startMemoryExpanding,
    stopMemoryExpanding,
    startMemoryWriting,
    stopMemoryWriting,
    cancelMemoryWriting,
    clearMemoryState,
  } = memory;
  const setDanmakuBand = useDanmakuBandStore((s) => s.setComments);

  // 会话身份：外部提供则以外部为准（对话模式在全局 store），否则存在 hook 内
  const [ownSessionId, setOwnSessionId] = useState(null);
  const sessionId = sessionIdentity ? sessionIdentity.sessionId : ownSessionId;
  // 身份写入口必须保持稳定引用：clearActiveSession 依赖它，页面又把 clearActiveSession 放进 effect 依赖
  const externalSetSessionId = sessionIdentity?.setSessionId;
  const setSessionId = useCallback((id) => {
    if (externalSetSessionId) externalSetSessionId(id);
    else setOwnSessionId(id);
  }, [externalSetSessionId]);

  const [currentSession, setCurrentSession] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [messageListKey, setMessageListKey] = useState(0);
  const [continuingMessageId, setContinuingMessageId] = useState(null);
  const [continuingText, setContinuingText] = useState('');
  const [errorBubble, setErrorBubble] = useState(null); // { partialContent, errorMsg }
  // 本轮流式占位节点的 React key（每次新流都换，避免相邻两轮 key 冲突）
  const [streamingKey, setStreamingKey] = useState('__stream_init__');
  const [impersonating, setImpersonating] = useState(false);

  const stopRef = useRef(null);
  const recoveryStopRef = useRef(null);
  const sessionIdRef = useRef(sessionId);
  const optionCollapsedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const streamingTextRef = useRef('');
  const continuingMessageIdRef = useRef(null);
  const continuingTextRef = useRef('');
  // 每次续写递增，防止旧 onStreamEnd 回调干扰新续写状态
  const continuationTokenRef = useRef(0);
  // 本轮乐观追加的 user 消息 temp id（用于收到 user_saved 后原地替换为真实 id）
  const tempUserIdRef = useRef(null);
  // 本轮后端返回的真实 assistant 消息（onDone 提前追加后置 null；finalizeStream 读取时若已 null 则跳过）
  const pendingAssistantRef = useRef(null);
  // onDone 已提前追加 assistant 消息的标志（防止 finalizeStream 兜底触发 refreshMessages）
  const assistantAppendedEarlyRef = useRef(false);
  // 本轮后端返回的选项列表（finalizeStream 时设置到 currentOptions）
  const pendingOptionsRef = useRef([]);
  // 本轮流式解析到的选项（onDelta 暂存；finalizeStream 时若后端无最终选项则使用此值）
  const streamingOptionsRef = useRef([]);
  // 本轮 SSE 推送的激活条目（onDone 时附加到 assistant 上，仅运行时展示）
  const pendingEntriesRef = useRef([]);
  // 本轮流占位节点的 key（finalizeStream 把它作为 assistant._key，保持 React key 稳定）
  const streamingKeyRef = useRef('__stream_init__');
  // 普通生成/重生成的 run id；旧 SSE 收尾不得覆盖新一轮状态
  const streamRunIdRef = useRef(0);
  // 用户主动点击停止时置 true；防止无内容时 finalizeStream 兜底触发 refreshMessages
  const streamAbortedRef = useRef(false);
  const recoveryToastKeyRef = useRef('');

  const [currentOptions, setCurrentOptions] = useState([]);
  const currentOptionsRef = useRef([]);
  const selectedOptionIndexRef = useRef(-1);
  const [optionCollapsed, setOptionCollapsed] = useState(false);
  const [pendingDiaryInject, setPendingDiaryInject] = useState(null);

  const signalState = useCallback((kind) => { onStateSignal?.(kind); }, [onStateSignal]);

  const clearOptionsState = useCallback(() => {
    pendingOptionsRef.current = [];
    streamingOptionsRef.current = [];
    setCurrentOptions((prev) => (prev.length > 0 ? [] : prev));
    setOptionCollapsed(false);
  }, [setCurrentOptions, setOptionCollapsed]);

  const resetContinuationState = useCallback(() => {
    continuationTokenRef.current += 1;
    continuingMessageIdRef.current = null;
    continuingTextRef.current = '';
    setContinuingMessageId(null);
    setContinuingText('');
  }, []);

  // 每次开启新流时调用：生成本轮唯一的占位 key
  const beginStreamingKey = useCallback(() => {
    const k = `__stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`;
    streamingKeyRef.current = k;
    setStreamingKey(k);
    return k;
  }, []);

  const beginStreamRun = useCallback(({ freezeOptions = true } = {}) => {
    // 将当前轮次选项冻结到最后一条 assistant 消息上（再次生成时保留历史选项）
    // 重新生成 / 编辑重生 / 重试场景下，选项属于即将被替换的消息，不应冻结到上一条 assistant
    if (freezeOptions && currentOptionsRef.current.length > 0) {
      messageListRef.current?.freezeOptions?.(currentOptionsRef.current, selectedOptionIndexRef.current, optionCollapsedRef.current);
      selectedOptionIndexRef.current = -1;
      setOptionCollapsed(false);
    }
    const runId = streamRunIdRef.current + 1;
    streamRunIdRef.current = runId;
    pendingAssistantRef.current = null;
    assistantAppendedEarlyRef.current = false;
    pendingOptionsRef.current = [];
    pendingEntriesRef.current = [];
    streamAbortedRef.current = false;
    clearOptionsState();
    beginStreamingKey();
    return runId;
  }, [beginStreamingKey, clearOptionsState, messageListRef, setOptionCollapsed]);

  const isCurrentStreamRun = useCallback((runId) => streamRunIdRef.current === runId, []);

  const invalidateCurrentRun = useCallback(() => {
    streamRunIdRef.current += 1;
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    currentOptionsRef.current = currentOptions;
  }, [currentOptions]);

  useEffect(() => {
    optionCollapsedRef.current = optionCollapsed;
  }, [optionCollapsed]);

  const clearActiveSession = useCallback(() => {
    invalidateCurrentRun();
    stopRef.current?.();
    stopRef.current = null;
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;
    clearOptionsState();
    setSessionId(null);
    setCurrentSession(null);
    setGenerating(false);
    setStreamingText('');
    setErrorBubble(null);
    clearMemoryState();
    resetContinuationState();
    streamingTextRef.current = '';
    setPendingDiaryInject(null);
    setMessageListKey((k) => k + 1);
  }, [clearMemoryState, clearOptionsState, invalidateCurrentRun, resetContinuationState, setSessionId, setPendingDiaryInject]);

  useEffect(() => {
    return () => {
      invalidateCurrentRun();
      recoveryStopRef.current?.();
      clearOptionsState();
    };
  }, [clearOptionsState, invalidateCurrentRun]);

  function enterSession(session) {
    invalidateCurrentRun();
    stopRef.current?.();
    stopRef.current = null;
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;
    clearOptionsState();
    setSessionId(session.id);
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    setErrorBubble(null);
    streamingTextRef.current = '';
    resetContinuationState();
    clearMemoryState();
    setPendingDiaryInject(null);
    setMessageListKey((k) => k + 1);
    onEnterSession?.(session);
  }

  const handleSessionSelect = enterSession;
  const handleSessionCreate = enterSession;

  // 流结束后刷新消息列表
  function refreshMessages() {
    setMessageListKey((k) => k + 1);
  }

  // 所有普通生成与续写都走同一收尾流程。
  const finalizeStream = useCallback((runId = null) => {
    finalizeSessionStream(runId, {
      isCurrentStreamRun,
      messages: { pendingAssistantRef, streamingKeyRef, assistantAppendedEarlyRef, messageListRef, tempUserIdRef },
      text: { continuingMessageIdRef, continuingTextRef, streamingTextRef, setStreamingText, setContinuingMessageId, setContinuingText },
      options: { pendingOptionsRef, streamingOptionsRef, setCurrentOptions },
      memory: { stopMemoryRecalling, stopMemoryExpanding, stopMemoryWriting },
      abortedRef: streamAbortedRef,
      mountedRef,
      setGenerating,
      stopRef,
      refreshMessages: () => setMessageListKey((key) => key + 1),
    });
  }, [isCurrentStreamRun, stopMemoryRecalling, stopMemoryExpanding, stopMemoryWriting, messageListRef, setCurrentOptions]);

  // 将本轮身份与 hook 运行时状态绑定到 SSE 事件处理器。
  function makeCallbacks(runId, sessionIdHint = null, continuationToken = null) {
    return createSessionStreamCallbacks({
      runId,
      sessionIdHint,
      continuationToken,
      mode,
      extraCallbacks,
      finalizeStream,
      identity: { continuationTokenRef, isCurrentStreamRun, sessionIdRef },
      text: { continuingTextRef, continuingMessageIdRef, setContinuingText, streamingTextRef, setStreamingText },
      options: { pendingOptionsRef, streamingOptionsRef, setCurrentOptions },
      messages: { tempUserIdRef, pendingAssistantRef, assistantAppendedEarlyRef, messageListRef, streamingKey: streamingKeyRef.current },
      entries: { pendingEntriesRef },
      memory: {
        setRecallSummary,
        startMemoryRecalling,
        stopMemoryRecalling,
        startMemoryExpanding,
        stopMemoryExpanding,
        startMemoryWriting,
        stopMemoryWriting,
        cancelMemoryWriting,
      },
      session: { sessionListBridge, setCurrentSession },
      setDanmakuBand,
      setErrorBubble,
      setGenerating,
      stopRef,
      signalState,
    });
  }

  function applyRecoveredSnapshot(task) {
    applyStreamRecoverySnapshot(task, {
      messageListRef,
      pendingOptionsRef,
      streamingOptionsRef,
      pendingEntriesRef,
      setCurrentOptions,
      setOptionCollapsed,
      continuingMessageIdRef,
      continuingTextRef,
      setContinuingMessageId,
      setContinuingText,
      streamingTextRef,
      setStreamingText,
      setErrorBubble,
      setGenerating,
    });
  }

  function recoverLiveStream(targetSessionId) {
    return recoverSessionStream(targetSessionId, {
      api,
      mode,
      sessionIdRef,
      recoveryToastKeyRef,
      recoveryStopRef,
      streamRunIdRef,
      makeCallbacks,
      applySnapshot: applyRecoveredSnapshot,
    });
  }

  function getActionRuntime() {
    return {
      api,
      mode,
      session: {
        sessionIdRef,
        sessionListBridge,
        createSessionOnDemand,
        enterSession,
        handleSessionSelect,
        onNoSessionsLeft,
        clearActiveSession,
      },
      generation: {
        generating,
        impersonating,
        setImpersonating,
        invalidateCurrentRun,
        recoveryStopRef,
        setErrorBubble,
        streamingTextRef,
        beginStreamRun,
        setGenerating,
        setStreamingText,
        stopRef,
        streamAbortedRef,
        finalizeStream,
        continuationTokenRef,
        continuingMessageIdRef,
        continuingTextRef,
        setContinuingMessageId,
        setContinuingText,
        clearOptionsState,
        makeCallbacks,
      },
      messages: { messageListRef, tempUserIdRef, selectedOptionIndexRef },
      view: {
        setRecallSummary,
        pendingDiaryInject,
        setPendingDiaryInject,
        inputBoxRef,
        refreshMessages,
        setOptionCollapsed,
        signalState,
        setCurrentSession,
        setCurrentOptions,
        setDanmakuBand,
        recoverLiveStream,
      },
    };
  }
  const actions = createSessionStreamActions(getActionRuntime);

  return {
    currentSession,
    setCurrentSession,
    clearActiveSession,
    clearOptionsState,
    generating,
    streamingText,
    streamingKey,
    continuingMessageId,
    continuingText,
    errorBubble,
    currentOptions,
    setCurrentOptions,
    optionCollapsed,
    setOptionCollapsed,
    messageListKey,
    pendingDiaryInject,
    setPendingDiaryInject,
    impersonating,
    enterSession,
    handleSessionSelect,
    handleSessionCreate,
    ...actions,
  };
}
