import { Router } from 'express';
import * as llm from '../llm/index.js';
import { buildWritingPrompt } from '../prompts/assembler.js';
import { getConfig, getWritingLlmConfig } from '../services/config.js';
import { activeStreams, processStreamOutput } from '../services/chat.js';
import { logPrompt } from '../utils/logger.js';
import {
  createWritingSession,
  getActiveWritingSessionsByWorldId,
  getWritingSessionById,
  deleteWritingSession,
  listNearby,
  addSavedFromCharacter,
  removeNearby,
  setNearbyIsSaved,
  patchNearbyPersona,
  renameNearby,
  patchNearbyState,
  createMessage,
  getMessageById,
  getMessagesBySessionId,
  touchWritingSession,
  deleteAllMessages,
  deleteMessagesAfter,
} from '../services/writing-sessions.js';
import { getWorldById } from '../services/worlds.js';
import { getCharactersByWorldId } from '../services/characters.js';
import { getOrCreatePersona } from '../services/personas.js';
import { enqueue, clearPending, waitForQueueIdle } from '../utils/async-queue.js';
import { runPostGenTasks } from '../utils/post-gen-runner.js';
import { generateTitle } from '../memory/summarizer.js';
import { updateAllStates } from '../memory/combined-state-updater.js';
import { clearCompressedContext } from '../db/queries/sessions.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { awaitPendingStateUpdate } from '../utils/state-update-tracker.js';
import { ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { createTurnRecord } from '../memory/turn-summarizer.js';
import { checkAndGenerateDiary, deleteDiaryFile } from '../memory/diary-generator.js';
import { generateChapterTitle } from '../memory/chapter-title-generator.js';
import { detectNewChapter, groupChapterMessages } from '../utils/chapter-detector.js';
import { getChapterTitle, upsertChapterTitle, getChapterTitlesBySessionId } from '../db/queries/chapter-titles.js';
import { getDailyEntriesAfterRound, deleteDailyEntriesAfterRound, deleteDailyEntriesBySessionId } from '../db/queries/daily-entries.js';
import { getWritingSessionById as dbGetWritingSessionById } from '../db/queries/writing-sessions.js';
import { updateMessageContent, updateMessageTokenUsage, updateMessageNextOptions, updateMessageActivatedEntries } from '../db/queries/messages.js';
import { getTurnRecordsBySessionId, deleteTurnRecordsAfterRound, deleteTurnRecordsBySessionId, getLatestTurnRecord, getLatestTurnRecordWithSnapshot, countTurnRecords } from '../db/queries/turn-records.js';
import { restoreLtmFromTurnRecord } from '../services/long-term-memory.js';
import { restoreStateFromSnapshot } from '../memory/state-rollback.js';
import {
  beginStreamSession,
  buildContinuationMessages,
  supportsPrefill,
  sendSse,
} from './stream-helpers.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { assertExists } from '../utils/route-helpers.js';
import { analyzeNearbyForCard } from '../services/nearby-card-maker.js';

const router = Router();
const log = createLogger('writing');

function getLastUserContent(sessionId) {
  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastUser = [...allMsgs].reverse().find((m) => m.role === 'user');
  return lastUser?.content ?? '';
}

function emitSse(res, sid, payload, { logEvent = true } = {}) {
  if (logEvent && payload?.type && payload.type !== 'delta') {
    log.info(`SSE ${payload.type.toUpperCase()}  ${formatMeta({
      session: sid,
      keys: Object.keys(payload),
      title: payload.title,
      hasAssistant: !!payload.assistant,
      error: payload.error,
    })}`);
  }
  sendSse(res, payload);
}

// ── 写作会话列表/创建 ──

// GET /api/worlds/:worldId/writing-sessions
router.get('/:worldId/writing-sessions', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  const sessions = getActiveWritingSessionsByWorldId(worldId);
  res.json(sessions);
});

// POST /api/worlds/:worldId/writing-sessions
router.post('/:worldId/writing-sessions', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  const session = createWritingSession(worldId);
  res.json(session);
});

// DELETE /api/worlds/:worldId/writing-sessions/:sessionId
router.delete('/:worldId/writing-sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  await deleteWritingSession(sessionId);
  res.json({ success: true });
});

// ── 会话内消息 ──

