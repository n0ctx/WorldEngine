import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import {
  getOrCreatePersona,
  updatePersona,
  listPersonas,
  createPersona,
  updatePersonaByIdService,
  deletePersonaService,
  activatePersona,
} from '../services/personas.js';
import { getPersonaById } from '../db/queries/personas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

// 按 worldId 上传头像（兼容旧接口）
const avatarStorage = multer.diskStorage({
  destination: path.join(DATA_ROOT, 'uploads', 'avatars'),
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const persona = getOrCreatePersona(req.params.worldId);
    cb(null, `persona-${persona.id}${ext}`);
  },
});

// 按 personaId 上传头像（新接口）
const avatarStorageById = multer.diskStorage({
  destination: path.join(DATA_ROOT, 'uploads', 'avatars'),
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `persona-${req.params.personaId}${ext}`);
  },
});

const uploadByWorld = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只接受图片文件'));
  },
});

const uploadById = multer({
  storage: avatarStorageById,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只接受图片文件'));
  },
});

const router = Router();

// ── 兼容旧接口（active persona by worldId）──────────────────────────────────

// GET /api/worlds/:worldId/persona — 返回 active persona
router.get('/worlds/:worldId/persona', (req, res) => {
  const persona = getOrCreatePersona(req.params.worldId);
  res.json(persona);
});

// PATCH /api/worlds/:worldId/persona — 更新 active persona
router.patch('/worlds/:worldId/persona', async (req, res) => {
  try {
    const { name, description, system_prompt } = req.body;
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (system_prompt !== undefined) patch.system_prompt = system_prompt;
    const persona = await updatePersona(req.params.worldId, patch);
    res.json(persona);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/worlds/:worldId/persona/avatar — 上传 active persona 头像（旧接口）
router.post('/worlds/:worldId/persona/avatar', uploadByWorld.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const relativePath = `avatars/${req.file.filename}`;
  const persona = await updatePersona(req.params.worldId, { avatar_path: relativePath });
  res.json({ avatar_path: persona.avatar_path });
});

// ── 新接口：多 persona CRUD ─────────────────────────────────────────────────

// GET /api/worlds/:worldId/personas — 列出所有 persona
router.get('/worlds/:worldId/personas', (req, res) => {
  try {
    const personas = listPersonas(req.params.worldId);
    res.json(personas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/worlds/:worldId/personas — 创建新 persona
router.post('/worlds/:worldId/personas', (req, res) => {
  try {
    const { name, description, system_prompt } = req.body ?? {};
    const persona = createPersona(req.params.worldId, { name, description, system_prompt });
    res.status(201).json(persona);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/worlds/:worldId/personas/:personaId/activate — 设置激活
router.patch('/worlds/:worldId/personas/:personaId/activate', (req, res) => {
  try {
    const personas = activatePersona(req.params.worldId, req.params.personaId);
    res.json(personas);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/personas/:id — 按 id 获取 persona
router.get('/personas/:id', (req, res) => {
  const persona = getPersonaById(req.params.id);
  if (!persona) return res.status(404).json({ error: '玩家卡不存在' });
  res.json(persona);
});

// PATCH /api/personas/:id — 按 id 更新 persona
router.patch('/personas/:id', async (req, res) => {
  try {
    const { name, description, system_prompt } = req.body ?? {};
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (system_prompt !== undefined) patch.system_prompt = system_prompt;
    const persona = await updatePersonaByIdService(req.params.id, patch);
    res.json(persona);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/personas/:id — 删除 persona
router.delete('/personas/:id', async (req, res) => {
  try {
    await deletePersonaService(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/personas/:personaId/avatar — 按 id 上传头像
router.post('/personas/:personaId/avatar', uploadById.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const relativePath = `avatars/${req.file.filename}`;
  try {
    const persona = await updatePersonaByIdService(req.params.personaId, { avatar_path: relativePath });
    res.json({ avatar_path: persona.avatar_path });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
