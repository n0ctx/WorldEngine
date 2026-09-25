import { Router } from 'express';
import {
  createSession,
  getSessionById,
  getSessionsByCharacterId,
  getLatestChatSessionByWorldId,
  getLatestSessionByWorldId,
  getSessionsByWorldId,
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
import { getModeForSession } from '../app/modes/index.js';
import { rollbackSession } from '../app/shared/rollback/rollback-session.js';
import { ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { assertExists } from '../utils/route-helpers.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { runHook } from '../hooks/hook-registry.js';

const router = Router();
const log = createLogger('sessions', 'cyan');

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

// GET /api/worlds/:worldId/latest-session — 获取某世界最近活跃的会话（不限 mode）
router.get('/worlds/:worldId/latest-session', (req, res) => {
  const session = getLatestSessionByWorldId(req.params.worldId);
  if (!assertExists(res, session, '该世界暂无会话')) return;
  res.json(session);
});

// GET /api/worlds/:worldId/timeline — 获取某世界的故事线（chat + writing 混编，按更新时间倒序）
router.get('/worlds/:worldId/timeline', (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
  const sessions = getSessionsByWorldId(req.params.worldId, limit);
  res.json(sessions);
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

// GET /api/sessions/:id/messages — 获取会话全部消息（一次性返回，前端自行翻页）
router.get('/sessions/:id/messages', (req, res) => {
  const session = getSessionById(req.params.id);
  if (!assertExists(res, session, '会话不存在')) return;
  // ALL_MESSAGES_LIMIT 现为 null（不分页），避免超长会话丢失最早历史；前端按每页轮数切片渲染
  res.json(getMessagesBySessionId(req.params.id, ALL_MESSAGES_LIMIT, 0));
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
    log.warn(`sessions.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'role 和 content 为必填项' })}`);
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
    log.warn(`sessions.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'content 为必填项' })}`);
    return res.status(400).json({ error: 'content 为必填项' });
  }

  let updated;
  await rollbackSession(getModeForSession(msg.session_id), msg.session_id, async () => {
    updated = await updateMessageAndDeleteAfter(req.params.id, content);
  });

  res.json(updated);
});

// DELETE /api/sessions/:sessionId/messages/:messageId — 删除单条消息及之后所有内容，回滚状态栏
router.delete('/sessions/:sessionId/messages/:messageId', async (req, res) => {
  const { sessionId, messageId } = req.params;

  const session = getSessionById(sessionId);
  if (!assertExists(res, session, '会话不存在')) return;

  const msg = getMessageById(messageId);
  if (!msg || msg.session_id !== sessionId) {
    log.warn(`sessions.not_found ${formatMeta({ method: req.method, path: req.path, id: messageId })}`);
    return res.status(404).json({ error: '消息不存在' });
  }

  await rollbackSession(getModeForSession(sessionId), sessionId, async () => {
    await deleteMessagesAfter(messageId);
    await deleteMessage(messageId);
    await runHook('message:deleted', { id: messageId, sessionId });
  });

  res.json({ success: true });
});

export default router;
