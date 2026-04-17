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

const router = Router();

// ── 工具函数 ──

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 执行流式生成（chat 和 regenerate 共用）
 */
async function runStream(sessionId, res) {
  // 若该 sessionId 已有进行中的请求，先 abort
  const existing = activeStreams.get(sessionId);
  if (existing) existing.abort();

  const ac = new AbortController();
  activeStreams.set(sessionId, ac);

  // 监听客户端断开（页面刷新/关闭）
  let clientClosed = false;
  res.on('close', () => {
    clientClosed = true;
    if (activeStreams.get(sessionId) === ac) {
      ac.abort();
    }
  });

  sseHeaders(res);

  let fullContent = '';
  let aborted = false;

  try {
    if (!clientClosed) sseSend(res, { type: 'memory_recall_start' });
    const { messages, overrides, recallHitCount } = await buildContext(sessionId, {
      onRecallEvent(name, payload) {
        if (!clientClosed) {
          sseSend(res, { type: name, ...payload });
        }
      },
    });
    if (!clientClosed) sseSend(res, { type: 'memory_recall_done', hit: recallHitCount });
    const stream = llm.chat(messages, { ...overrides, signal: ac.signal });

    for await (const chunk of stream) {
      fullContent += chunk;
      if (!clientClosed) sseSend(res, { delta: chunk });
    }
  } catch (err) {
    if (err.name === 'AbortError' || ac.signal.aborted) {
      aborted = true;
    } else {
      // LLM 错误
      if (!clientClosed) sseSend(res, { type: 'error', error: err.message });
      // 无内容时直接结束
      if (!fullContent) {
        activeStreams.delete(sessionId);
        if (!clientClosed) res.end();
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
  if (!clientClosed) {
    sseSend(res, aborted ? { aborted: true } : { done: true });
  }

  activeStreams.delete(sessionId);

  // 正常完成且有内容时，入队异步任务
  if (!aborted && fullContent) {
    const msgs = getMessagesBySessionId(sessionId, 9999, 0);
    const hasUserMsg = msgs.some((m) => m.role === 'user');

    if (hasUserMsg) {

      // 优先级 2：生成标题（不可丢弃，仅当 title 为 NULL）
      if (session && !session.title) {
        enqueue(sessionId, () => generateTitle(sessionId), 2, 'title')
          .then((title) => {
            if (title && !clientClosed) sseSend(res, { type: 'title_updated', title });
          })
          .catch(() => {})
          .finally(() => {
            if (!clientClosed) res.end();
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

  if (!clientClosed) res.end();
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

  // 若该 sessionId 已有进行中的请求，先 abort
  const existing = activeStreams.get(sessionId);
  if (existing) existing.abort();

  const ac = new AbortController();
  activeStreams.set(sessionId, ac);

  let clientClosed = false;
  res.on('close', () => {
    clientClosed = true;
    if (activeStreams.get(sessionId) === ac) {
      ac.abort();
    }
  });

  sseHeaders(res);

  const originalContent = lastAssistant.content;
  let newContent = '';
  let aborted = false;

  try {
    const { messages, overrides } = await buildContext(sessionId);

    // /continue 场景：修正上下文末尾，让 LLM 从当前 assistant 内容末尾续写（prefill）
    // buildContext 末尾是 [16] user 消息，续写时需改为以 assistant prefill 结尾

    // Step 1：移除末尾所有 user 消息（[15] post_prompt + [16] 当前用户消息）
    while (messages.length > 0 && messages[messages.length - 1].role === 'user') {
      messages.pop();
    }
    // Step 2：若 [14] 使用 turn record 路径，末尾是 asst_context（含"AI："前缀和状态后缀），
    //          会导致 LLM 模仿此格式输出状态信息，需移除；同时移除对应 user_context 避免重复
    const hasTurnRecords = getTurnRecordsBySessionId(sessionId, 1).length > 0;
    if (hasTurnRecords && messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      messages.pop(); // 移除 asst_context(K)
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages.pop(); // 移除 user_context(K)
      }
    }
    // Step 3：补充裸用户消息（不含状态快照前缀）
    const lastUserMsg = [...allMsgs].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) messages.push({ role: 'user', content: lastUserMsg.content });
    // Step 4：添加 assistant prefill，LLM 从此处续写
    messages.push({ role: 'assistant', content: originalContent });

    const stream = llm.chat(messages, { ...overrides, signal: ac.signal });
    for await (const chunk of stream) {
      newContent += chunk;
      if (!clientClosed) sseSend(res, { delta: chunk });
    }
  } catch (err) {
    if (err.name === 'AbortError' || ac.signal.aborted) {
      aborted = true;
    } else {
      if (!clientClosed) sseSend(res, { type: 'error', error: err.message });
      if (!newContent) {
        activeStreams.delete(sessionId);
        if (!clientClosed) res.end();
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

  if (!clientClosed) {
    sseSend(res, aborted ? { aborted: true } : { done: true });
  }

  activeStreams.delete(sessionId);

  // 正常完成且有内容时，入队异步任务
  if (!aborted && newContent) {
    const msgs = getMessagesBySessionId(sessionId, 9999, 0);
    const hasUserMsg = msgs.some((m) => m.role === 'user');

    if (hasUserMsg) {
      if (session && !session.title) {
        enqueue(sessionId, () => generateTitle(sessionId), 2, 'title')
          .then((title) => {
            if (title && !clientClosed) sseSend(res, { type: 'title_updated', title });
          })
          .catch(() => {})
          .finally(() => {
            if (!clientClosed) res.end();
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

  if (!clientClosed) res.end();
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
