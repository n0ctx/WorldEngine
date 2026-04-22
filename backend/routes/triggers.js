import { Router } from 'express';
import {
  createTrigger,
  getTriggerById,
  listTriggersByWorld,
  updateTrigger,
  deleteTrigger,
  replaceTriggerConditions,
  listConditionsByTrigger,
  replaceTriggerActions,
  getActionsByTriggerId,
} from '../db/queries/triggers.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();

function enrichTrigger(t) {
  return {
    ...t,
    conditions: listConditionsByTrigger(t.id),
    actions: getActionsByTriggerId(t.id),
  };
}

// GET /api/worlds/:worldId/triggers — 列表（含 conditions + actions）
router.get('/worlds/:worldId/triggers', (req, res) => {
  const list = listTriggersByWorld(req.params.worldId);
  res.json(list.map(enrichTrigger));
});

// POST /api/worlds/:worldId/triggers — 新建
router.post('/worlds/:worldId/triggers', (req, res) => {
  const { name, enabled, one_shot, conditions, actions } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const trigger = createTrigger({ world_id: req.params.worldId, name, enabled, one_shot });
  if (Array.isArray(conditions)) replaceTriggerConditions(trigger.id, conditions);
  if (Array.isArray(actions) && actions.length > 0) {
    replaceTriggerActions(trigger.id, actions.filter((a) => a.action_type));
  }
  res.status(201).json(enrichTrigger(trigger));
});

// PUT /api/triggers/:id — 更新
router.put('/triggers/:id', (req, res) => {
  const trigger = getTriggerById(req.params.id);
  if (!assertExists(res, trigger, 'Trigger not found')) return;
  const { name, enabled, one_shot, conditions, actions } = req.body;
  const updated = updateTrigger(req.params.id, { name, enabled, one_shot });
  if (Array.isArray(conditions)) replaceTriggerConditions(req.params.id, conditions);
  if (Array.isArray(actions)) {
    replaceTriggerActions(req.params.id, actions.filter((a) => a.action_type));
  }
  res.json(enrichTrigger(updated));
});

// DELETE /api/triggers/:id — 删除
router.delete('/triggers/:id', (req, res) => {
  const trigger = getTriggerById(req.params.id);
  if (!assertExists(res, trigger, 'Trigger not found')) return;
  deleteTrigger(req.params.id);
  res.json({ ok: true });
});

export default router;
