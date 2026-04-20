import { Router } from 'express';
import {
  createSession,
  getSessionById,
  getSessionsByCharacterId,
  getLatestChatSessionByWorldId,
  updateSessionTitle,
  deleteSession,
  getMessagesBySessionId,
  createMessage,
  getMessageById,
  updateMessageAndDeleteAfter,
  deleteMessage,
  deleteMessagesAfter,
} from '../services/sessions.js';
import { getCharacterById } from '../services/characters.js';
import { deleteTurnRecordsAfterRound } from '../db/queries/turn-records.js';
import { clearSessionWorldStateValues } from '../db/queries/session-world-state-values.js';
import { clearSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';
import { clearSessionCharacterStateValues } from '../db/queries/session-character-state-values.js';
import { ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();

// GET /api/characters/:characterId/sessions — 获取某角色下的会话列表
router.get('/characters/:characterId/sessions', (req, res) => {
  const character = getCharacterById(req.params.characterId);
  if (!assertExists(res, character, '角色不存在')) return;
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const sessions = getSessionsByCharacterId(req.params.characterId, limit, offset);
  res.json(sessions);
});

// GET /api/worlds/:worldId/latest-chat-session — 获取某世界最近活跃的 chat 会话
router.get('/worlds/:worldId/latest-chat-session', (req, res) => {
  const session = getLatestChatSessionByWorldId(req.params.worldId);
  if (!assertExists(res, session, '该世界暂无对话会话')) return;
  res.json(session);
});

// POST /api/characters/:characterId/sessions — 创建会话（自动插入 first_message）
router.post('/characters/:characterId/sessions', (req, res) => {
  const character = getCharacterById(req.params.characterId);
  if (!assertExists(res, character, '角色不存在')) return;
  const session = createSession(req.params.characterId);
  res.status(201).json(session);
});

// GET /api/sessions/:id — 获取单个会话
router.get('/sessions/:id', (req, res) => {
  const session = getSessionById(req.params.id);
  if (!assertExists(res, session, '会话不存在')) return;
  res.json(session);
});

// GET /api/sessions/:id/messages — 获取会话消息（分页）
router.get('/sessions/:id/messages', (req, res) => {
  const session = getSessionById(req.params.id);
  if (!assertExists(res, session, '会话不存在')) return;
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const messages = getMessagesBySessionId(req.params.id, limit, offset);
  res.json(messages);
});

// DELETE /api/sessions/:id — 删除会话
router.delete('/sessions/:id', async (req, res) => {
  const session = getSessionById(req.params.id);
  if (!assertExists(res, session, '会话不存在')) return;
  await deleteSession(req.params.id);
  res.status(204).end();
});

// PUT /api/sessions/:id/title — 修改会话标题
router.put('/sessions/:id/title', (req, res) => {
  const session = getSessionById(req.params.id);
  if (!assertExists(res, session, '会话不存在')) return;
  const { title } = req.body;
  const updated = updateSessionTitle(req.params.id, title ?? null);
  res.json(updated);
});

// POST /api/sessions/:id/messages — 创建消息
router.post('/sessions/:id/messages', (req, res) => {
  const session = getSessionById(req.params.id);
  if (!assertExists(res, session, '会话不存在')) return;
  const { role, content } = req.body;
  if (!role || !content) {
    return res.status(400).json({ error: 'role 和 content 为必填项' });
  }
  const msg = createMessage({ session_id: req.params.id, role, content, attachments: req.body.attachments });
  res.status(201).json(msg);
});

// PUT /api/messages/:id — 编辑消息（更新 content 并删除之后的消息）
router.put('/messages/:id', async (req, res) => {
  const msg = getMessageById(req.params.id);
  if (!assertExists(res, msg, '消息不存在')) return;
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content 为必填项' });
  }
  const updated = await updateMessageAndDeleteAfter(req.params.id, content);
  res.json(updated);
});

// DELETE /api/sessions/:sessionId/messages/:messageId — 删除单条消息及之后所有内容，回滚状态栏
router.delete('/sessions/:sessionId/messages/:messageId', async (req, res) => {
  const { sessionId, messageId } = req.params;

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, '会话不存在')) return;

  const msg = getMessageById(messageId);
  if (!msg || msg.session_id !== sessionId) return res.status(404).json({ error: '消息不存在' });

  // 删除该消息之后的所有消息（含 cleanup hooks）
  await deleteMessagesAfter(messageId);
  // 删除该消息自身
  await deleteMessage(messageId);

  // 计算剩余 user 消息数 R，删除 round_index > R-1 的 turn records
  const remaining = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const R = remaining.filter((m) => m.role === 'user').length;
  deleteTurnRecordsAfterRound(sessionId, R - 1);

  // 状态回滚：清空该会话的运行时状态（回到 default）
  clearSessionWorldStateValues(sessionId);
  clearSessionPersonaStateValues(sessionId);
  clearSessionCharacterStateValues(sessionId);

  res.json({ success: true });
});

export default router;
