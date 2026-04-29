import { Router } from 'express';
import * as llm from '../llm/index.js';
import { buildContext, activeStreams, saveAttachments, processStreamOutput } from '../services/chat.js';
import {
  createMessage,
  getMessageById,
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
import { enqueue, clearPending, waitForQueueIdle } from '../utils/async-queue.js';
import { generateTitle } from '../memory/summarizer.js';
import { updateAllStates } from '../memory/combined-state-updater.js';
import { getOrCreatePersona } from '../services/personas.js';
import { createTurnRecord } from '../memory/turn-summarizer.js';
import { checkAndGenerateDiary, deleteDiaryFile } from '../memory/diary-generator.js';
import { runPostGenTasks } from '../utils/post-gen-runner.js';
import { getDailyEntriesAfterRound, deleteDailyEntriesAfterRound, deleteDailyEntriesBySessionId } from '../db/queries/daily-entries.js';
import { getTurnRecordsBySessionId, deleteTurnRecordsAfterRound, deleteTurnRecordsBySessionId, getLatestTurnRecord, getLatestTurnRecordWithSnapshot, countTurnRecords } from '../db/queries/turn-records.js';
import { restoreLtmFromTurnRecord } from '../services/long-term-memory.js';
import { restoreStateFromSnapshot } from '../memory/state-rollback.js';
import { clearCompressedContext } from '../db/queries/sessions.js';
import { updateMessageTokenUsage, updateMessageNextOptions } from '../db/queries/messages.js';
import { applyRules } from '../utils/regex-runner.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { awaitPendingStateUpdate } from '../utils/state-update-tracker.js';
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
 * 构建 chat 模式的后台任务 spec 列表
 */
function buildChatTaskSpecs({ sessionId, worldId, characterId, session, streamState, res, sid, turnRecordOpts = {} }) {
  return [
    // title（p2）：仅当 session.title 为 NULL 时入队；完成后推送 title_updated 并关闭连接
    {
      label: 'title',
      priority: 2,
      fn: () => generateTitle(sessionId),
      condition: !!(session && !session.title),
      sseEvent: 'title_updated',
      ssePayload: (title) => title ? { type: 'title_updated', title } : null,
      keepSseAlive: true,
    },
    // all-state（p2）：chat 模式推 state_updated SSE（StatePanel 按事件刷新）
    {
      label: 'all-state',
      priority: 2,
      fn: () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId),
      tracksState: true,
      sseEvent: 'state_updated',
      ssePayload: () => ({ type: 'state_updated' }),
      keepSseAlive: true,
    },
    // turn-record（p3）
    {
      label: 'turn-record',
      priority: 3,
      fn: () => createTurnRecord(sessionId, turnRecordOpts),
      keepSseAlive: false,
    },
    // diary（p4）：续写（isUpdate=true）时轮次未变，不触发新一天检测
    {
      label: 'diary',
      priority: 4,
      fn: async () => {
        const latest = getLatestTurnRecord(sessionId);
        if (latest) await checkAndGenerateDiary(sessionId, latest.round_index);
      },
      condition: !turnRecordOpts?.isUpdate,
      keepSseAlive: false,
    },
  ];
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

  // 等待上一轮状态更新完成，确保本轮 buildContext 读到最新状态
  await awaitPendingStateUpdate(sessionId);

  // 重新生成：提前广播状态已回滚，让前端立即刷新状态栏
  if (opts.stateRolledBack && !streamState.isClientClosed()) {
    emitSse(res, sid, { type: 'state_rolled_back' });
  }

  // 广播真实 user 消息 id（前端用于把乐观追加的 __temp_ id 替换为真实 id）
  if (opts.userMsgId && !streamState.isClientClosed()) {
    emitSse(res, sid, { type: 'user_saved', id: opts.userMsgId });
  }

  let fullContent = '';
  let aborted = false;
  const usageRef = {};

  try {
    if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'memory_recall_start' });
    const { messages, overrides, recallHitCount } = await buildContext(sessionId, {
      onRecallEvent(name, payload) {
        if (!streamState.isClientClosed()) {
          emitSse(res, sid, { type: name, ...payload });
        }
      },
      diaryInjection: opts.diaryInjection,
    });
    if (!streamState.isClientClosed()) emitSse(res, sid, { type: 'memory_recall_done', hit: recallHitCount });
    log.info(`CONTEXT DONE  ${formatMeta({
      session: sid,
      msgs: messages.length,
      recall: recallHitCount,
      temperature: overrides.temperature,
      maxTokens: overrides.maxTokens,
    })}`);
    const stream = llm.chat(messages, { ...overrides, signal: ac.signal, usageRef, callType: 'main_answer', conversationId: sessionId });

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

  // 持久化 token usage，并同步到返回对象
  if (!aborted && savedAssistant && Object.keys(usageRef).length > 0) {
    updateMessageTokenUsage(savedAssistant.id, usageRef);
    savedAssistant.token_usage = usageRef;
  }

  // 推送结束事件（附带真实 assistant 消息，便于前端原地追加，免于重挂载刷新）
  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted
      ? { aborted: true, assistant: savedAssistant }
      : { done: true, assistant: savedAssistant, options, usage: Object.keys(usageRef).length > 0 ? usageRef : undefined });
  }

  streamState.clear();

  // 正常完成且有内容时，入队后台任务；有 keepSseAlive 任务时连接由 Promise.allSettled 关闭
  if (!aborted && fullContent) {
    const msgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
    if (msgs.some((m) => m.role === 'user')) {
      const taskSpecs = buildChatTaskSpecs({ sessionId, sid, worldId, characterId, session, streamState, res });
      const { hasSseWaits } = runPostGenTasks(sessionId, taskSpecs, {
        res, streamState, sid,
        emitSse: (payload) => emitSse(res, sid, payload),
      });
      if (hasSseWaits) return;
    }
  }

  if (!streamState.isClientClosed()) res.end();
}

