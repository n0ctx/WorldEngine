import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { getOrCreatePersona, updatePersona } from '../services/personas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, '..', '..', 'data');

const avatarStorage = multer.diskStorage({
  destination: path.join(DATA_ROOT, 'uploads', 'avatars'),
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const persona = getOrCreatePersona(req.params.worldId);
    cb(null, `persona-${persona.id}${ext}`);
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

// GET /api/worlds/:worldId/persona
router.get('/worlds/:worldId/persona', (req, res) => {
  const { worldId } = req.params;
  const persona = getOrCreatePersona(worldId);
  res.json(persona);
});

// PATCH /api/worlds/:worldId/persona
router.patch('/worlds/:worldId/persona', async (req, res) => {
  const { worldId } = req.params;
  const { name, system_prompt } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (system_prompt !== undefined) patch.system_prompt = system_prompt;
  const persona = await updatePersona(worldId, patch);
  res.json(persona);
});

// POST /api/worlds/:worldId/persona/avatar — 上传玩家头像
router.post('/worlds/:worldId/persona/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未收到文件' });
  }
  const relativePath = `avatars/${req.file.filename}`;
  const persona = await updatePersona(req.params.worldId, { avatar_path: relativePath });
  res.json({ avatar_path: persona.avatar_path });
});

export default router;
