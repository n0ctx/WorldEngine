import { Router } from 'express';
import {
  createGlobalPromptEntry, getGlobalPromptEntryById, listGlobalPromptEntries, updateGlobalPromptEntry, deleteGlobalPromptEntry, reorderGlobalPromptEntries,
  createWorldPromptEntry, getWorldPromptEntryById, listWorldPromptEntries, updateWorldPromptEntry, deleteWorldPromptEntry, reorderWorldPromptEntries,
  createCharacterPromptEntry, getCharacterPromptEntryById, listCharacterPromptEntries, updateCharacterPromptEntry, deleteCharacterPromptEntry, reorderCharacterPromptEntries,
} from '../services/prompt-entries.js';

const router = Router();

// ─── global entries ──────────────────────────────────────────────

// GET /api/global-entries
router.get('/global-entries', (req, res) => {
  res.json(listGlobalPromptEntries());
});

// POST /api/global-entries
router.post('/global-entries', (req, res) => {
  const { title, summary, content, keywords, sort_order } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const entry = createGlobalPromptEntry({ title, summary, content, keywords, sort_order });
  res.status(201).json(entry);
});

// ─── world entries ───────────────────────────────────────────────

// GET /api/worlds/:worldId/entries
router.get('/worlds/:worldId/entries', (req, res) => {
  res.json(listWorldPromptEntries(req.params.worldId));
});

// POST /api/worlds/:worldId/entries
router.post('/worlds/:worldId/entries', (req, res) => {
  const { title, summary, content, keywords, sort_order } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const entry = createWorldPromptEntry(req.params.worldId, { title, summary, content, keywords, sort_order });
  res.status(201).json(entry);
});

// ─── character entries ───────────────────────────────────────────

// GET /api/characters/:characterId/entries
router.get('/characters/:characterId/entries', (req, res) => {
  res.json(listCharacterPromptEntries(req.params.characterId));
});

// POST /api/characters/:characterId/entries
router.post('/characters/:characterId/entries', (req, res) => {
  const { title, summary, content, keywords, sort_order } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const entry = createCharacterPromptEntry(req.params.characterId, { title, summary, content, keywords, sort_order });
  res.status(201).json(entry);
});

// ─── reorder (must be before :type/:id to avoid conflict) ────────

// PUT /api/entries/:type/reorder
router.put('/entries/:type/reorder', (req, res) => {
  const { type } = req.params;
  const { orderedIds, worldId, characterId } = req.body;

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }

  if (type === 'global') {
    reorderGlobalPromptEntries(orderedIds);
  } else if (type === 'world') {
    if (!worldId) return res.status(400).json({ error: 'worldId is required' });
    reorderWorldPromptEntries(worldId, orderedIds);
  } else if (type === 'character') {
    if (!characterId) return res.status(400).json({ error: 'characterId is required' });
    reorderCharacterPromptEntries(characterId, orderedIds);
  } else {
    return res.status(400).json({ error: 'type must be global, world, or character' });
  }

  res.json({ ok: true });
});

// ─── single entry CRUD ───────────────────────────────────────────

// GET /api/entries/:type/:id
router.get('/entries/:type/:id', (req, res) => {
  const { type, id } = req.params;
  let entry;

  if (type === 'global') entry = getGlobalPromptEntryById(id);
  else if (type === 'world') entry = getWorldPromptEntryById(id);
  else if (type === 'character') entry = getCharacterPromptEntryById(id);
  else return res.status(400).json({ error: 'type must be global, world, or character' });

  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  res.json(entry);
});

// PUT /api/entries/:type/:id
router.put('/entries/:type/:id', (req, res) => {
  const { type, id } = req.params;
  const patch = req.body;
  let entry;

  if (type === 'global') entry = updateGlobalPromptEntry(id, patch);
  else if (type === 'world') entry = updateWorldPromptEntry(id, patch);
  else if (type === 'character') entry = updateCharacterPromptEntry(id, patch);
  else return res.status(400).json({ error: 'type must be global, world, or character' });

  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  res.json(entry);
});

// DELETE /api/entries/:type/:id
router.delete('/entries/:type/:id', (req, res) => {
  const { type, id } = req.params;

  if (type === 'global') deleteGlobalPromptEntry(id);
  else if (type === 'world') deleteWorldPromptEntry(id);
  else if (type === 'character') deleteCharacterPromptEntry(id);
  else return res.status(400).json({ error: 'type must be global, world, or character' });

  res.status(204).end();
});

export default router;
