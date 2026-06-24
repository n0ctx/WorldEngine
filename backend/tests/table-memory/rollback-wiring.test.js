import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-rb-'));
process.env.WE_DATA_DIR = tmp;

const { writeTables, readTablesRaw, restoreTablesFromTurnRecord } = await import('../../services/table-memory.js');
const { emptyTables } = await import('../../services/table-memory-schema.js');

test('回滚到零残留：restoreTablesFromTurnRecord(null) 清空表目录', () => {
  writeTables('sRB', emptyTables());
  assert.notEqual(readTablesRaw('sRB'), '');
  restoreTablesFromTurnRecord('sRB', null);
  assert.equal(readTablesRaw('sRB'), '');
});
