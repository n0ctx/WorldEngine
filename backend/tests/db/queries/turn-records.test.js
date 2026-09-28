import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertSession } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-turn-records');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('upsertTurnRecord：middle_summary / middle_covered_to 在插入与更新时都能往返读写', async () => {
  const session = insertSession(sandbox.db);
  const { upsertTurnRecord, getTurnRecordById } = await freshImport('backend/db/queries/turn-records.js');

  const inserted = upsertTurnRecord({
    session_id: session.id,
    round_index: 1,
    summary: '摘要1',
    middle_summary: '中期摘要A',
    middle_covered_to: 1,
  });
  assert.equal(inserted.middle_summary, '中期摘要A');
  assert.equal(inserted.middle_covered_to, 1);

  const updated = upsertTurnRecord({
    session_id: session.id,
    round_index: 1,
    summary: '摘要1-更新',
    middle_summary: '中期摘要B',
    middle_covered_to: 2,
  });
  assert.equal(updated.id, inserted.id);
  assert.equal(updated.middle_summary, '中期摘要B');
  assert.equal(updated.middle_covered_to, 2);
  assert.deepEqual(getTurnRecordById(inserted.id), updated);
});

test('upsertTurnRecord：不传 middle 字段时落库为 NULL（旧数据语义）', async () => {
  const session = insertSession(sandbox.db);
  const { upsertTurnRecord } = await freshImport('backend/db/queries/turn-records.js');

  const rec = upsertTurnRecord({ session_id: session.id, round_index: 1, summary: '摘要' });
  assert.equal(rec.middle_summary, null);
  assert.equal(rec.middle_covered_to, null);
});

test('updateTurnRecordIndex：回填 summary/scene/cast_json 并返回变更行数', async () => {
  const session = insertSession(sandbox.db);
  const { upsertTurnRecord, updateTurnRecordIndex, getTurnRecordById } = await freshImport('backend/db/queries/turn-records.js');

  const rec = upsertTurnRecord({ session_id: session.id, round_index: 1, summary: '' });
  const changed = updateTurnRecordIndex(rec.id, { summary: '索引摘要', scene: '场景', cast_json: '["甲"]' });
  assert.equal(changed, 1);

  const row = getTurnRecordById(rec.id);
  assert.equal(row.summary, '索引摘要');
  assert.equal(row.scene, '场景');
  assert.equal(row.cast_json, '["甲"]');

  assert.equal(updateTurnRecordIndex('missing-id', { summary: 'x' }), 0);
});

test('getRecallIndexCandidates：只返回 round_index <= coveredTo 且 summary 非空的行，按 round 升序', async () => {
  const session = insertSession(sandbox.db);
  const { upsertTurnRecord, getRecallIndexCandidates } = await freshImport('backend/db/queries/turn-records.js');

  upsertTurnRecord({ session_id: session.id, round_index: 1, summary: '摘要1' });
  upsertTurnRecord({ session_id: session.id, round_index: 2, summary: '' });
  upsertTurnRecord({ session_id: session.id, round_index: 3, summary: '摘要3' });
  upsertTurnRecord({ session_id: session.id, round_index: 4, summary: '摘要4' });

  const candidates = getRecallIndexCandidates(session.id, 3);
  assert.deepEqual(candidates.map((c) => c.round_index), [1, 3]);
  assert.equal(candidates[0].summary, '摘要1');
});

test('getUnindexedTurnRecords：只返回 summary 为空的行，按 round 升序并受 limit 约束', async () => {
  const session = insertSession(sandbox.db);
  const { upsertTurnRecord, getUnindexedTurnRecords } = await freshImport('backend/db/queries/turn-records.js');

  upsertTurnRecord({ session_id: session.id, round_index: 1, summary: '' });
  upsertTurnRecord({ session_id: session.id, round_index: 2, summary: '摘要2' });
  upsertTurnRecord({ session_id: session.id, round_index: 3, summary: '' });
  upsertTurnRecord({ session_id: session.id, round_index: 4, summary: '' });

  const all = getUnindexedTurnRecords(session.id, 10);
  assert.deepEqual(all.map((r) => r.round_index), [1, 3, 4]);

  const limited = getUnindexedTurnRecords(session.id, 2);
  assert.deepEqual(limited.map((r) => r.round_index), [1, 3]);
});

test('getRecentTurnSummaries：排除 summary 为空的行', async () => {
  const session = insertSession(sandbox.db);
  const { upsertTurnRecord, getRecentTurnSummaries } = await freshImport('backend/db/queries/turn-records.js');

  upsertTurnRecord({ session_id: session.id, round_index: 1, summary: '摘要1' });
  upsertTurnRecord({ session_id: session.id, round_index: 2, summary: '' });
  upsertTurnRecord({ session_id: session.id, round_index: 3, summary: '摘要3' });

  const rows = getRecentTurnSummaries(session.id, 10);
  assert.deepEqual(rows.map((r) => r.round_index), [1, 3]);
});
