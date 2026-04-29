/**
 * diary-generator.js — 日记生成模块
 *
 * 负责：
 *   1. 解析虚拟日期字段（_diary_time）
 *   2. 检测跨日（虚拟 / 真实日期两种模式）
 *   3. 收集前一天的消息原文
 *   4. 调用 LLM 生成日记文档
 *   5. 写文件 + 写 DB
 *
 * 对外暴露：
 *   checkAndGenerateDiary(sessionId, roundIndex) → Promise<void>
 *
 * 边缘情况：
 *   - roundIndex <= 1 时直接跳过（第一轮无参照）
 *   - session.diary_date_mode 为 null 时跳过（该 session 未开启日记功能）
 *   - 日期解析失败时跳过（不中断主流程）
 *   - LLM 调用失败时记录 warn，不抛出
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../llm/index.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getAllTurnRecordsBySessionId } from '../db/queries/turn-records.js';
import { upsertDailyEntry } from '../db/queries/daily-entries.js';
import db from '../db/index.js';
import { LLM_TASK_TEMPERATURE, LLM_DIARY_MAX_TOKENS, DIARY_TIME_FIELD_KEY } from '../utils/constants.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { resolveAuxScope } from '../utils/aux-scope.js';

const log = createLogger('diary');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

// ─── 日期解析 ─────────────────────────────────────────────────────

/** 虚拟日期解析正则：匹配 "N年N月N日N时N分"（分为必填），兼容旧格式 "N年N月N日N时" */
const VIRTUAL_DATE_RE = /^(\d+)年(\d+)月(\d+)日(\d+)时/;

/**
 * 从 JSON 编码的字段值（runtime_value_json）解析虚拟日期
 * @param {string|null|undefined} rawJson  DB 中存储的 runtime_value_json
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function parseVirtualDate(rawJson) {
  if (!rawJson) return null;
  let str;
  try { str = JSON.parse(rawJson); } catch { return null; }
  if (typeof str !== 'string') return null;
  const m = str.match(VIRTUAL_DATE_RE);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

/**
 * 将解析后的虚拟日期格式化为文件名安全字符串（补零），如 "1000-03-05"
 */
