import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { syncDiaryTimeField } from '../../api/world-state-fields.js';
import { useAppModeStore } from '../../store/appMode.js';
import { SETTINGS_MODE } from '../../components/settings/SettingsConstants';
import { refreshCustomCss } from '../../api/custom-css-snippets.js';
import { getConfig } from '../../api/config.js';
import { useDisplaySettingsStore } from '../../store/displaySettings.js';
import { getPersona, getPersonaById } from '../../api/personas.js';
import useStore from '../../store/index.js';
import {
  listWritingSessions,
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
} from '../../api/writing-sessions.js';
import { getChapterTitles, updateChapterTitle, retitleChapter } from '../../api/chapter-titles.js';
import { deleteMessage as deleteMessageApi, getSession } from '../../api/sessions.js';
import PageLayout from '../../core/layout/PageLayout.jsx';
import NearbyPanel from './components/NearbyPanel.jsx';
import MessageList from '../../components/chat/MessageList.jsx';
import InputBox from '../../components/chat/InputBox.jsx';
import WritingSessionList from './components/WritingSessionList.jsx';
import LongTermMemoryModal from '../../components/session/LongTermMemoryModal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { AnimatePresence } from 'framer-motion';
import { log } from '../../utils/logger.js';
import { writingSessionListBridge } from '../../utils/session-list-bridge.js';
import { parseNextPromptStream, parseContinuationText } from '../../utils/next-prompt.js';
import { RESTART_INTERRUPTED_ERROR } from '../../utils/constants.js';

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

