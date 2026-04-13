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

const router = Router();

// ── 世界状态字段 ──────────────────────────────────────────────────

router.get('/worlds/:worldId/world-state-fields', (req, res) => {
  res.json(listWorldStateFields(req.params.worldId));
});

router.post('/worlds/:worldId/world-state-fields', (req, res) => {
  const { field_key, label, type } = req.body;
  if (!field_key || !label || !type) {
    return res.status(400).json({ error: 'field_key, label, type 为必填项' });
  }
  const field = createWorldStateField(req.params.worldId, req.body);
  res.status(201).json(field);
});

// reorder 必须在 :id 路由前注册
router.put('/worlds/:worldId/world-state-fields/reorder', (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }
  reorderWorldStateFields(req.params.worldId, orderedIds);
  res.json({ ok: true });
});

router.put('/world-state-fields/:id', (req, res) => {
  const field = updateWorldStateField(req.params.id, req.body);
  if (!field) return res.status(404).json({ error: '字段不存在' });
  res.json(field);
});

router.delete('/world-state-fields/:id', (req, res) => {
  deleteWorldStateField(req.params.id);
  res.status(204).end();
});

// ── 角色状态字段 ──────────────────────────────────────────────────

router.get('/worlds/:worldId/character-state-fields', (req, res) => {
  res.json(listCharacterStateFields(req.params.worldId));
});

router.post('/worlds/:worldId/character-state-fields', (req, res) => {
  const { field_key, label, type } = req.body;
  if (!field_key || !label || !type) {
    return res.status(400).json({ error: 'field_key, label, type 为必填项' });
  }
  const field = createCharacterStateField(req.params.worldId, req.body);
  res.status(201).json(field);
});

router.put('/worlds/:worldId/character-state-fields/reorder', (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }
  reorderCharacterStateFields(req.params.worldId, orderedIds);
  res.json({ ok: true });
});

router.put('/character-state-fields/:id', (req, res) => {
  const field = updateCharacterStateField(req.params.id, req.body);
  if (!field) return res.status(404).json({ error: '字段不存在' });
  res.json(field);
});

router.delete('/character-state-fields/:id', (req, res) => {
  deleteCharacterStateField(req.params.id);
  res.status(204).end();
});

export default router;
