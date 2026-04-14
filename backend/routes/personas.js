import { Router } from 'express';
import { getOrCreatePersona, updatePersona } from '../services/personas.js';

const router = Router();

// GET /api/worlds/:worldId/persona
router.get('/worlds/:worldId/persona', (req, res) => {
  const { worldId } = req.params;
  const persona = getOrCreatePersona(worldId);
  res.json(persona);
});

// PATCH /api/worlds/:worldId/persona
router.patch('/worlds/:worldId/persona', (req, res) => {
  const { worldId } = req.params;
  const { name, system_prompt } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (system_prompt !== undefined) patch.system_prompt = system_prompt;
  const persona = updatePersona(worldId, patch);
  res.json(persona);
});

export default router;