export default function WritingSpacePage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const setAppMode = useAppModeStore((s) => s.setAppMode);
  const currentWritingSessionId = useStore((s) => s.currentWritingSessionId);
  const setCurrentWritingSessionId = useStore((s) => s.setCurrentWritingSessionId);
  const setCurrentWritingModelPricing = useDisplaySettingsStore((s) => s.setCurrentWritingModelPricing);
  const setShowTokenUsage = useDisplaySettingsStore((s) => s.setShowTokenUsage);

  const [ltmEnabled, setLtmEnabled] = useState(false);
  useEffect(() => {
    getConfig().then((c) => {
      setShowTokenUsage(c.ui?.show_token_usage === true);
      const writingModel = c.writing?.llm?.model_pricing ?? null;
      setCurrentWritingModelPricing(writingModel);
      setLtmEnabled(c.writing?.long_term_memory_enabled === true);
    });
  }, [setCurrentWritingModelPricing, setShowTokenUsage]);

  useEffect(() => {
    setAppMode(SETTINGS_MODE.WRITING);
    refreshCustomCss(SETTINGS_MODE.WRITING);
    return () => {
      setAppMode(SETTINGS_MODE.CHAT);
      refreshCustomCss(SETTINGS_MODE.CHAT);
    };
  }, [setAppMode]);

  const [persona, setPersona] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [ltmOpen, setLtmOpen] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingKey, setStreamingKey] = useState('__ws_stream_init__');
  const [continuingMessageId, setContinuingMessageId] = useState(null);
  const [continuingText, setContinuingText] = useState('');
  const [impersonating, setImpersonating] = useState(false);
  const [stateTick, setStateTick] = useState(0);
  const [diaryTick, setDiaryTick] = useState(0);
  const [stateQueuedTick, setStateQueuedTick] = useState(0);
  const [stateFailedTick, setStateFailedTick] = useState(0);
  const [messageListKey, setMessageListKey] = useState(0);
  const [error, setError] = useState(null);
  const [memoryRecalling, setMemoryRecalling] = useState(false);
  const [memoryExpanding, setMemoryExpanding] = useState(false);
  const [memoryWriting, setMemoryWriting] = useState(false);
  const [recallSummary, setRecallSummary] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState(null);
  const [initRetryToken, setInitRetryToken] = useState(0);

  const inputBoxRef = useRef(null);
  const messageListRef = useRef(null);
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
  const memoryRecallingStartRef = useRef(null);
  const memoryExpandingStartRef = useRef(null);
  const memoryWritingStartRef = useRef(null);
  const memoryWritingRunIdRef = useRef(null);
  const memoryRecallingTimerRef = useRef(null);
  const memoryExpandingTimerRef = useRef(null);
  const memoryWritingTimerRef = useRef(null);
  const recallSummaryTimerRef = useRef(null);
  const recoveryToastKeyRef = useRef('');

  const [currentOptions, setCurrentOptions] = useState([]);
  const currentOptionsRef = useRef([]);
  const selectedOptionIndexRef = useRef(-1);
  const optionCollapsedRef = useRef(false);
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
    if (!worldId) return;
    const timeoutId = setTimeout(() => {
      clearOptionsState();
      // writing session 自带 persona_id；session 加载完成后再由专门 effect 同步 persona 头像
      // 此处先按世界 active persona 兜底渲染，避免顶栏闪空
      getPersona(worldId).then(setPersona).catch(() => {});
      syncDiaryTimeField(worldId).catch(() => {});
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [worldId]);

  // session 切换时，按 session.persona_id 重新加载 persona 头像/名字
  useEffect(() => {
    const personaId = currentSession?.persona_id;
    if (!personaId) return;
    getPersonaById(personaId).then(setPersona).catch(() => {});
  }, [currentSession?.persona_id]);

  useEffect(() => {
    return () => {
      invalidateCurrentRun();
      recoveryStopRef.current?.();
      clearOptionsState();
    };
  }, []);

  // 初始化：加载或自动创建第一个会话
  // 若 currentWritingSessionId 给了目标 session（来自 TopBar「会话」入口），优先选它；
  // 命中失败/无 hint 时落到 sessions[0]（列表已按 updated_at DESC 排序，即最新一条）。
  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setIsInitializing(true);
      setInitError(null);
    });
    listWritingSessions(worldId).then((sessions) => {
      if (cancelled) return;
      const hintId = useStore.getState().currentWritingSessionId;
      if (sessions.length === 0) {
        createWritingSession(worldId).then((s) => {
          if (cancelled) return;
          writingSessionListBridge.addSession?.(s);
          enterSession(s);
          setIsInitializing(false);
        }).catch((err) => {
          if (cancelled) return;
          log.error('writing.session.create_failed', err, { toast: err.message || '创建写作会话失败' });
          setInitError('创建写作会话失败，请重试');
          setIsInitializing(false);
        });
        return;
      }
      const target = (hintId && sessions.find((s) => s.id === hintId)) || sessions[0];
      enterSession(target);
      setIsInitializing(false);
    }).catch((err) => {
      if (cancelled) return;
      log.error('writing.session.list_failed', err, { toast: err.message || '加载写作会话失败' });
      setInitError('加载写作会话失败，请重试');
      setIsInitializing(false);
    });
    return () => {
      cancelled = true;
    };
    // enterSession is intentionally kept as the page-level imperative transition used by stream callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, initRetryToken]);

  // 已在写作页时 TopBar 再次下发「会话」hint：切到目标 session 后清空 hint。
  // 与 init 效应配合：若 hint 在 mount 时已被 init 消费命中，进入此效应后 ids 相同直接清 hint；
  // 不一致（用户在另一会话编辑期间，目标 session 的 updated_at 已变成更新一条）则按 id 拉取并切换。
  useEffect(() => {
    if (!currentWritingSessionId) return;
    if (!currentSession) return;
    if (currentSession.id === currentWritingSessionId) {
      setCurrentWritingSessionId(null);
      return;
    }
    let cancelled = false;
    getSession(currentWritingSessionId).then((s) => {
      if (cancelled) return;
      if (s && s.mode === 'writing') enterSession(s);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setCurrentWritingSessionId(null);
    });
    return () => { cancelled = true; };
    // enterSession 是 page 内命令式入口，跟 store setter 一样不需要进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWritingSessionId, currentSession]);

  function refreshMessages() {
    setMessageListKey((k) => k + 1);
  }

  function startMemoryRecalling() {
    clearTimeout(memoryRecallingTimerRef.current);
    clearTimeout(recallSummaryTimerRef.current);
    memoryRecallingStartRef.current = Date.now();
    setMemoryRecalling(true);
  }
  function stopMemoryRecalling() {
    const elapsed = Date.now() - (memoryRecallingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryRecallingTimerRef.current = setTimeout(() => setMemoryRecalling(false), delay);
  }
  function startMemoryExpanding() {
    clearTimeout(memoryExpandingTimerRef.current);
    memoryExpandingStartRef.current = Date.now();
    setMemoryExpanding(true);
  }
  function stopMemoryExpanding() {
    const elapsed = Date.now() - (memoryExpandingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryExpandingTimerRef.current = setTimeout(() => setMemoryExpanding(false), delay);
  }
  function startMemoryWriting(runId = null) {
    clearTimeout(memoryWritingTimerRef.current);
    memoryWritingRunIdRef.current = runId;
    memoryWritingStartRef.current = Date.now();
    setMemoryWriting(true);
  }
  function stopMemoryWriting(runId = null) {
    if (runId !== null && memoryWritingRunIdRef.current !== runId) return;
    const elapsed = Date.now() - (memoryWritingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryWritingTimerRef.current = setTimeout(() => {
      if (runId !== null && memoryWritingRunIdRef.current !== runId) return;
      memoryWritingRunIdRef.current = null;
      setMemoryWriting(false);
      clearTimeout(recallSummaryTimerRef.current);
      recallSummaryTimerRef.current = setTimeout(() => setRecallSummary(null), 2000);
    }, delay);
  }
  function clearMemoryState() {
    clearTimeout(memoryRecallingTimerRef.current);
    clearTimeout(memoryExpandingTimerRef.current);
    clearTimeout(memoryWritingTimerRef.current);
    clearTimeout(recallSummaryTimerRef.current);
    memoryWritingRunIdRef.current = null;
    setMemoryRecalling(false);
    setMemoryExpanding(false);
    setMemoryWriting(false);
    setRecallSummary(null);
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
      setError(task.error);
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
        const { display, options } = parseNextPromptStream(next);
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
        clearTimeout(memoryWritingTimerRef.current);
        memoryWritingRunIdRef.current = null;
        setMemoryWriting(false);
        if (assistant) pendingAssistantRef.current = assistant;
      },
      onError(msg) {
        if (!isCurrentStreamRun(runId)) return;
        setError(msg);
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
        if (isSameSession()) {
          setStateFailedTick((tick) => tick + 1);
          log.error('state.update_failed', evt?.error, { toast: '状态整理失败，数据可能未更新' });
        }
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

  function handleRegenerateMessage(assistantMessageId) {
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
      setError(err.message || '保存失败');
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
      setError(err.message || '删除失败');
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
        clearTimeout(memoryWritingTimerRef.current);
        setMemoryWriting(false);
        if (assistant) pendingAssistantRef.current = assistant;
      },
      onError(msg) {
        if (continuationTokenRef.current !== continuationToken) return;
        setError(msg);
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
        if (currentSessionRef.current?.id === continuationSessionId) {
          setStateFailedTick((tick) => tick + 1);
          log.error('state.update_failed', evt?.error, { toast: '状态整理失败，数据可能未更新' });
        }
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

  return (
    <PageLayout
      left={(
        <WritingSessionList
          worldId={worldId}
          currentSessionId={currentSession?.id}
          onSessionSelect={enterSession}
          onSessionCreate={handleSessionCreate}
          onSessionDelete={handleSessionDelete}
          onBack={() => navigate(`/worlds/${worldId}`)}
        />
      )}
      recall={{ memoryRecalling, memoryExpanding, memoryWriting, recallSummary }}
      main={(
        <div className="we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden relative">
            {/* 章节标题区 */}
            <div className="we-chat-center-header">
              {currentSession ? (
                <>
                  <h1 className="we-chat-center-title">
                    {currentSession.title || '写作进行中'}
                  </h1>
                  {ltmEnabled && (
                    <button
                      type="button"
                      className="we-chat-center-action"
                      onClick={() => setLtmOpen(true)}
                      aria-label="长期记忆"
                      title="长期记忆"
                    >
                      <Icon size={20} aria-label="长期记忆">
                        <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" />
                        <path d="M8 8h8" />
                        <path d="M8 12h8" />
                        <path d="M8 16h5" />
                      </Icon>
                    </button>
                  )}
                </>
              ) : (
                <span className="flex-1" />
              )}
            </div>
            <AnimatePresence>
              {ltmEnabled && ltmOpen && currentSession && (
                <LongTermMemoryModal
                  key="ltm-modal"
                  sessionId={currentSession.id}
                  onClose={() => setLtmOpen(false)}
                />
              )}
            </AnimatePresence>

            {isInitializing ? (
              <div className="flex-1 flex items-center justify-center text-sm text-text-secondary opacity-60">
                正在准备写作空间…
              </div>
            ) : initError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-[var(--we-color-text-danger)]">{initError}</p>
                <button
                  type="button"
                  className="we-panel-card-action we-panel-card-action--chip"
                  onClick={() => setInitRetryToken((token) => token + 1)}
                >
                  重试
                </button>
              </div>
            ) : (
              <MessageList
                ref={messageListRef}
                key={`${currentSession?.id}-${messageListKey}`}
                sessionId={currentSession?.id}
                character={null}
                persona={persona}
                worldId={worldId}
                generating={generating}
                streamingText={streamingText}
                streamingKey={streamingKey}
                continuingMessageId={continuingMessageId}
                continuingText={continuingText}
                onEditMessage={handleEditMessage}
                onRegenerateMessage={handleRegenerateMessage}
                onEditAssistantMessage={handleEditAssistantMessage}
                onDeleteMessage={handleDeleteMessage}
                prose
                chapterTitles={chapterTitles}
                onChapterEdit={handleChapterEdit}
                onChapterRetitle={handleChapterRetitle}
                options={currentOptions}
                onSelectOption={(text, idx) => { selectedOptionIndexRef.current = idx; handleSend(text); }}
                onDismissOptions={() => setCurrentOptions([])}
                optionCollapsed={optionCollapsedRef.current}
                onOptionCollapsedChange={(c) => { optionCollapsedRef.current = c; }}
                onMessagesLoaded={(msgs) => {
                  const lastAsst = [...msgs].reverse().find((m) => m.role === 'assistant');
                  const opts = lastAsst?.next_options;
                  if (Array.isArray(opts) && opts.length > 0) {
                    setCurrentOptions(opts);
                    optionCollapsedRef.current = false;
                  }
                  void recoverLiveStream(currentSessionRef.current?.id ?? null);
                }}
              />
            )}

            {/* 错误提示 */}
            {error && (
              <div className="we-writing-error-bar">
                <p className="we-field-error we-writing-error-text">
                  生成失败：{error}
                </p>
              </div>
            )}

            {/* 输入区 */}
            <InputBox
              ref={inputBoxRef}
              onSend={handleSend}
              onStop={handleStop}
              generating={generating}
              impersonating={impersonating}
              lastUserContent=""
              worldId={worldId}
              mode="writing"
              onScrollToBottom={() => messageListRef.current?.scrollToBottom?.()}
              onContinue={handleContinue}
              onImpersonate={handleImpersonate}
              onTitle={handleRetitle}
            />
        </div>
      )}
      right={(
        <NearbyPanel
          worldId={worldId}
          sessionId={currentSession?.id}
          stateTick={stateTick}
          diaryTick={diaryTick}
          stateQueuedTick={stateQueuedTick}
          stateFailedTick={stateFailedTick}
          persona={persona}
          onDiaryInject={setPendingDiaryInject}
        />
      )}
    />
  );
}