// ── POST /api/sessions/:sessionId/chat ──

router.post('/:sessionId/chat', async (req, res) => {
  const { sessionId } = req.params;
  const { content, attachments, diaryInjection } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  log.info(`POST /chat  ${formatMeta({ session: sessionId.slice(0, 8), len: content.length, attachments: attachments?.length ?? 0, hasDiaryInject: !!diaryInjection })}`);

  // 保存用户消息
  const userMsg = createMessage({ session_id: sessionId, role: 'user', content });
  touchSession(sessionId);

  // 保存附件（写磁盘 + 更新 DB）
  if (attachments && attachments.length > 0) {
    saveAttachments(userMsg.id, attachments);
    log.info(`ATTACHMENTS SAVED  ${formatMeta({ session: sessionId.slice(0, 8), userMsgId: userMsg.id.slice(0, 8), count: attachments.length })}`);
  }

  await runStream(sessionId, res, {
    userMsgId: userMsg.id,
    diaryInjection: typeof diaryInjection === 'string' ? diaryInjection : undefined,
  });
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
  const afterMessage = getMessageById(afterMessageId);
  if (!afterMessage) {
    return res.status(404).json({ error: 'afterMessageId not found' });
  }
  if (afterMessage.session_id !== sessionId) {
    return res.status(400).json({ error: 'afterMessageId does not belong to this session' });
  }
  if (afterMessage.role !== 'user') {
    return res.status(400).json({ error: 'afterMessageId must be a user message' });
  }

  log.info(`POST /regenerate  ${formatMeta({ session: sessionId.slice(0, 8), after: afterMessageId.slice(0, 8) })}`);

  // 重新生成会截断消息并回滚状态；必须等同 session 已入队任务跑完，
  // 避免旧状态整理/turn-record 在新生成期间覆盖当前轮次。
  await waitForQueueIdle(sessionId);

  // 保留 afterMessageId 本身，删除之后的所有消息
  await deleteMessagesAfter(afterMessageId);

  // 删除多余的 turn records：计算剩余 user 消息数=当前轮编号 R，保留 1..R-1
  const remaining = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const R = remaining.filter((m) => m.role === 'user').length;
  deleteTurnRecordsAfterRound(sessionId, R - 1);
  log.info(`TURN-RECORD TRUNCATE  ${formatMeta({ session: sessionId.slice(0, 8), keepUntilRound: Math.max(0, R - 1) })}`);
  restoreLtmFromTurnRecord(sessionId, R === 0 ? null : getLatestTurnRecord(sessionId));

  // 清理被截断轮次之后的日记条目（及对应磁盘文件）
  const diaryToDelete = getDailyEntriesAfterRound(sessionId, R);
  for (const e of diaryToDelete) deleteDiaryFile(sessionId, e.date_str);
  deleteDailyEntriesAfterRound(sessionId, R);

  // 按约定只清理可丢弃的低优先级待处理任务；p2/p3 已通过队列屏障等待完成。
  clearPending(sessionId, 4);
  log.info(`QUEUE CLEAR  ${formatMeta({ session: sessionId.slice(0, 8), threshold: 4 })}`);

  // 状态回滚：恢复到最近保留的 turn record 快照（无快照时清空回 default）
  const regenSession = getSessionById(sessionId);
  const regenCharId = regenSession?.character_id;
  const regenChar = regenCharId ? getCharacterById(regenCharId) : null;
  const regenWorldId = regenChar?.world_id ?? null;
  if (regenWorldId) {
    const lastRecord = getLatestTurnRecordWithSnapshot(sessionId);
    restoreStateFromSnapshot(
      sessionId, regenWorldId, regenCharId ? [regenCharId] : [],
      lastRecord?.state_snapshot ? JSON.parse(lastRecord.state_snapshot) : null,
    );
    log.info(`STATE ROLLBACK  ${formatMeta({ session: sessionId.slice(0, 8), hasSnapshot: !!lastRecord?.state_snapshot })}`);
  }

  await runStream(sessionId, res, { stateRolledBack: !!regenWorldId });
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
  const lastAssistantIndex = allMsgs.map((m) => m.role).lastIndexOf('assistant');
  const lastAssistant = lastAssistantIndex >= 0 ? allMsgs[lastAssistantIndex] : null;
  if (!lastAssistant) {
    return res.status(400).json({ error: '当前会话没有 AI 回复可续写' });
  }
  const hasUserBeforeAssistant = allMsgs.slice(0, lastAssistantIndex).some((m) => m.role === 'user');
  if (!hasUserBeforeAssistant) {
    return res.status(400).json({ error: '当前会话没有可续写的用户-助手轮次' });
  }

  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;

  // 等待上一轮状态更新完成
  await awaitPendingStateUpdate(sessionId);

  const originalContent = lastAssistant.content;
  let newContent = '';
  let aborted = false;
  const usageRef = {};

  try {
    const { messages, overrides, suggestionText } = await buildContext(sessionId);
    const continuationMessages = buildContinuationMessages(messages, originalContent, { suggestionText });

    const stream = llm.chat(continuationMessages, { ...overrides, signal: ac.signal, usageRef, callType: 'main_continue', conversationId: sessionId });
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

  // 提取 <next_prompt> 选项（仅非中断时；剥除后内容不入 DB）
  let continueOptions = [];
  if (!aborted && newContent) {
    const extracted = extractNextPromptOptions(newContent);
    newContent = extracted.content;
    continueOptions = extracted.options;
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
      : stripAsstContext(applyRules(newContent, 'ai_output', worldId, session.mode));
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
    touchSession(sessionId);
  }

  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted
      ? { aborted: true, assistant: mergedAssistant }
      : { done: true, assistant: mergedAssistant, options: continueOptions, usage: Object.keys(usageRef).length > 0 ? usageRef : undefined });
  }

  streamState.clear();

  // 正常完成且有内容时，入队后台任务；有 keepSseAlive 任务时连接由 Promise.allSettled 关闭
  if (!aborted && newContent) {
    const msgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
    if (msgs.some((m) => m.role === 'user')) {
      const taskSpecs = buildChatTaskSpecs({
        sessionId, sid, worldId, characterId, session, streamState, res,
        turnRecordOpts: { isUpdate: true },
      });
      const { hasSseWaits } = runPostGenTasks(sessionId, taskSpecs, {
        res, streamState, sid,
        emitSse: (payload) => emitSse(res, sid, payload),
      });
      if (hasSseWaits) return;
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
      cacheableSystem: overrides.cacheableSystem,
      thinking_level: null,
      callType: 'impersonate',
      conversationId: sessionId,
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
  // 清理该 session 所有日记（文件由 cleanup-registrations.js session 钩子不处理，需手动删除）
  const allDiaryEntries = getDailyEntriesAfterRound(sessionId, 0);
  for (const e of allDiaryEntries) deleteDiaryFile(sessionId, e.date_str);
  deleteDailyEntriesBySessionId(sessionId);
  // 清空待处理的日记任务
  clearPending(sessionId, 4);

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
    await waitForQueueIdle(sessionId);

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
      thinking_level: null,
      callType: 'retitle',
      conversationId: sessionId,
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
