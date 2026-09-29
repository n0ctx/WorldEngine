/**
 * 世界卡的档案默认值（开场时间、开场地点）
 *
 *   GET   /api/worlds/:worldId/profile-defaults
 *   PATCH /api/worlds/:worldId/profile-defaults/:fieldKey
 */

import { Router } from 'express';
import { listWorldProfileDefaultRows, updateWorldProfileDefault } from '../services/world-profile-defaults.js';
import { createLogger } from '../utils/logger.js';
import { sendValidationError } from '../utils/route-helpers.js';

const router = Router();
const log = createLogger('world-profile-defaults', 'cyan');
const notFoundMessage = '世界不存在';

router.get('/:worldId/profile-defaults', (req, res) => {
  try {
    res.json(listWorldProfileDefaultRows(req.params.worldId));
  } catch (err) {
    sendValidationError(res, err, { log, ns: 'world-profile-defaults', notFoundMessage, id: req.params.worldId });
  }
});

router.patch('/:worldId/profile-defaults/:fieldKey', (req, res) => {
  const { value_json } = req.body;
  if (value_json === undefined) {
    return sendValidationError(res, new Error('value_json 为必填项'), { log, ns: 'world-profile-defaults', notFoundMessage, id: req.params.worldId });
  }
  try {
    updateWorldProfileDefault(req.params.worldId, req.params.fieldKey, value_json);
    res.json({ success: true });
  } catch (err) {
    sendValidationError(res, err, { log, ns: 'world-profile-defaults', notFoundMessage, id: req.params.worldId });
  }
});

export default router;
