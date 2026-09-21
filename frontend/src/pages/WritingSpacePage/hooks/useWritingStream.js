import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSessionStream } from '../../../core/hooks/useSessionStream.js';
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
import { writingSessionListBridge } from '../../../core/utils/session-list-bridge.js';
import { log } from '../../../core/utils/logger.js';

// 写作页的流式运行时：会话身份存在 hook 内，状态刷新信号走四个局部 tick（逐层 props 下传给右侧面板）。
// 章节标题与 saved 角色召回是写作独有，留在本层。
export function useWritingStream({ worldId, messageListRef, inputBoxRef, memory }) {
  const [stateTick, setStateTick] = useState(0);
  const [diaryTick, setDiaryTick] = useState(0);
  const [stateQueuedTick, setStateQueuedTick] = useState(0);
  const [stateFailedTick, setStateFailedTick] = useState(0);
  // saved nearby 召回判定结果（驱动右侧面板自动展开/收起 saved 角色 state）
  // hits=null 表示尚未收到本轮事件（保留之前的展开状态）；tick 在每次事件递增，触发子组件应用
  const [savedRecallTick, setSavedRecallTick] = useState(0);
  const [savedRecallHits, setSavedRecallHits] = useState(null);
  // chapterTitles: { [chapterIndex]: { title, is_default } }
  const [chapterTitles, setChapterTitles] = useState({});

  const streamRef = useRef(null);

  const api = useMemo(() => ({
    send: (sessionId, content, attachments, callbacks, opts) =>
      generate(worldId, sessionId, content, callbacks, opts),
    stop: (sessionId) => stopGeneration(worldId, sessionId),
    regenerate: (sessionId, afterMessageId, callbacks) =>
      regenerateWriting(worldId, sessionId, afterMessageId, callbacks),
    editAndRegenerate: (sessionId, messageId, newContent, callbacks) =>
      editAndRegenerateWriting(worldId, sessionId, messageId, newContent, callbacks),
    continueGeneration: (sessionId, callbacks) => continueGeneration(worldId, sessionId, callbacks),
    impersonate: (sessionId) => impersonateWriting(worldId, sessionId),
    editAssistant: (sessionId, messageId, content) =>
      editWritingAssistantMessage(worldId, sessionId, messageId, content),
    retitle: (sessionId) => retitleWritingSession(worldId, sessionId),
    recoverStream: (sessionId) => recoverWritingStream(worldId, sessionId),
    subscribeStream: (sessionId, callbacks) => subscribeWritingStream(worldId, sessionId, callbacks),
  }), [worldId]);

  const onStateSignal = useCallback((kind) => {
    if (kind === 'queued') setStateQueuedTick((t) => t + 1);
    else if (kind === 'failed') setStateFailedTick((t) => t + 1);
    else if (kind === 'diary') setDiaryTick((t) => t + 1);
    else setStateTick((t) => t + 1);
  }, []);

  // 进入会话后异步加载章节标题，不阻塞会话切换
  const onEnterSession = useCallback((session) => {
    setChapterTitles({});
    getChapterTitles(worldId, session.id)
      .then((arr) => {
        const map = {};
        for (const row of arr) map[row.chapter_index] = { title: row.title, is_default: row.is_default };
        setChapterTitles(map);
      })
      .catch(() => {});
  }, [worldId]);

  // 写作模式始终需要一个会话：删光了就新建一个
  const onNoSessionsLeft = useCallback(() => {
    createWritingSession(worldId)
      .then((s) => {
        writingSessionListBridge.addSession?.(s);
        streamRef.current?.enterSession(s);
      })
      .catch(() => {});
  }, [worldId]);

  const extraCallbacks = useMemo(() => ({
    onChapterTitleUpdated: (chapterIndex, title) => {
      setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title, is_default: 0 } }));
    },
    onSavedRecallDone: (evt) => {
      setSavedRecallHits(Array.isArray(evt?.ids) ? evt.ids : []);
      setSavedRecallTick((t) => t + 1);
    },
  }), []);

  const stream = useSessionStream({
    mode: 'writing',
    api,
    sessionListBridge: writingSessionListBridge,
    onStateSignal,
    onEnterSession,
    onNoSessionsLeft,
    extraCallbacks,
    messageListRef,
    inputBoxRef,
    memory,
  });

  useEffect(() => {
    streamRef.current = stream;
  });

  const { currentSession, generating } = stream;

  // 用户编辑章节标题（不调用 LLM）
  async function handleChapterEdit(chapterIndex, newTitle) {
    if (generating || !currentSession) return;
    try {
      await updateChapterTitle(worldId, currentSession.id, chapterIndex, newTitle);
      setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title: newTitle, is_default: 0 } }));
    } catch (err) {
      log.error('writing.chapter.title.save_failed', err, { toast: err.message || '章节标题保存失败' });
    }
  }

  // LLM 重新生成章节标题
  async function handleChapterRetitle(chapterIndex) {
    if (generating || !currentSession) return;
    try {
      const { title } = await retitleChapter(worldId, currentSession.id, chapterIndex);
      if (title) setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title, is_default: 0 } }));
    } catch (err) {
      log.error('writing.chapter.title.generate_failed', err, { toast: err.message || '章节标题生成失败' });
    }
  }

  return {
    ...stream,
    error: stream.errorBubble,
    chapterTitles,
    stateTick,
    diaryTick,
    stateQueuedTick,
    stateFailedTick,
    savedRecallTick,
    savedRecallHits,
    handleChapterEdit,
    handleChapterRetitle,
  };
}
