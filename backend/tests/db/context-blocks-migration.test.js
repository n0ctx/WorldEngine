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
  db.exec('DELETE FROM context_blocks; DELETE FROM context_state;');
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

test('旧剧情摘要按事件迁移为一级块：范围、小标题、来源指纹与原文一致；旧列保留供回滚', () => {
  const db = upgradeLegacyDb((legacy) => {
    seedSession(legacy, 's1', 8);
    seedRecord(legacy, 's1', 7, '更早一轮的旧版本，不迁移', 3);
    seedRecord(legacy, 's1', 8, EVENTS, 5);
  });
  try {
    const columns = db.pragma('table_info(turn_records)').map((c) => c.name);
    assert.ok(columns.includes('middle_summary') && columns.includes('middle_covered_to'));
    assert.equal(db.prepare('SELECT middle_summary FROM turn_records WHERE id = ?').get('s1-r8').middle_summary, EVENTS);
    assert.equal(db.prepare('SELECT middle_summary FROM turn_records WHERE id = ?').get('s1-r7').middle_summary, '更早一轮的旧版本，不迁移');
    const blocks = db.prepare('SELECT * FROM context_blocks WHERE session_id = ? ORDER BY block_no').all('s1');
    assert.deepEqual(blocks.map((b) => [b.block_no, b.tier, b.from_round, b.to_round, b.topic, b.created_round, b.origin, b.consumed_by]), [
      [1, 1, 1, 1, '前情', 1, 'legacy', null],
      [2, 1, 2, 3, '渡口', 3, 'legacy', null],
      [3, 1, 4, 4, '北岸', 4, 'legacy', null],
    ]);
    for (const block of blocks) assert.equal(block.source_digest, digestFor(db, 's1', block.from_round, block.to_round));
    // 注入时另加「【第a–b轮｜小标题】」，正文不再重复轮次标题，时间、地点、人物留作首行
    assert.equal(blocks[1].summary, '三月初七｜渡口｜林遥、老魏\n起因：借钱\n结果：约定开春还');
    assert.equal(db.prepare('SELECT next_block_no FROM context_state WHERE session_id = ?').get('s1').next_block_no, 4);
    // 第 5 轮是旧版里「进行中的事件」，迁移后回到原文，由新的压缩流程接手
    assert.ok(blocks.every((b) => b.to_round < 5));
  } finally {
    db.close();
  }
});

test('标题对不上（倒序、越界）时保留整段；来源超出现存轮次的摘要跳过，原文不删', () => {
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
    ]);
    assert.equal(db.prepare('SELECT middle_summary FROM turn_records WHERE id = ?').get('short-r2').middle_summary, '没有标题的旧摘要');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 22);
  } finally {
    db.close();
  }
});

test('planLegacyBlocks：只有前情时覆盖到 coveredTo；事件从第 1 轮开始时没有前情块', () => {
  assert.deepEqual(planLegacyBlocks('【前情】很久以前', 4), [{ from: 1, to: 4, topic: '前情', summary: '【前情】很久以前' }]);
  assert.deepEqual(planLegacyBlocks('【第1–3轮｜城门】\n结果：入城', 5).map((b) => [b.from, b.to]), [[1, 3]]);
});
