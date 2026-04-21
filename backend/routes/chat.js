import { Router } from 'express';
import * as llm from '../llm/index.js';
import { buildContext, activeStreams, saveAttachments, processStreamOutput } from '../services/chat.js';
import {
  createMessage,
  getMessagesBySessionId,
  touchSession,
  getSessionById,
  deleteMessagesAfter,
  deleteAllMessagesBySessionId,
  updateMessageContent,
  updateSessionTitle,
} from '../services/sessions.js';
import { getCharacterById } from '../services/characters.js';
import { getWorldById } from '../services/worlds.js';
import { enqueue, clearPending } from '../utils/async-queue.js';
import { generateTitle } from '../memory/summarizer.js';
import { updateAllStates } from '../memory/combined-state-updater.js';
import { getOrCreatePersona } from '../services/personas.js';
import { createTurnRecord } from '../memory/turn-summarizer.js';
import { getTurnRecordsBySessionId, deleteTurnRecordsAfterRound, deleteTurnRecordsBySessionId, getLatestTurnRecord } from '../db/queries/turn-records.js';
import { restoreStateFromSnapshot } from '../memory/state-rollback.js';
import { clearCompressedContext } from '../db/queries/sessions.js';
import { applyRules } from '../utils/regex-runner.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { ALL_MESSAGES_LIMIT, LLM_TASK_TEMPERATURE, LLM_TITLE_MAX_TOKENS } from '../utils/constants.js';
import { renderBackendPrompt, loadBackendPrompt } from '../prompts/prompt-loader.js';
import {
  beginStreamSession,
  buildContinuationMessages,
  sendSse,
} from './stream-helpers.js';
import { stripAsstContext, extractNextPromptOptions } from '../utils/turn-dialogue.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();
const log = createLogger('chat');

function emitSse(res, sid, payload, { logEvent = true } = {}) {
  if (logEvent && payload?.type && payload.type !== 'delta') {
    log.info(`SSE ${payload.type.toUpperCase()}  ${formatMeta({
      session: sid,
      keys: Object.keys(payload),
      hit: payload.hit,
      candidates: Array.isArray(payload.candidates) ? payload.candidates.length : undefined,
      expanded: Array.isArray(payload.expanded) ? payload.expanded.length : undefined,
      hasAssistant: !!payload.assistant,
      title: payload.title,
      error: payload.error,
    })}`);
  }
  sendSse(res, payload);
}

/**
 * 入队后台异步任务（title + all-state + turn-record）
 * @returns {boolean} true = 有 title 任务，调用方应 return（等待 finally 关闭连接）
 */
function enqueueStreamTasks({ sessionId, sid, worldId, characterId, session, streamState, res, turnRecordOpts }) {
  if (session && !session.title) {
    log.info(`QUEUE TITLE  ${formatMeta({ session: sid, priority: 2 })}`);
    enqueue(sessionId, () => generateTitle(sessionId), 2, 'title')
      .then((title) => {
        if (title && !streamState.isClientClosed()) emitSse(res, sid, { type: 'title_updated', title });
      })
      .catch((err) => log.warn('后台任务失败:', err.message))
      .finally(() => { if (!streamState.isClientClosed()) res.end(); });
  }
  log.info(`QUEUE ALL-STATE  ${formatMeta({ session: sid, priority: 2, worldId: worldId?.slice(0, 8) ?? null, hasCharacter: !!characterId })}`);
  enqueue(sessionId, () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId), 2, 'all-state')
    .catch((err) => log.warn('后台任务失败:', err.message));
  log.info(`QUEUE TURN-RECORD  ${formatMeta({ session: sid, priority: 3, ...(turnRecordOpts ?? {}) })}`);
  enqueue(sessionId, () => createTurnRecord(sessionId, turnRecordOpts), 3, 'turn-record')
    .catch((err) => log.warn('后台任务失败:', err.message));
  return !!(session && !session.title);
}

/**
 * 执行流式生成（chat 和 regenerate 共用）
 * @param {object} [opts]
 * @param {string} [opts.userMsgId] 真实 user 消息 id，流起始时广播给前端替换 temp id
 */