// GET /api/worlds/:worldId/writing-sessions/:sessionId/messages
router.get('/:worldId/writing-sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  res.json(messages);
});

// ── 登场角色（nearby characters） ──

function handleNearbyError(err, res) {
  if (err && err.code === 'NEARBY_NAME_CONFLICT') {
    return res.status(409).json({ error: err.message });
  }
  const msg = err?.message ?? '';
  if (/not found/i.test(msg)) {
    return res.status(404).json({ error: msg });
  }
  if (/required|not enabled|world mismatch|not in this world/i.test(msg)) {
    return res.status(400).json({ error: msg });
  }
  log.error(`NEARBY ERROR  ${formatMeta({ error: msg })}`);
  return res.status(500).json({ error: msg || 'Internal error' });
}

// GET /api/worlds/:worldId/writing-sessions/:sessionId/nearby
router.get('/:worldId/writing-sessions/:sessionId/nearby', (req, res) => {
  const { sessionId } = req.params;
  try {
    const list = listNearby(sessionId);
    res.json(list);
  } catch (err) {
    handleNearbyError(err, res);
  }
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/nearby
router.post('/:worldId/writing-sessions/:sessionId/nearby', (req, res) => {
  const { sessionId } = req.params;
  const characterId = req.body?.character_id;
  if (!characterId || typeof characterId !== 'string') {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'character_id is required' })}`);
    return res.status(400).json({ error: 'character_id is required' });
  }
  try {
    const id = addSavedFromCharacter(sessionId, characterId);
    res.status(201).json({ id });
  } catch (err) {
    handleNearbyError(err, res);
  }
});

// PATCH /api/worlds/:worldId/writing-sessions/:sessionId/nearby/:nearbyId
router.patch('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId', (req, res) => {
  const { sessionId, nearbyId } = req.params;
  const { is_saved, persona, name } = req.body ?? {};
  try {
    if (typeof name === 'string') {
      renameNearby(sessionId, nearbyId, name);
    }
    if (is_saved !== undefined) {
      setNearbyIsSaved(sessionId, nearbyId, is_saved ? 1 : 0);
    }
    if (persona !== undefined) {
      patchNearbyPersona(sessionId, nearbyId, persona);
    }
    const list = listNearby(sessionId);
    const row = list.find((n) => n.id === nearbyId);
    if (!row) {
      log.warn(`writing.not_found ${formatMeta({ method: req.method, path: req.path, id: nearbyId })}`);
      return res.status(404).json({ error: 'nearby not found in session' });
    }
    res.json(row);
  } catch (err) {
    handleNearbyError(err, res);
  }
});

// PATCH /api/worlds/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/state
router.patch('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/state', (req, res) => {
  const { sessionId, nearbyId } = req.params;
  const { field_key, value_json } = req.body ?? {};
  if (!field_key || typeof field_key !== 'string') {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'field_key is required' })}`);
    return res.status(400).json({ error: 'field_key is required' });
  }
  try {
    patchNearbyState(sessionId, nearbyId, field_key, value_json ?? null);
    res.json({ ok: true });
  } catch (err) {
    handleNearbyError(err, res);
  }
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/analyze
// 调 LLM 给 nearby 生成角色卡草稿（不落库）
router.post('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/analyze', async (req, res) => {
  const { sessionId, nearbyId } = req.params;
  try {
    const draft = await analyzeNearbyForCard(sessionId, nearbyId);
    res.json(draft);
  } catch (err) {
    handleNearbyError(err, res);
  }
});

// DELETE /api/worlds/:worldId/writing-sessions/:sessionId/nearby/:nearbyId
router.delete('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId', (req, res) => {
  const { sessionId, nearbyId } = req.params;
  try {
    removeNearby(sessionId, nearbyId);
    res.status(204).end();
  } catch (err) {
    handleNearbyError(err, res);
  }
});

// ── 世界所有角色列表（用于角色选择器） ──

// GET /api/worlds/:worldId/characters
router.get('/:worldId/characters', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  const characters = getCharactersByWorldId(worldId);
  res.json(characters);
});

// ── 流式生成 ──

