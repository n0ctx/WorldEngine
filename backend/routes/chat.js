import { Router } from 'express';

import * as llm from '../llm/index.js';
import {
  activeStreams,
  buildContext,
  saveAttachments,
} from '../services/chat.js';
import {
  createMessage,
  getMessageById,
  getMessagesBySessionId,
  getSessionById,
  touchSession,
  updateSessionTitle,
} from '../services/sessions.js';
import { getCharacterById } from '../services/characters.js';
import { getWorldById } from '../services/worlds.js';
import { enqueue, waitForQueueIdle } from '../utils/async-queue.js';
import { createTurnRecord } from '../memory/turn-summarizer.js';
import { updateAllStates } from '../memory/combined-state-updater.js';
import { getOrCreatePersona } from '../services/personas.js';
import { updateMessageContent } from '../db/queries/messages.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import {
  ALL_MESSAGES_LIMIT,
  LLM_TASK_TEMPERATURE,
  LLM_TITLE_MAX_TOKENS,
} from '../utils/constants.js';
import { renderBackendPrompt, loadBackendPrompt } from '../prompts/prompt-loader.js';
import { assertExists } from '../utils/route-helpers.js';
import { stripThinkBlocksFromText } from '../utils/turn-dialogue.js';
import { runHook } from '../hooks/hook-registry.js';
import { runChatContinue } from '../app/chat/run-chat-continue.js';
import { runChatRegenerate } from '../app/chat/run-chat-regenerate.js';
import { runChatStream } from '../app/chat/run-chat-stream.js';
import {
  attachSessionStreamSse,
  buildSessionStreamSnapshot,
  emitSessionStreamEvent,
  getRecoverableSessionStreamTask,
  writeSessionStreamSse,
} from '../services/session-stream-task-store.js';

const router = Router();
const log = createLogger('chat');

function emitSse(sessionId, payload, { logEvent = true, taskId } = {}) {
  if (logEvent && payload?.type && payload.type !== 'delta') {
    log.info(
      `SSE ${payload.type.toUpperCase()}  ${formatMeta({
        session: sessionId.slice(0, 8),
        keys: Object.keys(payload),
        hit: payload.hit,
        candidates: Array.isArray(payload.candidates) ? payload.candidates.length : undefined,
        expanded: Array.isArray(payload.expanded) ? payload.expanded.length : undefined,
        hasAssistant: !!payload.assistant,
        title: payload.title,
        error: payload.error,
      })}`
    );
  }
  emitSessionStreamEvent(sessionId, payload, { taskId });
}

router.post('/:sessionId/chat', async (req, res) => {
  const { sessionId } = req.params;
  const { content, attachments, diaryInjection } = req.body;

  if (!content || typeof content !== 'string') {
    log.warn(
      `chat.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'content is required',
      })}`
    );
    return res.status(400).json({ error: 'content is required' });
  }

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  log.info(
    `POST /chat  ${formatMeta({
      session: sessionId.slice(0, 8),
      len: content.length,
      attachments: attachments?.length ?? 0,
      hasDiaryInject: !!diaryInjection,
    })}`
  );

  await runHook('message:user:before', { sessionId, content, attachments: attachments ?? [] });
  const userMsg = createMessage({ session_id: sessionId, role: 'user', content });
  touchSession(sessionId);

  if (attachments && attachments.length > 0) {
    userMsg.attachments = saveAttachments(userMsg.id, attachments);
    log.info(
      `ATTACHMENTS SAVED  ${formatMeta({
        session: sessionId.slice(0, 8),
        userMsgId: userMsg.id.slice(0, 8),
        count: attachments.length,
      })}`
    );
  }

  await runHook('message:user:saved', { message: userMsg, sessionId });

  await runChatStream({
    sessionId,
    emitSse: (payload, options) => emitSse(sessionId, payload, options),
    attachSse: (task) => attachSessionStreamSse(sessionId, task.id, res),
    activeStreams,
    userMsgId: userMsg.id,
    userContent: content,
    diaryInjection: typeof diaryInjection === 'string' ? diaryInjection : undefined,
  });
});

router.post('/:sessionId/stop', (req, res) => {
  const { sessionId } = req.params;
  const ac = activeStreams.get(sessionId);
  if (ac) ac.abort();
  res.json({ success: true });
});

router.post('/:sessionId/regenerate', async (req, res) => {
  const { sessionId } = req.params;
  const { afterMessageId } = req.body;

  if (!afterMessageId) {
    log.warn(
      `chat.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'afterMessageId is required',
      })}`
    );
    return res.status(400).json({ error: 'afterMessageId is required' });
  }

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  const afterMessage = getMessageById(afterMessageId);
  if (!afterMessage) {
    log.warn(`chat.not_found ${formatMeta({ method: req.method, path: req.path, id: afterMessageId })}`);
    return res.status(404).json({ error: 'afterMessageId not found' });
  }
  if (afterMessage.session_id !== sessionId) {
    log.warn(
      `chat.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'afterMessageId does not belong to this session',
      })}`
    );
    return res.status(400).json({ error: 'afterMessageId does not belong to this session' });
  }
  if (afterMessage.role !== 'user') {
    log.warn(
      `chat.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'afterMessageId must be a user message',
      })}`
    );
    return res.status(400).json({ error: 'afterMessageId must be a user message' });
  }

  log.info(
    `POST /regenerate  ${formatMeta({
      session: sessionId.slice(0, 8),
      after: afterMessageId.slice(0, 8),
    })}`
  );

  await runChatRegenerate({
    sessionId,
    afterMessageId,
    emitSse: (payload, options) => emitSse(sessionId, payload, options),
    attachSse: (task) => attachSessionStreamSse(sessionId, task.id, res),
    activeStreams,
  });
});

