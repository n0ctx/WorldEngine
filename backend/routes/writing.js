import { Router } from 'express';
import * as llm from '../llm/index.js';
import { buildWritingPrompt } from '../prompts/assembler.js';
import { activeStreams } from '../services/chat.js';
import { logPrompt } from '../utils/logger.js';
import {
  createWritingSession,
  getWritingSessionsByWorldId,
  getWritingSessionById,
  deleteWritingSession,
  getWritingSessionCharacters,
  addWritingSessionCharacter,
  removeWritingSessionCharacter,
  createMessage,
  getMessagesBySessionId,
  touchWritingSession,
  deleteAllMessages,
  deleteMessagesAfter,
} from '../services/writing-sessions.js';
import { getWorldById } from '../services/worlds.js';
import { getCharactersByWorldId } from '../services/characters.js';
import { getOrCreatePersona } from '../services/personas.js';
import { enqueue, clearPending } from '../utils/async-queue.js';
import { generateTitle } from '../memory/summarizer.js';
import { updateAllStates } from '../memory/combined-state-updater.js';
import { clearCompressedContext } from '../db/queries/sessions.js';
import { applyRules } from '../utils/regex-runner.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { ALL_MESSAGES_LIMIT, LLM_IMPERSONATE_MAX_TOKENS } from '../utils/constants.js';
import { createTurnRecord } from '../memory/turn-summarizer.js';
import { getWritingSessionById as dbGetWritingSessionById } from '../db/queries/writing-sessions.js';
import { updateMessageContent } from '../db/queries/messages.js';
import { getTurnRecordsBySessionId, deleteTurnRecordsAfterRound } from '../db/queries/turn-records.js';
import {
  beginStreamSession,
  buildContinuationMessages,
  sendSse,
} from './stream-helpers.js';
import { stripAsstContext, extractNextPromptOptions } from '../utils/turn-dialogue.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();
const log = createLogger('writing');

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
  const sessions = getWritingSessionsByWorldId(worldId);
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

