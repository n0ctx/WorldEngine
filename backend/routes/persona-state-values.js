/**
 * 玩家状态值路由（只读）
 *
 *   GET /api/worlds/:worldId/persona-state-values
 */

import { Router } from 'express';
import { getPersonaStateValuesWithFields } from '../db/queries/persona-state-values.js';

const router = Router();

router.get('/worlds/:worldId/persona-state-values', (req, res) => {
  const rows = getPersonaStateValuesWithFields(req.params.worldId);
  res.json(rows);
});

export default router;
