/**
 * 世界状态值路由（只读 + 重置）
 *
 *   GET  /api/worlds/:worldId/state-values
 *   POST /api/worlds/:worldId/state-values/reset
 */

import { Router } from 'express';
import { getWorldStateValuesWithFields, upsertWorldStateValue } from '../db/queries/world-state-values.js';
import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';

const router = Router();

router.get('/worlds/:worldId/state-values', (req, res) => {
  const rows = getWorldStateValuesWithFields(req.params.worldId);
  res.json(rows);
});

router.post('/worlds/:worldId/state-values/reset', (req, res) => {
  const { worldId } = req.params;
  const fields = getWorldStateFieldsByWorldId(worldId);
  for (const field of fields) {
    upsertWorldStateValue(worldId, field.field_key, field.default_value ?? null);
  }
  res.json(getWorldStateValuesWithFields(worldId));
});

export default router;