async function runStream(sessionId, res, opts = {}) {
  const sid = sessionId.slice(0, 8);
  const t0  = Date.now();
  log.info(`REQUEST START  ${formatMeta({ session: sid, userMsgId: opts.userMsgId?.slice(0, 8) ?? null })}`);

  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;

  // 广播真实 user 消息 id（前端用于把乐观追加的 __temp_ id 替换为真实 id）
  if (opts.userMsgId && !streamState.isClientClosed()) {
    emitSse(res, sid, { type: 'user_saved', id: opts.userMsgId });
  }

  let fullContent = '';
  let aborted = false;

  try {
    if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'memory_recall_start' });
    const { messages, overrides, recallHitCount } = await buildContext(sessionId, {
      onRecallEvent(name, payload) {
        if (!streamState.isClientClosed()) {
          emitSse(res, sid, { type: name, ...payload });
        }
      },
    });
    if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'memory_recall_done', hit: recallHitCount });
    log.info(`CONTEXT DONE  ${formatMeta({
      session: sid,
      msgs: messages.length,
      recall: recallHitCount,
      temperature: overrides.temperature,
      maxTokens: overrides.maxTokens,
    })}`);
    const stream = llm.chat(messages, { ...overrides, signal: ac.signal });

    for await (const chunk of stream) {
      fullContent += chunk;
      if (!streamState.isClientClosed()) sendSse(res, { delta: chunk });
    }
  } catch (err) {
    if (err.name === 'AbortError' || ac.signal.aborted) {
      aborted = true;
    } else {
      // LLM 错误
      log.error(`STREAM ERROR  ${formatMeta({ session: sid, error: err.message })}`);
      if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'error', error: err.message });
      // 无内容时直接结束
      if (!fullContent) {
        streamState.clear();
        if (!streamState.isClientClosed()) res.end();
        return;
      }
      // 有部分内容时继续保存（作为正常 done 处理）
    }
  }

  log.info(`STREAM END  ${formatMeta({ session: sid, chars: fullContent.length, aborted, ms: Date.now() - t0 })}`);

  // 提前查询 session/character/world，供 ai_output 规则和异步任务使用
  const session = getSessionById(sessionId);
  const characterId = session?.character_id;
  const character = characterId ? getCharacterById(characterId) : null;
  const worldId = character?.world_id ?? null;

  // 保存 AI 回复（剥除状态块 + 提取选项 + 应用规则）
  const { savedContent, options, savedAssistant } = processStreamOutput(fullContent, aborted, worldId, sessionId);
  fullContent = savedContent;

  // 推送结束事件（附带真实 assistant 消息，便于前端原地追加，免于重挂载刷新）
  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted
      ? { aborted: true, assistant: savedAssistant }
      : { done: true, assistant: savedAssistant, options });
  }

  streamState.clear();

  // 正常完成且有内容时，入队异步任务
  if (!aborted && fullContent) {
    const msgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
    if (msgs.some((m) => m.role === 'user')) {
      const needsWait = enqueueStreamTasks({ sessionId, sid, worldId, characterId, session, streamState, res });
      if (needsWait) return;
    }
  }

  if (!streamState.isClientClosed()) res.end();
}

// ── POST /api/sessions/:sessionId/chat ──

router.post('/:sessionId/chat', async (req, res) => {
  const { sessionId } = req.params;
  const { content, attachments } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  log.info(`POST /chat  ${formatMeta({ session: sessionId.slice(0, 8), len: content.length, attachments: attachments?.length ?? 0 })}`);

  // 保存用户消息
  const userMsg = createMessage({ session_id: sessionId, role: 'user', content });
  touchSession(sessionId);

  // 保存附件（写磁盘 + 更新 DB）
  if (attachments && attachments.length > 0) {
    saveAttachments(userMsg.id, attachments);
    log.info(`ATTACHMENTS SAVED  ${formatMeta({ session: sessionId.slice(0, 8), userMsgId: userMsg.id.slice(0, 8), count: attachments.length })}`);
  }

  await runStream(sessionId, res, { userMsgId: userMsg.id });
});

// ── POST /api/sessions/:sessionId/stop ──

router.post('/:sessionId/stop', (req, res) => {
  const { sessionId } = req.params;
  const ac = activeStreams.get(sessionId);
  if (ac) ac.abort();
  res.json({ success: true });
});

// ── POST /api/sessions/:sessionId/regenerate ──

