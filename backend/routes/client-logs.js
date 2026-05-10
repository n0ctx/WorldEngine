import express from 'express';
import { ingestClientLogs } from '../services/client-log-ingest.js';
import {
  CLIENT_LOG_MAX_BATCH,
  CLIENT_LOG_MAX_PAYLOAD_BYTES,
  CLIENT_LOG_RATE_PER_SEC,
} from '../utils/constants.js';

const router = express.Router();

const _hits = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const list = (_hits.get(ip) || []).filter((t) => now - t < 1000);
  if (list.length >= CLIENT_LOG_RATE_PER_SEC) {
    _hits.set(ip, list);
    return false;
  }
  list.push(now);
  _hits.set(ip, list);
  return true;
}

router.post(
  '/',
  express.json({ limit: CLIENT_LOG_MAX_PAYLOAD_BYTES }),
  (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!rateLimit(ip)) return res.status(429).json({ error: 'rate_limited' });

    const body = req.body || {};
    if (!Array.isArray(body.logs)) {
      return res.status(400).json({ error: 'logs must be array' });
    }
    if (body.logs.length > CLIENT_LOG_MAX_BATCH) {
      body.logs = body.logs.slice(0, CLIENT_LOG_MAX_BATCH);
    }
    const result = ingestClientLogs(body);
    res.json(result);
  },
);

router.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
  res.status(500).json({ error: 'internal' });
});

export default router;