export function formatDateStr(parsed) {
  const y = String(parsed.year).padStart(4, '0');
  const m = String(parsed.month).padStart(2, '0');
  const d = String(parsed.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 将解析后的虚拟日期格式化为显示字符串，如 "1000年3月5日"
 */
export function formatDateDisplay(parsed) {
  return `${parsed.year}年${parsed.month}月${parsed.day}日`;
}

/**
 * 从真实时间戳生成 "YYYY-MM-DD" 字符串（UTC+8 本地日期）
 */
function realDateStr(ts) {
  return new Date(ts).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).replace(/\//g, '-');
}

function realDateDisplay(ts) {
  const d = new Date(ts);
  const opts = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' };
  return d.toLocaleDateString('zh-CN', opts);
}

// ─── 快照日期提取 ─────────────────────────────────────────────────

/**
 * 从 state_snapshot（JSON 字符串）提取 _diary_time 字段的值
 * @param {string|null} snapshotJson
 * @returns {string|null} runtime_value_json 原始值
 */
function extractDiaryTimeFromSnapshot(snapshotJson) {
  if (!snapshotJson) return null;
  try {
    const snap = JSON.parse(snapshotJson);
    return snap?.world?.[DIARY_TIME_FIELD_KEY] ?? null;
  } catch {
    return null;
  }
}

// ─── 消息收集 ─────────────────────────────────────────────────────

/**
 * 根据 user_message_id / asst_message_id 从 DB 获取消息内容
 */
function getMessageContent(messageId) {
  if (!messageId) return null;
  const row = db.prepare('SELECT content FROM messages WHERE id = ?').get(messageId);
  return row?.content ?? null;
}

/**
 * 收集属于 prevDateStr 的所有对话消息文本（用于日记生成）
 *
 * @param {object[]} allRecords  getAllTurnRecordsBySessionId 返回值（已按 round_index ASC）
 * @param {string} prevDateStr   目标日期，如 "1000-03-05"
 * @param {'virtual'|'real'} dateMode
 * @returns {string}  拼接好的消息文本
 */
function collectPrevDayMessages(allRecords, prevDateStr, dateMode) {
  const lines = [];

  for (const rec of allRecords) {
    let recDateStr = null;

    if (dateMode === 'virtual') {
      const raw = extractDiaryTimeFromSnapshot(rec.state_snapshot);
      const parsed = parseVirtualDate(raw);
      recDateStr = parsed ? formatDateStr(parsed) : null;
    } else {
      recDateStr = realDateStr(rec.created_at);
    }

    if (recDateStr !== prevDateStr) continue;

    const userContent = getMessageContent(rec.user_message_id);
    const asstContent = getMessageContent(rec.asst_message_id);
    if (userContent) lines.push(`玩家：${userContent}`);
    if (asstContent) lines.push(`角色：${asstContent}`);
  }

  return lines.join('\n\n');
}

// ─── 日记文件写入 ────────────────────────────────────────────────

/**
 * 将日记内容写入 data/daily/{sessionId}/{dateStr}.md
 */
function writeDiaryFile(sessionId, dateStr, content) {
  const dir = path.join(DATA_DIR, 'daily', sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${dateStr}.md`), content, 'utf-8');
}

/**
 * 删除 data/daily/{sessionId}/{dateStr}.md（文件不存在时静默跳过）
 */
export function deleteDiaryFile(sessionId, dateStr) {
  const filePath = path.join(DATA_DIR, 'daily', sessionId, `${dateStr}.md`);
  try { fs.unlinkSync(filePath); } catch {}
}

/**
 * 删除 data/daily/{sessionId}/ 整个目录（session 删除时调用）
 */
export function deleteDiaryDir(sessionId) {
  const dir = path.join(DATA_DIR, 'daily', sessionId);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ─── 主入口 ──────────────────────────────────────────────────────

/**
 * 检测当前轮次是否跨越了日期；如有，异步生成前一天的日记。
 *
 * 调用时机：优先级 4，在 createTurnRecord（优先级 3）完成后执行。
 *
 * @param {string} sessionId
 * @param {number} roundIndex  当前轮次（从 1 开始）
 */
export async function checkAndGenerateDiary(sessionId, roundIndex) {
  const sid = sessionId.slice(0, 8);

  // 第一轮无参照，跳过
  if (roundIndex <= 1) return;

  const session = getSessionById(sessionId);
  if (!session) return;
  const dateMode = session.diary_date_mode; // 'virtual' | 'real' | null
  if (!dateMode) return;

  // 取所有 turn records（已按 round_index ASC）
  const allRecords = getAllTurnRecordsBySessionId(sessionId);
  const currRec = allRecords.find((r) => r.round_index === roundIndex);
  const prevRec = allRecords.find((r) => r.round_index === roundIndex - 1);

  if (!currRec || !prevRec) return;

  // 解析日期
  let currDateStr, prevDateStr, prevDateDisplay;

  if (dateMode === 'virtual') {
    const currRaw = extractDiaryTimeFromSnapshot(currRec.state_snapshot);
    const prevRaw = extractDiaryTimeFromSnapshot(prevRec.state_snapshot);
    const currParsed = parseVirtualDate(currRaw);
    const prevParsed = parseVirtualDate(prevRaw);

    if (!currParsed || !prevParsed) {
      log.info(`SKIP  ${formatMeta({ session: sid, round: roundIndex, reason: 'no-virtual-date' })}`);
      return;
    }

    currDateStr = formatDateStr(currParsed);
    prevDateStr = formatDateStr(prevParsed);
    prevDateDisplay = formatDateDisplay(prevParsed);
  } else {
    currDateStr = realDateStr(currRec.created_at);
    prevDateStr = realDateStr(prevRec.created_at);
    prevDateDisplay = realDateDisplay(prevRec.created_at);
  }

  // 未跨日，跳过
  if (currDateStr === prevDateStr) return;

  log.info(`DATE CROSSED  ${formatMeta({ session: sid, round: roundIndex, from: prevDateStr, to: currDateStr })}`);

  // 收集前一天消息
  const prevDayRecords = allRecords.filter((r) => r.round_index < roundIndex);
  const messagesText = collectPrevDayMessages(prevDayRecords, prevDateStr, dateMode);

  if (!messagesText) {
    log.info(`SKIP  ${formatMeta({ session: sid, reason: 'no-messages-for-prev-day', date: prevDateStr })}`);
    return;
  }

  // LLM 生成日记
  let diaryContent = '';
  try {
    const prompt = [{
      role: 'user',
      content: renderBackendPrompt('diary-generation.md', {
        DATE_DISPLAY: prevDateDisplay,
        MESSAGES_TEXT: messagesText,
      }),
    }];
    const raw = await llm.complete(prompt, {
      temperature: LLM_TASK_TEMPERATURE,
      maxTokens: LLM_DIARY_MAX_TOKENS,
      thinking_level: null,
      configScope: resolveAuxScope(sessionId),
      callType: 'diary',
      conversationId: sessionId,
    });
    diaryContent = (raw || '').replace(/<think>[\s\S]*?<\/think>\n*/g, '').trim();
  } catch (err) {
    log.warn(`LLM FAIL  ${formatMeta({ session: sid, date: prevDateStr, error: err.message })}`);
    return;
  }

  if (!diaryContent) return;

  // 从日记正文提取摘要（第一个非空行，跳过 # 标题行）
  const summary = extractSummaryFromDiary(diaryContent);

  // 写文件
  try {
    writeDiaryFile(sessionId, prevDateStr, diaryContent);
    log.info(`FILE WRITTEN  ${formatMeta({ session: sid, date: prevDateStr })}`);
  } catch (err) {
    log.warn(`FILE WRITE FAIL  ${formatMeta({ session: sid, date: prevDateStr, error: err.message })}`);
    return;
  }

  // 写 DB
  upsertDailyEntry({
    session_id: sessionId,
    date_str: prevDateStr,
    date_display: prevDateDisplay,
    summary,
    triggered_by_round_index: roundIndex,
  });

  log.info(`DONE  ${formatMeta({ session: sid, date: prevDateStr, round: roundIndex, summaryLen: summary.length })}`);
}

/**
 * 从日记 markdown 正文中提取摘要（第二个非空段落，跳过标题行）
 */
function extractSummaryFromDiary(content) {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  // 跳过以 # 开头的标题行和 --- 分隔线
  for (const line of lines) {
    if (line.startsWith('#') || line === '---') continue;
    const cleaned = cleanDiarySummaryLine(line);
    if (!cleaned) continue;
    return cleaned.length > 80 ? cleaned.slice(0, 80) + '…' : cleaned;
  }
  return lines[0] ?? '';
}

function cleanDiarySummaryLine(line) {
  if (!line) return '';
  let cleaned = line.trim();

  // 兼容模型偶发复读模板占位，如 "{{摘要：今天...}}"。
  cleaned = cleaned.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();
  cleaned = cleaned.replace(/^摘要\s*[：:]\s*/u, '').trim();
  cleaned = cleaned.replace(/^正文\s*[：:]\s*/u, '').trim();

  return cleaned;
}
