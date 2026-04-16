/**
 * 玩家状态值路由
 *
 *   GET   /api/worlds/:worldId/persona-state-values
 *   PATCH /api/worlds/:worldId/persona-state-values/:fieldKey
 *   POST  /api/worlds/:worldId/persona-state-values/reset
 */

import { Router } from 'express';
import {
  getPersonaStateValuesWithFields,
  upsertPersonaStateValue,
} from '../db/queries/persona-state-values.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';

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

router.post('/worlds/:worldId/persona-state-values/reset', (req, res) => {
  const { worldId } = req.params;
  const fields = getPersonaStateFieldsByWorldId(worldId);
  for (const field of fields) {
    upsertPersonaStateValue(worldId, field.field_key, field.default_value ?? null);
  }
  res.json(getPersonaStateValuesWithFields(worldId));
});

export default router;
