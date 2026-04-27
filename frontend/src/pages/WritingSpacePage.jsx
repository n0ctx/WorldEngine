import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { syncDiaryTimeField } from '../api/world-state-fields.js';
import { useAppModeStore } from '../store/appMode.js';
import { SETTINGS_MODE } from '../components/settings/SettingsConstants';
import { refreshCustomCss } from '../api/custom-css-snippets.js';
import { getConfig } from '../api/config.js';
import { useDisplaySettingsStore } from '../store/displaySettings.js';
import { getPersona, getPersonaById } from '../api/personas.js';
import useStore from '../store/index.js';
import {
  listWritingSessions,
  createWritingSession,
  listActiveCharacters,
  generate,
  stopGeneration,
  continueGeneration,
  regenerateWriting,
  editAndRegenerateWriting,
  editWritingAssistantMessage,
  impersonateWriting,
  retitleWritingSession,
  extractCharactersFromMessage,
  confirmCharacters,
} from '../api/writing-sessions.js';
import { getChapterTitles, updateChapterTitle, retitleChapter } from '../api/chapter-titles.js';
import { deleteMessage as deleteMessageApi } from '../api/sessions.js';
import BookSpread from '../components/book/BookSpread.jsx';
import PageRight from '../components/book/PageRight.jsx';
import WritingPageLeft from '../components/book/WritingPageLeft.jsx';
import CastPanel from '../components/book/CastPanel.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import InputBox from '../components/chat/InputBox.jsx';
import WritingSessionList from '../components/book/WritingSessionList.jsx';
import OptionCard from '../components/chat/OptionCard.jsx';
import CharacterPreviewModal from '../components/writing/CharacterPreviewModal.jsx';
import CharacterAnalyzingModal from '../components/writing/CharacterAnalyzingModal.jsx';
import { AnimatePresence } from 'framer-motion';
import { pushToast, pushErrorToast } from '../utils/toast.js';
import { writingSessionListBridge } from '../utils/session-list-bridge.js';

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

