import { Router } from 'express';
import {
  createWorldPromptEntry, getWorldPromptEntryById, listWorldPromptEntries, updateWorldPromptEntry, deleteWorldPromptEntry, reorderWorldPromptEntries,
} from '../services/prompt-entries.js';
import { assertExists } from '../utils/route-helpers.js';
import { listConditionsByEntry, replaceEntryConditions } from '../db/queries/entry-conditions.js';

const router = Router();

// ─── world entries ───────────────────────────────────────────────

// GET /api/worlds/:worldId/entries
router.get('/worlds/:worldId/entries', (req, res) => {
  res.json(listWorldPromptEntries(req.params.worldId));
});

// POST /api/worlds/:worldId/entries
router.post('/worlds/:worldId/entries', (req, res) => {
  const { title, description, content, keywords, keyword_scope, trigger_type, sort_order, token } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const entry = createWorldPromptEntry(req.params.worldId, { title, description, content, keywords, keyword_scope, trigger_type, sort_order, token });
  res.status(201).json(entry);
});

// ─── reorder ─────────────────────────────────────────────────────

// PUT /api/world-entries/reorder
router.put('/world-entries/reorder', (req, res) => {
  const { orderedIds, worldId, characterId } = req.body;

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }
  if (!worldId) return res.status(400).json({ error: 'worldId is required' });
  if (characterId) return res.status(400).json({ error: 'characterId is no longer supported' });
  reorderWorldPromptEntries(worldId, orderedIds);

  res.json({ success: true });
});

// ─── single entry CRUD ───────────────────────────────────────────

// GET /api/world-entries/:id
router.get('/world-entries/:id', (req, res) => {
  const entry = getWorldPromptEntryById(req.params.id);

  if (!assertExists(res, entry, 'Entry not found')) return;
  res.json(entry);
});

// PUT /api/world-entries/:id
router.put('/world-entries/:id', (req, res) => {
  const entry = updateWorldPromptEntry(req.params.id, req.body);

  if (!assertExists(res, entry, 'Entry not found')) return;
  res.json(entry);
});

// DELETE /api/world-entries/:id
router.delete('/world-entries/:id', (req, res) => {
  deleteWorldPromptEntry(req.params.id);
  res.status(204).end();
});

// ─── entry_conditions ─────────────────────────────────────────

// GET /api/world-entries/:id/conditions
router.get('/world-entries/:id/conditions', (req, res) => {
  const entry = getWorldPromptEntryById(req.params.id);
  if (!assertExists(res, entry, 'Entry not found')) return;
  res.json(listConditionsByEntry(req.params.id));
});

// PUT /api/world-entries/:id/conditions — 批量替换所有条件
router.put('/world-entries/:id/conditions', (req, res) => {
  const entry = getWorldPromptEntryById(req.params.id);
  if (!assertExists(res, entry, 'Entry not found')) return;
  const { conditions } = req.body;
  if (!Array.isArray(conditions)) return res.status(400).json({ error: 'conditions must be an array' });
  replaceEntryConditions(req.params.id, conditions);
  res.json(listConditionsByEntry(req.params.id));
});

export default router;
