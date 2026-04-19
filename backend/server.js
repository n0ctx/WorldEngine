import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 代理支持：优先读取 data/config.json 中的 proxy_url，其次读取环境变量
import { applyProxy } from './utils/proxy.js';
import { getConfig as _getStartupConfig } from './services/config.js';
{
  const startupConfig = _getStartupConfig();
  const proxyUrl = startupConfig.proxy_url
    || process.env.https_proxy || process.env.HTTPS_PROXY
    || process.env.http_proxy || process.env.HTTP_PROXY
    || '';
  if (proxyUrl) applyProxy(proxyUrl);
}
import './services/cleanup-registrations.js';
import db from './db/index.js';
import { initSchema } from './db/schema.js';
import configRoutes from './routes/config.js';
import worldsRoutes from './routes/worlds.js';
import charactersRoutes from './routes/characters.js';
import sessionsRoutes from './routes/sessions.js';
import chatRoutes from './routes/chat.js';
import promptEntriesRoutes from './routes/prompt-entries.js';
import stateFieldsRoutes from './routes/state-fields.js';
import worldStateValuesRoutes from './routes/world-state-values.js';
import characterStateValuesRoutes from './routes/character-state-values.js';
import worldTimelineRoutes from './routes/world-timeline.js';
import importExportRoutes from './routes/import-export.js';
import customCssSnippetsRoutes from './routes/custom-css-snippets.js';
import regexRulesRoutes from './routes/regex-rules.js';
import personasRoutes from './routes/personas.js';
import personaStateFieldsRoutes from './routes/persona-state-fields.js';
import personaStateValuesRoutes from './routes/persona-state-values.js';
import writingRoutes from './routes/writing.js';
import assistantRoutes from '../assistant/server/routes.js';
import { resolveUploadPath } from './services/state-values.js';
import { createLogger } from './utils/logger.js';

const serverLog = createLogger('http', 'cyan');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, '..', 'data');
const UPLOADS_ROOT = path.join(DATA_ROOT, 'uploads');

function isLocalAddress(address) {
  return address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1';
}

function isAllowedOrigin(origin) {
  // origin 为空（curl/Postman）或 'null'（file:// 协议 / Electron）均允许；
  // 实际安全防护由 localOnly 中间件通过 remoteAddress 把守
  if (!origin || origin === 'null') {
    return true;
  }

  try {
    const parsed = new URL(origin);
    return (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      /^https?:$/.test(parsed.protocol);
  } catch {
    return false;
  }
}

function localOnly(req, res, next) {
  if (isLocalAddress(req.socket.remoteAddress)) {
    next();
    return;
  }

  res.status(403).json({ error: '仅允许本机访问' });
}

// 确保 /data/ 子目录存在
const dataDirs = [
  path.join(DATA_ROOT, 'uploads', 'avatars'),
  path.join(DATA_ROOT, 'uploads', 'attachments'),
  path.join(DATA_ROOT, 'vectors'),
  path.join(DATA_ROOT, 'logs'),
];
for (const dir of dataDirs) {
  fs.mkdirSync(dir, { recursive: true });
}

// 初始化数据库表结构
initSchema(db);

const app = express();
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
}));
app.use(express.json({ limit: '20mb' }));

// HTTP 请求日志中间件（仅 /api/，跳过静态文件）
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/uploads/')) {
    return next();
  }
  const t0     = Date.now();
  const method = req.method.padEnd(4);
  res.on('finish', () => {
    const ms      = Date.now() - t0;
    const status  = res.statusCode;
    const isStream = /\/(chat|regenerate|continue|impersonate)$/.test(req.path);
    const streamTag = isStream ? '  [SSE]' : '';
    serverLog.info(`${method} ${req.path}  →  ${status}${streamTag}  ${ms}ms`);
  });
  next();
});

app.use('/api', localOnly);

app.get('/api/uploads/*path', localOnly, (req, res) => {
  const relativePath = Array.isArray(req.params.path)
    ? req.params.path.join('/')
    : req.params.path;
  const filePath = resolveUploadPath(relativePath, UPLOADS_ROOT);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  res.sendFile(filePath);
});

// 注册路由
app.use('/api/config', configRoutes);
app.use('/api/worlds', worldsRoutes);
app.use('/api', charactersRoutes);
app.use('/api', sessionsRoutes);
app.use('/api/sessions', chatRoutes);
app.use('/api', promptEntriesRoutes);
app.use('/api', stateFieldsRoutes);
app.use('/api', worldStateValuesRoutes);
app.use('/api', characterStateValuesRoutes);
app.use('/api', worldTimelineRoutes);
app.use('/api', importExportRoutes);
app.use('/api', customCssSnippetsRoutes);
app.use('/api', regexRulesRoutes);
app.use('/api', personasRoutes);
app.use('/api', personaStateFieldsRoutes);
app.use('/api', personaStateValuesRoutes);
app.use('/api/worlds', writingRoutes);
app.use('/api/assistant', assistantRoutes);

const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 3000;
app.listen(PORT, HOST, () => {
  console.log(`WorldEngine backend running on http://${HOST}:${PORT}`);
  const level = (process.env.LOG_LEVEL || 'warn').toUpperCase();
  console.log(`日志级别: ${level}  （debug 模式可跟踪 prompt 组装 / LLM 调用 / 队列事件）`);
});
