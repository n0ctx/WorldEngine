import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db/index.js';
import { initSchema } from './db/schema.js';
import configRoutes from './routes/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, '..', 'data');

// 确保 /data/ 子目录存在
const dataDirs = [
  path.join(DATA_ROOT, 'uploads', 'avatars'),
  path.join(DATA_ROOT, 'uploads', 'attachments'),
  path.join(DATA_ROOT, 'vectors'),
];
for (const dir of dataDirs) {
  fs.mkdirSync(dir, { recursive: true });
}

// 初始化数据库表结构
initSchema(db);

const app = express();
app.use(cors());
app.use(express.json());

// 注册路由
app.use('/api/config', configRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WorldEngine backend running on http://localhost:${PORT}`);
});
