import { Router } from 'express';
import { exportCharacter, importCharacter, exportWorld, importWorld, exportPersona, exportPersonaById, importPersona, exportGlobalSettings, importGlobalSettings, exportMigration, importMigration } from '../services/import-export.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = Router();
const log = createLogger('import');

/**
 * 导入导出失败的统一响应：message 命中 notFound 回 404，isBadRequest 为真回 400，
 * 其余记 error 日志（`${tag} FAIL`）并回 500。
 */
function sendFailure(req, res, err, { notFound = [], isBadRequest = () => false, tag, meta = {}, failMessage }) {
  if (notFound.includes(err.message)) {
    log.warn(`import.not_found ${formatMeta({ method: req.method, path: req.path, reason: err.message })}`);
    return res.status(404).json({ error: err.message });
  }
  if (isBadRequest(err.message)) {
    log.warn(`import.bad_request ${formatMeta({ method: req.method, path: req.path, reason: err.message })}`);
    return res.status(400).json({ error: err.message });
  }
  log.error(`${tag} FAIL  ${formatMeta({ ...meta, error: err.message })}`);
  res.status(500).json({ error: failMessage });
}

const includesAny = (...parts) => (message) => parts.some((part) => message.includes(part));

// GET /api/characters/:id/export — 导出角色卡
router.get('/characters/:id/export', (req, res) => {
  try {
    res.json(exportCharacter(req.params.id));
  } catch (err) {
    sendFailure(req, res, err, { notFound: ['角色不存在'], tag: 'EXPORT CHARACTER', meta: { id: req.params.id }, failMessage: '导出失败' });
  }
});

// POST /api/worlds/:worldId/import-character — 导入角色卡到指定世界
router.post('/worlds/:worldId/import-character', (req, res) => {
  try {
    res.status(201).json(importCharacter(req.params.worldId, req.body));
  } catch (err) {
    sendFailure(req, res, err, {
      notFound: ['世界不存在'],
      isBadRequest: includesAny('角色卡', 'character', 'prompt_entries', 'state_values'),
      tag: 'IMPORT CHARACTER',
      meta: { worldId: req.params.worldId },
      failMessage: '导入失败',
    });
  }
});

// POST /api/worlds/:worldId/import-persona — 导入玩家卡到指定世界
router.post('/worlds/:worldId/import-persona', (req, res) => {
  try {
    res.status(201).json(importPersona(req.params.worldId, req.body));
  } catch (err) {
    sendFailure(req, res, err, {
      notFound: ['世界不存在'],
      isBadRequest: includesAny('玩家卡', '角色卡', 'persona', 'character_state_values', 'persona_state_values'),
      tag: 'IMPORT PERSONA',
      meta: { worldId: req.params.worldId },
      failMessage: '导入失败',
    });
  }
});

// GET /api/personas/:id/export — 按 personaId 精确导出玩家卡
router.get('/personas/:id/export', (req, res) => {
  try {
    res.json(exportPersonaById(req.params.id));
  } catch (err) {
    sendFailure(req, res, err, { notFound: ['玩家不存在'], tag: 'EXPORT PERSONA', meta: { personaId: req.params.id }, failMessage: '导出失败' });
  }
});

// GET /api/worlds/:worldId/persona/export — 导出当前激活玩家卡
router.get('/worlds/:worldId/persona/export', (req, res) => {
  try {
    res.json(exportPersona(req.params.worldId));
  } catch (err) {
    sendFailure(req, res, err, {
      notFound: ['玩家不存在', '世界不存在'],
      tag: 'EXPORT PERSONA',
      meta: { worldId: req.params.worldId },
      failMessage: '导出失败',
    });
  }
});

// GET /api/worlds/:id/export — 导出世界卡
router.get('/worlds/:id/export', (req, res) => {
  try {
    res.json(exportWorld(req.params.id));
  } catch (err) {
    sendFailure(req, res, err, { notFound: ['世界不存在'], tag: 'EXPORT WORLD', meta: { id: req.params.id }, failMessage: '导出失败' });
  }
});

// POST /api/worlds/import — 导入世界卡
router.post('/worlds/import', (req, res) => {
  try {
    res.status(201).json(importWorld(req.body));
  } catch (err) {
    sendFailure(req, res, err, {
      isBadRequest: includesAny('世界卡', 'world.', 'persona', 'characters['),
      tag: 'IMPORT WORLD',
      failMessage: '导入失败',
    });
  }
});

// GET /api/global-settings/export?mode=chat|writing — 导出全局设置
router.get('/global-settings/export', (req, res) => {
  const mode = req.query.mode === 'writing' ? 'writing' : 'chat';
  try {
    res.json(exportGlobalSettings(mode));
  } catch (err) {
    sendFailure(req, res, err, { tag: 'EXPORT GLOBAL', meta: { mode }, failMessage: '导出失败' });
  }
});

// POST /api/global-settings/import — 导入全局设置
router.post('/global-settings/import', (req, res) => {
  try {
    res.json(importGlobalSettings(req.body));
  } catch (err) {
    sendFailure(req, res, err, {
      isBadRequest: (message) => message === '全局设置文件格式不正确',
      tag: 'IMPORT GLOBAL',
      failMessage: '导入失败',
    });
  }
});

// GET /api/migration/export — 全量迁移导出
router.get('/migration/export', (req, res) => {
  try {
    res.json(exportMigration());
  } catch (err) {
    sendFailure(req, res, err, { tag: 'EXPORT MIGRATION', failMessage: '导出失败' });
  }
});

// POST /api/migration/import — 全量迁移导入
router.post('/migration/import', (req, res) => {
  try {
    res.json(importMigration(req.body));
  } catch (err) {
    sendFailure(req, res, err, {
      isBadRequest: (message) => message === '全量迁移文件格式不正确',
      tag: 'IMPORT MIGRATION',
      failMessage: '导入失败',
    });
  }
});

export default router;
