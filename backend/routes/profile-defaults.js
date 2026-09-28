/**
 * 角色卡 / 人设的档案初始值路由
 *
 *   GET   /api/characters/:id/profile-defaults
 *   PATCH /api/characters/:id/profile-defaults/:fieldKey
 *   GET   /api/personas/:id/profile-defaults
 *   PATCH /api/personas/:id/profile-defaults/:fieldKey
 */

import { Router } from 'express';
import { PROFILE_DEFAULT_OWNERS, listProfileDefaultRows, updateProfileDefault } from '../services/profile-defaults.js';
import { createLogger } from '../utils/logger.js';
import { sendValidationError } from '../utils/route-helpers.js';

const router = Router();
const log = createLogger('profile-defaults', 'cyan');

for (const [kind, prefix] of [['character', 'characters'], ['persona', 'personas']]) {
  const { notFoundMessage } = PROFILE_DEFAULT_OWNERS[kind];

  router.get(`/${prefix}/:id/profile-defaults`, (req, res) => {
    try {
      res.json(listProfileDefaultRows(kind, req.params.id));
    } catch (err) {
      sendValidationError(res, err, { log, ns: 'profile-defaults', notFoundMessage, id: req.params.id });
    }
  });

  router.patch(`/${prefix}/:id/profile-defaults/:fieldKey`, (req, res) => {
    const { value_json } = req.body;
    if (value_json === undefined) {
      return sendValidationError(res, new Error('value_json 为必填项'), { log, ns: 'profile-defaults', notFoundMessage, id: req.params.id });
    }
    try {
      updateProfileDefault(kind, req.params.id, req.params.fieldKey, value_json);
      res.json({ success: true });
    } catch (err) {
      sendValidationError(res, err, { log, ns: 'profile-defaults', notFoundMessage, id: req.params.id });
    }
  });
}

export default router;