async function runWritingStream(sessionId, res, opts = {}) {
  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;
  const sid = sessionId.slice(0, 8);

  // 等待上一轮状态更新完成，确保 buildWritingPrompt 读到最新状态
  await awaitPendingStateUpdate(sessionId);

  // 重新生成：提前广播状态已回滚，让前端立即刷新状态栏
  if (opts.stateRolledBack && !streamState.isClientClosed()) {
    emitSse(res, sid, { type: 'state_rolled_back' });
  }

  // 广播真实 user 消息 id（前端用于把乐观追加的 __optimistic_ id 替换为真实 id）
  if (opts.userMsgId && !streamState.isClientClosed()) {
    emitSse(res, sid, { type: 'user_saved', id: opts.userMsgId });
  }

  let fullContent = '';
  let aborted = false;
  let activatedEntries = [];
  const usageRef = {};

  const session = dbGetWritingSessionById(sessionId);
  const worldId = session?.world_id;
  log.info(`REQUEST START  ${formatMeta({ session: sid, worldId: worldId?.slice(0, 8) ?? null })}`);

  try {
    if (!streamState.isClientClosed()) sendSse(res, { type: 'memory_recall_start' });
    const onRecallEvent = (name, payload) => {
      if (!streamState.isClientClosed()) sendSse(res, { type: name, ...payload });
    };
    const { messages, temperature, maxTokens, model, cacheableSystem, activatedEntries: aEntries } = await buildWritingPrompt(sessionId, { onRecallEvent, diaryInjection: opts.diaryInjection });
    activatedEntries = aEntries ?? [];
    log.info(`PROMPT READY  ${formatMeta({ session: sid, msgs: messages.length, model: model || '', temperature, maxTokens })}`);
    logPrompt(sessionId, messages);
    if (activatedEntries?.length > 0 && !streamState.isClientClosed()) {
      emitSse(res, sid, { type: 'entries_activated', entries: activatedEntries });
    }
    const stream = llm.chat(messages, { temperature, maxTokens, model, cacheableSystem, signal: ac.signal, usageRef, configScope: 'writing', callType: 'writing_main', conversationId: sessionId });
    for await (const chunk of stream) {
      fullContent += chunk;
      if (!streamState.isClientClosed()) sendSse(res, { delta: chunk });
    }
  } catch (err) {
    if (err.name === 'AbortError' || ac.signal.aborted) {
      aborted = true;
    } else {
      log.error(`STREAM ERROR  ${formatMeta({ session: sid, error: err.message })}`);
      if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'error', error: err.message });
      if (!fullContent) {
        streamState.clear();
        if (!streamState.isClientClosed()) res.end();
        return;
      }
    }
  }

  const { savedContent, options, savedAssistant } = await processStreamOutput(
    fullContent, aborted, worldId, sessionId,
    {
      mode: 'writing',
      createMessageFn: createMessage,
      touchSessionFn: touchWritingSession,
      suggestionEnabled: !!getConfig().writing?.suggestion_enabled,
      currentUserContent: opts.userContent ?? getLastUserContent(sessionId),
      configScope: 'writing-aux',
      onSuggestionFallback() {
        if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'suggestion_fallback_started' });
      },
    }
  );
  fullContent = savedContent;

  log.info(`STREAM END  ${formatMeta({ session: sid, chars: fullContent.length, aborted })}`);

  // 持久化 token usage，并同步到返回对象
  if (!aborted && savedAssistant && Object.keys(usageRef).length > 0) {
    updateMessageTokenUsage(savedAssistant.id, usageRef);
    savedAssistant.token_usage = usageRef;
  }

  // 持久化本轮激活的非常驻条目
  if (!aborted && savedAssistant && activatedEntries?.length > 0) {
    updateMessageActivatedEntries(savedAssistant.id, activatedEntries);
    savedAssistant.activated_entries = activatedEntries;
  }

  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted
      ? { aborted: true, assistant: savedAssistant }
      : { done: true, assistant: savedAssistant, options, usage: Object.keys(usageRef).length > 0 ? usageRef : undefined });
  }

  streamState.clear();

  if (!aborted && fullContent) {
    const msgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
    const hasUserMsg = msgs.some((m) => m.role === 'user');

    if (hasUserMsg) {
      // 写作模式无固定角色，characterIds 传 [] 即可（nearby 状态由 combined-state-updater 单独处理）

      // 章节标题条件：本轮 AI 回复是某章节第一条，且 DB 尚无记录
      const newChapter = detectNewChapter(msgs);
      let chapterTitleCondition = false;
      let chapterIndex, chapterMessages;
      if (newChapter) {
        chapterIndex = newChapter.chapterIndex;
        chapterMessages = newChapter.chapterMessages;
        const existing = getChapterTitle(sessionId, chapterIndex);
        if (!existing) {
          // 立即写入默认标题占位，防止并发重复生成
          const defaultTitle = chapterIndex === 1 ? '序章' : '续章';
          upsertChapterTitle(sessionId, chapterIndex, defaultTitle, 1);
          chapterTitleCondition = true;
        }
      }

      const taskSpecs = [
        // title（p2）：仅当 session.title 为 NULL 时入队
        {
          label: 'session-title',
          priority: 2,
          fn: () => generateTitle(sessionId),
          condition: !!(session && !session.title),
          sseEvent: 'title_updated',
          ssePayload: (title) => title ? { type: 'title_updated', title } : null,
          keepSseAlive: true,
        },
        // 章节标题（p2）：writing 专有，仅新章节首轮触发
        {
          label: 'chapter-title',
          priority: 2,
          fn: () => generateChapterTitle(sessionId, chapterIndex, chapterMessages),
          condition: chapterTitleCondition,
          sseEvent: 'chapter_title_updated',
          ssePayload: (title) => title ? { type: 'chapter_title_updated', chapterIndex, title } : null,
          keepSseAlive: true,
        },
        // all-state（p2）：writing 模式推 state_updated SSE（NearbyPanel/StatePanel 按事件刷新）
        {
          label: 'all-state',
          priority: 2,
          fn: () => updateAllStates(worldId, [], sessionId),
          tracksState: true,
          startSseEvent: 'state_queued',
          sseEvent: 'state_updated',
          ssePayload: () => ({ type: 'state_updated' }),
          keepSseAlive: true,
        },
        // turn-record（p3）：不推 SSE
        {
          label: 'turn-record',
          priority: 3,
          fn: () => createTurnRecord(sessionId),
          keepSseAlive: false,
        },
        // diary（p4）：writing 模式推 diary_updated SSE
        {
          label: 'diary',
          priority: 4,
          fn: async () => {
            const latest = getLatestTurnRecord(sessionId);
            if (latest) await checkAndGenerateDiary(sessionId, latest.round_index);
          },
          sseEvent: 'diary_updated',
          ssePayload: () => ({ type: 'diary_updated' }),
          keepSseAlive: true,
        },
      ];

      const { hasSseWaits } = runPostGenTasks(sessionId, taskSpecs, {
        res, streamState, sid,
        emitSse: (payload) => emitSse(res, sid, payload),
      });
      if (hasSseWaits) return;
    }
  }

  if (!streamState.isClientClosed()) res.end();
}

