import { Router } from 'express';
import {
  createWorldPromptEntry, getWorldPromptEntryById, listWorldPromptEntries, updateWorldPromptEntry, deleteWorldPromptEntry, reorderWorldPromptEntries,
} from '../services/prompt-entries.js';
import { assertExists } from '../utils/route-helpers.js';
import { listConditionsByEntry, replaceEntryConditions } from '../db/queries/entry-conditions.js';
import { KeywordScopeEmptyError } from '../db/queries/prompt-entries.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = Router();
const log = createLogger('prompt-entries', 'cyan');

// ─── world entries ───────────────────────────────────────────────

// GET /api/worlds/:worldId/entries
router.get('/worlds/:worldId/entries', (req, res) => {
  res.json(listWorldPromptEntries(req.params.worldId));
});

// POST /api/worlds/:worldId/entries
router.post('/worlds/:worldId/entries', (req, res) => {
  const { title, description, content, keywords, keyword_scope, trigger_type, condition_logic, keyword_logic, active_turns, sort_order, token } = req.body;
  if (!title) {
    log.warn(`prompt-entries.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'title is required' })}`);
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const entry = createWorldPromptEntry(req.params.worldId, { title, description, content, keywords, keyword_scope, trigger_type, condition_logic, keyword_logic, active_turns, sort_order, token });
    res.status(201).json(entry);
  } catch (err) {
    if (err instanceof KeywordScopeEmptyError) {
      log.warn(`prompt-entries.bad_request ${formatMeta({ method: req.method, path: req.path, reason: err.message, code: err.code })}`);
      return res.status(400).json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

// ─── reorder ─────────────────────────────────────────────────────

// PUT /api/world-entries/reorder
router.put('/world-entries/reorder', (req, res) => {
  const { orderedIds, worldId, characterId } = req.body;

  if (!Array.isArray(orderedIds)) {
    log.warn(`prompt-entries.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'orderedIds must be an array' })}`);
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }
  if (!worldId) {
    log.warn(`prompt-entries.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'worldId is required' })}`);
    return res.status(400).json({ error: 'worldId is required' });
  }
  if (characterId) {
    log.warn(`prompt-entries.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'characterId is no longer supported' })}`);
    return res.status(400).json({ error: 'characterId is no longer supported' });
  }
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
  let entry;
  try {
    entry = updateWorldPromptEntry(req.params.id, req.body);
  } catch (err) {
    if (err instanceof KeywordScopeEmptyError) {
      log.warn(`prompt-entries.bad_request ${formatMeta({ method: req.method, path: req.path, reason: err.message, code: err.code })}`);
      return res.status(400).json({ error: err.message, code: err.code });
    }
    throw err;
  }
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
  if (!Array.isArray(conditions)) {
    log.warn(`prompt-entries.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'conditions must be an array' })}`);
    return res.status(400).json({ error: 'conditions must be an array' });
  }
  replaceEntryConditions(req.params.id, conditions);
  res.json(listConditionsByEntry(req.params.id));
});

export default router;
