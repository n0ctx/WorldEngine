/**
 * long-term-memory.js — 会话级长期记忆 md 文件 IO 与压缩
 *
 * 磁盘路径：data/long_term_memory/{sessionId}/memory.md
 * 文件格式：纯文本，每行一条记忆（可带 [时间] 前缀），按写入顺序追加
 * 清理：通过 cleanup-registrations.js 注册的 'session' 钩子在 session 删除时移除整个目录
 *
 * 对外暴露：
 *   readMemoryFile(sessionId)
 *   writeMemoryFile(sessionId, content)
 *   appendMemoryLines(sessionId, lines)  — 追加 + 触发压缩
 *   compressMemory(sessionId)            — 调 aux LLM 压缩
 *   deleteMemoryDir(sessionId)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../llm/index.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import {
  LONG_TERM_MEMORY_LINE_MAX_CHARS,
  LONG_TERM_MEMORY_MAX_LINES,
  LONG_TERM_MEMORY_TARGET_LINES,
  LLM_LONG_TERM_MEMORY_COMPRESS_MAX_TOKENS,
  LLM_TASK_TEMPERATURE,
} from '../utils/constants.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('ltm');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

function memoryDir(sessionId) {
  return path.join(DATA_DIR, 'long_term_memory', sessionId);
}

function memoryPath(sessionId) {
  return path.join(memoryDir(sessionId), 'memory.md');
}

export function readMemoryFile(sessionId) {
  try {
    return fs.readFileSync(memoryPath(sessionId), 'utf-8');
  } catch {
    return '';
  }
}

export function writeMemoryFile(sessionId, content) {
  const dir = memoryDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(memoryPath(sessionId), String(content ?? ''), 'utf-8');
}

export function deleteMemoryDir(sessionId) {
  try { fs.rmSync(memoryDir(sessionId), { recursive: true, force: true }); } catch {}
}

/**
 * 按 turn record 中的快照还原 memory.md。
 * - lastRecord 为空（R=0）→ 整个目录清掉（无轮次留存即无长期记忆）
 * - lastRecord.long_term_memory_snapshot 为 null（旧版本无快照字段）→ 保持文件不动
 * - 否则按快照内容覆盖写入（空字符串即清空）
 */
export function restoreLtmFromTurnRecord(sessionId, lastRecord) {
  if (!lastRecord) {
    deleteMemoryDir(sessionId);
    log.info(`ROLLBACK WIPE  ${formatMeta({ session: sessionId.slice(0, 8) })}`);
    return;
  }
  const snapshot = lastRecord.long_term_memory_snapshot;
  if (snapshot == null) {
    log.info(`ROLLBACK SKIP (legacy)  ${formatMeta({ session: sessionId.slice(0, 8), round: lastRecord.round_index })}`);
    return;
  }
  writeMemoryFile(sessionId, snapshot);
  const lineCount = String(snapshot).split('\n').filter((l) => l.trim()).length;
  log.info(`ROLLBACK RESTORE  ${formatMeta({ session: sessionId.slice(0, 8), round: lastRecord.round_index, lines: lineCount })}`);
}

/**
 * 追加若干行长期记忆，并在超过上限时触发压缩。
 * lines 由调用方负责清洗（去空、截长、限数量）。
 */
export async function appendMemoryLines(sessionId, lines) {
  const cleaned = (lines || [])
    .map((s) => String(s ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((s) => s.slice(0, LONG_TERM_MEMORY_LINE_MAX_CHARS));
  if (cleaned.length === 0) return;

  const existing = readMemoryFile(sessionId);
  const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  const next = existing + sep + cleaned.join('\n') + '\n';
  writeMemoryFile(sessionId, next);

  const lineCount = next.split('\n').filter((l) => l.trim()).length;
  log.info(`APPEND  ${formatMeta({ session: sessionId.slice(0, 8), added: cleaned.length, total: lineCount })}`);

  if (lineCount > LONG_TERM_MEMORY_MAX_LINES) {
    try {
      await compressMemory(sessionId);
    } catch (err) {
      log.warn(`COMPRESS FAIL  ${formatMeta({ session: sessionId.slice(0, 8), error: err.message })}`);
    }
  }
}

/**
 * 调用副模型把当前长期记忆压缩到目标行数以内。
 */
export async function compressMemory(sessionId) {
  const content = readMemoryFile(sessionId).trim();
  if (!content) return;

  const sid = sessionId.slice(0, 8);
  const beforeLines = content.split('\n').filter((l) => l.trim()).length;
  log.info(`COMPRESS START  ${formatMeta({ session: sid, before: beforeLines, target: LONG_TERM_MEMORY_TARGET_LINES })}`);

  const prompt = [{
    role: 'user',
    content: renderBackendPrompt('memory-long-term-compress.md', {
      MEMORY_CONTENT: content,
      TARGET_LINES: String(LONG_TERM_MEMORY_TARGET_LINES),
    }),
  }];

  const raw = await llm.complete(prompt, {
    temperature: LLM_TASK_TEMPERATURE,
    maxTokens: LLM_LONG_TERM_MEMORY_COMPRESS_MAX_TOKENS,
    thinking_level: null,
    configScope: resolveAuxScope(sessionId),
    callType: 'long_term_memory_compress',
    conversationId: sessionId,
  });

  const cleanedRaw = (raw || '')
    .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();

  const lines = cleanedRaw
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•·]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, LONG_TERM_MEMORY_TARGET_LINES);

  if (lines.length === 0) {
    log.warn(`COMPRESS EMPTY  ${formatMeta({ session: sid })}`);
    return;
  }

  writeMemoryFile(sessionId, lines.join('\n') + '\n');
  log.info(`COMPRESS DONE  ${formatMeta({ session: sid, before: beforeLines, after: lines.length })}`);
}
