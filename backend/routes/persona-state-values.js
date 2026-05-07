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
  getPersonaStateValuesWithFieldsByPersonaId,
} from '../db/queries/persona-state-values.js';
import {
  resetPersonaStateValuesValidated,
  updatePersonaDefaultStateValueValidated,
  updatePersonaDefaultStateValueByPersonaIdValidated,
  resetPersonaStateValuesByPersonaIdValidated,
} from '../services/state-values.js';

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

  try {
    updatePersonaDefaultStateValueValidated(worldId, fieldKey, value_json);
    res.json({ success: true });
  } catch (err) {
    if (err.message === '世界不存在') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.post('/worlds/:worldId/persona-state-values/reset', (req, res) => {
  try {
    resetPersonaStateValuesValidated(req.params.worldId);
    res.json(getPersonaStateValuesWithFields(req.params.worldId));
  } catch (err) {
    if (err.message === '世界不存在') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

// ─── 按 personaId 的专属路由 ──────────────────────────────────────────────────

router.get('/worlds/:worldId/personas/:personaId/state-values', (req, res) => {
  const { worldId, personaId } = req.params;
  res.json(getPersonaStateValuesWithFieldsByPersonaId(personaId, worldId));
});

router.patch('/worlds/:worldId/personas/:personaId/state-values/:fieldKey', (req, res) => {
  const { worldId, personaId, fieldKey } = req.params;
  const { value_json } = req.body;
  if (value_json === undefined) {
    return res.status(400).json({ error: 'value_json 为必填项' });
  }
  try {
    updatePersonaDefaultStateValueByPersonaIdValidated(personaId, worldId, fieldKey, value_json);
    res.json({ success: true });
  } catch (err) {
    if (err.message === '世界不存在') return res.status(404).json({ error: err.message });
    res.status(400).json({ error: err.message });
  }
});

router.post('/worlds/:worldId/personas/:personaId/state-values/reset', (req, res) => {
  const { worldId, personaId } = req.params;
  try {
    resetPersonaStateValuesByPersonaIdValidated(personaId, worldId);
    res.json(getPersonaStateValuesWithFieldsByPersonaId(personaId, worldId));
  } catch (err) {
    if (err.message === '世界不存在') return res.status(404).json({ error: err.message });
    res.status(400).json({ error: err.message });
  }
});

export default router;
