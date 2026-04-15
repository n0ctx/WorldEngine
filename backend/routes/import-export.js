import { Router } from 'express';
import { exportCharacter, importCharacter, exportWorld, importWorld, exportPersona } from '../services/import-export.js';

const router = Router();

// GET /api/characters/:id/export — 导出角色卡
router.get('/characters/:id/export', (req, res) => {
  try {
    const data = exportCharacter(req.params.id);
    res.json(data);
  } catch (err) {
    if (err.message === '角色不存在') return res.status(404).json({ error: err.message });
    console.error('导出角色卡失败', err);
    res.status(500).json({ error: '导出失败' });
  }
});

// POST /api/worlds/:worldId/import-character — 导入角色卡到指定世界
router.post('/worlds/:worldId/import-character', (req, res) => {
  try {
    const character = importCharacter(req.params.worldId, req.body);
    res.status(201).json(character);
  } catch (err) {
    if (err.message === '世界不存在') return res.status(404).json({ error: err.message });
    if (err.message === '不支持的角色卡格式') return res.status(400).json({ error: err.message });
    console.error('导入角色卡失败', err);
    res.status(500).json({ error: '导入失败' });
  }
});

// GET /api/worlds/:worldId/persona/export — 导出玩家为角色卡
router.get('/worlds/:worldId/persona/export', (req, res) => {
  try {
    const data = exportPersona(req.params.worldId);
    res.json(data);
  } catch (err) {
    if (err.message === '玩家不存在') return res.status(404).json({ error: err.message });
    console.error('导出玩家卡失败', err);
    res.status(500).json({ error: '导出失败' });
  }
});

// GET /api/worlds/:id/export — 导出世界卡
router.get('/worlds/:id/export', (req, res) => {
  try {
    const data = exportWorld(req.params.id);
    res.json(data);
  } catch (err) {
    if (err.message === '世界不存在') return res.status(404).json({ error: err.message });
    console.error('导出世界卡失败', err);
    res.status(500).json({ error: '导出失败' });
  }
});

// POST /api/worlds/import — 导入世界卡
router.post('/worlds/import', (req, res) => {
  try {
    const world = importWorld(req.body);
    res.status(201).json(world);
  } catch (err) {
    if (err.message === '不支持的世界卡格式') return res.status(400).json({ error: err.message });
    console.error('导入世界卡失败', err);
    res.status(500).json({ error: '导入失败' });
  }
});

export default router;
