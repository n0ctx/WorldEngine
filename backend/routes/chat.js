import { Router } from 'express';
import * as llm from '../llm/index.js';
import { buildContext, activeStreams, saveAttachments } from '../services/chat.js';
import {
  createMessage,
  getMessagesBySessionId,
  touchSession,
  getSessionById,
  deleteMessagesAfter,
  deleteAllMessagesBySessionId,
  updateMessageContent,
} from '../services/sessions.js';
import { getCharacterById } from '../services/characters.js';
import { getWorldById } from '../services/worlds.js';
import { enqueue, clearPending } from '../utils/async-queue.js';
import { generateTitle } from '../memory/summarizer.js';
import { updateAllStates } from '../memory/combined-state-updater.js';
import { getOrCreatePersona } from '../services/personas.js';
import { generateTimelineEntry } from '../memory/context-compressor.js';
import { createTurnRecord } from '../memory/turn-summarizer.js';
import { getTurnRecordsBySessionId, deleteTurnRecordsAfterRound } from '../db/queries/turn-records.js';
import { clearCompressedContext } from '../db/queries/sessions.js';
import { applyRules } from '../utils/regex-runner.js';
import {
  beginStreamSession,
  buildContinuationMessages,
  sendSse,
} from './stream-helpers.js';

const router = Router();

/**
 * 执行流式生成（chat 和 regenerate 共用）
 */
async function runStream(sessionId, res) {
  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const ac = streamState.controller;

  let fullContent = '';
  let aborted = false;

  try {
    if (!streamState.isClientClosed()) sendSse(res, { type: 'memory_recall_start' });
    const { messages, overrides, recallHitCount } = await buildContext(sessionId, {
      onRecallEvent(name, payload) {
        if (!streamState.isClientClosed()) {
          sendSse(res, { type: name, ...payload });
        }
      },
    });
    if (!streamState.isClientClosed()) sendSse(res, { type: 'memory_recall_done', hit: recallHitCount });
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
      if (!streamState.isClientClosed()) sendSse(res, { type: 'error', error: err.message });
      // 无内容时直接结束
      if (!fullContent) {
        streamState.clear();
        if (!streamState.isClientClosed()) res.end();
        return;
      }
      // 有部分内容时继续保存（作为正常 done 处理）
    }
  }

  // 提前查询 session/character/world，供 ai_output 规则和异步任务使用
  const session = getSessionById(sessionId);
  const characterId = session?.character_id;
  const character = characterId ? getCharacterById(characterId) : null;
  const worldId = character?.world_id ?? null;

  // 保存 AI 回复
  if (aborted && fullContent) {
    fullContent += '\n\n[已中断]';
  }

  if (fullContent) {
    // ai_output scope：流式完结后、写入 messages 前处理
    const savedContent = aborted ? fullContent : applyRules(fullContent, 'ai_output', worldId);
    createMessage({ session_id: sessionId, role: 'assistant', content: savedContent });
    fullContent = savedContent;
    touchSession(sessionId);
  }

  // 推送结束事件
  if (!streamState.isClientClosed()) {
    sendSse(res, aborted ? { aborted: true } : { done: true });
  }

  streamState.clear();

  // 正常完成且有内容时，入队异步任务
  if (!aborted && fullContent) {
    const msgs = getMessagesBySessionId(sessionId, 9999, 0);
    const hasUserMsg = msgs.some((m) => m.role === 'user');

    if (hasUserMsg) {

      // 优先级 2：生成标题（不可丢弃，仅当 title 为 NULL）
      if (session && !session.title) {
        enqueue(sessionId, () => generateTitle(sessionId), 2, 'title')
          .then((title) => {
            if (title && !streamState.isClientClosed()) sendSse(res, { type: 'title_updated', title });
          })
          .catch(() => {})
          .finally(() => {
            if (!streamState.isClientClosed()) res.end();
          });
        // 优先级 2：状态更新（世界/角色/玩家合并为单次 LLM 调用）
        enqueue(sessionId, () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId), 2, 'all-state').catch(() => {});
        enqueue(sessionId, () => createTurnRecord(sessionId), 3, 'turn-record').catch(() => {});
        return; // 等待标题生成后再关闭连接
      }

      // 优先级 2：状态更新（世界/角色/玩家合并为单次 LLM 调用）
      enqueue(sessionId, () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId), 2, 'all-state').catch(() => {});
      enqueue(sessionId, () => createTurnRecord(sessionId), 3, 'turn-record').catch(() => {});
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
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // 保存用户消息
  const userMsg = createMessage({ session_id: sessionId, role: 'user', content });
  touchSession(sessionId);

  // 保存附件（写磁盘 + 更新 DB）
  if (attachments && attachments.length > 0) {
    saveAttachments(userMsg.id, attachments);
  }

  await runStream(sessionId, res);
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
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // 保留 afterMessageId 本身，删除之后的所有消息
  await deleteMessagesAfter(afterMessageId);

  // 删除多余的 turn records：计算剩余 user 消息数=当前轮编号 R，保留 1..R-1
  const remaining = getMessagesBySessionId(sessionId, 9999, 0);
  const R = remaining.filter((m) => m.role === 'user').length;
  deleteTurnRecordsAfterRound(sessionId, R - 1);

  // 丢弃低优先级待处理任务（时间线、向量化）
  clearPending(sessionId, 4);

  await runStream(sessionId, res);
});

