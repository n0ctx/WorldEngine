import { useEffect, useRef, useState } from 'react';
import {
  createWritingSession,
  generate,
  stopGeneration,
  continueGeneration,
  regenerateWriting,
  editAndRegenerateWriting,
  editWritingAssistantMessage,
  impersonateWriting,
  retitleWritingSession,
  recoverWritingStream,
  subscribeWritingStream,
} from '../../../core/api/writing-sessions.js';
import { getChapterTitles, updateChapterTitle, retitleChapter } from '../../../core/api/chapter-titles.js';
import { deleteMessage as deleteMessageApi } from '../../../core/api/sessions.js';
import { log } from '../../../core/utils/logger.js';
import { buildPostgenToast } from '../../../core/api/postgen-error-toast.js';
import { writingSessionListBridge } from '../../../core/utils/session-list-bridge.js';
import { parseNextPromptStream, parseContinuationText } from '../../../core/utils/next-prompt.js';
import { RESTART_INTERRUPTED_ERROR } from '../../../core/utils/constants.js';

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

// writing 页流式收发 / 中断 / 续写 / 选项 / 章节标题 / 断点恢复 + 会话切换运行时。
// 与 session-view（currentSession / messageListKey / chapterTitles / 各 state tick）耦合不可分，故一并收口。
// init / TopBar hint / persona 加载留在页面，借 enterSession & currentSession 协调。
// 入参：worldId（写作 API 必需）、messageListRef / inputBoxRef、optionCollapsedRef（页面持有的折叠态 ref，
//      渲染期读取须在页面本地 ref 上以满足 react-hooks/refs）、memory（记忆指示器 hook 返回值）。
export function useWritingStream({ worldId, messageListRef, inputBoxRef, optionCollapsedRef, memory }) {
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

  const [currentSession, setCurrentSession] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingKey, setStreamingKey] = useState('__ws_stream_init__');
  const [continuingMessageId, setContinuingMessageId] = useState(null);
  const [continuingText, setContinuingText] = useState('');
  const [impersonating, setImpersonating] = useState(false);
  const [stateTick, setStateTick] = useState(0);
  const [diaryTick, setDiaryTick] = useState(0);
  const [stateQueuedTick, setStateQueuedTick] = useState(0);
  const [stateFailedTick, setStateFailedTick] = useState(0);
  // saved nearby 召回判定结果（驱动右侧面板自动展开/收起 saved 角色 state）
  // hits=null 表示尚未收到本轮事件（保留之前的展开状态）；tick 在每次事件递增，触发子组件应用
  const [savedRecallTick, setSavedRecallTick] = useState(0);
  const [savedRecallHits, setSavedRecallHits] = useState(null);
  const applySavedRecall = (evt) => {
    setSavedRecallHits(Array.isArray(evt?.ids) ? evt.ids : []);
    setSavedRecallTick((t) => t + 1);
  };
  const [messageListKey, setMessageListKey] = useState(0);
  const [error, setError] = useState(null);

  const stopRef = useRef(null);
  const recoveryStopRef = useRef(null);
  const streamingTextRef = useRef('');
  const streamingKeyRef = useRef('__ws_stream_init__');
  const continuingMessageIdRef = useRef(null);
  const continuingTextRef = useRef('');
  const continuationTokenRef = useRef(0);
  const pendingAssistantRef = useRef(null);
  const assistantAppendedEarlyRef = useRef(false);
  const pendingOptionsRef = useRef([]);
  // 本轮 SSE 推送的激活条目（onDone 时附加到 assistant 上，仅运行时展示）
  const pendingEntriesRef = useRef([]);
  // 普通生成/重生成的 run id；旧 SSE 收尾不得覆盖新一轮状态
  const streamRunIdRef = useRef(0);
  // 用户主动点击停止时置 true；防止无内容时 onStreamEnd 兜底触发 refreshMessages
  const streamAbortedRef = useRef(false);
  const currentSessionRef = useRef(null);
  // 本轮乐观追加的 user 消息 temp id（用于收到 user_saved 后原地替换为真实 id）
  const tempUserIdRef = useRef(null);
  const recoveryToastKeyRef = useRef('');

  const [currentOptions, setCurrentOptions] = useState([]);
  const currentOptionsRef = useRef([]);
  const selectedOptionIndexRef = useRef(-1);
  const [pendingDiaryInject, setPendingDiaryInject] = useState(null);
  // chapterTitles: { [chapterIndex]: { title, is_default } }
  const [chapterTitles, setChapterTitles] = useState({});

  function clearOptionsState() {
    pendingOptionsRef.current = [];
    setCurrentOptions([]);
    optionCollapsedRef.current = false;
  }

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    currentOptionsRef.current = currentOptions;
  }, [currentOptions]);

  useEffect(() => {
    return () => {
      invalidateCurrentRun();
      recoveryStopRef.current?.();
      clearOptionsState();
    };
    // 仅在卸载时清理本组件的流与订阅；这些命令式入口稳定，无需进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshMessages() {
    setMessageListKey((k) => k + 1);
  }

  async function enterSession(session) {
    invalidateCurrentRun();
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;
    clearOptionsState();
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    streamingTextRef.current = '';
    continuingMessageIdRef.current = null;
    continuingTextRef.current = '';
    setContinuingMessageId(null);
    setContinuingText('');
    setError(null);
    setChapterTitles({});
    clearMemoryState();
    refreshMessages();

    // 加载章节标题（异步，不阻塞进入会话）
    getChapterTitles(worldId, session.id)
      .then((arr) => {
        const map = {};
        for (const row of arr) map[row.chapter_index] = { title: row.title, is_default: row.is_default };
        setChapterTitles(map);
      })
      .catch(() => {});
  }

  function handleSessionCreate(session) {
    enterSession(session);
  }

  function handleSessionDelete(deletedId, remaining) {
    if (currentSessionRef.current?.id === deletedId) {
      if (remaining.length > 0) {
        enterSession(remaining[0]);
      } else {
        createWritingSession(worldId).then((s) => {
          writingSessionListBridge.addSession?.(s);
          enterSession(s);
        }).catch(() => {});
      }
    }
  }

  function handleStop() {
    streamAbortedRef.current = true;
    stopGeneration(worldId, currentSessionRef.current?.id).catch(() => {});
  }

  function showRecoveryToast(task) {
    const key = `${task.id}:${task.updatedAt ?? ''}:${task.status}:${task.error ?? ''}`;
    if (recoveryToastKeyRef.current === key) return;
    recoveryToastKeyRef.current = key;
    if (task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR) {
      log.warn('writing.resume.interrupted', null, { toast: '已恢复中断前内容，旧生成因服务重启已停止' });
      return;
    }
    log.info('writing.resume.reconnected', null, { toast: '已恢复生成连接' });
  }

  function applyRecoveredSnapshot(task) {
    const interrupted = task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR;
    const nextMessages = interrupted ? materializeInterruptedMessages(task) : (task.messages ?? []);
    messageListRef.current?.updateMessages?.(() => nextMessages);
    pendingOptionsRef.current = Array.isArray(task.options) ? task.options : [];
    if (Array.isArray(task.options) && task.options.length > 0) {
      setCurrentOptions(task.options);
    } else {
      setCurrentOptions([]);
    }
    if (task.continuingMessageId && !interrupted) {
      continuingMessageIdRef.current = task.continuingMessageId;
      continuingTextRef.current = task.continuingText || '';
      setContinuingMessageId(task.continuingMessageId);
      setContinuingText(parseContinuationText(task.continuingText || '').content);
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
      setError({ partialContent: '', errorMsg: task.error || '生成失败' });
    }
    setGenerating(!interrupted);
  }

  async function recoverLiveStream(sessionId) {
    if (!sessionId) return;
    try {
      const task = await recoverWritingStream(worldId, sessionId);
      if (!task || currentSessionRef.current?.id !== sessionId) return;
      applyRecoveredSnapshot(task);
      showRecoveryToast(task);
      if (task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR) return;
      recoveryStopRef.current?.();
      const runId = streamRunIdRef.current + 1;
      streamRunIdRef.current = runId;
      recoveryStopRef.current = subscribeWritingStream(worldId, sessionId, {
        ...makeStreamCallbacks(runId, sessionId),
        onStreamSnapshot: (snapshot) => {
          if (snapshot && currentSessionRef.current?.id === sessionId) {
            applyRecoveredSnapshot(snapshot);
          }
        },
      });
    } catch (err) {
      log.error('writing.resume.failed', err, { toast: err.message || '断点续传恢复失败' });
    }
  }

  function beginStreamingKey() {
    const k = `__ws_stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}__`;
    streamingKeyRef.current = k;
    setStreamingKey(k);
    return k;
  }

  function beginStreamRun({ freezeOptions = true } = {}) {
    // 重新生成 / 编辑重生场景下，选项属于即将被替换的消息，不应冻结到上一条 assistant
    if (freezeOptions && currentOptionsRef.current.length > 0) {
      messageListRef.current?.freezeOptions?.(currentOptionsRef.current, selectedOptionIndexRef.current, optionCollapsedRef.current);
      selectedOptionIndexRef.current = -1;
      optionCollapsedRef.current = false;
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
  }

  function isCurrentStreamRun(runId) {
    return streamRunIdRef.current === runId;
  }

  function invalidateCurrentRun() {
    streamRunIdRef.current += 1;
  }

  // sessionIdHint：调用方显式传入回调归属的 sessionId（应对 ref 同步未到位的场景）；
  // 省略时回退到 currentSessionRef。
  function makeStreamCallbacks(runId, sessionIdHint = null) {
    const streamKey = streamingKeyRef.current;
    // 捕获本次回调对应的 session：title/state 这类 session 级事件的迟到判断；
    // 切到别的 session 才丢弃，同 session 内迟到（用户已开新一轮）也必须刷新。
    const callbackSessionId = sessionIdHint ?? currentSessionRef.current?.id ?? null;
    const isSameSession = () => (currentSessionRef.current?.id ?? null) === callbackSessionId;
    return {
      onDelta(delta) {
        if (!isCurrentStreamRun(runId)) return;
        const next = streamingTextRef.current + delta;
        streamingTextRef.current = next;
        const { display, options } = parseNextPromptStream(next, true);
        setStreamingText(display);
        if (options.length > 0) setCurrentOptions(options);
      },
      onUserSaved(realId) {
        if (!isCurrentStreamRun(runId)) return;
        const tempId = tempUserIdRef.current;
        if (!tempId || !realId || tempId === realId) return;
        if (messageListRef.current?.updateMessages) {
          messageListRef.current.updateMessages((prev) =>
            prev.map((m) => m.id === tempId ? { ...m, _key: m._key ?? tempId, id: realId } : m)
          );
        }
        tempUserIdRef.current = realId;
      },
      onDone(assistant, options) {
        if (!isCurrentStreamRun(runId)) return;
        if (options?.length) {
          pendingOptionsRef.current = options;
          // 立即渲染选项，不等 onStreamEnd（后者要等 keepSseAlive 异步任务全部完成才触发）
          setCurrentOptions(options);
        }
        if (assistant && pendingEntriesRef.current.length > 0) {
          assistant = { ...assistant, activated_entries: pendingEntriesRef.current };
        }
        // 立即追加真实消息 + 解锁输入框（同批次渲染），避免流式占位消失后真实消息延迟出现的闪烁
        if (assistant && messageListRef.current?.appendMessage) {
          messageListRef.current.appendMessage({ ...assistant, _key: streamKey });
          assistantAppendedEarlyRef.current = true;
        } else if (assistant) {
          pendingAssistantRef.current = assistant;
        }
        setGenerating(false);
        startMemoryWriting(runId);
      },
      onEntriesActivated(entries) {
        if (!isCurrentStreamRun(runId)) return;
        pendingEntriesRef.current = Array.isArray(entries) ? entries : [];
      },
      onSuggestionFallbackStarted() {
        if (!isCurrentStreamRun(runId)) return;
        log.warn('writing.suggestion_fallback_started', null, { toast: '本轮选项缺失，正在补全…' });
      },
      onSuggestionFallbackSucceeded() {
        if (!isCurrentStreamRun(runId)) return;
        log.info('writing.suggestion_fallback_succeeded', null, { toast: '选项补全成功' });
      },
      onSuggestionFallbackFailed() {
        if (!isCurrentStreamRun(runId)) return;
        log.error('writing.suggestion_fallback_failed', null, { toast: '选项补全失败' });
      },
      onAborted(assistant) {
        if (!isCurrentStreamRun(runId)) return;
        pendingOptionsRef.current = [];
        setCurrentOptions([]);
        cancelMemoryWriting();
        if (assistant) pendingAssistantRef.current = assistant;
      },
      onError(msg) {
        if (!isCurrentStreamRun(runId)) return;
        const partial = streamingTextRef.current;
        const errMsg = typeof msg === 'string' ? msg : (msg?.message || '生成失败');
        setError({ partialContent: partial, errorMsg: errMsg });
        streamingTextRef.current = '';
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
      },
      onTitleUpdated(title) {
        // title 写入本回调所属的 session：侧边栏始终用 callbackSessionId 更新；当前页只在同 session 时同步。
        if (callbackSessionId) writingSessionListBridge.updateTitle?.(callbackSessionId, title);
        if (isSameSession()) {
          setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        }
      },
      onChapterTitleUpdated(chapterIndex, title) {
        if (!isSameSession()) return;
        setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title, is_default: 0 } }));
      },
      onStateQueued() {
        if (isSameSession()) setStateQueuedTick((tick) => tick + 1);
      },
      onStateUpdated() {
        // 状态是 session 级数据：同 session 内迟到事件（用户已开新一轮）也必须刷新；切到别的 session 才丢弃。
        stopMemoryWriting(runId);
        if (isSameSession()) setStateTick((tick) => tick + 1);
      },
      onStateUpdateFailed(evt) {
        stopMemoryWriting(runId);
        if (isSameSession()) {
          setStateFailedTick((tick) => tick + 1);
          log.error('state.update_failed', evt?.error, { toast: buildPostgenToast(evt, 'state') });
        }
      },
      onPostprocessFailed(evt) {
        stopMemoryWriting(runId);
        if (!isSameSession()) return;
        log.error('writing.postprocess_failed', evt?.error, {
          toast: buildPostgenToast(evt, 'postprocess'),
        });
      },
      onStateRolledBack() {
        if (isSameSession()) setStateTick((tick) => tick + 1);
      },
      onDiaryUpdated() {
        if (!isCurrentStreamRun(runId)) return;
        setDiaryTick((tick) => tick + 1);
      },
      onMemoryRecallStart() {
        if (!isCurrentStreamRun(runId)) return;
        startMemoryRecalling();
      },
      onMemoryRecallDone(evt) {
        if (!isCurrentStreamRun(runId)) return;
        stopMemoryRecalling();
        const hit = evt?.hit ?? 0;
        setRecallSummary({ recalled: hit, expanded: 0 });
      },
      onMemoryExpandStart() {
        if (!isCurrentStreamRun(runId)) return;
        startMemoryExpanding();
      },
      onMemoryExpandDone(evt) {
        if (!isCurrentStreamRun(runId)) return;
        stopMemoryExpanding();
        const count = Array.isArray(evt?.expanded) ? evt.expanded.length : 0;
        setRecallSummary((prev) => prev ? { ...prev, expanded: count } : { recalled: 0, expanded: count });
      },
      onSavedRecallDone(evt) {
        if (!isCurrentStreamRun(runId)) return;
        applySavedRecall(evt);
      },
      onStreamEnd() {
        if (!isCurrentStreamRun(runId)) {
          stopMemoryWriting(runId);
          return;
        }
        const pending = pendingAssistantRef.current;
        pendingAssistantRef.current = null;
        const alreadyAppended = assistantAppendedEarlyRef.current;
        assistantAppendedEarlyRef.current = false;
        const pendingOptions = pendingOptionsRef.current;
        pendingOptionsRef.current = [];
        const wasAborted = streamAbortedRef.current;
        streamAbortedRef.current = false;
        streamingTextRef.current = '';
        tempUserIdRef.current = null;
        setGenerating(false);
        setStreamingText('');
        stopMemoryWriting(runId);
        stopRef.current = null;
        if (!wasAborted && pendingOptions?.length > 0) setCurrentOptions(pendingOptions);
        if (!alreadyAppended) {
          if (pending && messageListRef.current?.appendMessage) {
            messageListRef.current.appendMessage({ ...pending, _key: streamKey });
          } else if (!wasAborted) {
            refreshMessages();
          }
        }
      },
    };
  }

  function handleSend(content) {
    const session = currentSessionRef.current;
    if (!session || generating) return;
    invalidateCurrentRun();
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;

    setError(null);
    clearOptionsState();

    if (content) {
      const optimisticMsg = {
        id: `__optimistic_${Date.now()}`,
        session_id: session.id,
        role: 'user',
        content,
        attachments: null,
        created_at: Date.now(),
      };
      tempUserIdRef.current = optimisticMsg.id;
      if (messageListRef.current?.appendMessage) messageListRef.current.appendMessage(optimisticMsg);
    } else {
      tempUserIdRef.current = null;
    }

    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';
    const inject = pendingDiaryInject;
    setPendingDiaryInject(null);
    const runId = beginStreamRun();
    stopRef.current = generate(worldId, session.id, content || '', makeStreamCallbacks(runId, session.id), inject ? { diaryInjection: inject } : {});
  }

  function handleEditMessage(messageId, newContent) {
    const session = currentSessionRef.current;
    if (!session || generating) return;
    invalidateCurrentRun();
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;
    setError(null);
    if (messageListRef.current?.updateMessages) {
      messageListRef.current.updateMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), { ...prev[idx], content: newContent }];
      });
    }
    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';
    const runId = beginStreamRun({ freezeOptions: false });
    stopRef.current = editAndRegenerateWriting(worldId, session.id, messageId, newContent, makeStreamCallbacks(runId, session.id));
  }

  function doRegenerate(assistantMessageId) {
    const session = currentSessionRef.current;
    if (!session || generating) return;
    invalidateCurrentRun();
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;
    setError(null);
    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    const idx = msgs.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;
    const afterMessageId = msgs[idx - 1].id;
    messageListRef.current?.updateMessages?.((prev) => {
      const i = prev.findIndex((m) => m.id === assistantMessageId);
      return i >= 0 ? prev.slice(0, i) : prev;
    });
    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';
    const runId = beginStreamRun({ freezeOptions: false });
    stopRef.current = regenerateWriting(worldId, session.id, afterMessageId, makeStreamCallbacks(runId, session.id));
  }

  function handleRegenerateMessage(assistantMessageId) {
    const session = currentSessionRef.current;
    if (!session || generating) return;
    doRegenerate(assistantMessageId);
  }

  // 错误后重试:从最后一条 user 消息重新生成(出错时尚未追加 assistant)
  function handleRetryAfterError() {
    const session = currentSessionRef.current;
    if (!session || generating) return;
    invalidateCurrentRun();
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;
    setError(null);
    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    let lastUserId = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserId = msgs[i].id; break; }
    }
    if (!lastUserId) return;
    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';
    const runId = beginStreamRun({ freezeOptions: false });
    stopRef.current = regenerateWriting(worldId, session.id, lastUserId, makeStreamCallbacks(runId, session.id));
  }

  async function handleEditAssistantMessage(messageId, newContent) {
    if (generating) return;
    const session = currentSessionRef.current;
    if (!session) return;
    if (messageListRef.current?.updateMessages) {
      messageListRef.current.updateMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, content: newContent } : m)
      );
    }
    try {
      await editWritingAssistantMessage(worldId, session.id, messageId, newContent);
    } catch (err) {
      setError({ partialContent: '', errorMsg: err.message || '保存失败' });
      refreshMessages();
    }
  }

  async function handleDeleteMessage(messageId) {
    if (generating) return;
    const session = currentSessionRef.current;
    if (!session) return;
    try {
      await deleteMessageApi(session.id, messageId);
      if (messageListRef.current?.updateMessages) {
        messageListRef.current.updateMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx === -1) return prev;
          return prev.slice(0, idx);
        });
      }
      clearOptionsState();
      selectedOptionIndexRef.current = -1;
      optionCollapsedRef.current = false;
      setStateTick((tick) => tick + 1);
      setDiaryTick((tick) => tick + 1);
    } catch (err) {
      setError({ partialContent: '', errorMsg: err.message || '删除失败' });
    }
  }

  function handleContinue() {
    const session = currentSessionRef.current;
    if (!session || generating) return;
    invalidateCurrentRun();
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;

    clearOptionsState();

    // 找最后一条 assistant 消息 id
    let lastAssistantId = null;
    if (messageListRef.current?.messagesRef) {
      const msgs = messageListRef.current.messagesRef.current ?? [];
      const last = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (last) lastAssistantId = last.id;
    }
    if (!lastAssistantId) return;

    setError(null);
    const continuationToken = continuationTokenRef.current + 1;
    continuationTokenRef.current = continuationToken;
    continuingMessageIdRef.current = lastAssistantId;
    continuingTextRef.current = '';
    setContinuingMessageId(lastAssistantId);
    setContinuingText('');
    setGenerating(true);

    const finishContinuation = () => {
      const contId = continuingMessageIdRef.current;
      const contText = parseContinuationText(continuingTextRef.current).content;
      const pendingAssistant = pendingAssistantRef.current;
      pendingAssistantRef.current = null;
      if (contId && messageListRef.current?.updateMessages) {
        messageListRef.current.updateMessages((prev) =>
          prev.map((m) => {
            if (m.id !== contId) return m;
            if (pendingAssistant?.content) return { ...m, ...pendingAssistant, content: pendingAssistant.content, _key: m._key ?? m.id };
            if (!contText) return m;
            return { ...m, content: m.content + '\n\n' + contText.replace(/^\n+/, '') };
          })
        );
      }
      const finalOptions = pendingOptionsRef.current;
      pendingOptionsRef.current = [];
      if (finalOptions.length > 0) setCurrentOptions(finalOptions);
      continuingMessageIdRef.current = null;
      continuingTextRef.current = '';
      setContinuingMessageId(null);
      setContinuingText('');
      setGenerating(false);
      stopRef.current = null;
    };

    const continuationSessionId = session.id;
    stopRef.current = continueGeneration(worldId, session.id, {
      onDelta(delta) {
        if (continuationTokenRef.current !== continuationToken) return;
        const next = continuingTextRef.current + delta;
        continuingTextRef.current = next;
        const parsed = parseContinuationText(next);
        if (parsed.options.length > 0) setCurrentOptions(parsed.options);
        setContinuingText(parsed.content);
      },
      onDone(assistant, options) {
        if (continuationTokenRef.current !== continuationToken) return;
        if (assistant) pendingAssistantRef.current = assistant;
        if (options?.length) {
          pendingOptionsRef.current = options;
          setCurrentOptions(options);
        }
        startMemoryWriting();
      },
      onAborted(assistant) {
        if (continuationTokenRef.current !== continuationToken) return;
        cancelMemoryWriting();
        if (assistant) pendingAssistantRef.current = assistant;
      },
      onError(msg) {
        if (continuationTokenRef.current !== continuationToken) return;
        setError({ partialContent: '', errorMsg: typeof msg === 'string' ? msg : (msg?.message || '生成失败') });
        continuingMessageIdRef.current = null;
        continuingTextRef.current = '';
        setContinuingMessageId(null);
        setContinuingText('');
        setGenerating(false);
        stopRef.current = null;
      },
      onStateQueued() {
        if (currentSessionRef.current?.id === continuationSessionId) {
          setStateQueuedTick((tick) => tick + 1);
        }
      },
      onStateUpdated() {
        stopMemoryWriting();
        if (currentSessionRef.current?.id === continuationSessionId) {
          setStateTick((tick) => tick + 1);
        }
      },
      onStateUpdateFailed(evt) {
        stopMemoryWriting();
        if (currentSessionRef.current?.id === continuationSessionId) {
          setStateFailedTick((tick) => tick + 1);
          log.error('state.update_failed', evt?.error, { toast: buildPostgenToast(evt, 'state') });
        }
      },
      onPostprocessFailed(evt) {
        stopMemoryWriting();
        if (currentSessionRef.current?.id !== continuationSessionId) return;
        log.error('writing.postprocess_failed', evt?.error, {
          toast: buildPostgenToast(evt, 'postprocess'),
        });
      },
      onSuggestionFallbackStarted() {
        if (continuationTokenRef.current !== continuationToken) return;
        log.warn('writing.suggestion_fallback_started', null, { toast: '本轮选项缺失，正在补全…' });
      },
      onSuggestionFallbackSucceeded() {
        if (continuationTokenRef.current !== continuationToken) return;
        log.info('writing.suggestion_fallback_succeeded', null, { toast: '选项补全成功' });
      },
      onSuggestionFallbackFailed() {
        if (continuationTokenRef.current !== continuationToken) return;
        log.error('writing.suggestion_fallback_failed', null, { toast: '选项补全失败' });
      },
      onDiaryUpdated() {
        if (continuationTokenRef.current !== continuationToken) return;
        setDiaryTick((tick) => tick + 1);
      },
      onMemoryRecallStart() {
        startMemoryRecalling();
      },
      onMemoryRecallDone(evt) {
        stopMemoryRecalling();
        const hit = evt?.hit ?? 0;
        setRecallSummary({ recalled: hit, expanded: 0 });
      },
      onMemoryExpandStart() {
        startMemoryExpanding();
      },
      onMemoryExpandDone(evt) {
        stopMemoryExpanding();
        const count = Array.isArray(evt?.expanded) ? evt.expanded.length : 0;
        setRecallSummary((prev) => prev ? { ...prev, expanded: count } : { recalled: 0, expanded: count });
      },
      onSavedRecallDone(evt) {
        if (continuationTokenRef.current !== continuationToken) return;
        applySavedRecall(evt);
      },
      onStreamEnd() {
        if (continuationTokenRef.current !== continuationToken) return;
        stopMemoryWriting();
        finishContinuation();
      },
    });
  }

  async function handleImpersonate() {
    const session = currentSessionRef.current;
    if (!session || generating || impersonating) return;
    setImpersonating(true);
    try {
      const { content } = await impersonateWriting(worldId, session.id);
      if (content) {
        const filled = inputBoxRef.current?.fillText(content, { focus: false });
        if (filled === false) {
          const confirmed = window.confirm('输入框已有内容，是否用 AI 代写结果覆盖？');
          if (confirmed) inputBoxRef.current?.fillText(content, { force: true, focus: true });
        }
      }
    } catch (err) {
      log.error('writing.proxy_failed', err, { toast: err.message || '代拟失败' });
    } finally {
      setImpersonating(false);
    }
  }

  // 重新生成会话标题（修复 /title 命令）
  async function handleRetitle() {
    const session = currentSessionRef.current;
    if (generating || !session) return;
    try {
      const { title } = await retitleWritingSession(worldId, session.id);
      if (title) {
        setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        writingSessionListBridge.updateTitle?.(session.id, title);
      }
    } catch (err) {
      log.error('writing.title.generate_failed', err, { toast: err.message || '标题生成失败' });
    }
  }

  // 用户编辑章节标题（不调用 LLM）
  async function handleChapterEdit(chapterIndex, newTitle) {
    const session = currentSessionRef.current;
    if (generating || !session) return;
    try {
      await updateChapterTitle(worldId, session.id, chapterIndex, newTitle);
      setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title: newTitle, is_default: 0 } }));
    } catch (err) {
      log.error('writing.chapter.title.save_failed', err, { toast: err.message || '章节标题保存失败' });
    }
  }

  // LLM 重新生成章节标题
  async function handleChapterRetitle(chapterIndex) {
    const session = currentSessionRef.current;
    if (generating || !session) return;
    try {
      const { title } = await retitleChapter(worldId, session.id, chapterIndex);
      if (title) {
        setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title, is_default: 0 } }));
      }
    } catch (err) {
      log.error('writing.chapter.title.generate_failed', err, { toast: err.message || '章节标题生成失败' });
    }
  }

  // 选项点击：记录选中下标后按选项文本发送
  function selectOption(text, idx) {
    selectedOptionIndexRef.current = idx;
    handleSend(text);
  }

  // 消息列表加载完成：恢复尾条选项 + 触发断点续传探测
  function handleMessagesLoaded(msgs) {
    const lastAsst = [...msgs].reverse().find((m) => m.role === 'assistant');
    const opts = lastAsst?.next_options;
    if (Array.isArray(opts) && opts.length > 0) {
      setCurrentOptions(opts);
      optionCollapsedRef.current = false;
    }
    void recoverLiveStream(currentSessionRef.current?.id ?? null);
  }

  return {
    currentSession,
    generating,
    streamingText,
    streamingKey,
    continuingMessageId,
    continuingText,
    error,
    currentOptions,
    setCurrentOptions,
    chapterTitles,
    messageListKey,
    pendingDiaryInject,
    setPendingDiaryInject,
    impersonating,
    stateTick,
    diaryTick,
    stateQueuedTick,
    stateFailedTick,
    savedRecallTick,
    savedRecallHits,
    clearOptionsState,
    enterSession,
    handleSessionCreate,
    handleSessionDelete,
    handleStop,
    handleSend,
    handleEditMessage,
    handleRegenerateMessage,
    handleRetryAfterError,
    handleEditAssistantMessage,
    handleDeleteMessage,
    handleContinue,
    handleImpersonate,
    handleRetitle,
    handleChapterEdit,
    handleChapterRetitle,
    selectOption,
    handleMessagesLoaded,
  };
}
