/**
 * 角色状态值路由
 *
 *   GET   /api/characters/:characterId/state-values
 *   PATCH /api/characters/:characterId/state-values/:fieldKey
 *   POST  /api/characters/:characterId/state-values/reset
 */

import { Router } from 'express';
import {
  getCharacterStateValuesWithFields,
  upsertCharacterStateValue,
} from '../db/queries/character-state-values.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';

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

router.post('/characters/:characterId/state-values/reset', (req, res) => {
  const { characterId } = req.params;
  const character = getCharacterById(characterId);
  if (!character) return res.status(404).json({ error: '角色不存在' });
  const fields = getCharacterStateFieldsByWorldId(character.world_id);
  for (const field of fields) {
    upsertCharacterStateValue(characterId, field.field_key, field.default_value ?? null);
  }
  res.json(getCharacterStateValuesWithFields(characterId));
});

export default router;
