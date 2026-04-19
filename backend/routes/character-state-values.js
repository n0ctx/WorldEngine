/**
 * 角色状态值路由
 *
 *   GET   /api/characters/:characterId/state-values
 *   PATCH /api/characters/:characterId/state-values/:fieldKey
 *   POST  /api/characters/:characterId/state-values/reset
 */

import { Router } from 'express';
import { getCharacterStateValuesWithFields } from '../db/queries/character-state-values.js';
import {
  resetCharacterStateValuesValidated,
  updateCharacterDefaultStateValueValidated,
} from '../services/state-values.js';

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

  try {
    updateCharacterDefaultStateValueValidated(characterId, fieldKey, value_json);
    res.json({ success: true });
  } catch (err) {
    if (err.message === '角色不存在') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.post('/characters/:characterId/state-values/reset', (req, res) => {
  try {
    resetCharacterStateValuesValidated(req.params.characterId);
    res.json(getCharacterStateValuesWithFields(req.params.characterId));
  } catch (err) {
    if (err.message === '角色不存在') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

export default router;
