import { Router } from 'express';
import {
  createWorld,
  getWorldById,
  getAllWorlds,
  updateWorld,
  deleteWorld,
} from '../services/worlds.js';

const router = Router();

// GET /api/worlds — 获取所有世界
router.get('/', (_req, res) => {
  const worlds = getAllWorlds();
  res.json(worlds);
});

// POST /api/worlds — 创建世界
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name 为必填项' });
  }
  const world = createWorld(req.body);
  res.status(201).json(world);
});

// GET /api/worlds/:id — 获取单个世界
router.get('/:id', (req, res) => {
  const world = getWorldById(req.params.id);
  if (!world) {
    return res.status(404).json({ error: '世界不存在' });
  }
  res.json(world);
});

// PUT /api/worlds/:id — 更新世界
router.put('/:id', (req, res) => {
  const existing = getWorldById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '世界不存在' });
  }
  const updated = updateWorld(req.params.id, req.body);
  res.json(updated);
});

// DELETE /api/worlds/:id — 删除世界
router.delete('/:id', (req, res) => {
  const existing = getWorldById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '世界不存在' });
  }
  deleteWorld(req.params.id);
  res.status(204).end();
});

export default router;
