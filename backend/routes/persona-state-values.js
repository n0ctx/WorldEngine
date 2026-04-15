/**
 * 玩家状态值路由
 *
 *   GET   /api/worlds/:worldId/persona-state-values
 *   PATCH /api/worlds/:worldId/persona-state-values/:fieldKey
 */

import { Router } from 'express';
import {
  getPersonaStateValuesWithFields,
  upsertPersonaStateValue,
} from '../db/queries/persona-state-values.js';

const router = Router();

router.get('/worlds/:worldId/persona-state-values', (req, res) => {
  const rows = getPersonaStateValuesWithFields(req.params.worldId);
  res.json(rows);
});

router.patch('/worlds/:worldId/persona-state-values/:fieldKey', (req, res) => {
  const { worldId, fieldKey } = req.params;
  const { value_json } = req.body;
  if (value_json === undefined) {
    return res.status(400).json({ error: 'value_json 为必填项' });
  }
  upsertPersonaStateValue(worldId, fieldKey, value_json);
  res.json({ success: true });
});

export default router;
