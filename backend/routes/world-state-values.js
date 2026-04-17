/**
 * 世界状态值路由
 *
 *   GET   /api/worlds/:worldId/state-values
 *   PATCH /api/worlds/:worldId/state-values/:fieldKey
 *   POST  /api/worlds/:worldId/state-values/reset
 */

import { Router } from 'express';
import { getWorldStateValuesWithFields } from '../db/queries/world-state-values.js';
import {
  resetWorldStateValuesValidated,
  updateWorldDefaultStateValueValidated,
} from '../services/state-values.js';

const router = Router();

router.get('/worlds/:worldId/state-values', (req, res) => {
  const rows = getWorldStateValuesWithFields(req.params.worldId);
  res.json(rows);
});

router.patch('/worlds/:worldId/state-values/:fieldKey', (req, res) => {
  const { worldId, fieldKey } = req.params;
  const { value_json } = req.body;
  if (value_json === undefined) {
    return res.status(400).json({ error: 'value_json 为必填项' });
  }

  try {
    updateWorldDefaultStateValueValidated(worldId, fieldKey, value_json);
    res.json({ success: true });
  } catch (err) {
    if (err.message === '世界不存在') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.post('/worlds/:worldId/state-values/reset', (req, res) => {
  try {
    resetWorldStateValuesValidated(req.params.worldId);
    res.json(getWorldStateValuesWithFields(req.params.worldId));
  } catch (err) {
    if (err.message === '世界不存在') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

export default router;
