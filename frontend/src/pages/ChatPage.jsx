import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../store/index.js';
import Icon from '../components/ui/Icon.jsx';
import { getCharacter } from '../api/characters.js';
import { getPersona } from '../api/personas.js';
import { sendMessage, stopGeneration, regenerate, editAndRegenerate, continueGeneration, impersonate, clearMessages, editAssistantMessage, retitle } from '../api/chat.js';
import { createSession, getSession, deleteMessage as deleteMessageApi } from '../api/sessions.js';
import SessionListPanel from '../components/book/SessionListPanel.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import InputBox from '../components/chat/InputBox.jsx';
import BookSpread from '../components/book/BookSpread.jsx';
import PageLeft from '../components/book/PageLeft.jsx';
import PageRight from '../components/book/PageRight.jsx';
import StatePanel from '../components/book/StatePanel.jsx';
import { syncDiaryTimeField } from '../api/world-state-fields.js';
import { loadRules } from '../utils/regex-runner.js';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar.js';
import { pushErrorToast } from '../utils/toast';
import { getConfig } from '../api/config.js';
import { useDisplaySettingsStore } from '../store/displaySettings.js';
import { chatSessionListBridge } from '../utils/session-list-bridge.js';

function parseContinuationText(text) {
  const raw = text || '';
  const tagIdx = raw.indexOf('<next_prompt>');
  if (tagIdx === -1) return { content: raw, options: [] };
  const content = raw.slice(0, tagIdx);
  const afterTag = raw.slice(tagIdx + '<next_prompt>'.length);
  const options = afterTag
    .replace('</next_prompt>', '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { content, options };
}

export default function ChatPage() {
  const { characterId } = useParams();
  const setCurrentModelPricing = useDisplaySettingsStore((s) => s.setCurrentModelPricing);
  const setShowTokenUsage = useDisplaySettingsStore((s) => s.setShowTokenUsage);

  useEffect(() => {
    getConfig().then((c) => {
      setShowTokenUsage(c.ui?.show_token_usage === true);
      setCurrentModelPricing(c.llm?.model_pricing ?? null);
    });
  }, [setCurrentModelPricing, setShowTokenUsage]);
  const { currentSessionId, setCurrentSessionId, currentCharacterId, setCurrentCharacterId } = useStore();

  const [character, setCharacter] = useState(null);
  const [persona, setPersona] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [memoryRecalling, setMemoryRecalling] = useState(false);
  const [memoryExpanding, setMemoryExpanding] = useState(false);
  const [memoryWriting, setMemoryWriting] = useState(false);
  const [recallSummary, setRecallSummary] = useState(null); // null | { recalled: number, expanded: number }
  const [messageListKey, setMessageListKey] = useState(0);
  const [continuingMessageId, setContinuingMessageId] = useState(null);
  const [continuingText, setContinuingText] = useState('');
  const inputBoxRef = useRef(null);
  const messageListRef = useRef(null);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [errorBubble, setErrorBubble] = useState(null); // { partialContent, errorMsg }
  // 本轮流式占位节点的 React key（每次新流都换，避免相邻两轮 key 冲突）
  const [streamingKey, setStreamingKey] = useState('__stream_init__');

  const stopRef = useRef(null);
  const currentSessionIdRef = useRef(currentSessionId);
  const optionCollapsedRef = useRef(false);
  const memoryRecallingStartRef = useRef(null);
  const memoryExpandingStartRef = useRef(null);
  const memoryWritingStartRef = useRef(null);
  const memoryWritingRunIdRef = useRef(null);
  const memoryRecallingTimerRef = useRef(null);
  const memoryExpandingTimerRef = useRef(null);
  const memoryWritingTimerRef = useRef(null);
  const recallSummaryTimerRef = useRef(null);
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
  // 本轮流占位节点的 key（finalizeStream 把它作为 assistant._key，保持 React key 稳定）
  const streamingKeyRef = useRef('__stream_init__');
  // 普通生成/重生成的 run id；旧 SSE 收尾不得覆盖新一轮状态
  const streamRunIdRef = useRef(0);
  // 用户主动点击停止时置 true；防止无内容时 finalizeStream 兜底触发 refreshMessages
  const streamAbortedRef = useRef(false);

  const [currentOptions, setCurrentOptions] = useState([]);
  const currentOptionsRef = useRef([]);
  const selectedOptionIndexRef = useRef(-1);
  const [optionCollapsed, setOptionCollapsed] = useState(false);
  const [pendingDiaryInject, setPendingDiaryInject] = useState(null);

  const clearOptionsState = useCallback(() => {
    pendingOptionsRef.current = [];
    setCurrentOptions([]);
  }, []);

  // 每次开启新流时调用：生成本轮唯一的占位 key
  const beginStreamingKey = useCallback(() => {
    const k = `__stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`;
    streamingKeyRef.current = k;
    setStreamingKey(k);
    return k;
  }, []);

  const beginStreamRun = useCallback(() => {
    // 将当前轮次选项冻结到最后一条 assistant 消息上（再次生成时保留历史选项）
    if (currentOptionsRef.current.length > 0) {
      messageListRef.current?.freezeOptions?.(currentOptionsRef.current, selectedOptionIndexRef.current, optionCollapsedRef.current);
      selectedOptionIndexRef.current = -1;
      setOptionCollapsed(false);
    }
    const runId = streamRunIdRef.current + 1;
    streamRunIdRef.current = runId;
    pendingAssistantRef.current = null;
    assistantAppendedEarlyRef.current = false;
    pendingOptionsRef.current = [];
    streamAbortedRef.current = false;
    clearOptionsState();
    beginStreamingKey();
    return runId;
  }, [beginStreamingKey, clearOptionsState]);

  const isCurrentStreamRun = useCallback((runId) => streamRunIdRef.current === runId, []);

  const startMemoryRecalling = useCallback(() => {
    clearTimeout(memoryRecallingTimerRef.current);
    clearTimeout(recallSummaryTimerRef.current);
    memoryRecallingStartRef.current = Date.now();
    setMemoryRecalling(true);
  }, []);
  const stopMemoryRecalling = useCallback(() => {
    const elapsed = Date.now() - (memoryRecallingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryRecallingTimerRef.current = setTimeout(() => setMemoryRecalling(false), delay);
  }, []);

  const startMemoryExpanding = useCallback(() => {
    clearTimeout(memoryExpandingTimerRef.current);
    memoryExpandingStartRef.current = Date.now();
    setMemoryExpanding(true);
  }, []);
  const stopMemoryExpanding = useCallback(() => {
    const elapsed = Date.now() - (memoryExpandingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryExpandingTimerRef.current = setTimeout(() => setMemoryExpanding(false), delay);
  }, []);

  const startMemoryWriting = useCallback((runId = null) => {
    clearTimeout(memoryWritingTimerRef.current);
    memoryWritingRunIdRef.current = runId;
    memoryWritingStartRef.current = Date.now();
    setMemoryWriting(true);
  }, []);
  const stopMemoryWriting = useCallback((runId = null) => {
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
  }, []);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    currentOptionsRef.current = currentOptions;
  }, [currentOptions]);

  useEffect(() => {
    optionCollapsedRef.current = optionCollapsed;
  }, [optionCollapsed]);

  const clearActiveSession = useCallback(() => {
    clearOptionsState();
    setCurrentSessionId(null);
    setCurrentSession(null);
    setGenerating(false);
    setStreamingText('');
    setErrorBubble(null);
    clearTimeout(memoryRecallingTimerRef.current);
    clearTimeout(memoryExpandingTimerRef.current);
    clearTimeout(memoryWritingTimerRef.current);
    clearTimeout(recallSummaryTimerRef.current);
    memoryWritingRunIdRef.current = null;
    setMemoryRecalling(false);
    setMemoryExpanding(false);
    setMemoryWriting(false);
    setRecallSummary(null);
    setContinuingMessageId(null);
    setContinuingText('');
    streamingTextRef.current = '';
    continuingMessageIdRef.current = null;
    continuingTextRef.current = '';
    stopRef.current = null;
    setMessageListKey((k) => k + 1);
  }, [clearOptionsState, setCurrentSessionId]);

  // 加载角色信息
  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    const shouldResetSession = !!currentCharacterId && currentCharacterId !== characterId;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (shouldResetSession) {
        clearActiveSession();
      }
      setCurrentCharacterId(characterId);
      setCharacter(null);
      setPersona(null);
      setCurrentSession((prev) => (shouldResetSession ? null : prev));

      getCharacter(characterId).then((c) => {
        if (cancelled) return;
        setCharacter(c);
        if (c.world_id) {
          getPersona(c.world_id).then((p) => {
            if (!cancelled) setPersona(p);
          }).catch(() => {});
          syncDiaryTimeField(c.world_id).catch(() => {});
        }
      }).catch(() => {});

      if (!shouldResetSession && currentSessionId) {
        getSession(currentSessionId)
          .then((session) => {
            if (cancelled) return;
            if (session?.character_id === characterId) {
              setCurrentSession(session);
              return;
            }
            clearActiveSession();
          })
          .catch(() => {
            if (!cancelled) clearActiveSession();
          });
      } else if (!currentSessionId) {
        setCurrentSession(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [characterId, clearActiveSession, currentCharacterId, currentSessionId, setCurrentCharacterId]);

  // 启动时加载正则规则缓存
  useEffect(() => {
    loadRules('chat').catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      clearOptionsState();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [clearOptionsState]);

  function enterSession(session) {
    clearOptionsState();
    setCurrentSessionId(session.id);
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    setErrorBubble(null);
    streamingTextRef.current = '';
    setMessageListKey((k) => k + 1);
  }

  const handleSessionSelect = enterSession;
  const handleSessionCreate = enterSession;

  // 删除当前会话后切换到第一个，或清空
  function handleSessionDelete(deletedId, remaining) {
    const activeSessionId = currentSessionIdRef.current;
    if (deletedId === activeSessionId) {
      if (remaining.length > 0) {
        handleSessionSelect(remaining[0]);
      } else {
        clearActiveSession();
      }
      return;
    }

    if (activeSessionId && !remaining.some((session) => session.id === activeSessionId)) {
      clearActiveSession();
    }
  }

  // 流结束后刷新消息列表
  function refreshMessages() {
    setMessageListKey((k) => k + 1);
  }

  // Toast 提示（自动消失）
  function showToast(msg, type = 'success') {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  // 流状态清理
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
    setGenerating(false);
    setStreamingText('');
    stopMemoryRecalling();
    stopMemoryExpanding();
    stopMemoryWriting(runId);
    setContinuingMessageId(null);
    setContinuingText('');
    stopRef.current = null;
    // 设置本轮选项；后端有最终解析结果时覆盖，否则保留流式检测的内容
    const finalOpts = pendingOptionsRef.current;
    if (finalOpts.length > 0) setCurrentOptions(finalOpts);
    pendingOptionsRef.current = [];
    // 兜底：后端未回传 assistant（例如旧后端 / 错误路径已消费），降级为重拉刷新
    // 用户主动停止时（streamAbortedRef=true）跳过刷新，避免页面闪烁跳顶
    const wasAborted = streamAbortedRef.current;
    streamAbortedRef.current = false;
    if (!wasContinuing && !appendedAssistant && !wasAborted) refreshMessages();
  }, [isCurrentStreamRun, stopMemoryRecalling, stopMemoryExpanding, stopMemoryWriting]);

  // 共用 SSE callbacks
  function makeCallbacks(runId) {
    return {
      onDelta(delta) {
        if (!isCurrentStreamRun(runId)) return;
        const next = streamingTextRef.current + delta;
        streamingTextRef.current = next;
        const tagIdx = next.indexOf('<next_prompt>');
        if (tagIdx !== -1) {
          setStreamingText(next.slice(0, tagIdx));
          const afterTag = next.slice(tagIdx + '<next_prompt>'.length);
          const opts = afterTag.split('\n').map((s) => s.trim()).filter((s) => s && s !== '</next_prompt>');
          setCurrentOptions(opts);
        } else {
          setStreamingText(next);
        }
      },
      onUserSaved(realId) {
        if (!isCurrentStreamRun(runId)) return;
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
        if (!isCurrentStreamRun(runId)) return;
        if (options?.length) pendingOptionsRef.current = options;
        // 立即追加真实消息 + 解锁输入框（同批次渲染，避免流式气泡消失后真实消息尚未出现的闪烁）
        // 续写场景不在此追加，由 finalizeStream 合并内容
        if (assistant && !continuingMessageIdRef.current && messageListRef.current?.appendMessage) {
          messageListRef.current.appendMessage({ ...assistant, _key: streamingKeyRef.current });
          assistantAppendedEarlyRef.current = true;
        } else if (assistant) {
          pendingAssistantRef.current = assistant;
        }
        setGenerating(false);
        startMemoryWriting(runId);
      },
      onAborted(assistant) {
        if (!isCurrentStreamRun(runId)) return;
        // 中断事件仅记录 pending，统一由 onStreamEnd 调用 finalizeStream，避免双重 finalize
        streamingTextRef.current = '';
        clearTimeout(memoryWritingTimerRef.current);
        memoryWritingRunIdRef.current = null;
        setMemoryWriting(false);
        if (assistant) pendingAssistantRef.current = assistant;
      },
      onError(err) {
        if (!isCurrentStreamRun(runId)) return;
        const partial = streamingTextRef.current;
        const errMsg = typeof err === 'string' ? err : (err?.message || '生成失败');
        streamingTextRef.current = '';
        setErrorBubble({ partialContent: partial, errorMsg: errMsg });
        // 不直接 finalize，交给 onStreamEnd 统一处理，避免第二次 finalize 回退到 refreshMessages 引发重挂载
      },
      onTitleUpdated(title) {
        if (!isCurrentStreamRun(runId)) return;
        setCurrentSession((prev) => (prev ? { ...prev, title } : prev));
        if (chatSessionListBridge.updateTitle && currentSessionIdRef.current) {
          chatSessionListBridge.updateTitle(currentSessionIdRef.current, title);
        }
      },
      onStateUpdated() {
        if (!isCurrentStreamRun(runId)) {
          stopMemoryWriting(runId);
          return;
        }
        stopMemoryWriting(runId);
        useStore.getState().triggerMemoryRefresh();
      },
      onStateRolledBack() {
        if (!isCurrentStreamRun(runId)) return;
        useStore.getState().triggerMemoryRefresh();
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
        finalizeStream(runId);
      },
    };
  }

  // 发送消息
  async function handleSend(content, attachments) {
    if (generating) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      if (!character) return;
      const newSession = await createSession(character.id);
      enterSession(newSession);
      chatSessionListBridge.addSession?.(newSession);
      sessionId = newSession.id;
    }

    setErrorBubble(null);
    streamingTextRef.current = '';
    setRecallSummary(null);

    // 乐观追加 user 消息到列表
    const tempUserMsg = {
      id: `__temp_${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content,
      attachments: null,
      created_at: Date.now(),
    };
    tempUserIdRef.current = tempUserMsg.id;
    if (messageListRef.current?.appendMessage) messageListRef.current.appendMessage(tempUserMsg);

    const runId = beginStreamRun();
    setGenerating(true);
    setStreamingText('');

    const inject = pendingDiaryInject;
    setPendingDiaryInject(null);
    const stop = sendMessage(sessionId, content, attachments, makeCallbacks(runId), inject ? { diaryInjection: inject } : {});
    stopRef.current = stop;
  }

  // 停止生成：只通知后端中断，不在前端 abort fetch；
  // 后端会发回 aborted SSE 事件后自然关闭连接，避免前端提前断流导致 refreshMessages 重挂载页面
  function handleStop() {
    streamAbortedRef.current = true;
    stopGeneration(currentSessionId).catch(() => {});
  }

  // 编辑并重新生成
  function handleEditMessage(messageId, newContent) {
    if (generating) return;

    setErrorBubble(null);
    streamingTextRef.current = '';

    // 截断消息列表到被编辑消息（含，内容替换）
    if (messageListRef.current?.updateMessages) {
      messageListRef.current.updateMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), { ...prev[idx], content: newContent }];
      });
    }

    const runId = beginStreamRun();
    setGenerating(true);
    setStreamingText('');

    const stop = editAndRegenerate(currentSessionId, messageId, newContent, makeCallbacks(runId));
    stopRef.current = stop;
  }

  // 重新生成 assistant 消息
  function handleRegenerateMessage(assistantMessageId) {
    if (generating || !currentSessionId) return;

    setErrorBubble(null);
    streamingTextRef.current = '';

    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    const idx = msgs.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;
    const afterMessageId = msgs[idx - 1].id;

    messageListRef.current?.updateMessages?.((prev) => {
      const i = prev.findIndex((m) => m.id === assistantMessageId);
      return i >= 0 ? prev.slice(0, i) : prev;
    });

    const runId = beginStreamRun();
    setGenerating(true);
    setStreamingText('');

    const stop = regenerate(currentSessionId, afterMessageId, makeCallbacks(runId));
    stopRef.current = stop;
  }

  // 续写最后一条 assistant 消息
  function handleContinue() {
    if (generating || !currentSessionId) return;

    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
    const lastAssistantId = lastAssistant?.id ?? null;
    if (!lastAssistantId) return;

    clearOptionsState();
    const continuationToken = continuationTokenRef.current + 1;
    continuationTokenRef.current = continuationToken;
    continuingMessageIdRef.current = lastAssistantId;
    continuingTextRef.current = '';
    setContinuingMessageId(lastAssistantId);
    setContinuingText('');
    setGenerating(true);

    const callbacks = {
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
        if (options?.length) pendingOptionsRef.current = options;
      },
      onStateUpdated() {
        if (continuationTokenRef.current !== continuationToken) return;
        useStore.getState().triggerMemoryRefresh();
      },
      onAborted(assistant) {
        if (continuationTokenRef.current !== continuationToken) return;
        if (assistant) pendingAssistantRef.current = assistant;
      },
      onError(err) {
        if (continuationTokenRef.current !== continuationToken) return;
        pushErrorToast(typeof err === 'string' ? err : (err?.message || '续写失败'));
      },
      onStreamEnd() {
        if (continuationTokenRef.current !== continuationToken) return;
        finalizeStream();
      },
    };

    const stop = continueGeneration(currentSessionId, callbacks);
    stopRef.current = stop;
  }

  // AI 代拟用户消息，填入输入框
  const [impersonating, setImpersonating] = useState(false);
  async function handleImpersonate() {
    if (generating || impersonating || !currentSessionId) return;
    setImpersonating(true);
    try {
      const { content } = await impersonate(currentSessionId);
      if (content) inputBoxRef.current?.fillText(content);
    } catch (err) {
      pushErrorToast(err.message || '代拟失败');
    } finally {
      setImpersonating(false);
    }
  }

  // 编辑 AI 消息（不重新生成，仅更新内容并重新生成 summary）
  async function handleEditAssistantMessage(messageId, newContent) {
    if (generating) return;
    if (messageListRef.current?.updateMessages) {
      messageListRef.current.updateMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, content: newContent } : m)
      );
    }
    try {
      await editAssistantMessage(currentSessionId, messageId, newContent);
      showToast('已保存，摘要更新中…');
    } catch (err) {
      showToast(err.message || '保存失败', 'error');
      refreshMessages();
    }
  }

  // 删除消息（及之后所有内容），回滚状态栏
  async function handleDeleteMessage(messageId) {
    if (generating || !currentSessionId) return;
    try {
      await deleteMessageApi(currentSessionId, messageId);
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
      useStore.getState().triggerMemoryRefresh();
    } catch (err) {
      showToast(err.message || '删除失败', 'error');
    }
  }

  // 重试：删除最后一条 assistant 消息并重新生成
  function handleRetryLast() {
    if (generating || !currentSessionId) return;

    setErrorBubble(null);
    streamingTextRef.current = '';

    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    let lastIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') { lastIdx = i; break; }
    }
    if (lastIdx <= 0) return;
    const afterMessageId = msgs[lastIdx - 1].id;

    messageListRef.current?.updateMessages?.((prev) => prev.slice(0, lastIdx));

    const runId = beginStreamRun();
    setGenerating(true);
    setStreamingText('');
    const stop = regenerate(currentSessionId, afterMessageId, makeCallbacks(runId));
    stopRef.current = stop;
  }

  // 错误后重试：从最后一条 user 消息重新生成
  function handleRetryAfterError() {
    if (generating || !currentSessionId) return;

    setErrorBubble(null);
    streamingTextRef.current = '';

    const msgs = messageListRef.current?.messagesRef?.current ?? [];
    // 去掉末尾可能残留的 assistant 消息
    let end = msgs.length;
    while (end > 0 && msgs[end - 1].role === 'assistant') end--;
    const trimmed = msgs.slice(0, end);
    const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const afterMessageId = lastUser.id;

    messageListRef.current?.updateMessages?.(() => trimmed);

    const runId = beginStreamRun();
    setGenerating(true);
    setStreamingText('');
    const stop = regenerate(currentSessionId, afterMessageId, makeCallbacks(runId));
    stopRef.current = stop;
  }

  // 清空会话消息
  async function handleClearMessages() {
    if (!currentSessionId) return;
    if (!window.confirm('确认清空当前会话所有消息？')) return;
    try {
      const { firstMessage } = await clearMessages(currentSessionId);
      if (firstMessage) {
        // 角色有开场白，重新插入
        const fakeMsg = {
          id: `__first_${Date.now()}`,
          session_id: currentSessionId,
          role: 'assistant',
          content: firstMessage,
          attachments: null,
          created_at: Date.now(),
        };
        if (messageListRef.current?.updateMessages) {
          messageListRef.current.updateMessages(() => [fakeMsg]);
        }
      } else {
        if (messageListRef.current?.updateMessages) {
          messageListRef.current.updateMessages(() => []);
        }
      }
      // 刷新以拿到真实 id
      refreshMessages();
    } catch (err) {
      pushErrorToast(err.message || '清空失败');
    }
  }

  // 根据最近对话上下文重新生成标题
  async function handleRetitle() {
    if (!currentSessionId) return;
    try {
      showToast('标题生成中…');
      const { title } = await retitle(currentSessionId);
      if (title) {
        setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        if (chatSessionListBridge.updateTitle) {
          chatSessionListBridge.updateTitle(currentSessionIdRef.current, title);
        }
        showToast(`标题已更新：${title}`);
      } else {
        showToast('标题生成失败', 'error');
      }
    } catch (err) {
      showToast(err.message || '标题生成失败', 'error');
    }
  }

  return (
    <BookSpread>
      {/* Toast 提示 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--we-z-toast)] px-4 py-2 rounded-lg text-sm shadow-lg pointer-events-none ${
            toast.type === 'error'
              ? 'bg-[var(--we-color-status-danger)] text-[var(--we-color-text-inverse)]'
              : 'bg-[var(--we-color-accent)] text-[var(--we-color-text-inverse)]'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* 左页：会话列表 */}
      <PageLeft
        character={character}
        currentSessionId={currentSessionId}
        onSessionSelect={handleSessionSelect}
        onSessionCreate={handleSessionCreate}
        onSessionDelete={handleSessionDelete}
        memoryRecalling={memoryRecalling}
        memoryExpanding={memoryExpanding}
        memoryWriting={memoryWriting}
        recallSummary={recallSummary}
      />

      {/* 右页：对话区 + 记忆面板 */}
      <PageRight className="!p-0">
        <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* 中栏：对话区（弹性，内容最大 800px 居中） */}
      <div className="we-main we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <div className="we-chat-center-header">
          {currentSession ? (
            <h1 className="we-chat-center-title">
              {currentSession.title || '新对话'}
            </h1>
          ) : (
            <span className="flex-1" />
          )}
        </div>

        {/* 消息列表 */}
        <MessageList
          ref={messageListRef}
          key={`${currentSessionId}-${messageListKey}`}
          sessionId={currentSessionId}
          sessionTitle={currentSession?.title || ''}
          character={character}
          persona={persona}
          worldId={character?.world_id ?? null}
          generating={generating}
          streamingText={streamingText}
          streamingKey={streamingKey}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onEditAssistantMessage={handleEditAssistantMessage}
          onDeleteMessage={handleDeleteMessage}
          continuingMessageId={continuingMessageId}
          continuingText={continuingText}
          options={currentOptions}
          onSelectOption={(text, idx) => { selectedOptionIndexRef.current = idx; handleSend(text, []); }}
          onDismissOptions={() => setCurrentOptions([])}
          optionCollapsed={optionCollapsed}
          onOptionCollapsedChange={setOptionCollapsed}
        />

        {/* 错误气泡：生成失败时保留可见，提供重试入口 */}
        {errorBubble && !generating && (
          <div className="px-4 pb-2 shrink-0">
            <div className="max-w-[800px] mx-auto">
              <div className="flex items-start gap-3">
                <div
                  className="we-chat-error-avatar"
                  style={{ '--avatar-bg': getAvatarColor(character?.id) }}
                >
                  {getAvatarUrl(character?.avatar_path)
                    ? <img src={getAvatarUrl(character?.avatar_path)} alt="" className="w-6 h-6 object-cover" />
                    : (character?.name?.[0] || '?')}
                </div>
                <div className="flex flex-col gap-1 max-w-[75%]">
                  <span className="text-xs opacity-50">{character?.name}</span>
                  {errorBubble.partialContent && (
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-ivory border border-border text-text text-sm leading-relaxed whitespace-pre-wrap opacity-60">
                      {errorBubble.partialContent}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-1 rounded-full bg-[var(--we-color-accent-bg)] text-[var(--we-color-text-danger)] border border-[var(--we-color-border-focus)]">
                      生成失败：{errorBubble.errorMsg}
                    </span>
                    <button
                      onClick={handleRetryAfterError}
                      className="text-xs px-3 py-1 rounded-lg border border-border hover:bg-sand transition-colors flex items-center gap-1 text-text-secondary"
                    >
                      <Icon size={16}>
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                      </Icon>
                      重新生成
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 输入框 */}
        <InputBox
          ref={inputBoxRef}
          onSend={handleSend}
          onStop={handleStop}
          generating={generating}
          impersonating={impersonating}
          onScrollToBottom={() => messageListRef.current?.scrollToBottom()}
          onContinue={handleContinue}
          onImpersonate={handleImpersonate}
          onClear={handleClearMessages}
          onRetry={handleRetryLast}
          onTitle={handleRetitle}
          worldId={character?.world_id ?? null}
          mode="chat"
        />
      </div>

      {/* 右侧状态面板 */}
      <StatePanel
        sessionId={currentSessionId}
        character={character}
        persona={persona}
        worldId={character?.world_id ?? null}
        onDiaryInject={setPendingDiaryInject}
      />

        </div>
      </PageRight>
    </BookSpread>
  );
}
