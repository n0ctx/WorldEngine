/**
 * 玩家状态值路由
 *
 *   GET   /api/worlds/:worldId/persona-state-values
 *   PATCH /api/worlds/:worldId/persona-state-values/:fieldKey
 *   POST  /api/worlds/:worldId/persona-state-values/reset
 *   GET   /api/worlds/:worldId/personas/:personaId/state-values
 *   PATCH /api/worlds/:worldId/personas/:personaId/state-values/:fieldKey
 *   POST  /api/worlds/:worldId/personas/:personaId/state-values/reset
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
import { createLogger, formatMeta } from '../utils/logger.js';
import { sendValidationError } from '../utils/route-helpers.js';

const router = Router();
const log = createLogger('persona-state-values', 'cyan');

function requireValueJson(req, res) {
  const { value_json } = req.body;
  if (value_json !== undefined) return value_json;
  const reason = 'value_json 为必填项';
  log.warn(`persona-state-values.bad_request ${formatMeta({ method: req.method, path: req.path, reason })}`);
  res.status(400).json({ error: reason });
  return undefined;
}

router.get('/worlds/:worldId/persona-state-values', (req, res) => {
  const rows = getPersonaStateValuesWithFields(req.params.worldId);
  res.json(rows);
});

router.patch('/worlds/:worldId/persona-state-values/:fieldKey', (req, res) => {
  const { worldId, fieldKey } = req.params;
  const value_json = requireValueJson(req, res);
  if (value_json === undefined) return;

  try {
    updatePersonaDefaultStateValueValidated(worldId, fieldKey, value_json);
    res.json({ success: true });
  } catch (err) {
    sendValidationError(res, err, { log, ns: 'persona-state-values', notFoundMessage: '世界不存在', id: worldId });
  }
});

router.post('/worlds/:worldId/persona-state-values/reset', (req, res) => {
  try {
    resetPersonaStateValuesValidated(req.params.worldId);
    res.json(getPersonaStateValuesWithFields(req.params.worldId));
  } catch (err) {
    sendValidationError(res, err, { log, ns: 'persona-state-values', notFoundMessage: '世界不存在', id: req.params.worldId });
  }
});

// ─── 按 personaId 的专属路由 ──────────────────────────────────────────────────

router.get('/worlds/:worldId/personas/:personaId/state-values', (req, res) => {
  const { worldId, personaId } = req.params;
  res.json(getPersonaStateValuesWithFieldsByPersonaId(personaId, worldId));
});

router.patch('/worlds/:worldId/personas/:personaId/state-values/:fieldKey', (req, res) => {
  const { worldId, personaId, fieldKey } = req.params;
  const value_json = requireValueJson(req, res);
  if (value_json === undefined) return;
  try {
    updatePersonaDefaultStateValueByPersonaIdValidated(personaId, worldId, fieldKey, value_json);
    res.json({ success: true });
  } catch (err) {
    sendValidationError(res, err, { log, ns: 'persona-state-values', notFoundMessage: '世界不存在', id: worldId });
  }
});

router.post('/worlds/:worldId/personas/:personaId/state-values/reset', (req, res) => {
  const { worldId, personaId } = req.params;
  try {
    resetPersonaStateValuesByPersonaIdValidated(personaId, worldId);
    res.json(getPersonaStateValuesWithFieldsByPersonaId(personaId, worldId));
  } catch (err) {
    sendValidationError(res, err, { log, ns: 'persona-state-values', notFoundMessage: '世界不存在', id: worldId });
  }
});

export default router;
