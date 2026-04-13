import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 代理支持：读取环境变量 https_proxy / http_proxy，为 Node 原生 fetch 设置全局代理
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
if (proxyUrl) {
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`Proxy enabled: ${proxyUrl}`);
}
import db from './db/index.js';
import { initSchema } from './db/schema.js';
import configRoutes from './routes/config.js';
import worldsRoutes from './routes/worlds.js';
import charactersRoutes from './routes/characters.js';
import sessionsRoutes from './routes/sessions.js';
import chatRoutes from './routes/chat.js';
import promptEntriesRoutes from './routes/prompt-entries.js';

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
app.use(express.json({ limit: '20mb' }));

// 静态文件：头像、附件
app.use('/uploads', express.static(path.join(DATA_ROOT, 'uploads')));

// 注册路由
app.use('/api/config', configRoutes);
app.use('/api/worlds', worldsRoutes);
app.use('/api', charactersRoutes);
app.use('/api', sessionsRoutes);
app.use('/api/sessions', chatRoutes);
app.use('/api', promptEntriesRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WorldEngine backend running on http://localhost:${PORT}`);
});
