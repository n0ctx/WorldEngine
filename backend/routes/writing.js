import { Router } from 'express';

import * as llm from '../llm/index.js';
import { buildWritingPrompt } from '../prompts/assembler.js';
import { getWritingLlmConfig } from '../services/config.js';
import { activeStreams } from '../services/chat.js';
import { logPrompt, createLogger, formatMeta } from '../utils/logger.js';
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
  getMessagesBySessionId,
  touchWritingSession,
} from '../services/writing-sessions.js';
import { getWorldById } from '../services/worlds.js';
import { getCharactersByWorldId } from '../services/characters.js';
import { getOrCreatePersona } from '../services/personas.js';
import { enqueue, waitForQueueIdle } from '../utils/async-queue.js';
import { generateTitle } from '../memory/summarizer.js';
import { updateAllStates } from '../memory/combined-state-updater.js';
import { ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { createTurnRecord } from '../memory/turn-summarizer.js';
import { generateChapterTitle } from '../memory/chapter-title-generator.js';
import { groupChapterMessages, detectNewChapter } from '../utils/chapter-detector.js';
import {
  getChapterTitlesBySessionId,
  upsertChapterTitle,
} from '../db/queries/chapter-titles.js';
import { getMessageById, updateMessageContent } from '../db/queries/messages.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { assertExists } from '../utils/route-helpers.js';
import { analyzeNearbyForCard } from '../services/nearby-card-maker.js';
import { runHook } from '../hooks/hook-registry.js';
import { runWritingContinue } from '../app/writing/run-writing-continue.js';
import { runWritingRegenerate } from '../app/writing/run-writing-regenerate.js';
import { runWritingStream } from '../app/writing/run-writing-stream.js';
import {
  attachSessionStreamSse,
  buildSessionStreamSnapshot,
  emitSessionStreamEvent,
  getRecoverableSessionStreamTask,
  writeSessionStreamSse,
} from '../services/session-stream-task-store.js';

const router = Router();
const log = createLogger('writing');

function emitSse(sessionId, payload, { logEvent = true, taskId } = {}) {
  if (logEvent && payload?.type && payload.type !== 'delta') {
    log.info(
      `SSE ${payload.type.toUpperCase()}  ${formatMeta({
        session: sessionId.slice(0, 8),
        keys: Object.keys(payload),
        title: payload.title,
        hasAssistant: !!payload.assistant,
        error: payload.error,
      })}`
    );
  }
  emitSessionStreamEvent(sessionId, payload, { taskId });
}

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

router.get('/:worldId/writing-sessions', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  res.json(getActiveWritingSessionsByWorldId(worldId));
});

router.post('/:worldId/writing-sessions', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  res.json(createWritingSession(worldId));
});

router.delete('/:worldId/writing-sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  await deleteWritingSession(sessionId);
  res.json({ success: true });
});

router.get('/:worldId/writing-sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  res.json(getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0));
});