router.post('/:sessionId/regenerate', async (req, res) => {
  const { sessionId } = req.params;
  const { afterMessageId } = req.body;

  if (!afterMessageId) {
    return res.status(400).json({ error: 'afterMessageId is required' });
  }

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  log.info(`POST /regenerate  ${formatMeta({ session: sessionId.slice(0, 8), after: afterMessageId.slice(0, 8) })}`);

  // 保留 afterMessageId 本身，删除之后的所有消息
  await deleteMessagesAfter(afterMessageId);

  // 删除多余的 turn records：计算剩余 user 消息数=当前轮编号 R，保留 1..R-1
  const remaining = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const R = remaining.filter((m) => m.role === 'user').length;
  deleteTurnRecordsAfterRound(sessionId, R - 1);
  log.info(`TURN-RECORD TRUNCATE  ${formatMeta({ session: sessionId.slice(0, 8), keepUntilRound: Math.max(0, R - 1) })}`);

  // 先清空所有待处理任务，防止旧轮次状态更新（prio 2）覆盖即将恢复的快照
  clearPending(sessionId, 2);
  log.info(`QUEUE CLEAR  ${formatMeta({ session: sessionId.slice(0, 8), threshold: 2 })}`);

  // 状态回滚：恢复到最近保留的 turn record 快照（无快照时清空回 default）
  const regenSession = getSessionById(sessionId);
  const regenCharId = regenSession?.character_id;
  const regenChar = regenCharId ? getCharacterById(regenCharId) : null;
  const regenWorldId = regenChar?.world_id ?? null;
  if (regenWorldId) {
    const lastRecord = getLatestTurnRecord(sessionId);
    restoreStateFromSnapshot(
      sessionId, regenWorldId, regenCharId ? [regenCharId] : [],
      lastRecord?.state_snapshot ? JSON.parse(lastRecord.state_snapshot) : null,
    );
    log.info(`STATE ROLLBACK  ${formatMeta({ session: sessionId.slice(0, 8), hasSnapshot: !!lastRecord?.state_snapshot })}`);
  }

  await runStream(sessionId, res);
});

// ── POST /api/sessions/:sessionId/continue ──

router.post('/:sessionId/continue', async (req, res) => {
  const { sessionId } = req.params;
  const sid = sessionId.slice(0, 8);

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  log.info(`POST /continue  ${formatMeta({ session: sessionId.slice(0, 8) })}`);

  // 找最后一条 assistant 消息
  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistant = [...allMsgs].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant) {
    return res.status(400).json({ error: '当前会话没有 AI 回复可续写' });
  }

  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;

  const originalContent = lastAssistant.content;
  let newContent = '';
  let aborted = false;

  try {
    const { messages, overrides } = await buildContext(sessionId);
    const continuationMessages = buildContinuationMessages(messages, originalContent);

    const stream = llm.chat(continuationMessages, { ...overrides, signal: ac.signal });
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

  const characterId = session.character_id;
  const character = characterId ? getCharacterById(characterId) : null;
  const worldId = character?.world_id ?? null;

  if (newContent) {
    newContent = stripAsstContext(newContent);
  }

  if (aborted && newContent) {
    newContent += '\n\n[已中断]';
  }

  let mergedAssistant = null;
  let mergedContent = '';
  if (newContent) {
    // ai_output scope 仅作用于新生成的内容；再剥除末尾状态块
    const processedNew = aborted
      ? newContent
      : stripAsstContext(applyRules(newContent, 'ai_output', worldId));
    mergedContent = originalContent + '\n\n' + processedNew.replace(/^\n+/, '');
    updateMessageContent(lastAssistant.id, mergedContent);
    mergedAssistant = { ...lastAssistant, content: mergedContent };
    touchSession(sessionId);
  }

  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted
      ? { aborted: true, assistant: mergedAssistant }
      : { done: true, assistant: mergedAssistant });
  }

  streamState.clear();

  // 正常完成且有内容时，入队异步任务
  if (!aborted && newContent) {
    const msgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
    if (msgs.some((m) => m.role === 'user')) {
      const needsWait = enqueueStreamTasks({
        sessionId, sid, worldId, characterId, session, streamState, res,
        turnRecordOpts: { isUpdate: true },
      });
      if (needsWait) return;
    }
  }

  if (!streamState.isClientClosed()) res.end();
});

