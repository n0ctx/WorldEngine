/**
 * daily-entries.js 路由
 *
 *   GET  /api/sessions/:sessionId/daily-entries
 *     → { items: [{ date_str, date_display, summary, triggered_by_round_index, created_at }] }
 *       按 date_str ASC
 *
 *   GET  /api/sessions/:sessionId/daily-entries/:dateStr
 *     → { content: "..." }  日记正文（读文件）
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSessionById } from '../db/queries/sessions.js';
import { getDailyEntriesBySessionId } from '../db/queries/daily-entries.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

router.get('/:sessionId/daily-entries', (req, res) => {
  const { sessionId } = req.params;
  const session = getSessionById(sessionId);
  if (!assertExists(res, session, '会话不存在')) return;

  const items = getDailyEntriesBySessionId(sessionId).map((e) => ({
    date_str: e.date_str,
    date_display: e.date_display,
    summary: e.summary,
    triggered_by_round_index: e.triggered_by_round_index,
    created_at: e.created_at,
  }));

  res.json({ items });
});

router.get('/:sessionId/daily-entries/:dateStr', (req, res) => {
  const { sessionId, dateStr } = req.params;
  const session = getSessionById(sessionId);
  if (!assertExists(res, session, '会话不存在')) return;

  const filePath = path.join(DATA_DIR, 'daily', sessionId, `${dateStr}.md`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '日记文件不存在' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ content });
});

export default router;
