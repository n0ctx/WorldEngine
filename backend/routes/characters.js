import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import {
  createCharacter,
  getCharacterById,
  getCharactersByWorldId,
  updateCharacter,
  deleteCharacter,
  reorderCharacters,
} from '../services/characters.js';
import { getWorldById } from '../services/worlds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, '..', '..', 'data');

const avatarStorage = multer.diskStorage({
  destination: path.join(DATA_ROOT, 'uploads', 'avatars'),
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.params.id}${ext}`);
  },
});
const upload = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只接受图片文件'));
  },
});

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

// PUT /api/characters/reorder — 批量更新排序（注意：必须在 :id 路由前注册）
router.put('/characters/reorder', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items 为必填数组' });
  }
  reorderCharacters(items);
  res.json({ ok: true });
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
router.put('/characters/:id', async (req, res) => {
  const existing = getCharacterById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '角色不存在' });
  }
  const updated = await updateCharacter(req.params.id, req.body);
  res.json(updated);
});

// DELETE /api/characters/:id — 删除角色
router.delete('/characters/:id', async (req, res) => {
  const existing = getCharacterById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '角色不存在' });
  }
  await deleteCharacter(req.params.id);
  res.status(204).end();
});

// POST /api/characters/:id/avatar — 上传头像
router.post('/characters/:id/avatar', upload.single('avatar'), async (req, res) => {
  const existing = getCharacterById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '角色不存在' });
  }
  if (!req.file) {
    return res.status(400).json({ error: '未收到文件' });
  }
  // 存储相对路径，如 avatars/abc123.png
  const relativePath = `avatars/${req.file.filename}`;
  const updated = await updateCharacter(req.params.id, { avatar_path: relativePath });
  res.json({ avatar_path: updated.avatar_path });
});

export default router;