// ── POST /api/sessions/:sessionId/impersonate ──

router.post('/:sessionId/impersonate', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  const world = character?.world_id ? getWorldById(character.world_id) : null;
  if (!character || !world) {
    return res.status(400).json({ error: 'Session is missing character/world context' });
  }

  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '用户';
  try {
    const { messages: baseMessages, overrides } = await buildContext(sessionId);
    const prompt = [...baseMessages];
    // 剥掉 buildContext 末尾的 [16] user 消息，避免走"改写已发消息"分支
    while (prompt.length > 0 && prompt[prompt.length - 1].role === 'user') {
      prompt.pop();
    }

    const instruction = renderBackendPrompt('chat-impersonate.md', { PERSONA_NAME: personaName });
    prompt.push({ role: 'user', content: instruction });

    const raw = await llm.complete(prompt, {
      temperature: overrides.temperature,
      maxTokens: overrides.maxTokens ?? 1000,
    });
    // 剥除 thinking 模型输出的 <think>...</think> 推理块
    const content = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/sessions/:sessionId/messages ──

router.delete('/:sessionId/messages', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  await deleteAllMessagesBySessionId(sessionId);
  deleteTurnRecordsBySessionId(sessionId);
  clearCompressedContext(sessionId);

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  let firstMessage = null;

  if (character?.first_message) {
    firstMessage = character.first_message;
    createMessage({ session_id: sessionId, role: 'assistant', content: firstMessage });
    touchSession(sessionId);
  }

  res.json({ success: true, firstMessage });
});

// ── POST /api/sessions/:sessionId/edit-assistant ──

router.post('/:sessionId/edit-assistant', async (req, res) => {
  const { sessionId } = req.params;
  const { messageId, content } = req.body;

  if (!messageId || !content || typeof content !== 'string') {
    return res.status(400).json({ error: 'messageId and content are required' });
  }

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  updateMessageContent(messageId, content.trim());

  // 仅在编辑当前最后一条 assistant 消息时，重跑状态更新，
  // 避免编辑历史 AI 消息时直接改写当前状态。
  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistant = [...allMsgs].reverse().find((m) => m.role === 'assistant');
  if (lastAssistant?.id === messageId) {
    const characterId = session.character_id;
    const character = characterId ? getCharacterById(characterId) : null;
    const worldId = character?.world_id ?? null;
    enqueue(sessionId, () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId), 2, 'all-state').catch(err => log.warn('后台任务失败:', err.message));
  }

  // 重新生成最后一条 turn record（覆盖）
  enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch(err => log.warn('后台任务失败:', err.message));

  res.json({ success: true });
});

// ── POST /api/sessions/:sessionId/retitle ──
// 用最近一轮完整上下文（[11][12][13][14][16] + 最后 AI 回复）重新生成并覆盖会话标题

router.post('/:sessionId/retitle', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  try {
    // 获取完整提示词上下文（[1-16]）
    const { messages, overrides } = await buildContext(sessionId);

    // 找最后一条 AI 回复
    const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
    const lastAssistant = [...allMsgs].reverse().find((m) => m.role === 'assistant');

    // 在完整上下文后追加 AI 回复（若尚不在末尾）+ 标题生成指令
    const titlePrompt = [...messages];
    if (lastAssistant) {
      // 剥除 think 标签后追加
      const cleanContent = lastAssistant.content.replace(/<think>[\s\S]*?<\/think>\n*/gi, '').trim();
      titlePrompt.push({ role: 'assistant', content: cleanContent });
    }
    titlePrompt.push({
      role: 'user',
      content: loadBackendPrompt('memory-retitle-generation.md'),
    });

    const raw = await llm.complete(titlePrompt, {
      temperature: overrides.temperature ?? LLM_TASK_TEMPERATURE,
      maxTokens: LLM_TITLE_MAX_TOKENS,
    });
    if (!raw) return res.json({ title: null });

    const title = raw
      .replace(/<think>[\s\S]*?<\/think>\n*/gi, '')
      .replace(/<think>[\s\S]*$/i, '')
      .trim()
      .replace(/["'"'「」『』《》【】]/g, '')
      .slice(0, 15);

    updateSessionTitle(sessionId, title);
    log.info(`retitle DONE  session=${sessionId.slice(0, 8)}  title="${title}"`);
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