// POST /api/worlds/:worldId/writing-sessions/:sessionId/generate
router.post('/:worldId/writing-sessions/:sessionId/generate', async (req, res) => {
  const { sessionId } = req.params;
  const { content, diaryInjection } = req.body;

  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  // 若有用户输入则先保存
  let userMsgId = null;
  if (content && typeof content === 'string' && content.trim()) {
    const userMsg = createMessage({ session_id: sessionId, role: 'user', content: content.trim() });
    userMsgId = userMsg.id;
    touchWritingSession(sessionId);
    log.info(`POST /generate  ${formatMeta({ session: sessionId.slice(0, 8), len: content.trim().length })}`);
  }

  await runWritingStream(sessionId, res, {
    userMsgId,
    userContent: typeof content === 'string' ? content.trim() : '',
    diaryInjection: typeof diaryInjection === 'string' ? diaryInjection : undefined,
  });
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/stop
router.post('/:worldId/writing-sessions/:sessionId/stop', (req, res) => {
  const { sessionId } = req.params;
  const ac = activeStreams.get(sessionId);
  if (ac) ac.abort();
  res.json({ success: true });
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/continue
router.post('/:worldId/writing-sessions/:sessionId/continue', async (req, res) => {
  const { sessionId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  const worldId = session.world_id;
  const sid = sessionId.slice(0, 8);
  log.info(`POST /continue  ${formatMeta({ session: sid, worldId: worldId?.slice(0, 8) ?? null })}`);

  // 找最后一条 assistant 消息
  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistantIndex = allMsgs.map((m) => m.role).lastIndexOf('assistant');
  const lastAssistant = lastAssistantIndex >= 0 ? allMsgs[lastAssistantIndex] : null;
  if (!lastAssistant) {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: '当前会话没有 AI 回复可续写' })}`);
    return res.status(400).json({ error: '当前会话没有 AI 回复可续写' });
  }
  const hasUserBeforeAssistant = allMsgs.slice(0, lastAssistantIndex).some((m) => m.role === 'user');
  if (!hasUserBeforeAssistant) {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: '当前会话没有可续写的用户-助手轮次' })}`);
    return res.status(400).json({ error: '当前会话没有可续写的用户-助手轮次' });
  }

  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;

  // 等待上一轮状态更新完成
  await awaitPendingStateUpdate(sessionId);

  const originalContent = lastAssistant.content;
  const lastUser = [...allMsgs.slice(0, lastAssistantIndex)].reverse().find((m) => m.role === 'user');
  let newContent = '';
  let aborted = false;
  const usageRef = {};

  try {
    const { messages, temperature, maxTokens, model, cacheableSystem, suggestionText } = await buildWritingPrompt(sessionId);
    log.info(`CONTINUE PROMPT READY  ${formatMeta({ session: sid, msgs: messages.length, model: model || '', temperature, maxTokens })}`);
    logPrompt(sessionId, messages);
    const usePrefill = supportsPrefill(getWritingLlmConfig()?.provider);
    const continuationMessages = buildContinuationMessages(messages, originalContent, { suggestionText, usePrefill });

    const stream = llm.chat(continuationMessages, { temperature, maxTokens, model, cacheableSystem, signal: ac.signal, usageRef, configScope: 'writing', callType: 'writing_continue', conversationId: sessionId });
    for await (const chunk of stream) {
      newContent += chunk;
      if (!streamState.isClientClosed()) sendSse(res, { delta: chunk });
    }
  } catch (err) {
    if (err.name === 'AbortError' || ac.signal.aborted) {
      aborted = true;
    } else {
      log.error(`CONTINUE ERROR  ${formatMeta({ session: sid, error: err.message })}`);
      if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'error', error: err.message });
      if (!newContent) {
        streamState.clear();
        if (!streamState.isClientClosed()) res.end();
        return;
      }
    }
  }

  let mergedAssistant = null;
  let mergedContent = '';
  let continueOptions = [];
  if (newContent) {
    const processed = await processStreamOutput(newContent, aborted, worldId, sessionId, {
      mode: 'writing',
      suggestionEnabled: !!getConfig().writing?.suggestion_enabled,
      currentUserContent: lastUser?.content ?? '',
      configScope: 'writing-aux',
      onSuggestionFallback() {
        if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'suggestion_fallback_started' });
      },
      createMessageFn: () => null,
      touchSessionFn: () => {},
    });
    const processedNew = processed.savedContent;
    continueOptions = processed.options;
    mergedContent = originalContent + '\n\n' + processedNew.replace(/^\n+/, '');
    updateMessageContent(lastAssistant.id, mergedContent);
    if (!aborted && Object.keys(usageRef).length > 0) {
      updateMessageTokenUsage(lastAssistant.id, usageRef);
    }
    if (!aborted) {
      updateMessageNextOptions(lastAssistant.id, continueOptions);
    }
    mergedAssistant = { ...lastAssistant, content: mergedContent };
    if (!aborted && Object.keys(usageRef).length > 0) mergedAssistant.token_usage = usageRef;
    if (!aborted) mergedAssistant.next_options = continueOptions.length > 0 ? continueOptions : null;
    touchWritingSession(sessionId);
  }

  log.info(`CONTINUE END  ${formatMeta({ session: sid, chars: mergedContent.length || newContent.length, aborted })}`);

  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted
      ? { aborted: true, assistant: mergedAssistant }
      : { done: true, assistant: mergedAssistant, options: continueOptions, usage: Object.keys(usageRef).length > 0 ? usageRef : undefined });
  }

  streamState.clear();

  // 续写正常完成后保持 SSE 连接，等后台任务推送完事件后再关闭
  if (!aborted && mergedContent) {
    // 写作模式无固定角色，characterIds 传 [] 即可
    // continue 不触发新章节（轮次未变），故无 title/chapterTitle 任务
    const taskSpecs = [
      // all-state（p2）：writing 模式推 state_updated SSE
      {
        label: 'all-state',
        priority: 2,
        fn: () => updateAllStates(worldId, [], sessionId),
        tracksState: true,
        startSseEvent: 'state_queued',
        sseEvent: 'state_updated',
        ssePayload: () => ({ type: 'state_updated' }),
        keepSseAlive: true,
      },
      // turn-record（p3）：isUpdate=true，UPSERT 覆盖最后一轮，不新增轮次
      {
        label: 'turn-record',
        priority: 3,
        fn: () => createTurnRecord(sessionId, { isUpdate: true }),
        keepSseAlive: false,
      },
      // diary（p4）：writing 模式推 diary_updated SSE
      {
        label: 'diary',
        priority: 4,
        fn: async () => {
          const latest = getLatestTurnRecord(sessionId);
          if (latest) await checkAndGenerateDiary(sessionId, latest.round_index);
        },
        sseEvent: 'diary_updated',
        ssePayload: () => ({ type: 'diary_updated' }),
        keepSseAlive: true,
      },
    ];

    const { hasSseWaits } = runPostGenTasks(sessionId, taskSpecs, {
      res, streamState, sid,
      emitSse: (payload) => emitSse(res, sid, payload),
    });
    if (hasSseWaits) return;
  }

  if (!streamState.isClientClosed()) res.end();
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/impersonate
router.post('/:worldId/writing-sessions/:sessionId/impersonate', async (req, res) => {
  const { worldId, sessionId } = req.params;

  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;

  const persona = getOrCreatePersona(worldId);
  const personaName = persona?.name || '用户';

  try {
    const { messages: baseMessages, temperature, maxTokens, model, cacheableSystem } = await buildWritingPrompt(sessionId, { skipWritingInstructions: true });
    log.info(`POST /impersonate  ${formatMeta({ session: sessionId.slice(0, 8), worldId: worldId.slice(0, 8), msgs: baseMessages.length })}`);
    logPrompt(sessionId, baseMessages);
    const prompt = [...baseMessages];
    while (prompt.length > 0 && prompt[prompt.length - 1].role === 'user') {
      prompt.pop();
    }
    const instruction = renderBackendPrompt('chat-impersonate.md', { PERSONA_NAME: personaName });
    prompt.push({ role: 'user', content: instruction });

    const content = await llm.complete(prompt, {
      temperature,
      maxTokens: 1000,
      model,
      cacheableSystem,
      configScope: 'writing',
      callType: 'writing_impersonate',
      conversationId: sessionId,
    });
    // 剥除 thinking 模型输出的 <think>...</think> 推理块
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    res.json({ content: cleaned });
  } catch (err) {
    log.error(`writing.unhandled ${formatMeta({ method: req.method, path: req.path, msg: err?.message })}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/regenerate
router.post('/:worldId/writing-sessions/:sessionId/regenerate', async (req, res) => {
  const { sessionId } = req.params;
  const { afterMessageId } = req.body;

  if (!afterMessageId) {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'afterMessageId is required' })}`);
    return res.status(400).json({ error: 'afterMessageId is required' });
  }

  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  const afterMessage = getMessageById(afterMessageId);
  if (!afterMessage) {
    log.warn(`writing.not_found ${formatMeta({ method: req.method, path: req.path, id: afterMessageId })}`);
    return res.status(404).json({ error: 'afterMessageId not found' });
  }
  if (afterMessage.session_id !== sessionId) {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'afterMessageId does not belong to this session' })}`);
    return res.status(400).json({ error: 'afterMessageId does not belong to this session' });
  }
  if (afterMessage.role !== 'user') {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'afterMessageId must be a user message' })}`);
    return res.status(400).json({ error: 'afterMessageId must be a user message' });
  }

  // 重新生成前等待同 session 队列空闲，避免旧状态整理完成后覆盖回滚结果，
  // 或旧 SSE 收尾打断新的 regenerate 流。
  await waitForQueueIdle(sessionId);

  await deleteMessagesAfter(afterMessageId);

  const remaining = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const R = remaining.filter((m) => m.role === 'user').length;
  deleteTurnRecordsAfterRound(sessionId, R - 1);
  restoreLtmFromTurnRecord(sessionId, R === 0 ? null : getLatestTurnRecord(sessionId));

  // 清理被截断轮次之后的日记条目
  const diaryToDelete = getDailyEntriesAfterRound(sessionId, R);
  for (const e of diaryToDelete) deleteDiaryFile(sessionId, e.date_str);
  deleteDailyEntriesAfterRound(sessionId, R);

  // 按约定只清理可丢弃的低优先级待处理任务；p2/p3 已通过队列屏障等待完成。
  clearPending(sessionId, 4);

  // 状态回滚：恢复到最近保留的 turn record 快照（无快照时清空回 default）
  const regenWorldId = session.world_id;
  if (regenWorldId) {
    // 写作模式无固定角色（nearby 状态由 turn snapshot 中的 nearby 段独立回滚）
    const lastRecord = getLatestTurnRecordWithSnapshot(sessionId);
    restoreStateFromSnapshot(
      sessionId, regenWorldId, [],
      lastRecord?.state_snapshot ? JSON.parse(lastRecord.state_snapshot) : null,
    );
  }

  await runWritingStream(sessionId, res, { stateRolledBack: !!regenWorldId });
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/edit-assistant
router.post('/:worldId/writing-sessions/:sessionId/edit-assistant', async (req, res) => {
  const { worldId, sessionId } = req.params;
  const { messageId, content } = req.body;

  if (!messageId || !content || typeof content !== 'string') {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'messageId and content are required' })}`);
    return res.status(400).json({ error: 'messageId and content are required' });
  }

  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  updateMessageContent(messageId, content.trim());

  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistant = [...allMsgs].reverse().find((m) => m.role === 'assistant');
  if (lastAssistant?.id === messageId) {
    // 写作模式无固定角色，characterIds 传 [] 即可
    enqueue(sessionId, () => updateAllStates(worldId, [], sessionId), 2, 'all-state').catch(err => log.warn('后台任务失败:', err.message));
  }

  enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch(err => log.warn('后台任务失败:', err.message));

  res.json({ success: true });
});

// ── 章节标题管理 ──

// GET /api/worlds/:worldId/writing-sessions/:sessionId/chapter-titles
router.get('/:worldId/writing-sessions/:sessionId/chapter-titles', (req, res) => {
  const { sessionId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  const titles = getChapterTitlesBySessionId(sessionId);
  res.json(titles);
});

// PUT /api/worlds/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex
// 用户手动编辑章节标题（存 is_default=0，不调用 LLM）
router.put('/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex', (req, res) => {
  const { sessionId, chapterIndex } = req.params;
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    log.warn(`writing.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'title is required' })}`);
    return res.status(400).json({ error: 'title is required' });
  }
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  upsertChapterTitle(sessionId, Number(chapterIndex), title.trim().slice(0, 20), 0);
  res.json({ success: true });
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex/retitle
// LLM 重新生成章节标题
router.post('/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex/retitle', async (req, res) => {
  const { sessionId, chapterIndex } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  const idx = Number(chapterIndex);
  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const chapterMsgs = groupChapterMessages(allMsgs, idx);
  if (chapterMsgs.length === 0) {
    log.warn(`writing.not_found ${formatMeta({ method: req.method, path: req.path, id: `chapter:${idx}` })}`);
    return res.status(404).json({ error: 'Chapter not found' });
  }

  try {
    await waitForQueueIdle(sessionId);

    const title = await generateChapterTitle(sessionId, idx, chapterMsgs);
    if (!title) {
      log.error(`writing.unhandled ${formatMeta({ method: req.method, path: req.path, msg: 'generateChapterTitle returned empty' })}`);
      return res.status(500).json({ error: '生成失败' });
    }
    res.json({ title, chapterIndex: idx });
  } catch (err) {
    log.error(`writing.unhandled ${formatMeta({ method: req.method, path: req.path, msg: err?.message })}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/retitle
// 重新生成会话标题（修复写作 /title 命令失效）
router.post('/:worldId/writing-sessions/:sessionId/retitle', async (req, res) => {
  const { sessionId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  try {
    await waitForQueueIdle(sessionId);

    const title = await generateTitle(sessionId);
    if (!title) return res.json({ title: null });
    res.json({ title });
  } catch (err) {
    log.error(`writing.unhandled ${formatMeta({ method: req.method, path: req.path, msg: err?.message })}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
