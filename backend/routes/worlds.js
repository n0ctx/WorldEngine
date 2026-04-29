import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import {
  createWorld,
  getWorldById,
  getAllWorlds,
  updateWorld,
  deleteWorld,
  ensureDiaryTimeField,
  clearAllDiaryData,
  reorderWorlds,
} from '../services/worlds.js';
import { assertExists } from '../utils/route-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

const coverStorage = multer.diskStorage({
  destination: path.join(DATA_ROOT, 'uploads', 'avatars'),
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `world_${req.params.id}${ext}`);
  },
});
const upload = multer({
  storage: coverStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只接受图片文件'));
  },
});

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

// PUT /api/worlds/reorder — 批量更新世界排序（必须在 :id 路由前注册）
router.put('/reorder', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items 为必填数组' });
  }
  reorderWorlds(items);
  res.json({ ok: true });
});

// GET /api/worlds/:id — 获取单个世界
router.get('/:id', (req, res) => {
  const world = getWorldById(req.params.id);
  if (!assertExists(res, world, '世界不存在')) return;
  res.json(world);
});

// PUT /api/worlds/:id — 更新世界
router.put('/:id', (req, res) => {
  const existing = getWorldById(req.params.id);
  if (!assertExists(res, existing, '世界不存在')) return;
  const updated = updateWorld(req.params.id, req.body);
  res.json(updated);
});

// DELETE /api/worlds/:id — 删除世界
router.delete('/:id', async (req, res) => {
  const existing = getWorldById(req.params.id);
  if (!assertExists(res, existing, '世界不存在')) return;
  await deleteWorld(req.params.id);
  res.status(204).end();
});

// POST /api/worlds/clear-all-diaries — 清除所有会话的日记数据（用户关闭日记功能时调用）
router.post('/clear-all-diaries', (_req, res) => {
  clearAllDiaryData();
  res.json({ ok: true });
});

// POST /api/worlds/:id/cover — 上传封面图
router.post('/:id/cover', upload.single('cover'), async (req, res) => {
  const existing = getWorldById(req.params.id);
  if (!assertExists(res, existing, '世界不存在')) return;
  if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
  const relativePath = `avatars/world_${req.params.id}${path.extname(req.file.originalname).toLowerCase() || '.jpg'}`;
  const updated = updateWorld(req.params.id, { cover_path: relativePath });
  res.json({ cover_path: updated.cover_path });
});

// POST /api/worlds/:id/sync-diary — 根据当前日记配置同步 diary_time 字段
router.post('/:id/sync-diary', (req, res) => {
  const existing = getWorldById(req.params.id);
  if (!assertExists(res, existing, '世界不存在')) return;
  ensureDiaryTimeField(req.params.id);
  res.json({ ok: true });
});

export default router;
