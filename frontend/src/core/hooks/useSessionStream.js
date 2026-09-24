import { useCallback, useEffect, useRef, useState } from 'react';

import { useDanmakuBandStore } from '../state/danmakuBand.js';
import { latestAssistantDanmaku, toDanmakuBand } from '../utils/danmaku.js';
import { deleteMessage as deleteMessageApi } from '../api/sessions.js';
import { buildPostgenToast } from '../api/postgen-error-toast.js';
import { log } from '../utils/logger.js';
import { parseNextPromptStream, parseContinuationText } from '../utils/next-prompt.js';
import { RESTART_INTERRUPTED_ERROR } from '../utils/constants.js';

function areOptionsEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function materializeInterruptedMessages(task) {
  const base = Array.isArray(task?.messages) ? task.messages : [];
  if (task?.continuingMessageId && task?.continuingText) {
    return base.map((msg) =>
      msg.id === task.continuingMessageId
        ? { ...msg, content: `${msg.content}\n\n${parseContinuationText(task.continuingText).content}` }
        : msg
    );
  }
  if (task?.streamingText) {
    return [
      ...base,
      {
        id: `__recovered_${task.id}`,
        _key: `__recovered_${task.id}`,
        role: 'assistant',
        content: task.streamingText,
        created_at: Date.now(),
      },
    ];
  }
  return base;
}

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
  }, []);

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
  }, [beginStreamingKey, clearOptionsState, messageListRef]);

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
  }, [clearMemoryState, clearOptionsState, invalidateCurrentRun, resetContinuationState, setSessionId]);

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

  // 删除当前会话后切换到第一个；无可回落会话时交给模式决定（对话清空，写作新建）
  function handleSessionDelete(deletedId, remaining) {
    const activeSessionId = sessionIdRef.current;
    const fallback = () => (onNoSessionsLeft ? onNoSessionsLeft() : clearActiveSession());
    if (deletedId === activeSessionId) {
      if (remaining.length > 0) handleSessionSelect(remaining[0]);
      else fallback();
      return;
    }
    if (activeSessionId && !remaining.some((session) => session.id === activeSessionId)) {
      fallback();
    }
  }

  // 流结束后刷新消息列表
  function refreshMessages() {
    setMessageListKey((k) => k + 1);
  }

  function showRecoveryToast(task) {
    const key = `${task.id}:${task.updatedAt ?? ''}:${task.status}:${task.error ?? ''}`;
    if (recoveryToastKeyRef.current === key) return;
    recoveryToastKeyRef.current = key;
    if (task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR) {
      log.warn(`${mode}.resume.interrupted`, null, { toast: '已恢复中断前内容，旧生成因服务重启已停止' });
      return;
    }
    log.info(`${mode}.resume.reconnected`, null, { toast: '已恢复生成连接' });
  }

  function applyRecoveredSnapshot(task) {
    const interrupted = task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR;
    const nextMessages = interrupted ? materializeInterruptedMessages(task) : (task.messages ?? []);
    messageListRef.current?.updateMessages?.(() => nextMessages);
    pendingOptionsRef.current = Array.isArray(task.options) ? task.options : [];
    streamingOptionsRef.current = Array.isArray(task.options) ? task.options : [];
    pendingEntriesRef.current = Array.isArray(task.activatedEntries) ? task.activatedEntries : [];
    if (Array.isArray(task.options) && task.options.length > 0) {
      setCurrentOptions(task.options);
      setOptionCollapsed(false);
    } else {
      setCurrentOptions([]);
    }
    if (task.continuingMessageId && !interrupted) {
      continuingMessageIdRef.current = task.continuingMessageId;
      continuingTextRef.current = task.continuingText || '';
      setContinuingMessageId(task.continuingMessageId);
      setContinuingText(parseContinuationText(task.continuingText || '', true).content);
      streamingTextRef.current = '';
      setStreamingText('');
    } else {
      continuingMessageIdRef.current = null;
      continuingTextRef.current = '';
      setContinuingMessageId(null);
      setContinuingText('');
      streamingTextRef.current = interrupted ? '' : (task.streamingText || '');
      setStreamingText(interrupted ? '' : (task.streamingText || ''));
    }
    if (interrupted && task.streamingText) {
      // 半截正文已由 materializeInterruptedMessages 并入消息列表；错误气泡只留提示与重试入口，
      // 不再重复渲染整段 partialContent（否则消息下方多出一个大文本框，看起来像进入了编辑态）
      setErrorBubble({ partialContent: '', errorMsg: task.error });
    }
    setGenerating(!interrupted);
  }

  async function recoverLiveStream(targetSessionId) {
    if (!targetSessionId) return;
    try {
      const task = await api.recoverStream(targetSessionId);
      if (!task || sessionIdRef.current !== targetSessionId) return;
      applyRecoveredSnapshot(task);
      showRecoveryToast(task);
      if (task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR) return;
      recoveryStopRef.current?.();
      const runId = streamRunIdRef.current + 1;
      streamRunIdRef.current = runId;
      recoveryStopRef.current = api.subscribeStream(targetSessionId, {
        ...makeCallbacks(runId, targetSessionId),
        onStreamSnapshot: (snapshot) => {
          if (snapshot && sessionIdRef.current === targetSessionId) {
            applyRecoveredSnapshot(snapshot);
          }
        },
      });
    } catch (err) {
      log.error(`${mode}.resume.failed`, err, { toast: err.message || '断点续传恢复失败' });
    }
  }

  // 流状态清理；续写场景下原地合并内容，普通场景下补追 assistant 消息
  const finalizeStream = useCallback((runId = null) => {
    if (runId !== null && !isCurrentStreamRun(runId)) return;

    const pending = pendingAssistantRef.current;
    const streamKey = streamingKeyRef.current;
    pendingAssistantRef.current = null;

    // 续写场景：原地合并消息内容，不重挂载 MessageList，避免气泡闪烁
    const wasContinuing = !!continuingMessageIdRef.current;
    if (wasContinuing && messageListRef.current?.updateMessages) {
      const contId = continuingMessageIdRef.current;
      const contText = parseContinuationText(continuingTextRef.current).content;
      messageListRef.current.updateMessages((prev) =>
        prev.map((m) => {
          if (m.id !== contId) return m;
          if (pending?.content) return { ...m, ...pending, content: pending.content, _key: m._key ?? m.id };
          if (!contText) return m;
          return { ...m, content: m.content + '\n\n' + contText.replace(/^\n+/, '') };
        })
      );
    }

    // 普通流结束：若 onDone 尚未提前追加，在此补追（兜底路径）
    // 复用本轮的 streamingKey 让 AnimatePresence 视其与流式占位为同一节点，零动画切换
    let appendedAssistant = assistantAppendedEarlyRef.current;
    assistantAppendedEarlyRef.current = false;
    if (!wasContinuing && pending && messageListRef.current?.appendMessage) {
      messageListRef.current.appendMessage({ ...pending, _key: streamKey });
      appendedAssistant = true;
    }

    continuingMessageIdRef.current = null;
    continuingTextRef.current = '';
    tempUserIdRef.current = null;
    streamingTextRef.current = '';
    setGenerating(false);
    setStreamingText('');
    stopMemoryRecalling();
    stopMemoryExpanding();
    stopMemoryWriting(runId);
    setContinuingMessageId(null);
    setContinuingText('');
    stopRef.current = null;
    // 设置本轮选项；后端最终解析结果优先，否则回落到流式检测到的内容
    const wasAborted = streamAbortedRef.current;
    const finalOpts = wasAborted
      ? []
      : (pendingOptionsRef.current.length > 0 ? pendingOptionsRef.current : streamingOptionsRef.current);
    if (finalOpts.length > 0) {
      setCurrentOptions(finalOpts);
      requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        messageListRef.current?.scrollToBottom?.();
      });
    }
    pendingOptionsRef.current = [];
    streamingOptionsRef.current = [];
    // 兜底：后端未回传 assistant（例如错误路径已消费），降级为重拉刷新
    // 用户主动停止时（streamAbortedRef=true）跳过刷新，避免页面闪烁跳顶
    streamAbortedRef.current = false;
    if (!wasContinuing && !appendedAssistant && !wasAborted) refreshMessages();
  }, [isCurrentStreamRun, stopMemoryRecalling, stopMemoryExpanding, stopMemoryWriting, messageListRef]);

  // 共用 SSE callbacks。
  // sessionIdHint：调用方显式传入回调归属的 sessionId，用于"首次发送时新建 session"这种
  // sessionIdRef 还没被 effect 同步到位的场景；其他场景可省略，默认取 ref。
  // continuationToken：续写流用它判活（续写不占用 run id）。
  function makeCallbacks(runId, sessionIdHint = null, continuationToken = null) {
    const streamKey = streamingKeyRef.current;
    const isContinuation = continuationToken !== null;
    // 判定本次回调是否仍属于当前这一轮流
    const isLive = () => (isContinuation
      ? continuationTokenRef.current === continuationToken
      : isCurrentStreamRun(runId));
    // 捕获本次回调对应的 session：用于 title/state 这类 session 级事件的迟到判断。
    // 只要回调到达时仍处于同一个 session，就应当刷新；切换到别的 session 才丢弃。
    const callbackSessionId = sessionIdHint ?? sessionIdRef.current ?? null;
    const isSameSession = () => (sessionIdRef.current ?? null) === callbackSessionId;
    return {
      onDelta(delta) {
        if (!isLive()) return;
        if (isContinuation) {
          const next = continuingTextRef.current + delta;
          continuingTextRef.current = next;
          const parsed = parseContinuationText(next, true);
          if (parsed.options.length > 0) setCurrentOptions(parsed.options);
          setContinuingText(parsed.content);
          return;
        }
        const next = streamingTextRef.current + delta;
        streamingTextRef.current = next;
        const { display, options } = parseNextPromptStream(next, true);
        setStreamingText(display);
        if (options.length > 0) {
          streamingOptionsRef.current = options;
          setCurrentOptions((prev) => (areOptionsEqual(prev, options) ? prev : options));
        }
      },
      onUserSaved(realId) {
        if (!isLive()) return;
        const tempId = tempUserIdRef.current;
        if (!tempId || !realId || tempId === realId) return;
        if (messageListRef.current?.updateMessages) {
          // 保留 _key=tempId 作为稳定 React key，避免 AnimatePresence 把 id 变化当作进出场
          messageListRef.current.updateMessages((prev) =>
            prev.map((m) => m.id === tempId ? { ...m, _key: m._key ?? tempId, id: realId } : m)
          );
        }
        tempUserIdRef.current = realId;
      },
      onDone(assistant, options) {
        if (!isLive()) return;
        if (options?.length) {
          pendingOptionsRef.current = options;
          // 立即渲染选项，不等 onStreamEnd（后者要等 keepSseAlive 异步任务全部完成才触发）
          setCurrentOptions(options);
        }
        // 把本轮激活条目挂到 assistant 上（仅运行时；不入 DB）
        if (assistant && pendingEntriesRef.current.length > 0) {
          assistant = { ...assistant, activated_entries: pendingEntriesRef.current };
        }
        // 立即追加真实消息 + 解锁输入框（同批次渲染，避免流式气泡消失后真实消息尚未出现的闪烁）
        // 续写场景不在此追加，由 finalizeStream 合并内容
        if (assistant && !continuingMessageIdRef.current && messageListRef.current?.appendMessage) {
          messageListRef.current.appendMessage({ ...assistant, _key: streamKey });
          assistantAppendedEarlyRef.current = true;
        } else if (assistant) {
          pendingAssistantRef.current = assistant;
        }
        if (!isContinuation) setGenerating(false);
        startMemoryWriting(isContinuation ? undefined : runId);
      },
      onEntriesActivated(entries) {
        if (!isLive()) return;
        pendingEntriesRef.current = Array.isArray(entries) ? entries : [];
      },
      onDanmaku(comments) {
        if (!isLive()) return;
        const arr = Array.isArray(comments) ? comments.filter((c) => typeof c === 'string' && c.trim()) : [];
        if (arr.length === 0) return;
        // 实时弹幕直接写入弹幕带 store（顶部栏读取）；历史回退由 handleMessagesLoaded 兜底
        setDanmakuBand(toDanmakuBand(arr));
      },
      onSuggestionFallbackStarted() {
        if (!isLive()) return;
        log.warn(`${mode}.suggestion_fallback_started`, null, { toast: '本轮选项缺失，正在补全…' });
      },
      onSuggestionFallbackSucceeded() {
        if (!isLive()) return;
        log.info(`${mode}.suggestion_fallback_succeeded`, null, { toast: '选项补全成功' });
      },
      onSuggestionFallbackFailed() {
        if (!isLive()) return;
        log.error(`${mode}.suggestion_fallback_failed`, null, { toast: '选项补全失败' });
      },
      onAborted(assistant) {
        if (!isLive()) return;
        // 中断事件仅记录 pending，统一由 onStreamEnd 调用 finalizeStream，避免双重 finalize
        if (!isContinuation) {
          pendingOptionsRef.current = [];
          streamingOptionsRef.current = [];
          setCurrentOptions([]);
          streamingTextRef.current = '';
        }
        cancelMemoryWriting();
        if (assistant) pendingAssistantRef.current = assistant;
      },
      onError(err) {
        if (!isLive()) return;
        const partial = isContinuation ? '' : streamingTextRef.current;
        const errMsg = typeof err === 'string' ? err : (err?.message || '生成失败');
        streamingTextRef.current = '';
        setErrorBubble({ partialContent: partial, errorMsg: errMsg });
        if (isContinuation) log.error(`${mode}.continue_failed`, err, { toast: errMsg });
        // 状态收尾交给 onStreamEnd 统一处理，避免第二次 finalize 回退到 refreshMessages 引发重挂载；
        // 这里只做幂等解锁，让输入框不必等到 keepSseAlive 任务结束
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
      },
      onTitleUpdated(title) {
        // title 写入本回调所属的 session：侧边栏始终更新该 session；当前页只在同 session 时同步。
        if (callbackSessionId) sessionListBridge.updateTitle?.(callbackSessionId, title);
        if (isSameSession()) {
          setCurrentSession((prev) => (prev ? { ...prev, title } : prev));
        }
      },
      onStateQueued() {
        if (isSameSession()) signalState('queued');
      },
      onStateUpdated() {
        // 状态是 session 级数据：同 session 内迟到事件（用户已开新一轮）也必须刷新面板，
        // 否则第 N 轮 state_updated 会被丢弃，造成"过了一轮才看到状态更新"。切到别的 session 才丢弃。
        stopMemoryWriting(isContinuation ? undefined : runId);
        if (isSameSession()) signalState('updated');
      },
      onStateUpdateFailed(evt) {
        stopMemoryWriting(isContinuation ? undefined : runId);
        if (isSameSession()) {
          signalState('failed');
          log.error('state.update_failed', evt?.error, { toast: buildPostgenToast(evt, 'state') });
        }
      },
      onPostprocessFailed(evt) {
        stopMemoryWriting(isContinuation ? undefined : runId);
        if (!isSameSession()) return;
        log.error(`${mode}.postprocess_failed`, evt?.error, { toast: buildPostgenToast(evt, 'postprocess') });
      },
      onStateRolledBack() {
        if (isSameSession()) signalState('updated');
      },
      onDiaryUpdated() {
        if (!isLive()) return;
        signalState('diary');
      },
      onMemoryRecallStart() {
        if (!isLive()) return;
        startMemoryRecalling();
      },
      onMemoryRecallDone(evt) {
        if (!isLive()) return;
        stopMemoryRecalling();
        setRecallSummary({ recalled: evt?.hit ?? 0, expanded: 0 });
      },
      onMemoryExpandStart() {
        if (!isLive()) return;
        startMemoryExpanding();
      },
      onMemoryExpandDone(evt) {
        if (!isLive()) return;
        stopMemoryExpanding();
        const count = Array.isArray(evt?.expanded) ? evt.expanded.length : 0;
        setRecallSummary((prev) => prev ? { ...prev, expanded: count } : { recalled: 0, expanded: count });
      },
      onChapterTitleUpdated(chapterIndex, title) {
        if (isSameSession()) extraCallbacks.onChapterTitleUpdated?.(chapterIndex, title);
      },
      onSavedRecallDone(evt) {
        if (!isLive()) return;
        extraCallbacks.onSavedRecallDone?.(evt);
      },
      onStreamEnd() {
        if (!isLive()) {
          if (!isContinuation) stopMemoryWriting(runId);
          return;
        }
        finalizeStream(isContinuation ? null : runId);
      },
    };
  }

  // 开新流前的共同准备：作废旧 run、断开断点续传订阅、清错误气泡
  function prepareNewRun() {
    invalidateCurrentRun();
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;
    setErrorBubble(null);
    streamingTextRef.current = '';
  }

  // 发送消息
  async function handleSend(content, attachments) {
    if (generating) return;
    prepareNewRun();

    let targetSessionId = sessionIdRef.current;
    if (!targetSessionId) {
      if (!createSessionOnDemand) return;
      const newSession = await createSessionOnDemand();
      if (!newSession) return;
      enterSession(newSession);
      sessionListBridge.addSession?.(newSession);
      targetSessionId = newSession.id;
    }

    setRecallSummary(null);

    // 乐观追加 user 消息到列表（写作模式允许空输入直接续写，此时不追加）
    if (content) {
      const tempUserMsg = {
        id: `__temp_${Date.now()}`,
        session_id: targetSessionId,
        role: 'user',
        content,
        attachments: null,
        created_at: Date.now(),
      };
      tempUserIdRef.current = tempUserMsg.id;
      if (messageListRef.current?.appendMessage) messageListRef.current.appendMessage(tempUserMsg);
    } else {
      tempUserIdRef.current = null;
    }

    const runId = beginStreamRun();
    setGenerating(true);
    setStreamingText('');

    const inject = pendingDiaryInject;
    setPendingDiaryInject(null);
    stopRef.current = api.send(
      targetSessionId,
      content ?? '',
      attachments,
      makeCallbacks(runId, targetSessionId),
      inject ? { diaryInjection: inject } : {}
    );
  }

  // 停止生成：只通知后端中断，不在前端 abort fetch；
  // 后端会发回 aborted SSE 事件后自然关闭连接，避免前端提前断流导致 refreshMessages 重挂载页面。
  // 例外：后端回报 active=false（该会话已无活动流，典型是服务重启后连接经 dev 代理悬挂、永远等不到 aborted），
  // 此时本地断开并按非主动停止收尾——刷新消息列表，加载完成后由 recoverLiveStream 恢复中断快照。
  function handleStop() {
    streamAbortedRef.current = true;
    const targetSessionId = sessionIdRef.current;
    api.stop(targetSessionId)
      .then((result) => {
        if (result?.active !== false || sessionIdRef.current !== targetSessionId) return;
        streamAbortedRef.current = false;
        if (!stopRef.current && !recoveryStopRef.current) {
          finalizeStream();
          return;
        }
        stopRef.current?.();
        recoveryStopRef.current?.();
      })
      .catch((err) => {
        // 停止请求没送达：生成仍在进行，撤销「主动停止」标记，停止按钮保持可再点
        if (sessionIdRef.current === targetSessionId) streamAbortedRef.current = false;
        log.error('stream.stop_failed', err, { toast: `停止失败，请重试：${err.message || '网络错误'}` });
      });
  }

  // 编辑用户消息并重新生成
  function handleEditMessage(messageId, newContent) {
    const targetSessionId = sessionIdRef.current;
    if (generating || !targetSessionId) return;
    prepareNewRun();

    // 截断消息列表到被编辑消息（含，内容替换）
    if (messageListRef.current?.updateMessages) {
      messageListRef.current.updateMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), { ...prev[idx], content: newContent }];
      });
    }

    const runId = beginStreamRun({ freezeOptions: false });
    setGenerating(true);
    setStreamingText('');
    stopRef.current = api.editAndRegenerate(targetSessionId, messageId, newContent, makeCallbacks(runId, targetSessionId));
  }

  // 从指定消息之前重新生成（截断列表后开流）
  function regenerateFrom(afterMessageId, truncateTo, targetSessionId) {
    messageListRef.current?.updateMessages?.(truncateTo);
    const runId = beginStreamRun({ freezeOptions: false });
    setGenerating(true);
    setStreamingText('');
    stopRef.current = api.regenerate(targetSessionId, afterMessageId, makeCallbacks(runId, targetSessionId));
  }

  // 重新生成指定 assistant 消息
  function handleRegenerateMessage(assistantMessageId) {
    const targetSessionId = sessionIdRef.current;
    if (generating || !targetSessionId) return;
    prepareNewRun();

    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    const idx = msgs.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;

    regenerateFrom(msgs[idx - 1].id, (prev) => {
      const i = prev.findIndex((m) => m.id === assistantMessageId);
      return i >= 0 ? prev.slice(0, i) : prev;
    }, targetSessionId);
  }

  // 重试：删除最后一条 assistant 消息并重新生成
  function handleRetryLast() {
    const targetSessionId = sessionIdRef.current;
    if (generating || !targetSessionId) return;
    prepareNewRun();

    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    let lastIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') { lastIdx = i; break; }
    }
    if (lastIdx <= 0) return;
    regenerateFrom(msgs[lastIdx - 1].id, (prev) => prev.slice(0, lastIdx), targetSessionId);
  }

  // 错误后重试：丢掉末尾残留的 assistant，从最后一条 user 消息重新生成
  function handleRetryAfterError() {
    const targetSessionId = sessionIdRef.current;
    if (generating || !targetSessionId) return;
    prepareNewRun();

    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    let end = msgs.length;
    while (end > 0 && msgs[end - 1].role === 'assistant') end--;
    const trimmed = msgs.slice(0, end);
    const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    regenerateFrom(lastUser.id, () => trimmed, targetSessionId);
  }

  // 续写最后一条 assistant 消息
  function handleContinue() {
    const targetSessionId = sessionIdRef.current;
    if (generating || !targetSessionId) return;
    prepareNewRun();

    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;

    clearOptionsState();
    const continuationToken = continuationTokenRef.current + 1;
    continuationTokenRef.current = continuationToken;
    continuingMessageIdRef.current = lastAssistant.id;
    continuingTextRef.current = '';
    setContinuingMessageId(lastAssistant.id);
    setContinuingText('');
    setGenerating(true);

    stopRef.current = api.continueGeneration(
      targetSessionId,
      makeCallbacks(null, targetSessionId, continuationToken)
    );
  }

  // AI 代拟用户消息，填入输入框
  async function handleImpersonate() {
    const targetSessionId = sessionIdRef.current;
    if (generating || impersonating || !targetSessionId) return;
    setImpersonating(true);
    try {
      const { content } = await api.impersonate(targetSessionId);
      if (content) {
        const filled = inputBoxRef.current?.fillText(content, { focus: false });
        if (filled === false) {
          const confirmed = window.confirm('输入框已有内容，是否用 AI 代写结果覆盖？');
          if (confirmed) inputBoxRef.current?.fillText(content, { force: true, focus: true });
        }
      }
    } catch (err) {
      log.error(`${mode}.proxy_failed`, err, { toast: err.message || '代拟失败' });
    } finally {
      setImpersonating(false);
    }
  }

  // 编辑 AI 消息（不重新生成，仅更新内容并重新生成 summary）
  async function handleEditAssistantMessage(messageId, newContent) {
    const targetSessionId = sessionIdRef.current;
    if (generating || !targetSessionId) return;
    if (messageListRef.current?.updateMessages) {
      messageListRef.current.updateMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, content: newContent } : m)
      );
    }
    try {
      await api.editAssistant(targetSessionId, messageId, newContent);
      log.info(`${mode}.message.saved`, null, { toast: '已保存，摘要更新中…' });
    } catch (err) {
      log.error(`${mode}.message.save_failed`, err, { toast: err.message || '保存失败' });
      refreshMessages();
    }
  }

  // 删除消息（及之后所有内容），回滚状态栏
  async function handleDeleteMessage(messageId) {
    const targetSessionId = sessionIdRef.current;
    if (generating || !targetSessionId) return;
    try {
      await deleteMessageApi(targetSessionId, messageId);
      if (messageListRef.current?.updateMessages) {
        messageListRef.current.updateMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx === -1) return prev;
          return prev.slice(0, idx);
        });
      }
      clearOptionsState();
      selectedOptionIndexRef.current = -1;
      setOptionCollapsed(false);
      signalState('updated');
      signalState('diary');
    } catch (err) {
      log.error(`${mode}.message.delete_failed`, err, { toast: err.message || '删除失败' });
    }
  }

  // 重新生成会话标题
  async function handleRetitle() {
    const targetSessionId = sessionIdRef.current;
    if (generating || !targetSessionId) return;
    try {
      log.info(`${mode}.title.generating`, null, { toast: '标题生成中…' });
      const { title } = await api.retitle(targetSessionId);
      if (title) {
        setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        sessionListBridge.updateTitle?.(targetSessionId, title);
        log.info(`${mode}.title.updated`, null, { toast: `标题已更新：${title}` });
      } else {
        log.error(`${mode}.title.generate_failed`, null, { toast: '标题生成失败' });
      }
    } catch (err) {
      log.error(`${mode}.title.generate_failed`, err, { toast: err.message || '标题生成失败' });
    }
  }

  // 选项点击：记录选中下标后按选项文本发送
  function selectOption(text, idx) {
    selectedOptionIndexRef.current = idx;
    handleSend(text, []);
  }

  // 消息列表加载完成：恢复尾条选项 + 触发断点续传探测
  function handleMessagesLoaded(msgs) {
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
    const opts = lastAssistant?.next_options;
    if (Array.isArray(opts) && opts.length > 0) {
      setCurrentOptions(opts);
      setOptionCollapsed(false);
    }
    // 弹幕带反映本会话最新一轮的弹幕（加载/刷新历史时可靠触发，不依赖渲染期派生）
    setDanmakuBand(toDanmakuBand(latestAssistantDanmaku(msgs)));
    void recoverLiveStream(sessionIdRef.current);
  }

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
    handleSessionDelete,
    handleSend,
    handleStop,
    handleEditMessage,
    handleRegenerateMessage,
    handleEditAssistantMessage,
    handleDeleteMessage,
    handleContinue,
    handleImpersonate,
    handleRetryLast,
    handleRetryAfterError,
    handleRetitle,
    selectOption,
    handleMessagesLoaded,
  };
}
