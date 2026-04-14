/**
 * 角色状态值路由（只读）
 *
 *   GET /api/characters/:characterId/state-values
 */

import { Router } from 'express';
import { getCharacterStateValuesWithFields } from '../db/queries/character-state-values.js';

const router = Router();

router.get('/characters/:characterId/state-values', (req, res) => {
  const rows = getCharacterStateValuesWithFields(req.params.characterId);
  res.json(rows);
});

export default router;
