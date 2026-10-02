/**
 * middle-summary.js — 会话级中期摘要（剧情摘要）HTTP 接口
 *
 * GET  /api/sessions/:sessionId/middle-summary  → { content, coveredTo }
 * PUT  /api/sessions/:sessionId/middle-summary  body: { content }  → { content }
 *   PUT 更新最新一条 turn record 的中期摘要正文；会话尚无 turn record 时返回 409。
 */

import express from 'express';
import { getSessionById } from '../db/queries/sessions.js';
import { getLatestTurnRecord } from '../db/queries/turn-records.js';
import { editLatestMiddleSummary } from '../memory/middle-summary.js';
import { assertExists } from '../utils/route-helpers.js';

const router = express.Router();

router.get('/:sessionId/middle-summary', (req, res) => {
  const { sessionId } = req.params;
  if (!assertExists(res, getSessionById(sessionId), '会话不存在')) return;
  const latest = getLatestTurnRecord(sessionId);
  res.json({
    content: latest?.middle_summary ?? '',
    coveredTo: latest?.middle_covered_to ?? 0,
  });
});

router.put('/:sessionId/middle-summary', (req, res) => {
  const { sessionId } = req.params;
  if (!assertExists(res, getSessionById(sessionId), '会话不存在')) return;
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!editLatestMiddleSummary(sessionId, content)) {
    return res.status(409).json({ error: '会话尚无剧情记录' });
  }
  res.json({ content });
});

export default router;
