/**
 * 状态字段路由
 *
 * 世界状态字段：
 *   GET    /api/worlds/:worldId/world-state-fields
 *   POST   /api/worlds/:worldId/world-state-fields
 *   PUT    /api/worlds/:worldId/world-state-fields/reorder
 *   PUT    /api/world-state-fields/:id
 *   DELETE /api/world-state-fields/:id
 *
 * 角色状态字段：
 *   GET    /api/worlds/:worldId/character-state-fields
 *   POST   /api/worlds/:worldId/character-state-fields
 *   PUT    /api/worlds/:worldId/character-state-fields/reorder
 *   PUT    /api/character-state-fields/:id
 *   DELETE /api/character-state-fields/:id
 */

import { Router } from 'express';
import {
  createWorldStateField, listWorldStateFields,
  updateWorldStateField, deleteWorldStateField, reorderWorldStateFields,
} from '../services/world-state-fields.js';
import {
  createCharacterStateField, listCharacterStateFields,
  updateCharacterStateField, deleteCharacterStateField, reorderCharacterStateFields,
} from '../services/character-state-fields.js';
import { assertExists } from '../utils/route-helpers.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = Router();
const log = createLogger('state-fields', 'cyan');

/** 注册某一层（world / character）状态字段的 CRUD 与排序路由 */
function registerStateFieldRoutes(scope, { list, create, reorder, update, remove }) {
  router.get(`/worlds/:worldId/${scope}-state-fields`, (req, res) => {
    res.json(list(req.params.worldId));
  });

  router.post(`/worlds/:worldId/${scope}-state-fields`, (req, res) => {
    const { field_key, label, type } = req.body;
    if (!field_key || !label || !type) {
      log.warn(`state-fields.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'field_key, label, type 为必填项' })}`);
      return res.status(400).json({ error: 'field_key, label, type 为必填项' });
    }
    try {
      const field = create(req.params.worldId, req.body);
      res.status(201).json(field);
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        log.warn(`state-fields.bad_request ${formatMeta({ method: req.method, path: req.path, reason: `duplicate field_key: ${field_key}` })}`);
        return res.status(409).json({ error: `field_key "${field_key}" 在该世界下已存在` });
      }
      throw e;
    }
  });

  // reorder 必须在 :id 路由前注册
  router.put(`/worlds/:worldId/${scope}-state-fields/reorder`, (req, res) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      log.warn(`state-fields.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'orderedIds must be an array' })}`);
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }
    reorder(req.params.worldId, orderedIds);
    res.json({ ok: true });
  });

  router.put(`/${scope}-state-fields/:id`, (req, res) => {
    const field = update(req.params.id, req.body);
    if (!assertExists(res, field, '字段不存在')) return;
    res.json(field);
  });

  router.delete(`/${scope}-state-fields/:id`, (req, res) => {
    remove(req.params.id);
    res.status(204).end();
  });
}

registerStateFieldRoutes('world', {
  list: listWorldStateFields,
  create: createWorldStateField,
  reorder: reorderWorldStateFields,
  update: updateWorldStateField,
  remove: deleteWorldStateField,
});

registerStateFieldRoutes('character', {
  list: listCharacterStateFields,
  create: createCharacterStateField,
  reorder: reorderCharacterStateFields,
  update: updateCharacterStateField,
  remove: deleteCharacterStateField,
});

export default router;
