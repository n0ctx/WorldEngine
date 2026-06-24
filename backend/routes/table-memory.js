/**
 * table-memory.js — 会话级表格记忆 HTTP 接口
 * GET  /api/sessions/:sessionId/table-memory → { tables, markdown }
 * PUT  /api/sessions/:sessionId/table-memory  body: { tables } → { tables, markdown }
 *   PUT 是真删除/手动编辑路径（整体覆盖）。
 */
import express from 'express';
import { getSessionById } from '../db/queries/sessions.js';
import { readTables, writeTables } from '../services/table-memory.js';
import { renderTablesToMarkdown } from '../services/table-memory-ops.js';
import { TABLE_SCHEMAS, FIELD_MAX_CHARS } from '../services/table-memory-schema.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = express.Router();
const log = createLogger('table-memory', 'cyan');

router.get('/:sessionId/table-memory', (req, res) => {
  const { sessionId } = req.params;
  if (!getSessionById(sessionId)) {
    log.warn(`table-memory.not_found ${formatMeta({ id: sessionId })}`);
    return res.status(404).json({ error: '会话不存在' });
  }
  const tables = readTables(sessionId);
  res.json({
    tables,
    markdown: renderTablesToMarkdown(tables, { withId: false }),
    schema: { tables: TABLE_SCHEMAS, fieldMaxChars: FIELD_MAX_CHARS },
  });
});

router.put('/:sessionId/table-memory', (req, res) => {
  const { sessionId } = req.params;
  if (!getSessionById(sessionId)) {
    return res.status(404).json({ error: '会话不存在' });
  }
  const incoming = req.body?.tables;
  if (!incoming || typeof incoming.tables !== 'object' || !incoming.archive) {
    return res.status(400).json({ error: '表格数据格式无效' });
  }
  writeTables(sessionId, incoming);
  res.json({ tables: incoming, markdown: renderTablesToMarkdown(incoming, { withId: false }) });
});

export default router;
