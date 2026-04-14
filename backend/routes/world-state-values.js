/**
 * 世界状态值路由（只读）
 *
 *   GET /api/worlds/:worldId/state-values
 */

import { Router } from 'express';
import { getWorldStateValuesWithFields } from '../db/queries/world-state-values.js';

const router = Router();

router.get('/worlds/:worldId/state-values', (req, res) => {
  const rows = getWorldStateValuesWithFields(req.params.worldId);
  res.json(rows);
});

export default router;
