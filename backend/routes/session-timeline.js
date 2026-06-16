/**
 * 会话时间线路由
 *
 *   GET /api/sessions/:sessionId/timeline
 *     — 返回 { items: [{ round_index, summary, created_at }] }
 *       按 round_index 升序，取最近 WORLD_TIMELINE_RECENT_LIMIT 条
 */

import { Router } from 'express';
import { getSessionById } from '../db/queries/sessions.js';
import { getRecentTurnSummaries } from '../db/queries/turn-records.js';
import { WORLD_TIMELINE_RECENT_LIMIT } from '../utils/constants.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();

router.get('/:sessionId/timeline', (req, res) => {
  const { sessionId } = req.params;
  const session = getSessionById(sessionId);
  if (!assertExists(res, session, '会话不存在')) return;

  const items = getRecentTurnSummaries(sessionId, WORLD_TIMELINE_RECENT_LIMIT);

  res.json({ items });
});

export default router;