// DELETE /api/worlds/:worldId/writing-sessions/:sessionId/messages
router.delete('/:worldId/writing-sessions/:sessionId/messages', async (req, res) => {
  const { sessionId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  await deleteAllMessages(sessionId);
  clearCompressedContext(sessionId);
  res.json({ success: true });
});

// ── 激活角色管理 ──

// GET /api/worlds/:worldId/writing-sessions/:sessionId/characters
router.get('/:worldId/writing-sessions/:sessionId/characters', (req, res) => {
  const { sessionId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  const characters = getWritingSessionCharacters(sessionId);
  res.json(characters);
});

// PUT /api/worlds/:worldId/writing-sessions/:sessionId/characters/:characterId
router.put('/:worldId/writing-sessions/:sessionId/characters/:characterId', (req, res) => {
  const { sessionId, characterId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  addWritingSessionCharacter(sessionId, characterId);
  res.json({ success: true });
});

// DELETE /api/worlds/:worldId/writing-sessions/:sessionId/characters/:characterId
router.delete('/:worldId/writing-sessions/:sessionId/characters/:characterId', (req, res) => {
  const { sessionId, characterId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;
  removeWritingSessionCharacter(sessionId, characterId);
  res.json({ success: true });
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

async function runWritingStream(sessionId, res) {
  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;
  const sid = sessionId.slice(0, 8);

  let fullContent = '';
  let aborted = false;

  const session = dbGetWritingSessionById(sessionId);
  const worldId = session?.world_id;
  log.info(`REQUEST START  ${formatMeta({ session: sid, worldId: worldId?.slice(0, 8) ?? null })}`);

  try {
    if (!streamState.isClientClosed()) sendSse(res, { type: 'memory_recall_start' });
    const onRecallEvent = (name, payload) => {
      if (!streamState.isClientClosed()) sendSse(res, { type: name, ...payload });
    };
    const { messages, temperature, maxTokens, model } = await buildWritingPrompt(sessionId, { onRecallEvent });
    log.info(`PROMPT READY  ${formatMeta({ session: sid, msgs: messages.length, model: model || '', temperature, maxTokens })}`);
    logPrompt(sessionId, messages);
    const stream = llm.chat(messages, { temperature, maxTokens, model, signal: ac.signal });
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

  if (fullContent) {
    fullContent = stripAsstContext(fullContent);
  }

  // 提取选项（仅非中断时；剥除后内容不入 DB）
  let options = [];
  if (!aborted && fullContent) {
    const extracted = extractNextPromptOptions(fullContent);
    fullContent = extracted.content;
    options = extracted.options;
  }

  if (aborted && fullContent) {
    fullContent += '\n\n[已中断]';
  }

  let savedAssistant = null;
  if (fullContent) {
    const savedContent = aborted ? fullContent : applyRules(fullContent, 'ai_output', worldId, 'writing');
    savedAssistant = createMessage({ session_id: sessionId, role: 'assistant', content: savedContent });
    fullContent = savedContent;
    touchWritingSession(sessionId);
  }

  log.info(`STREAM END  ${formatMeta({ session: sid, chars: fullContent.length, aborted })}`);

  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted
      ? { aborted: true, assistant: savedAssistant }
      : { done: true, assistant: savedAssistant, options });
  }

  streamState.clear();

  if (!aborted && fullContent) {
    const msgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
    const hasUserMsg = msgs.some((m) => m.role === 'user');

    if (hasUserMsg) {
      // 标题生成
      if (session && !session.title) {
        log.info(`QUEUE TITLE  ${formatMeta({ session: sid, priority: 2 })}`);
        enqueue(sessionId, () => generateTitle(sessionId), 2)
          .then((title) => {
            if (title && !streamState.isClientClosed()) emitSse(res, sid, { type: 'title_updated', title });
          })
          .catch(err => log.warn('后台任务失败:', err.message))
          .finally(() => {
            if (!streamState.isClientClosed()) res.end();
          });

        // 状态更新（世界/角色/玩家合并为单次 LLM 调用）
        const activeCharacters = getWritingSessionCharacters(sessionId);
        log.info(`QUEUE ALL-STATE  ${formatMeta({ session: sid, priority: 2, worldId: worldId?.slice(0, 8) ?? null, characters: activeCharacters.map((c) => c.id.slice(0, 8)) })}`);
        enqueue(sessionId, () => updateAllStates(worldId, activeCharacters.map((c) => c.id), sessionId), 2, 'all-state').catch(err => log.warn('后台任务失败:', err.message));
        // turn record（在状态更新之后入队，捕获本轮结果状态）
        log.info(`QUEUE TURN-RECORD  ${formatMeta({ session: sid, priority: 3 })}`);
        enqueue(sessionId, () => createTurnRecord(sessionId), 3, 'turn-record').catch(err => log.warn('后台任务失败:', err.message));
        return;
      }

      // 状态更新（世界/角色/玩家合并为单次 LLM 调用）
      const activeCharacters = getWritingSessionCharacters(sessionId);
      log.info(`QUEUE ALL-STATE  ${formatMeta({ session: sid, priority: 2, worldId: worldId?.slice(0, 8) ?? null, characters: activeCharacters.map((c) => c.id.slice(0, 8)) })}`);
      enqueue(sessionId, () => updateAllStates(worldId, activeCharacters.map((c) => c.id), sessionId), 2, 'all-state').catch(err => log.warn('后台任务失败:', err.message));
      log.info(`QUEUE TURN-RECORD  ${formatMeta({ session: sid, priority: 3 })}`);
      enqueue(sessionId, () => createTurnRecord(sessionId), 3, 'turn-record').catch(err => log.warn('后台任务失败:', err.message));
    }
  }

  if (!streamState.isClientClosed()) res.end();
}

// POST /api/worlds/:worldId/writing-sessions/:sessionId/generate
router.post('/:worldId/writing-sessions/:sessionId/generate', async (req, res) => {
  const { sessionId } = req.params;
  const { content } = req.body;

  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  // 若有用户输入则先保存
  if (content && typeof content === 'string' && content.trim()) {
    createMessage({ session_id: sessionId, role: 'user', content: content.trim() });
    touchWritingSession(sessionId);
    log.info(`POST /generate  ${formatMeta({ session: sessionId.slice(0, 8), len: content.trim().length })}`);
  }

  await runWritingStream(sessionId, res);
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

  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;

  // 找最后一条 assistant 消息
  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistant = [...allMsgs].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant) {
    emitSse(res, sid, { type: 'error', error: '没有可续写的内容' });
    res.end();
    return;
  }

  const originalContent = lastAssistant.content;
  let newContent = '';
  let aborted = false;

  try {
    const { messages, temperature, maxTokens, model } = await buildWritingPrompt(sessionId);
    log.info(`CONTINUE PROMPT READY  ${formatMeta({ session: sid, msgs: messages.length, model: model || '', temperature, maxTokens })}`);
    logPrompt(sessionId, messages);
    const continuationMessages = buildContinuationMessages(messages, originalContent);

    const stream = llm.chat(continuationMessages, { temperature, maxTokens, model, signal: ac.signal });
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

  if (newContent) {
    newContent = stripAsstContext(newContent);
  }

  if (aborted && newContent) {
    newContent += '\n\n[已中断]';
  }

  if (newContent) {
    const processedNew = aborted ? newContent : applyRules(newContent, 'ai_output', worldId, 'writing');
    // 续写：合并到上一条 assistant 消息
    updateMessageContent(lastAssistant.id, originalContent + '\n\n' + processedNew.replace(/^\n+/, ''));
    touchWritingSession(sessionId);
  }

  log.info(`CONTINUE END  ${formatMeta({ session: sid, chars: newContent.length, aborted })}`);

  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted ? { aborted: true } : { done: true });
  }

  streamState.clear();

  // 续写正常完成后更新 turn record（isUpdate=true 覆盖最后一轮）
  if (!aborted && newContent) {
    const activeCharacters = getWritingSessionCharacters(sessionId);
    log.info(`QUEUE ALL-STATE  ${formatMeta({ session: sid, priority: 2, worldId: worldId?.slice(0, 8) ?? null, characters: activeCharacters.map((character) => character.id.slice(0, 8)) })}`);
    enqueue(sessionId, () => updateAllStates(worldId, activeCharacters.map((character) => character.id), sessionId), 2, 'all-state').catch(err => log.warn('后台任务失败:', err.message));
    log.info(`QUEUE TURN-RECORD  ${formatMeta({ session: sid, priority: 3, isUpdate: true })}`);
    enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch(err => log.warn('后台任务失败:', err.message));
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
    const { messages: baseMessages, temperature, maxTokens, model } = await buildWritingPrompt(sessionId);
    log.info(`POST /impersonate  ${formatMeta({ session: sessionId.slice(0, 8), worldId: worldId.slice(0, 8), msgs: baseMessages.length })}`);
    logPrompt(sessionId, baseMessages);
    const prompt = [...baseMessages];
    while (prompt.length > 0 && prompt[prompt.length - 1].role === 'user') {
      prompt.pop();
    }
    const instruction = renderBackendPrompt('writing-impersonate.md', { PERSONA_NAME: personaName });
    prompt.push({ role: 'user', content: instruction });

    const content = await llm.complete(prompt, {
      temperature,
      maxTokens: Math.min(maxTokens ?? LLM_IMPERSONATE_MAX_TOKENS, LLM_IMPERSONATE_MAX_TOKENS),
      model,
    });
    // 剥除 thinking 模型输出的 <think>...</think> 推理块
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    res.json({ content: cleaned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/regenerate
router.post('/:worldId/writing-sessions/:sessionId/regenerate', async (req, res) => {
  const { sessionId } = req.params;
  const { afterMessageId } = req.body;

  if (!afterMessageId) return res.status(400).json({ error: 'afterMessageId is required' });

  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  await deleteMessagesAfter(afterMessageId);

  const remaining = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const R = remaining.filter((m) => m.role === 'user').length;
  deleteTurnRecordsAfterRound(sessionId, R - 1);
  clearPending(sessionId, 4);

  await runWritingStream(sessionId, res);
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/edit-assistant
router.post('/:worldId/writing-sessions/:sessionId/edit-assistant', async (req, res) => {
  const { worldId, sessionId } = req.params;
  const { messageId, content } = req.body;

  if (!messageId || !content || typeof content !== 'string') {
    return res.status(400).json({ error: 'messageId and content are required' });
  }

  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  updateMessageContent(messageId, content.trim());

  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistant = [...allMsgs].reverse().find((m) => m.role === 'assistant');
  if (lastAssistant?.id === messageId) {
    const activeCharacters = getWritingSessionCharacters(sessionId);
    enqueue(sessionId, () => updateAllStates(worldId, activeCharacters.map((c) => c.id), sessionId), 2, 'all-state').catch(err => log.warn('后台任务失败:', err.message));
  }

  enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch(err => log.warn('后台任务失败:', err.message));

  res.json({ success: true });
});

export default router;
