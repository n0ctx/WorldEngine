import { Router } from 'express';
import {
  createCharacter,
  getCharacterById,
  getCharactersByWorldId,
  updateCharacter,
  deleteCharacter,
} from '../services/characters.js';
import { getWorldById } from '../services/worlds.js';

const router = Router();

// GET /api/worlds/:worldId/characters — 获取某世界下所有角色
router.get('/worlds/:worldId/characters', (req, res) => {
  const world = getWorldById(req.params.worldId);
  if (!world) {
    return res.status(404).json({ error: '世界不存在' });
  }
  const characters = getCharactersByWorldId(req.params.worldId);
  res.json(characters);
});

// POST /api/worlds/:worldId/characters — 创建角色
router.post('/worlds/:worldId/characters', (req, res) => {
  const world = getWorldById(req.params.worldId);
  if (!world) {
    return res.status(404).json({ error: '世界不存在' });
  }
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name 为必填项' });
  }
  const character = createCharacter({ ...req.body, world_id: req.params.worldId });
  res.status(201).json(character);
});

// GET /api/characters/:id — 获取单个角色
router.get('/characters/:id', (req, res) => {
  const character = getCharacterById(req.params.id);
  if (!character) {
    return res.status(404).json({ error: '角色不存在' });
  }
  res.json(character);
});

// PUT /api/characters/:id — 更新角色
router.put('/characters/:id', (req, res) => {
  const existing = getCharacterById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '角色不存在' });
  }
  const updated = updateCharacter(req.params.id, req.body);
  res.json(updated);
});

// DELETE /api/characters/:id — 删除角色
router.delete('/characters/:id', (req, res) => {
  const existing = getCharacterById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '角色不存在' });
  }
  deleteCharacter(req.params.id);
  res.status(204).end();
});

export default router;
