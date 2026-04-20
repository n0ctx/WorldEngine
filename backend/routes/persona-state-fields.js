/**
 * 玩家状态字段路由
 *
 *   GET    /api/worlds/:worldId/persona-state-fields
 *   POST   /api/worlds/:worldId/persona-state-fields
 *   PUT    /api/worlds/:worldId/persona-state-fields/reorder
 *   PUT    /api/persona-state-fields/:id
 *   DELETE /api/persona-state-fields/:id
 */

import { Router } from 'express';
import {
  createPersonaStateField,
  getPersonaStateFieldsByWorldId,
  updatePersonaStateField,
  deletePersonaStateField,
  reorderPersonaStateFields,
} from '../services/persona-state-fields.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();

router.get('/worlds/:worldId/persona-state-fields', (req, res) => {
  res.json(getPersonaStateFieldsByWorldId(req.params.worldId));
});

router.post('/worlds/:worldId/persona-state-fields', (req, res) => {
  const { field_key, label, type } = req.body;
  if (!field_key || !label || !type) {
    return res.status(400).json({ error: 'field_key, label, type 为必填项' });
  }
  const field = createPersonaStateField(req.params.worldId, req.body);
  res.status(201).json(field);
});

// reorder 必须在 :id 路由前注册
router.put('/worlds/:worldId/persona-state-fields/reorder', (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }
  reorderPersonaStateFields(req.params.worldId, orderedIds);
  res.json({ ok: true });
});

router.put('/persona-state-fields/:id', (req, res) => {
  const field = updatePersonaStateField(req.params.id, req.body);
  if (!assertExists(res, field, '字段不存在')) return;
  res.json(field);
});

router.delete('/persona-state-fields/:id', (req, res) => {
  deletePersonaStateField(req.params.id);
  res.status(204).end();
});

export default router;
