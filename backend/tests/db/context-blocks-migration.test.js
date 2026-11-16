import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { initSchema } from '../../db/schema.js';
import { planLegacyBlocks } from '../../db/migrations/context-blocks.js';
import { rangeDigest, roundDigest, splitRounds } from '../../utils/session-rounds.js';

/** 造一个停在上一版结构（turn_records 仍有剧情摘要两列）的库，铺好消息与旧摘要，再升级到当前版本 */
function upgradeLegacyDb(seed) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const migrate = () => initSchema(db);
  migrate();
  db.exec(`
    ALTER TABLE turn_records ADD COLUMN middle_summary TEXT;
    ALTER TABLE turn_records ADD COLUMN middle_covered_to INTEGER;
    DELETE FROM context_blocks; DELETE FROM context_state;
  `);
  db.pragma('user_version = 5');
  seed(db);
  migrate();
  return db;
}

function seedSession(db, id, rounds) {
  db.prepare("INSERT INTO sessions (id, mode, created_at, updated_at) VALUES (?, 'chat', 1, 1)").run(id);
  const insert = db.prepare('INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)');
  for (let round = 1; round <= rounds; round++) {
    insert.run(`${id}-u${round}`, id, 'user', `第${round}轮提问`, round * 10);
    insert.run(`${id}-a${round}`, id, 'assistant', `第${round}轮回答`, round * 10 + 1);
  }
}

function seedRecord(db, sessionId, round, middleSummary, coveredTo) {
  db.prepare(`INSERT INTO turn_records (id, session_id, round_index, summary, middle_summary, middle_covered_to, created_at)
    VALUES (?, ?, ?, '', ?, ?, 1)`).run(`${sessionId}-r${round}`, sessionId, round, middleSummary, coveredTo);
}

function digestFor(db, sessionId, from, to) {
  const rounds = splitRounds(db.prepare('SELECT id, role, content FROM messages WHERE session_id = ? ORDER BY created_at, rowid').all(sessionId));
  return rangeDigest(rounds.slice(from - 1, to).map(roundDigest));
}

const EVENTS = [
  '【前情】早年间的旧事',
  '【第2–3轮｜三月初七｜渡口｜林遥、老魏】\n起因：借钱\n结果：约定开春还',
  '【第4轮｜三月初八｜北岸｜林遥】\n结果：看见灯塔亮灯',
].join('\n');

test('旧剧情摘要按事件迁移为一级块：范围、小标题、来源指纹与当前原文一致，建块轮次取止轮；随后删去两列', () => {
  const db = upgradeLegacyDb((legacy) => {
    seedSession(legacy, 's1', 8);
    seedRecord(legacy, 's1', 7, '更早一轮的旧版本，不迁移', 3);
    seedRecord(legacy, 's1', 8, EVENTS, 5);
  });
  try {
    const columns = db.pragma('table_info(turn_records)').map((c) => c.name);
    assert.ok(!columns.includes('middle_summary') && !columns.includes('middle_covered_to'));
    const blocks = db.prepare('SELECT * FROM context_blocks WHERE session_id = ? ORDER BY block_no').all('s1');
    assert.deepEqual(blocks.map((b) => [b.block_no, b.tier, b.from_round, b.to_round, b.topic, b.created_round, b.origin, b.consumed_by]), [
      [1, 1, 1, 1, '前情', 1, 'legacy', null],
      [2, 1, 2, 3, '三月初七｜渡口｜林遥、老魏', 3, 'legacy', null],
      [3, 1, 4, 4, '三月初八｜北岸｜林遥', 4, 'legacy', null],
    ]);
    for (const block of blocks) assert.equal(block.source_digest, digestFor(db, 's1', block.from_round, block.to_round));
    assert.match(blocks[1].summary, /^【第2–3轮/);
    assert.equal(db.prepare('SELECT next_block_no FROM context_state WHERE session_id = ?').get('s1').next_block_no, 4);
    // 第 5 轮是旧版里「进行中的事件」，迁移后回到原文，由新的压缩流程接手
    assert.ok(blocks.every((b) => b.to_round < 5));
  } finally {
    db.close();
  }
});

test('标题对不上（倒序、越界）时整段作为一个块覆盖到 coveredTo；范围超出现存轮次的截掉，一轮不剩的不建', () => {
  const db = upgradeLegacyDb((legacy) => {
    seedSession(legacy, 'bad', 6);
    seedRecord(legacy, 'bad', 6, '【第4–5轮｜甲】\n后\n【第1–2轮｜乙】\n前', 5);
    seedSession(legacy, 'short', 2);
    seedRecord(legacy, 'short', 2, '没有标题的旧摘要', 9);
    seedSession(legacy, 'empty', 3);
    seedRecord(legacy, 'empty', 3, null, null);
  });
  try {
    const rows = db.prepare('SELECT session_id, from_round, to_round, summary FROM context_blocks ORDER BY session_id').all();
    assert.deepEqual(rows, [
      { session_id: 'bad', from_round: 1, to_round: 5, summary: '【第4–5轮｜甲】\n后\n【第1–2轮｜乙】\n前' },
      { session_id: 'short', from_round: 1, to_round: 2, summary: '没有标题的旧摘要' },
    ]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 22);
  } finally {
    db.close();
  }
});

test('planLegacyBlocks：只有前情时覆盖到 coveredTo；事件从第 1 轮开始时没有前情块', () => {
  assert.deepEqual(planLegacyBlocks('【前情】很久以前', 4), [{ from: 1, to: 4, topic: '前情', summary: '【前情】很久以前' }]);
  assert.deepEqual(planLegacyBlocks('【第1–3轮｜城门】\n结果：入城', 5).map((b) => [b.from, b.to]), [[1, 3]]);
});