export default function WritingSpacePage() {
  const { worldId } = useParams();
  const setAppMode = useAppModeStore((s) => s.setAppMode);
  const currentPersonaId = useStore((s) => s.currentPersonaId);
  const setCurrentWritingModelPricing = useDisplaySettingsStore((s) => s.setCurrentWritingModelPricing);
  const setShowTokenUsage = useDisplaySettingsStore((s) => s.setShowTokenUsage);

  useEffect(() => {
    getConfig().then((c) => {
      setShowTokenUsage(c.ui?.show_token_usage === true);
      const writingModel = c.writing?.llm?.model_pricing ?? null;
      setCurrentWritingModelPricing(writingModel);
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
  const [activeCharacters, setActiveCharacters] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingKey, setStreamingKey] = useState('__ws_stream_init__');
  const [continuingMessageId, setContinuingMessageId] = useState(null);
  const [continuingText, setContinuingText] = useState('');
  const [impersonating, setImpersonating] = useState(false);
  const [stateTick, setStateTick] = useState(0);
  const [diaryTick, setDiaryTick] = useState(0);
  const [messageListKey, setMessageListKey] = useState(0);
  const [error, setError] = useState(null);
  const [cardPreviewChars, setCardPreviewChars] = useState(null); // null = 弹窗关闭，[] = 打开
  const [cardAnalyzing, setCardAnalyzing] = useState(false);
  const [memoryRecalling, setMemoryRecalling] = useState(false);
  const [memoryExpanding, setMemoryExpanding] = useState(false);
  const [memoryWriting, setMemoryWriting] = useState(false);
  const [recallSummary, setRecallSummary] = useState(null);

  const inputBoxRef = useRef(null);
  const messageListRef = useRef(null);
  const stopRef = useRef(null);
  const streamingTextRef = useRef('');
  const streamingKeyRef = useRef('__ws_stream_init__');
  const continuingMessageIdRef = useRef(null);
  const continuingTextRef = useRef('');
  const continuationTokenRef = useRef(0);
  const pendingAssistantRef = useRef(null);
  const assistantAppendedEarlyRef = useRef(false);
  const pendingOptionsRef = useRef([]);
  // 普通生成/重生成的 run id；旧 SSE 收尾不得覆盖新一轮状态
  const streamRunIdRef = useRef(0);
  // 用户主动点击停止时置 true；防止无内容时 onStreamEnd 兜底触发 refreshMessages
  const streamAbortedRef = useRef(false);
  const currentSessionRef = useRef(null);
  // 本轮乐观追加的 user 消息 temp id（用于收到 user_saved 后原地替换为真实 id）
  const tempUserIdRef = useRef(null);
  const makingCardRef = useRef(false);
  const memoryRecallingStartRef = useRef(null);
  const memoryExpandingStartRef = useRef(null);
  const memoryWritingStartRef = useRef(null);
  const memoryRecallingTimerRef = useRef(null);
  const memoryExpandingTimerRef = useRef(null);
  const memoryWritingTimerRef = useRef(null);

  const [currentOptions, setCurrentOptions] = useState([]);
  const [pendingDiaryInject, setPendingDiaryInject] = useState(null);
  // chapterTitles: { [chapterIndex]: { title, is_default } }
  const [chapterTitles, setChapterTitles] = useState({});

  function clearOptionsState() {
    pendingOptionsRef.current = [];
    setCurrentOptions([]);
  }

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    if (!worldId) return;
    const timeoutId = setTimeout(() => {
      clearOptionsState();
      const loadPersona = currentPersonaId
        ? getPersonaById(currentPersonaId).catch(() => getPersona(worldId))
        : getPersona(worldId);
      loadPersona.then(setPersona).catch(() => {});
      syncDiaryTimeField(worldId).catch(() => {});
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [worldId, currentPersonaId]);

  useEffect(() => {
    return () => {
      clearOptionsState();
    };
  }, []);

  // 初始化：加载或自动创建第一个会话
  useEffect(() => {
    if (!worldId) return;
    listWritingSessions(worldId).then((sessions) => {
      if (sessions.length > 0) {
        enterSession(sessions[0]);
      } else {
        createWritingSession(worldId).then((s) => {
          writingSessionListBridge.addSession?.(s);
          enterSession(s);
        }).catch(() => {});
      }
    }).catch(() => {});
    // enterSession is intentionally kept as the page-level imperative transition used by stream callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  function refreshMessages() {
    setMessageListKey((k) => k + 1);
  }

  function startMemoryRecalling() {
    clearTimeout(memoryRecallingTimerRef.current);
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
  function startMemoryWriting() {
    clearTimeout(memoryWritingTimerRef.current);
    memoryWritingStartRef.current = Date.now();
    setMemoryWriting(true);
  }
  function stopMemoryWriting() {
    const elapsed = Date.now() - (memoryWritingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryWritingTimerRef.current = setTimeout(() => setMemoryWriting(false), delay);
  }
  function clearMemoryState() {
    clearTimeout(memoryRecallingTimerRef.current);
    clearTimeout(memoryExpandingTimerRef.current);
    clearTimeout(memoryWritingTimerRef.current);
    setMemoryRecalling(false);
    setMemoryExpanding(false);
    setMemoryWriting(false);
    setRecallSummary(null);
  }

  async function enterSession(session) {
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

    try {
      const chars = await listActiveCharacters(worldId, session.id);
      setActiveCharacters(chars);
    } catch {
      setActiveCharacters([]);
    }

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

  function beginStreamingKey() {
    const k = `__ws_stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}__`;
    streamingKeyRef.current = k;
    setStreamingKey(k);
    return k;
  }

  function beginStreamRun() {
    const runId = streamRunIdRef.current + 1;
    streamRunIdRef.current = runId;
    pendingAssistantRef.current = null;
    assistantAppendedEarlyRef.current = false;
    pendingOptionsRef.current = [];
    streamAbortedRef.current = false;
    clearOptionsState();
    beginStreamingKey();
    return runId;
  }

  function isCurrentStreamRun(runId) {
    return streamRunIdRef.current === runId;
  }

  function makeStreamCallbacks(runId) {
    const streamKey = streamingKeyRef.current;
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
          messageListRef.current.updateMessages((prev) =>
            prev.map((m) => m.id === tempId ? { ...m, _key: m._key ?? tempId, id: realId } : m)
          );
        }
        tempUserIdRef.current = realId;
      },
      onDone(assistant, options) {
        if (!isCurrentStreamRun(runId)) return;
        if (options?.length) pendingOptionsRef.current = options;
        // 立即追加真实消息 + 解锁输入框（同批次渲染），避免流式占位消失后真实消息延迟出现的闪烁
        if (assistant && messageListRef.current?.appendMessage) {
          messageListRef.current.appendMessage({ ...assistant, _key: streamKey });
          assistantAppendedEarlyRef.current = true;
        } else if (assistant) {
          pendingAssistantRef.current = assistant;
        }
        setGenerating(false);
        startMemoryWriting();
      },
      onAborted(assistant) {
        if (!isCurrentStreamRun(runId)) return;
        clearTimeout(memoryWritingTimerRef.current);
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
        if (!isCurrentStreamRun(runId)) return;
        setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        writingSessionListBridge.updateTitle?.(currentSessionRef.current?.id, title);
      },
      onChapterTitleUpdated(chapterIndex, title) {
        if (!isCurrentStreamRun(runId)) return;
        setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title, is_default: 0 } }));
      },
      onStateUpdated() {
        if (!isCurrentStreamRun(runId)) return;
        stopMemoryWriting();
        setStateTick((tick) => tick + 1);
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
        if (!isCurrentStreamRun(runId)) return;
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
        stopMemoryWriting();
        stopRef.current = null;
        if (pendingOptions?.length > 0) setCurrentOptions(pendingOptions);
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
    stopRef.current = generate(worldId, session.id, content || '', makeStreamCallbacks(runId), inject ? { diaryInjection: inject } : {});
  }

  function handleEditMessage(messageId, newContent) {
    const session = currentSessionRef.current;
    if (!session || generating) return;
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
    const runId = beginStreamRun();
    stopRef.current = editAndRegenerateWriting(worldId, session.id, messageId, newContent, makeStreamCallbacks(runId));
  }

  function handleRegenerateMessage(assistantMessageId) {
    const session = currentSessionRef.current;
    if (!session || generating) return;
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
    const runId = beginStreamRun();
    stopRef.current = regenerateWriting(worldId, session.id, afterMessageId, makeStreamCallbacks(runId));
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
      setStateTick((tick) => tick + 1);
      setDiaryTick((tick) => tick + 1);
    } catch (err) {
      setError(err.message || '删除失败');
    }
  }

  function handleContinue() {
    const session = currentSessionRef.current;
    if (!session || generating) return;

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
        if (options?.length) pendingOptionsRef.current = options;
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
      onStateUpdated() {
        if (continuationTokenRef.current !== continuationToken) return;
        stopMemoryWriting();
        setStateTick((tick) => tick + 1);
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
      if (content) inputBoxRef.current?.fillText(content);
    } catch (err) {
      pushErrorToast(err.message || '代拟失败');
    } finally {
      setImpersonating(false);
    }
  }

  // 重新生成会话标题（修复 /title 命令）
  async function handleRetitle() {
    const session = currentSessionRef.current;
    if (!session) return;
    try {
        const { title } = await retitleWritingSession(worldId, session.id);
      if (title) {
        setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        writingSessionListBridge.updateTitle?.(session.id, title);
      }
    } catch (err) {
      pushErrorToast(err.message || '标题生成失败');
    }
  }

  // 用户编辑章节标题（不调用 LLM）
  async function handleChapterEdit(chapterIndex, newTitle) {
    const session = currentSessionRef.current;
    if (!session) return;
    try {
      await updateChapterTitle(worldId, session.id, chapterIndex, newTitle);
      setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title: newTitle, is_default: 0 } }));
    } catch (err) {
      pushErrorToast(err.message || '章节标题保存失败');
    }
  }

  // LLM 重新生成章节标题
  async function handleChapterRetitle(chapterIndex) {
    const session = currentSessionRef.current;
    if (!session) return;
    try {
      const { title } = await retitleChapter(worldId, session.id, chapterIndex);
      if (title) {
        setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title, is_default: 0 } }));
      }
    } catch (err) {
      pushErrorToast(err.message || '章节标题生成失败');
    }
  }

  // 阶段一：提取角色（dry-run），弹出预览弹窗
  function handleMakeCard(assistantMessageId) {
    if (makingCardRef.current) return;
    makingCardRef.current = true;
    const session = currentSessionRef.current;
    if (!session) { makingCardRef.current = false; return; }
    setCardAnalyzing(true);
    extractCharactersFromMessage(worldId, session.id, assistantMessageId, {
      onEvent(evt) {
        if (evt.type === 'characters_extracted') {
          makingCardRef.current = false;
          setCardAnalyzing(false);
          if (evt.count === 0) {
            pushToast('未发现新角色');
          } else {
            setCardPreviewChars(evt.characters);
          }
        } else if (evt.type === 'error') {
          setCardAnalyzing(false);
          pushErrorToast(evt.error || '提取失败');
        }
      },
      onStreamEnd() {
        makingCardRef.current = false;
        setCardAnalyzing(false);
      },
      onError(err) {
        makingCardRef.current = false;
        setCardAnalyzing(false);
        pushErrorToast(err || '提取请求失败');
      },
    }, { dryRun: true });
  }

  // 阶段二：用户确认后创建角色卡
  function handleConfirmCards(chosen, onProgress) {
    const session = currentSessionRef.current;
    if (!session) return Promise.resolve();

    return new Promise((resolve) => {
      let doneCount = 0;
      confirmCharacters(worldId, session.id, chosen, {
        onEvent(evt) {
          if (evt.type === 'card_activated' && evt.character) {
            doneCount += 1;
            onProgress(doneCount);
            setActiveCharacters((prev) => {
              if (prev.some((c) => c.id === evt.character.id)) return prev;
              return [...prev, evt.character];
            });
          } else if (evt.type === 'error') {
            pushErrorToast(evt.error || '角色创建失败');
          }
        },
        onStreamEnd() {
          if (doneCount > 0) pushToast(`制卡完成，共激活 ${doneCount} 个角色`);
          setCardPreviewChars(null);
          resolve();
        },
        onError(err) {
          pushErrorToast(err || '创建请求失败');
          resolve();
        },
      });
    });
  }

  return (
    <>
    <BookSpread>
      <WritingPageLeft
        worldId={worldId}
        currentSessionId={currentSession?.id}
        onSessionSelect={enterSession}
        onSessionCreate={handleSessionCreate}
        onSessionDelete={handleSessionDelete}
        memoryRecalling={memoryRecalling}
        memoryExpanding={memoryExpanding}
        memoryWriting={memoryWriting}
        recallSummary={recallSummary}
      />

      <PageRight className="!p-0">
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* 中间消息区 */}
          <div className="we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden relative">
            {/* 章节标题区 */}
            <div className="we-chat-center-header">
              {currentSession ? (
                <h1 className="we-chat-center-title">
                  {currentSession.title || '写作进行中'}
                </h1>
              ) : (
                <span className="flex-1" />
              )}
            </div>

            {/* 消息列表 */}
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
              onMakeCard={handleMakeCard}
              prose
              chapterTitles={chapterTitles}
              onChapterEdit={handleChapterEdit}
              onChapterRetitle={handleChapterRetitle}
            />

            {/* 选项卡：AI 回复后展示行动选项 */}
            {currentOptions.length > 0 && (
              <OptionCard
                options={currentOptions}
                streaming={generating}
                onSelect={(text) => { setCurrentOptions([]); handleSend(text); }}
                onDismiss={() => setCurrentOptions([])}
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
              onScrollToBottom={() => messageListRef.current?.scrollToBottom()}
              onContinue={handleContinue}
              onImpersonate={handleImpersonate}
              onTitle={handleRetitle}
            />
          </div>

          <CastPanel
            worldId={worldId}
            sessionId={currentSession?.id}
            activeCharacters={activeCharacters}
            onActiveCharactersChange={setActiveCharacters}
            stateTick={stateTick}
            diaryTick={diaryTick}
            persona={persona}
            onDiaryInject={setPendingDiaryInject}
          />

        </div>
      </PageRight>
    </BookSpread>

    <AnimatePresence>
      {cardAnalyzing && <CharacterAnalyzingModal key="analyzing" />}
      {cardPreviewChars !== null && (
        <CharacterPreviewModal
          key="preview"
          characters={cardPreviewChars}
          onConfirm={handleConfirmCards}
          onClose={() => setCardPreviewChars(null)}
        />
      )}
    </AnimatePresence>
    </>
  );
}
