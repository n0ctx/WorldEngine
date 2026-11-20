import crypto from 'node:crypto';
import { splitRounds, roundDigest, rangeDigest, roundTokens } from '../../utils/session-rounds.js';
import { toPromptMessage } from '../../utils/turn-dialogue.js';

const EVENT_HEADER = /^【第(\d+)(?:\s*[–—~～至到-]\s*(\d+))?轮(?:｜([^】]*))?】/;

/** 旧版剧情摘要按「【」开头的行切成事件；第一个标题之前的文字（更早的【前情】或手改的文字）自成一段 */
function splitLegacyEvents(text) {
  return text.split(/\n(?=[ \t]*【)/).map((part) => part.trim()).filter(Boolean);
}

const TOPIC_MAX_CHARS = 40;

/**
 * 旧事件 → 块的小标题与正文。注入时会另加「【第a–b轮｜小标题】」，所以正文去掉原标题里的轮次，
 * 只把「时间｜地点｜人物」留作首行；小标题取地点（没有地点栏时取第一栏）。
 */
function legacyEventText(part, match) {
  const fields = (match[3] || '').split('｜').map((field) => field.trim()).filter(Boolean);
  const body = part.slice(match[0].length).trim();
  const topic = [...(fields[1] ?? fields[0] ?? '')].slice(0, TOPIC_MAX_CHARS).join('');
  const summary = [fields.join('｜'), body].filter(Boolean).join('\n');
  return { topic, summary: summary || part };
}

/**
 * 把旧摘要切成一级块的覆盖范围。事件标题给出轮次范围，范围依次递增、互不重叠且落在
 * [1, coveredTo] 内时逐事件成块；没有标题的开头一段覆盖到第一个事件之前。
 * 任何一处对不上（手改过的标题、轮次倒序或越界）就整段作为一个块覆盖 1 到 coveredTo（旧版里这些轮次都已不在正文），不丢文字。
 */
export function planLegacyBlocks(text, coveredTo) {
  const parts = splitLegacyEvents(text);
  const planned = [];
  let last = 0;
  let valid = true;
  for (const part of parts) {
    const match = part.match(EVENT_HEADER);
    if (!match) {
      if (planned.length > 0) { valid = false; break; }
      planned.push({ from: 1, to: null, topic: '前情', summary: part });
      continue;
    }
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from <= last || to < from || to > coveredTo) { valid = false; break; }
    planned.push({ from, to, ...legacyEventText(part, match) });
    last = to;
  }
  const lead = planned[0]?.to === null ? planned[0] : null;
  if (lead) lead.to = (planned[1]?.from ?? coveredTo + 1) - 1;
  if (valid && planned.every((block) => block.to >= block.from)) return planned;
  return [{ from: 1, to: coveredTo, topic: '旧版剧情摘要', summary: text.trim() }];
}

/**
 * 旧版剧情摘要（turn_records 最新一行的 middle_summary / middle_covered_to）迁移为一级压缩块。
 * - 只迁移每条故事线最新一行的摘要，即当时实际注入正文的那份；更早轮次行里的历史版本原样保留作回滚副本。
 * - 块的建块轮次取它自己的止轮：块的内容只来自覆盖范围内的原文，回退到止轮之后仍然有效；
 *   回退到止轮之前时块作废，这几轮原文回到正文。
 * - 只有 coveredTo 完整落在现存原文内才迁移；越界摘要的来源不可验证，整份跳过，不把截短来源伪装成完整指纹。
 * - 保留旧列作为回滚/人工核对副本；迁移不删除旧摘要或历史版本。
 */
export function migrateMiddleSummaryToContextBlocks(db) {
  const columns = new Set(db.pragma('table_info(turn_records)').map((column) => column.name));
  if (columns.has('middle_summary') && columns.has('middle_covered_to')) {
    db.transaction(() => migrateLatestSummaries(db))();
  }
}

// guard-allow(perf-shape): 一次性数据迁移，按故事线逐条读消息
function migrateLatestSummaries(db) {
  const latestRows = db.prepare(`
    SELECT tr.session_id, tr.middle_summary, tr.middle_covered_to FROM turn_records tr
    WHERE tr.round_index = (SELECT MAX(round_index) FROM turn_records WHERE session_id = tr.session_id)
      AND tr.middle_covered_to > 0 AND TRIM(COALESCE(tr.middle_summary, '')) != ''
  `).all();
  const selectMessages = db.prepare('SELECT id, role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC');
  const insertBlock = db.prepare(`
    INSERT INTO context_blocks (id, session_id, block_no, tier, topic, summary, from_round, to_round, source_digest,
      source_tokens, raw_tokens, consumed_by, created_round, run_id, origin, created_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'legacy', ?)
  `);
  const insertState = db.prepare(`
    INSERT OR REPLACE INTO context_state (session_id, next_block_no, baseline_tokens, updated_at) VALUES (?, ?, 0, ?)
  `);
  const now = Date.now();
  for (const row of latestRows) {
    const rounds = splitRounds(selectMessages.all(row.session_id));
    // 旧摘要覆盖了缺失的原文，无法为其建立可信来源指纹；保留旧列供回滚/人工恢复。
    if (!Number.isInteger(row.middle_covered_to) || row.middle_covered_to < 1 || row.middle_covered_to > rounds.length) continue;
    const runId = `legacy-${crypto.randomUUID()}`;
    let blockNo = 1;
    for (const planned of planLegacyBlocks(row.middle_summary, row.middle_covered_to)) {
      const to = Math.min(planned.to, rounds.length);
      if (to < planned.from) continue;
      const covered = rounds.slice(planned.from - 1, to);
      const rawTokens = covered.reduce((sum, round) => sum + roundTokens({ messages: round.messages.map(toPromptMessage) }), 0);
      insertBlock.run(
        crypto.randomUUID(), row.session_id, blockNo, planned.topic, planned.summary, planned.from, to,
        rangeDigest(covered.map(roundDigest)), rawTokens, rawTokens, to, runId, now,
      );
      blockNo += 1;
    }
    insertState.run(row.session_id, blockNo, now);
  }
}
