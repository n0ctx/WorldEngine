import { Router } from 'express';
import { exportCharacter, importCharacter, exportWorld, importWorld, exportPersona, exportGlobalSettings, importGlobalSettings } from '../services/import-export.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = Router();
const log = createLogger('import');

// GET /api/characters/:id/export — 导出角色卡
router.get('/characters/:id/export', (req, res) => {
  try {
    const data = exportCharacter(req.params.id);
    res.json(data);
  } catch (err) {
    if (err.message === '角色不存在') return res.status(404).json({ error: err.message });
    log.error(`EXPORT CHARACTER FAIL  ${formatMeta({ id: req.params.id, error: err.message })}`);
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
    if (err.message.includes('角色卡') || err.message.includes('character') || err.message.includes('prompt_entries') || err.message.includes('state_values')) {
      return res.status(400).json({ error: err.message });
    }
    log.error(`IMPORT CHARACTER FAIL  ${formatMeta({ worldId: req.params.worldId, error: err.message })}`);
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
    log.error(`EXPORT PERSONA FAIL  ${formatMeta({ worldId: req.params.worldId, error: err.message })}`);
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
    log.error(`EXPORT WORLD FAIL  ${formatMeta({ id: req.params.id, error: err.message })}`);
    res.status(500).json({ error: '导出失败' });
  }
});

// POST /api/worlds/import — 导入世界卡
router.post('/worlds/import', (req, res) => {
  try {
    const world = importWorld(req.body);
    res.status(201).json(world);
  } catch (err) {
    if (err.message.includes('世界卡') || err.message.includes('world.') || err.message.includes('persona') || err.message.includes('characters[')) {
      return res.status(400).json({ error: err.message });
    }
    log.error(`IMPORT WORLD FAIL  ${formatMeta({ error: err.message })}`);
    res.status(500).json({ error: '导入失败' });
  }
});

// GET /api/global-settings/export?mode=chat|writing — 导出全局设置
router.get('/global-settings/export', (req, res) => {
  try {
    const mode = req.query.mode === 'writing' ? 'writing' : 'chat';
    const data = exportGlobalSettings(mode);
    res.json(data);
  } catch (err) {
    log.error(`EXPORT GLOBAL FAIL  ${formatMeta({ mode: req.query.mode === 'writing' ? 'writing' : 'chat', error: err.message })}`);
    res.status(500).json({ error: '导出失败' });
  }
});

// POST /api/global-settings/import — 导入全局设置
router.post('/global-settings/import', (req, res) => {
  try {
    const result = importGlobalSettings(req.body);
    res.json(result);
  } catch (err) {
    if (err.message === '全局设置文件格式不正确') {
      return res.status(400).json({ error: err.message });
    }
    log.error(`IMPORT GLOBAL FAIL  ${formatMeta({ error: err.message })}`);
    res.status(500).json({ error: '导入失败' });
  }
});

export default router;
