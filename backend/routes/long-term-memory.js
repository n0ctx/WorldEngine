/**
 * long-term-memory.js — 会话级长期记忆 md 文件 HTTP 接口
 *
 * GET  /api/sessions/:sessionId/long-term-memory  → { content }
 * PUT  /api/sessions/:sessionId/long-term-memory  body: { content }  → { content }
 */

import express from 'express';
import { getSessionById } from '../db/queries/sessions.js';
import { readMemoryFile, writeMemoryFile } from '../services/long-term-memory.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = express.Router();
const log = createLogger('long-term-memory', 'cyan');

router.get('/:sessionId/long-term-memory', (req, res) => {
  const { sessionId } = req.params;
  if (!getSessionById(sessionId)) {
    log.warn(`long-term-memory.not_found ${formatMeta({ method: req.method, path: req.path, id: sessionId })}`);
    return res.status(404).json({ error: '会话不存在' });
  }
  res.json({ content: readMemoryFile(sessionId) });
});

router.put('/:sessionId/long-term-memory', (req, res) => {
  const { sessionId } = req.params;
  if (!getSessionById(sessionId)) {
    log.warn(`long-term-memory.not_found ${formatMeta({ method: req.method, path: req.path, id: sessionId })}`);
    return res.status(404).json({ error: '会话不存在' });
  }
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  writeMemoryFile(sessionId, content);
  res.json({ content });
});

export default router;
