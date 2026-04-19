/**
 * 世界时间线路由（只读）
 *
 *   GET /api/worlds/:worldId/timeline?limit=50
 */

import { Router } from 'express';
import { getTimelineByWorldId } from '../db/queries/world-timeline.js';

const router = Router();

router.get('/worlds/:worldId/timeline', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
  const rows = getTimelineByWorldId(req.params.worldId, limit);
  res.json(rows);
});

export default router;
