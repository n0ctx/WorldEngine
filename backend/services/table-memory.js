/**
 * table-memory.js — 会话级表格记忆 JSON 文件 IO、副 LLM 更新、回滚还原
 *
 * 磁盘路径：data/table_memory/{sessionId}/tables.json
 * 清理：cleanup-registrations.js 注册 session 钩子删整个目录
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../llm/index.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { LLM_TASK_TEMPERATURE, LLM_STATE_UPDATE_MAX_TOKENS, STATE_UPDATE_JSON_RETRY_MAX, LLM_BACKGROUND_TASK_TIMEOUT_MS } from '../utils/constants.js';
import { applyOps, renderTablesToMarkdown } from './table-memory-ops.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { emptyTables } from './table-memory-schema.js';

const log = createLogger('table-mem');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

function tablesDir(sessionId) {
  return path.join(DATA_DIR, 'table_memory', sessionId);
}
function tablesPath(sessionId) {
  return path.join(tablesDir(sessionId), 'tables.json');
}

export function readTablesRaw(sessionId) {
  try { return fs.readFileSync(tablesPath(sessionId), 'utf-8'); } catch { return ''; }
}

export function readTables(sessionId) {
  const raw = readTablesRaw(sessionId);
  if (!raw) return emptyTables();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.tables && parsed.archive) return parsed;
    return emptyTables();
  } catch { return emptyTables(); }
}

export function writeTables(sessionId, tables) {
  const dir = tablesDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tablesPath(sessionId), JSON.stringify(tables ?? emptyTables(), null, 2), 'utf-8');
}

export function deleteTableMemoryDir(sessionId) {
  try { fs.rmSync(tablesDir(sessionId), { recursive: true, force: true }); } catch {}
}

/**
 * 按 turn record 中的快照还原 tables.json（对齐 restoreLtmFromTurnRecord 三态语义）。
 */
export function restoreTablesFromTurnRecord(sessionId, lastRecord) {
  const sid = sessionId.slice(0, 8);
  if (!lastRecord) {
    deleteTableMemoryDir(sessionId);
    log.info(`ROLLBACK WIPE  ${formatMeta({ session: sid })}`);
    return;
  }
  const snapshot = lastRecord.table_memory_snapshot;
  if (snapshot == null) {
    log.info(`ROLLBACK SKIP (legacy)  ${formatMeta({ session: sid })}`);
    return;
  }
  const dir = tablesDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tablesPath(sessionId), String(snapshot), 'utf-8');
  log.info(`ROLLBACK RESTORE  ${formatMeta({ session: sid, bytes: String(snapshot).length })}`);
}

export function __parseOps(raw) {
  let body = String(raw ?? '')
    .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();
  body = body.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

export async function updateTableMemory(sessionId, turnText) {
  const sid = sessionId.slice(0, 8);
  if (!turnText || !turnText.trim()) return;

  const current = readTables(sessionId);
  const rendered = renderTablesToMarkdown(current, { withId: true }) || '（当前所有表为空）';
  const prompt = [{
    role: 'user',
    content: renderBackendPrompt('memory-table-update.md', {
      CURRENT_TABLES: rendered,
      TURN_TEXT: turnText,
    }),
  }];

  let ops = null;
  for (let attempt = 0; attempt <= STATE_UPDATE_JSON_RETRY_MAX; attempt++) {
    let raw;
    try {
      raw = await llm.complete(prompt, {
        temperature: LLM_TASK_TEMPERATURE,
        maxTokens: LLM_STATE_UPDATE_MAX_TOKENS,
        configScope: resolveAuxScope(sessionId),
        callType: 'table_memory_update',
        conversationId: sessionId,
        timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
      });
    } catch (err) {
      log.warn(`UPDATE LLM FAIL  ${formatMeta({ session: sid, attempt, error: err.message })}`);
      continue;
    }
    ops = __parseOps(raw);
    if (ops) break;
    log.warn(`UPDATE PARSE FAIL  ${formatMeta({ session: sid, attempt })}`);
  }

  if (!ops) { log.warn(`UPDATE GIVEUP  ${formatMeta({ session: sid })}`); return; }

  const { tables, applied, dropped } = applyOps(current, ops);
  writeTables(sessionId, tables);
  log.info(`UPDATE DONE  ${formatMeta({ session: sid, applied, dropped })}`);
}
