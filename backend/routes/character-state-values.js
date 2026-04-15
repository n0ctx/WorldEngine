/**
 * 角色状态值路由
 *
 *   GET   /api/characters/:characterId/state-values
 *   PATCH /api/characters/:characterId/state-values/:fieldKey
 */

import { Router } from 'express';
import {
  getCharacterStateValuesWithFields,
  upsertCharacterStateValue,
} from '../db/queries/character-state-values.js';

const router = Router();

router.get('/characters/:characterId/state-values', (req, res) => {
  const rows = getCharacterStateValuesWithFields(req.params.characterId);
  res.json(rows);
});

router.patch('/characters/:characterId/state-values/:fieldKey', (req, res) => {
  const { characterId, fieldKey } = req.params;
  const { value_json } = req.body;
  if (value_json === undefined) {
    return res.status(400).json({ error: 'value_json 为必填项' });
  }
  upsertCharacterStateValue(characterId, fieldKey, value_json);
  res.json({ success: true });
});

export default router;