router.get('/:worldId/writing-sessions/:sessionId/nearby', (req, res) => {
  const { sessionId } = req.params;
  try {
    res.json(listNearby(sessionId));
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.post('/:worldId/writing-sessions/:sessionId/nearby', (req, res) => {
  const { sessionId } = req.params;
  const characterId = req.body?.character_id;
  if (!characterId || typeof characterId !== 'string') {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'character_id is required',
      })}`
    );
    return res.status(400).json({ error: 'character_id is required' });
  }
  try {
    const id = addSavedFromCharacter(sessionId, characterId);
    res.status(201).json({ id });
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.patch('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId', (req, res) => {
  const { sessionId, nearbyId } = req.params;
  const { is_saved, persona, name } = req.body ?? {};
  try {
    if (typeof name === 'string') renameNearby(sessionId, nearbyId, name);
    if (is_saved !== undefined) setNearbyIsSaved(sessionId, nearbyId, is_saved ? 1 : 0);
    if (persona !== undefined) patchNearbyPersona(sessionId, nearbyId, persona);
    const row = listNearby(sessionId).find((nearby) => nearby.id === nearbyId);
    if (!row) {
      log.warn(`writing.not_found ${formatMeta({ method: req.method, path: req.path, id: nearbyId })}`);
      return res.status(404).json({ error: 'nearby not found in session' });
    }
    res.json(row);
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.patch('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/state', (req, res) => {
  const { sessionId, nearbyId } = req.params;
  const { field_key, value_json } = req.body ?? {};
  if (!field_key || typeof field_key !== 'string') {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'field_key is required',
      })}`
    );
    return res.status(400).json({ error: 'field_key is required' });
  }
  try {
    patchNearbyState(sessionId, nearbyId, field_key, value_json ?? null);
    res.json({ ok: true });
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.post('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/analyze', async (req, res) => {
  const { sessionId, nearbyId } = req.params;
  try {
    res.json(await analyzeNearbyForCard(sessionId, nearbyId));
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.delete('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId', (req, res) => {
  const { sessionId, nearbyId } = req.params;
  try {
    removeNearby(sessionId, nearbyId);
    res.status(204).end();
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.get('/:worldId/characters', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  res.json(getCharactersByWorldId(worldId));
});

router.post('/:worldId/writing-sessions/:sessionId/generate', async (req, res) => {
  const { sessionId } = req.params;
  const { content, diaryInjection } = req.body;

  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  let userMsgId = null;
  if (content && typeof content === 'string' && content.trim()) {
    const trimmedContent = content.trim();
    await runHook('message:user:before', { sessionId, content: trimmedContent, attachments: [] });
    const userMsg = createMessage({ session_id: sessionId, role: 'user', content: trimmedContent });
    userMsgId = userMsg.id;
    touchWritingSession(sessionId);
    await runHook('message:user:saved', { message: userMsg, sessionId });
    log.info(`POST /generate  ${formatMeta({ session: sessionId.slice(0, 8), len: trimmedContent.length })}`);
  }

  await runWritingStream({
    sessionId,
    emitSse: (payload, options) => emitSse(sessionId, payload, options),
    attachSse: (task) => attachSessionStreamSse(sessionId, task.id, res),
    activeStreams,
    userMsgId,
    userContent: typeof content === 'string' ? content.trim() : '',
    diaryInjection: typeof diaryInjection === 'string' ? diaryInjection : undefined,
  });
});

router.post('/:worldId/writing-sessions/:sessionId/stop', (req, res) => {
  const { sessionId } = req.params;
  const ac = activeStreams.get(sessionId);
  if (ac) ac.abort();
  res.json({ success: true });
});

router.post('/:worldId/writing-sessions/:sessionId/continue', async (req, res) => {
  const { sessionId } = req.params;
  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf('assistant');
  if (lastAssistantIndex < 0) {
    return res.status(400).json({ error: '当前会话没有 AI 回复可续写' });
  }
  const hasUserBeforeAssistant = messages
    .slice(0, lastAssistantIndex)
    .some((message) => message.role === 'user');
  if (!hasUserBeforeAssistant) {
    return res.status(400).json({ error: '当前会话没有可续写的用户-助手轮次' });
  }

  try {
    await runWritingContinue({
      sessionId,
      emitSse: (payload, options) => emitSse(sessionId, payload, options),
      attachSse: (task) => attachSessionStreamSse(sessionId, task.id, res),
      activeStreams,
    });
  } catch (err) {
    if (err?.status) {
      log.warn(
        `writing.bad_request ${formatMeta({
          method: req.method,
          path: req.path,
          reason: err.message,
        })}`
      );
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

router.post('/:worldId/writing-sessions/:sessionId/impersonate', async (req, res) => {
  const { worldId, sessionId } = req.params;

  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;

  const persona = getOrCreatePersona(worldId);
  const personaName = persona?.name || '用户';

  try {
    const {
      messages: baseMessages,
      temperature,
      maxTokens,
      model,
      cacheableSystem,
    } = await buildWritingPrompt(sessionId, { skipWritingInstructions: true });
    log.info(
      `POST /impersonate  ${formatMeta({
        session: sessionId.slice(0, 8),
        worldId: worldId.slice(0, 8),
        msgs: baseMessages.length,
      })}`
    );
    logPrompt(sessionId, baseMessages);
    const prompt = [...baseMessages];
    while (prompt.length > 0 && prompt[prompt.length - 1].role === 'user') {
      prompt.pop();
    }
    const instruction = renderBackendPrompt('chat-impersonate.md', {
      PERSONA_NAME: personaName,
    });
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
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    res.json({ content: cleaned });
  } catch (err) {
    log.error(
      `writing.unhandled ${formatMeta({
        method: req.method,
        path: req.path,
        msg: err?.message,
      })}`
    );
    res.status(500).json({ error: err.message });
  }
});

router.post('/:worldId/writing-sessions/:sessionId/regenerate', async (req, res) => {
  const { sessionId } = req.params;
  const { afterMessageId } = req.body;

  if (!afterMessageId) {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'afterMessageId is required',
      })}`
    );
    return res.status(400).json({ error: 'afterMessageId is required' });
  }

  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  const afterMessage = getMessageById(afterMessageId);
  if (!afterMessage) {
    log.warn(`writing.not_found ${formatMeta({ method: req.method, path: req.path, id: afterMessageId })}`);
    return res.status(404).json({ error: 'afterMessageId not found' });
  }
  if (afterMessage.session_id !== sessionId) {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'afterMessageId does not belong to this session',
      })}`
    );
    return res.status(400).json({ error: 'afterMessageId does not belong to this session' });
  }
  if (afterMessage.role !== 'user') {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'afterMessageId must be a user message',
      })}`
    );
    return res.status(400).json({ error: 'afterMessageId must be a user message' });
  }

  await runWritingRegenerate({
    sessionId,
    afterMessageId,
    emitSse: (payload, options) => emitSse(sessionId, payload, options),
    attachSse: (task) => attachSessionStreamSse(sessionId, task.id, res),
    activeStreams,
  });
});

router.get('/:worldId/writing-sessions/:sessionId/recover-stream', (req, res) => {
  const task = getRecoverableSessionStreamTask(req.params.sessionId);
  res.json({ task: task ? buildSessionStreamSnapshot(task) : null });
});

router.get('/:worldId/writing-sessions/:sessionId/stream', (req, res) => {
  const task = getRecoverableSessionStreamTask(req.params.sessionId);
  if (!task) return res.status(404).json({ error: 'stream task not found' });
  attachSessionStreamSse(req.params.sessionId, task.id, res);
  writeSessionStreamSse(res, { type: 'stream_snapshot', task: buildSessionStreamSnapshot(task) });
});

router.post('/:worldId/writing-sessions/:sessionId/edit-assistant', async (req, res) => {
  const { worldId, sessionId } = req.params;
  const { messageId, content } = req.body;

  if (!messageId || !content || typeof content !== 'string') {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'messageId and content are required',
      })}`
    );
    return res.status(400).json({ error: 'messageId and content are required' });
  }

  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  updateMessageContent(messageId, content.trim());

  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistant = [...allMsgs].reverse().find((message) => message.role === 'assistant');
  if (lastAssistant?.id === messageId) {
    enqueue(sessionId, () => updateAllStates(worldId, [], sessionId), 2, 'all-state').catch((err) =>
      log.warn('后台任务失败:', err.message)
    );
  }

  enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch((err) =>
    log.warn('后台任务失败:', err.message)
  );

  res.json({ success: true });
});

router.get('/:worldId/writing-sessions/:sessionId/chapter-titles', (req, res) => {
  const { sessionId } = req.params;
  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  res.json(getChapterTitlesBySessionId(sessionId));
});

router.put('/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex', (req, res) => {
  const { sessionId, chapterIndex } = req.params;
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'title is required',
      })}`
    );
    return res.status(400).json({ error: 'title is required' });
  }
  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  upsertChapterTitle(sessionId, Number(chapterIndex), title.trim().slice(0, 20), 0);
  res.json({ success: true });
});

router.post('/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex/retitle', async (req, res) => {
  const { sessionId, chapterIndex } = req.params;
  const session = getWritingSessionById(sessionId);
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
      log.error(
        `writing.unhandled ${formatMeta({
          method: req.method,
          path: req.path,
          msg: 'generateChapterTitle returned empty',
        })}`
      );
      return res.status(500).json({ error: '生成失败' });
    }
    res.json({ title, chapterIndex: idx });
  } catch (err) {
    log.error(
      `writing.unhandled ${formatMeta({
        method: req.method,
        path: req.path,
        msg: err?.message,
      })}`
    );
    res.status(500).json({ error: err.message });
  }
});

router.post('/:worldId/writing-sessions/:sessionId/retitle', async (req, res) => {
  const { sessionId } = req.params;
  const session = getWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  try {
    await waitForQueueIdle(sessionId);
    const title = await generateTitle(sessionId);
    if (!title) return res.json({ title: null });
    res.json({ title });
  } catch (err) {
    log.error(
      `writing.unhandled ${formatMeta({
        method: req.method,
        path: req.path,
        msg: err?.message,
      })}`
    );
    res.status(500).json({ error: err.message });
  }
});

export default router;
