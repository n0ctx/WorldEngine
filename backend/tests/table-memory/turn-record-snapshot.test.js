// backend/tests/table-memory/turn-record-snapshot.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-tr-'));
process.env.WE_DATA_DIR = tmp;

const db = (await import('../../db/index.js')).default;
const { initSchema } = await import('../../db/schema.js');
initSchema(db);
const { updateTurnRecordTableSnapshot, getTurnRecordById, upsertTurnRecord } = await import('../../db/queries/turn-records.js');
import { insertSession } from '../helpers/fixtures.js';

test('turn_records 表含 table_memory_snapshot 列且可读写', () => {
  const cols = db.prepare('PRAGMA table_info(turn_records)').all().map((c) => c.name);
  assert.ok(cols.includes('table_memory_snapshot'));

  // 先插入 session 行以满足外键约束
  const session = insertSession(db, { id: 'sess-x' });
  const rec = upsertTurnRecord({ session_id: session.id, round_index: 1, summary: 's', user_message_id: null, asst_message_id: null, state_snapshot: null });
  updateTurnRecordTableSnapshot(rec.id, '{"hello":1}');
  assert.equal(getTurnRecordById(rec.id).table_memory_snapshot, '{"hello":1}');
});
