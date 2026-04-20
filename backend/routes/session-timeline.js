/**
 * 会话时间线路由
 *
 *   GET /api/sessions/:sessionId/timeline
 *     — 返回 { items: [{ round_index, summary, created_at }] }
 *       按 round_index 升序，取最近 WORLD_TIMELINE_RECENT_LIMIT 条
 */

import { Router } from 'express';
import db from '../db/index.js';
import { getSessionById } from '../db/queries/sessions.js';
import { WORLD_TIMELINE_RECENT_LIMIT } from '../utils/constants.js';

const router = Router();

router.get('/:sessionId/timeline', (req, res) => {
  const { sessionId } = req.params;
  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: '会话不存在' });

  const items = db.prepare(`
    SELECT round_index, summary, created_at FROM (
      SELECT round_index, summary, created_at FROM turn_records
      WHERE session_id = ?
      ORDER BY round_index DESC LIMIT ?
    ) ORDER BY round_index ASC
  `).all(sessionId, WORLD_TIMELINE_RECENT_LIMIT);

  res.json({ items });
});

export default router;