// ── POST /api/sessions/:sessionId/continue ──

router.post('/:sessionId/continue', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // 找最后一条 assistant 消息
  const allMsgs = getMessagesBySessionId(sessionId, 9999, 0);
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
    const hasTurnRecords = getTurnRecordsBySessionId(sessionId, 1).length > 0;
    const continuationMessages = buildContinuationMessages(messages, allMsgs, hasTurnRecords, originalContent);

    const stream = llm.chat(continuationMessages, { ...overrides, signal: ac.signal });
    for await (const chunk of stream) {
      newContent += chunk;
      if (!streamState.isClientClosed()) sendSse(res, { delta: chunk });
    }
  } catch (err) {
    if (err.name === 'AbortError' || ac.signal.aborted) {
      aborted = true;
    } else {
      if (!streamState.isClientClosed()) sendSse(res, { type: 'error', error: err.message });
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

  if (aborted && newContent) {
    newContent += '\n\n[已中断]';
  }

  if (newContent) {
    // ai_output scope 仅作用于新生成的内容
    const processedNew = aborted ? newContent : applyRules(newContent, 'ai_output', worldId);
    const mergedContent = originalContent + processedNew;
    updateMessageContent(lastAssistant.id, mergedContent);
    touchSession(sessionId);
  }

  if (!streamState.isClientClosed()) {
    sendSse(res, aborted ? { aborted: true } : { done: true });
  }

  streamState.clear();

  // 正常完成且有内容时，入队异步任务
  if (!aborted && newContent) {
    const msgs = getMessagesBySessionId(sessionId, 9999, 0);
    const hasUserMsg = msgs.some((m) => m.role === 'user');

    if (hasUserMsg) {
      if (session && !session.title) {
        enqueue(sessionId, () => generateTitle(sessionId), 2, 'title')
          .then((title) => {
            if (title && !streamState.isClientClosed()) sendSse(res, { type: 'title_updated', title });
          })
          .catch(() => {})
          .finally(() => {
            if (!streamState.isClientClosed()) res.end();
          });
        // 优先级 2：状态更新（世界/角色/玩家合并为单次 LLM 调用）
        enqueue(sessionId, () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId), 2, 'all-state').catch(() => {});
        // /continue 场景：覆盖最后一条 turn record（isUpdate=true）
        enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch(() => {});
        return;
      }

      // 优先级 2：状态更新（世界/角色/玩家合并为单次 LLM 调用）
      enqueue(sessionId, () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId), 2, 'all-state').catch(() => {});
      // /continue 场景：覆盖最后一条 turn record（isUpdate=true）
      enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch(() => {});
    }
  }

  if (!streamState.isClientClosed()) res.end();
});

// ── POST /api/sessions/:sessionId/impersonate ──

router.post('/:sessionId/impersonate', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  const world = character?.world_id ? getWorldById(character.world_id) : null;

  const persona = world ? getOrCreatePersona(world.id) : null;
  const personaName = persona?.name || '用户';
  const personaPrompt = persona?.system_prompt || '';

  const systemText = personaPrompt
    ? `你正在扮演用户「${personaName}」。用户设定：${personaPrompt}`
    : `你正在扮演用户「${personaName}」。`;
  const prompt = [
    {
      role: 'user',
      content:
        `${systemText}\n\n根据当前对话情境，以第一人称写一条用户接下来可能说的话。只输出这条话本身，不加任何解释或引号。`,
    },
  ];

  try {
    const content = await llm.complete(prompt, { temperature: 0.7, maxTokens: 200 });
    res.json({ content: content.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/sessions/:sessionId/messages ──

router.delete('/:sessionId/messages', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  await deleteAllMessagesBySessionId(sessionId);
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
  if (!session) return res.status(404).json({ error: 'Session not found' });

  updateMessageContent(messageId, content.trim());

  // 仅在编辑当前最后一条 assistant 消息时，重跑状态更新，
  // 避免编辑历史 AI 消息时直接改写当前状态。
  const allMsgs = getMessagesBySessionId(sessionId, 9999, 0);
  const lastAssistant = [...allMsgs].reverse().find((m) => m.role === 'assistant');
  if (lastAssistant?.id === messageId) {
    const characterId = session.character_id;
    const character = characterId ? getCharacterById(characterId) : null;
    const worldId = character?.world_id ?? null;
    enqueue(sessionId, () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId), 2, 'all-state').catch(() => {});
  }

  // 重新生成最后一条 turn record（覆盖）
  enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record').catch(() => {});

  res.json({ success: true });
});

// ── POST /api/sessions/:sessionId/summary ──

router.post('/:sessionId/summary', async (req, res) => {
  const { sessionId } = req.params;

  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    await generateTimelineEntry(sessionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
