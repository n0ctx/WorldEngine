import { Router } from 'express';
import {
  createTrigger,
  getTriggerById,
  listTriggersByWorld,
  updateTrigger,
  deleteTrigger,
  replaceTriggerConditions,
  listConditionsByTrigger,
  upsertTriggerAction,
  getActionByTriggerId,
} from '../db/queries/triggers.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();

// GET /api/worlds/:worldId/triggers — 列表（含 conditions + action）
router.get('/worlds/:worldId/triggers', (req, res) => {
  const list = listTriggersByWorld(req.params.worldId);
  const enriched = list.map((t) => ({
    ...t,
    conditions: listConditionsByTrigger(t.id),
    action: getActionByTriggerId(t.id) || null,
  }));
  res.json(enriched);
});

// POST /api/worlds/:worldId/triggers — 新建
router.post('/worlds/:worldId/triggers', (req, res) => {
  const { name, enabled, one_shot, conditions, action } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const trigger = createTrigger({ world_id: req.params.worldId, name, enabled, one_shot });
  if (Array.isArray(conditions)) replaceTriggerConditions(trigger.id, conditions);
  if (action?.action_type) upsertTriggerAction(trigger.id, action.action_type, action.params || {});
  res.status(201).json({
    ...trigger,
    conditions: listConditionsByTrigger(trigger.id),
    action: getActionByTriggerId(trigger.id) || null,
  });
});

// PUT /api/triggers/:id — 更新
router.put('/triggers/:id', (req, res) => {
  const trigger = getTriggerById(req.params.id);
  if (!assertExists(res, trigger, 'Trigger not found')) return;
  const { name, enabled, one_shot, conditions, action } = req.body;
  const updated = updateTrigger(req.params.id, { name, enabled, one_shot });
  if (Array.isArray(conditions)) replaceTriggerConditions(req.params.id, conditions);
  if (action?.action_type) upsertTriggerAction(req.params.id, action.action_type, action.params || {});
  res.json({
    ...updated,
    conditions: listConditionsByTrigger(req.params.id),
    action: getActionByTriggerId(req.params.id) || null,
  });
});

// DELETE /api/triggers/:id — 删除
router.delete('/triggers/:id', (req, res) => {
  const trigger = getTriggerById(req.params.id);
  if (!assertExists(res, trigger, 'Trigger not found')) return;
  deleteTrigger(req.params.id);
  res.json({ ok: true });
});

export default router;
