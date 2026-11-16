import crypto from 'node:crypto';
import db from '../index.js';

/**
 * context-blocks.js — 上下文压缩块与压缩运行状态（表 context_blocks / context_state）
 *
 * 块只记录摘要与来源（覆盖轮次、来源指纹、吸收它的上级块），原文消息不在这里、也从不改动。
 * 删除一个块等于把它展开一级：它吸收的子块重新在用，没有子块覆盖的轮次回到原文。
 */

function toBlock(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    no: row.block_no,
    tier: row.tier,
    topic: row.topic,
    summary: row.summary,
    fromRound: row.from_round,
    toRound: row.to_round,
    sourceDigest: row.source_digest,
    sourceTokens: row.source_tokens,
    rawTokens: row.raw_tokens,
    consumedBy: row.consumed_by,
    createdRound: row.created_round,
    runId: row.run_id,
    origin: row.origin,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

/** 会话的全部块（含已被吸收的），按起始轮次、块号升序 */
export function listContextBlocks(sessionId) {
  return db.prepare(
    'SELECT * FROM context_blocks WHERE session_id = ? ORDER BY from_round ASC, block_no ASC',
  ).all(sessionId).map(toBlock);
}

function getContextBlock(sessionId, blockId) {
  return toBlock(db.prepare('SELECT * FROM context_blocks WHERE session_id = ? AND id = ?').get(sessionId, blockId));
}

const DEFAULT_STATE = Object.freeze({
  nextBlockNo: 1,
  baselineTokens: 0,
  lastPromptTokens: null,
  contextLimit: null,
  compressCount: 0,
  tokensSaved: 0,
  lastOutcome: null,
  lastError: null,
  lastRunRound: null,
  noWriteStreak: 0,
  updatedAt: null,
});

/** 会话的压缩运行状态；还没有记录时返回默认值 */
export function getContextState(sessionId) {
  const row = db.prepare('SELECT * FROM context_state WHERE session_id = ?').get(sessionId);
  if (!row) return { ...DEFAULT_STATE };
  return {
    nextBlockNo: row.next_block_no,
    baselineTokens: row.baseline_tokens,
    lastPromptTokens: row.last_prompt_tokens,
    contextLimit: row.context_limit,
    compressCount: row.compress_count,
    tokensSaved: row.tokens_saved,
    lastOutcome: row.last_outcome,
    lastError: row.last_error,
    lastRunRound: row.last_run_round,
    noWriteStreak: row.no_write_streak,
    updatedAt: row.updated_at,
  };
}

const STATE_COLUMNS = {
  nextBlockNo: 'next_block_no',
  baselineTokens: 'baseline_tokens',
  lastPromptTokens: 'last_prompt_tokens',
  contextLimit: 'context_limit',
  compressCount: 'compress_count',
  tokensSaved: 'tokens_saved',
  lastOutcome: 'last_outcome',
  lastError: 'last_error',
  lastRunRound: 'last_run_round',
  noWriteStreak: 'no_write_streak',
};

/**
 * 合并写入压缩运行状态；只写 patch 里出现的字段。
 * 故事线已被删除（后台任务进行中用户删了会话）时什么都不写，不因外键报错。
 */
export function saveContextState(sessionId, patch) {
  const merged = { ...getContextState(sessionId), ...patch };
  const columns = Object.values(STATE_COLUMNS);
  const values = Object.keys(STATE_COLUMNS).map((key) => merged[key] ?? DEFAULT_STATE[key]);
  db.prepare(`
    INSERT INTO context_state (session_id, ${columns.join(', ')}, updated_at)
    SELECT ?, ${columns.map(() => '?').join(', ')}, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?)
    ON CONFLICT(session_id) DO UPDATE SET ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = excluded.updated_at
  `).run(sessionId, ...values, Date.now(), sessionId);
}

/**
 * 一次压缩的全部写入放在同一个事务里：新块、被吸收块的指向、运行状态。
 * 新块的块号从 state.nextBlockNo 起依次分配。
 *
 * @param {string} sessionId
 * @param {{ runId:string, createdRound:number, blocks:Array<object>, statePatch:object }} run
 *   blocks[i]：{ tier, topic, summary, fromRound, toRound, sourceDigest, sourceTokens, rawTokens, consumes:string[] }
 * @returns {Array<object>} 写入后的新块
 */
export function commitContextRun(sessionId, { runId, createdRound, blocks, statePatch }) {
  const insert = db.prepare(`
    INSERT INTO context_blocks (id, session_id, block_no, tier, topic, summary, from_round, to_round, source_digest,
      source_tokens, raw_tokens, consumed_by, created_round, run_id, origin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'model', ?)
  `);
  const consume = db.prepare('UPDATE context_blocks SET consumed_by = ? WHERE session_id = ? AND id = ? AND consumed_by IS NULL');
  return db.transaction(() => {
    const state = getContextState(sessionId);
    const now = Date.now();
    const ids = [];
    let blockNo = state.nextBlockNo;
    for (const block of blocks) {
      const id = crypto.randomUUID();
      insert.run(id, sessionId, blockNo, block.tier, block.topic ?? '', block.summary, block.fromRound, block.toRound,
        block.sourceDigest, block.sourceTokens, block.rawTokens, createdRound, runId, now);
      for (const childId of block.consumes) {
        if (consume.run(id, sessionId, childId).changes !== 1) throw new Error(`压缩块 ${childId} 已不在用`);
      }
      ids.push(id);
      blockNo += 1;
    }
    saveContextState(sessionId, { ...statePatch, nextBlockNo: blockNo });
    return ids.map((id) => getContextBlock(sessionId, id));
  })();
}

/** 删除这些块，并让它们吸收的子块重新在用（展开一级）；返回删除的行数 */
export function removeContextBlocks(sessionId, blockIds) {
  if (blockIds.length === 0) return 0;
  const placeholders = blockIds.map(() => '?').join(', ');
  return db.transaction(() => {
    const removed = db.prepare(`DELETE FROM context_blocks WHERE session_id = ? AND id IN (${placeholders})`)
      .run(sessionId, ...blockIds).changes;
    db.prepare(`UPDATE context_blocks SET consumed_by = NULL WHERE session_id = ? AND consumed_by IN (${placeholders})`)
      .run(sessionId, ...blockIds);
    return removed;
  })();
}

/**
 * 回退到只剩前 keptRounds 轮：建块时已超出这一轮的块、覆盖到这一轮之后的块一律删除，
 * 被删块吸收的子块重新在用（子块建得更早、范围更小，仍超出的同样被删）。
 * 由调用方放在回滚的同一个事务里执行。
 */
export function rollbackContextBlocks(sessionId, keptRounds) {
  db.prepare('DELETE FROM context_blocks WHERE session_id = ? AND (created_round > ? OR to_round > ?)')
    .run(sessionId, keptRounds, keptRounds);
  db.prepare(`
    UPDATE context_blocks SET consumed_by = NULL
    WHERE session_id = ? AND consumed_by IS NOT NULL
      AND consumed_by NOT IN (SELECT id FROM context_blocks WHERE session_id = ?)
  `).run(sessionId, sessionId);
}

/** 用户手改块的摘要与主题；块不存在时返回 null */
export function updateContextBlockText(sessionId, blockId, { summary, topic }) {
  const changes = db.prepare(
    'UPDATE context_blocks SET summary = ?, topic = ?, edited_at = ? WHERE session_id = ? AND id = ?',
  ).run(summary, topic, Date.now(), sessionId, blockId).changes;
  return changes === 1 ? getContextBlock(sessionId, blockId) : null;
}