router.post('/:sessionId/continue', async (req, res) => {
  const { sessionId } = req.params;
  const session = getSessionById(sessionId);
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
    await runChatContinue({
      sessionId,
      emitSse: (payload, options) => emitSse(sessionId, payload, options),
      attachSse: (task) => attachSessionStreamSse(sessionId, task.id, res),
      activeStreams,
    });
  } catch (err) {
    if (err?.status) {
      log.warn(
        `chat.bad_request ${formatMeta({
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

router.get('/:sessionId/recover-stream', (req, res) => {
  const task = getRecoverableSessionStreamTask(req.params.sessionId);
  res.json({ task: task ? buildSessionStreamSnapshot(task) : null });
});

router.get('/:sessionId/stream', (req, res) => {
  const task = getRecoverableSessionStreamTask(req.params.sessionId);
  if (!task) return res.status(404).json({ error: 'stream task not found' });
  attachSessionStreamSse(req.params.sessionId, task.id, res);
  writeSessionStreamSse(res, { type: 'stream_snapshot', task: buildSessionStreamSnapshot(task) });
});

router.post('/:sessionId/impersonate', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  const world = character?.world_id ? getWorldById(character.world_id) : null;
  if (!character || !world) {
    log.warn(
      `chat.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'Session is missing character/world context',
      })}`
    );
    return res.status(400).json({ error: 'Session is missing character/world context' });
  }

  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '用户';

  try {
    const { messages: baseMessages, overrides } = await buildContext(sessionId);
    const prompt = [...baseMessages];
    while (prompt.length > 0 && prompt[prompt.length - 1].role === 'user') {
      prompt.pop();
    }

    const instruction = renderBackendPrompt('chat-impersonate.md', {
      PERSONA_NAME: personaName,
    });
    prompt.push({ role: 'user', content: instruction });

    const raw = await llm.complete(prompt, {
      temperature: overrides.temperature,
      maxTokens: overrides.maxTokens ?? 1000,
      cacheableSystem: overrides.cacheableSystem,
      thinking_level: null,
      callType: 'impersonate',
      conversationId: sessionId,
    });
    const content = stripThinkBlocksFromText(raw).trim();
    res.json({ content });
  } catch (err) {
    log.error(
      `chat.unhandled ${formatMeta({
        method: req.method,
        path: req.path,
        msg: err?.message,
      })}`
    );
    res.status(500).json({ error: err.message });
  }
});

router.post('/:sessionId/edit-assistant', async (req, res) => {
  const { sessionId } = req.params;
  const { messageId, content } = req.body;

  if (!messageId || !content || typeof content !== 'string') {
    log.warn(
      `chat.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'messageId and content are required',
      })}`
    );
    return res.status(400).json({ error: 'messageId and content are required' });
  }

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  const trimmedContent = content.trim();
  updateMessageContent(messageId, trimmedContent);
  await runHook('message:edited', { id: messageId, sessionId, content: trimmedContent });

  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistant = [...allMsgs].reverse().find((message) => message.role === 'assistant');
  if (lastAssistant?.id === messageId) {
    const characterId = session.character_id;
    const character = characterId ? getCharacterById(characterId) : null;
    const worldId = character?.world_id ?? null;
    enqueue(sessionId, () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId), 2, 'all-state').catch((err) =>
      log.warn('后台任务失败:', err.message)
    );
  }

  enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch((err) =>
    log.warn('后台任务失败:', err.message)
  );

  res.json({ success: true });
});

router.post('/:sessionId/retitle', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  try {
    await waitForQueueIdle(sessionId);

    const { messages, overrides } = await buildContext(sessionId);
    const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
    const lastAssistant = [...allMsgs].reverse().find((message) => message.role === 'assistant');

    const titlePrompt = [...messages];
    if (lastAssistant) {
      const cleanContent = stripThinkBlocksFromText(lastAssistant.content).trim();
      titlePrompt.push({ role: 'assistant', content: cleanContent });
    }
    titlePrompt.push({
      role: 'user',
      content: loadBackendPrompt('memory-retitle-generation.md'),
    });

    const raw = await llm.complete(titlePrompt, {
      temperature: overrides.temperature ?? LLM_TASK_TEMPERATURE,
      maxTokens: LLM_TITLE_MAX_TOKENS,
      thinking_level: null,
      callType: 'retitle',
      conversationId: sessionId,
    });
    if (!raw) return res.json({ title: null });

    const title = stripThinkBlocksFromText(raw)
      .trim()
      .replace(/["'"'「」『』《》【】]/g, '')
      .slice(0, 15);

    updateSessionTitle(sessionId, title);
    log.info(`retitle DONE  session=${sessionId.slice(0, 8)}  title="${title}"`);
    res.json({ title });
  } catch (err) {
    log.error(
      `chat.unhandled ${formatMeta({
        method: req.method,
        path: req.path,
        msg: err?.message,
      })}`
    );
    res.status(500).json({ error: err.message });
  }
});

export default router;
