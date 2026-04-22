import { Router } from 'express';
import * as llm from '../llm/index.js';
import { buildWritingPrompt } from '../prompts/assembler.js';
import { activeStreams, processStreamOutput } from '../services/chat.js';
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
  getMessageById,
  getMessagesBySessionId,
  touchWritingSession,
  deleteAllMessages,
  deleteMessagesAfter,
} from '../services/writing-sessions.js';
import { getWorldById } from '../services/worlds.js';
import { getCharactersByWorldId } from '../services/characters.js';
import { getOrCreatePersona } from '../services/personas.js';
import { enqueue, clearPending } from '../utils/async-queue.js';
import { runPostGenTasks } from '../utils/post-gen-runner.js';
import { evaluateTriggers } from '../services/trigger-evaluator.js';
import { generateTitle } from '../memory/summarizer.js';
import { updateAllStates } from '../memory/combined-state-updater.js';
import { clearCompressedContext } from '../db/queries/sessions.js';
import { applyRules } from '../utils/regex-runner.js';
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
import { updateMessageContent } from '../db/queries/messages.js';
import { getTurnRecordsBySessionId, deleteTurnRecordsAfterRound, deleteTurnRecordsBySessionId, getLatestTurnRecord, countTurnRecords } from '../db/queries/turn-records.js';
import { restoreStateFromSnapshot } from '../memory/state-rollback.js';
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
  deleteTurnRecordsBySessionId(sessionId);
  clearCompressedContext(sessionId);
  const allDiaryEntries = getDailyEntriesAfterRound(sessionId, 0);
  for (const e of allDiaryEntries) deleteDiaryFile(sessionId, e.date_str);
  deleteDailyEntriesBySessionId(sessionId);
  clearPending(sessionId, 4);
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

async function runWritingStream(sessionId, res, opts = {}) {
  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;
  const sid = sessionId.slice(0, 8);

  // 等待上一轮状态更新完成，确保 buildWritingPrompt 读到最新状态
  await awaitPendingStateUpdate(sessionId);

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
    const { messages, temperature, maxTokens, model } = await buildWritingPrompt(sessionId, { onRecallEvent, diaryInjection: opts.diaryInjection });
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

  const { savedContent, options, savedAssistant } = processStreamOutput(
    fullContent, aborted, worldId, sessionId,
    { mode: 'writing', createMessageFn: createMessage, touchSessionFn: touchWritingSession }
  );
  fullContent = savedContent;

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
      const activeCharacters = getWritingSessionCharacters(sessionId);

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
        // all-state（p2）：writing 模式推 state_updated SSE（CastPanel/StatePanel 按事件刷新）
        {
          label: 'all-state',
          priority: 2,
          fn: () => updateAllStates(worldId, activeCharacters.map((c) => c.id), sessionId),
          tracksState: true,
          sseEvent: 'state_updated',
          ssePayload: () => ({ type: 'state_updated' }),
          keepSseAlive: true,
        },
        // trigger-eval（p2）：状态更新完成后评估触发器，有通知时推 trigger_fired SSE
        {
          label: 'trigger-eval',
          priority: 2,
          fn: () => {
            const roundIndex = countTurnRecords(sessionId) + 1;
            return evaluateTriggers(worldId, sessionId, roundIndex);
          },
          condition: !!worldId,
          sseEvent: 'trigger_fired',
          ssePayload: (result) =>
            result?.notifications?.length > 0
              ? { type: 'trigger_fired', notifications: result.notifications }
              : null,
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
  if (content && typeof content === 'string' && content.trim()) {
    createMessage({ session_id: sessionId, role: 'user', content: content.trim() });
    touchWritingSession(sessionId);
    log.info(`POST /generate  ${formatMeta({ session: sessionId.slice(0, 8), len: content.trim().length })}`);
  }

  await runWritingStream(sessionId, res, {
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

  if (newContent) {
    const processedNew = aborted ? newContent : applyRules(newContent, 'ai_output', worldId, 'writing');
    // 续写：合并到上一条 assistant 消息
    updateMessageContent(lastAssistant.id, originalContent + '\n\n' + processedNew.replace(/^\n+/, ''));
    touchWritingSession(sessionId);
  }

  log.info(`CONTINUE END  ${formatMeta({ session: sid, chars: newContent.length, aborted })}`);

  if (!streamState.isClientClosed()) {
    emitSse(res, sid, aborted ? { aborted: true } : { done: true, options: continueOptions });
  }

  streamState.clear();

  // 续写正常完成后保持 SSE 连接，等后台任务推送完事件后再关闭
  if (!aborted && newContent) {
    const activeCharacters = getWritingSessionCharacters(sessionId);

    // continue 不触发新章节（轮次未变），故无 title/chapterTitle 任务
    const taskSpecs = [
      // all-state（p2）：writing 模式推 state_updated SSE
      {
        label: 'all-state',
        priority: 2,
        fn: () => updateAllStates(worldId, activeCharacters.map((c) => c.id), sessionId),
        tracksState: true,
        sseEvent: 'state_updated',
        ssePayload: () => ({ type: 'state_updated' }),
        keepSseAlive: true,
      },
      // trigger-eval（p2）：续写场景覆盖最后轮，roundIndex 取最新 turn record
      {
        label: 'trigger-eval',
        priority: 2,
        fn: () => {
          const roundIndex = getLatestTurnRecord(sessionId)?.round_index ?? 1;
          return evaluateTriggers(worldId, sessionId, roundIndex);
        },
        condition: !!worldId,
        sseEvent: 'trigger_fired',
        ssePayload: (result) =>
          result?.notifications?.length > 0
            ? { type: 'trigger_fired', notifications: result.notifications }
            : null,
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
    const { messages: baseMessages, temperature, maxTokens, model } = await buildWritingPrompt(sessionId);
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

  await deleteMessagesAfter(afterMessageId);

  const remaining = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const R = remaining.filter((m) => m.role === 'user').length;
  deleteTurnRecordsAfterRound(sessionId, R - 1);

  // 清理被截断轮次之后的日记条目
  const diaryToDelete = getDailyEntriesAfterRound(sessionId, R);
  for (const e of diaryToDelete) deleteDiaryFile(sessionId, e.date_str);
  deleteDailyEntriesAfterRound(sessionId, R);

  // 先清空所有待处理任务，防止旧轮次状态更新（prio 2）覆盖即将恢复的快照
  clearPending(sessionId, 2);

  // 状态回滚：恢复到最近保留的 turn record 快照（无快照时清空回 default）
  const regenWorldId = session.world_id;
  if (regenWorldId) {
    const activeChars = getWritingSessionCharacters(sessionId);
    const lastRecord = getLatestTurnRecord(sessionId);
    restoreStateFromSnapshot(
      sessionId, regenWorldId, activeChars.map((c) => c.id),
      lastRecord?.state_snapshot ? JSON.parse(lastRecord.state_snapshot) : null,
    );
  }

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

  try {
    const title = await generateChapterTitle(sessionId, idx, chapterMsgs);
    if (!title) return res.status(500).json({ error: '生成失败' });
    res.json({ title, chapterIndex: idx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/worlds/:worldId/writing-sessions/:sessionId/retitle
// 重新生成会话标题（修复写作空间 /title 命令失效）
router.post('/:worldId/writing-sessions/:sessionId/retitle', async (req, res) => {
  const { sessionId } = req.params;
  const session = dbGetWritingSessionById(sessionId);
  if (!assertExists(res, session, 'Session not found')) return;

  try {
    const title = await generateTitle(sessionId);
    if (!title) return res.json({ title: null });
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
