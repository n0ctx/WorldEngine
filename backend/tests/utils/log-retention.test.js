import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { pruneMainLogs, pruneRawLogs } from '../../utils/log-retention.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 6, 12);

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(process.env.WE_DATA_DIR, 'log-retention-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeFile(name, { ageDays, bytes = 1 }) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, 'x'.repeat(bytes));
  const mtime = new Date(NOW - ageDays * DAY_MS);
  fs.utimesSync(filePath, mtime, mtime);
}

const remaining = () => fs.readdirSync(dir).sort();

test('主日志按天数删除，不碰命名不符的文件', async () => {
  writeFile('worldengine-2026-09-01.log', { ageDays: 35 });
  writeFile('worldengine-2026-09-20.log', { ageDays: 15 });
  writeFile('worldengine-2026-10-05.log', { ageDays: 1 });
  writeFile('notes.log', { ageDays: 60 });
  fs.mkdirSync(path.join(dir, 'llm-raw'));

  const { removed } = await pruneMainLogs(dir, { maxAgeDays: 14, now: NOW });

  assert.equal(removed, 2);
  assert.deepEqual(remaining(), ['llm-raw', 'notes.log', 'worldengine-2026-10-05.log']);
});

test('原始日志先按天数删，再按总量从最旧的删', async () => {
  writeFile('2026-10-01T00-00-00-000Z-glm-writing_main.json', { ageDays: 5, bytes: 10 });
  writeFile('2026-10-05T00-00-00-000Z-xiaomi-state_update.json', { ageDays: 1.5, bytes: 40 });
  writeFile('2026-10-05T12-00-00-000Z-xiaomi-state_update_tools.json', { ageDays: 1, bytes: 40 });
  writeFile('2026-10-06T00-00-00-000Z-xiaomi-entry_match.json', { ageDays: 0.5, bytes: 40 });
  writeFile('keep.json', { ageDays: 30, bytes: 10 });

  const { removed, keptBytes } = await pruneRawLogs(dir, { maxAgeDays: 3, maxBytes: 100, now: NOW });

  assert.equal(removed, 2);
  assert.equal(keptBytes, 80);
  assert.deepEqual(remaining(), [
    '2026-10-05T12-00-00-000Z-xiaomi-state_update_tools.json',
    '2026-10-06T00-00-00-000Z-xiaomi-entry_match.json',
    'keep.json',
  ]);
});

test('目录不存在时不报错', async () => {
  const result = await pruneRawLogs(path.join(dir, 'missing'), { maxAgeDays: 3, maxBytes: 100, now: NOW });
  assert.deepEqual(result, { removed: 0, keptBytes: 0 });
});
