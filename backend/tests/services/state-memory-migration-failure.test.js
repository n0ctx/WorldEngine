import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertWorld, insertSession, insertNearbyCharacter, insertNearbyStateValue } from '../helpers/fixtures.js';

// 独立进程/独立数据库：验证迁移中途失败时事务整体回滚。
// 与 state-memory-migration.test.js 的完整场景共用同一数据库会导致标记提前写入，
// 所以这里单独起一个 sandbox（node --test --test-isolation=process 按文件隔离进程）。
const sandbox = createTestSandbox('state-memory-migration-failure');
sandbox.setEnv();

const { migrateToStateMemory } = await freshImport('backend/services/state-memory-migration.js');
const { default: db } = await freshImport('backend/db/index.js');

test.after(() => sandbox.cleanup());

test('迁移中途失败时整体回滚：不留部分数据，标记未写，旧表与目录仍在', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });
  const nearby = insertNearbyCharacter(db, session.id, { name: '沈彦', persona: '', is_saved: 1 });
  insertNearbyStateValue(db, session.id, nearby.id, { field_key: 'outfit', runtime_value_json: JSON.stringify('黑色风衣') });

  // 损坏的 tables.json：不是合法 JSON。迁移读取时不捕获该异常，触发事务回滚。
  const tablesDir = path.join(sandbox.root, 'table_memory', session.id);
  fs.mkdirSync(tablesDir, { recursive: true });
  fs.writeFileSync(path.join(tablesDir, 'tables.json'), '{not valid json', 'utf-8');

  assert.throws(() => migrateToStateMemory());

  assert.equal(
    db.prepare(`SELECT value FROM internal_meta WHERE key = 'state_memory_migrated_v1'`).get(),
    undefined,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM state_entities').get().n, 0);
  assert.equal(
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_nearby_characters'`).get()?.name,
    'session_nearby_characters',
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM session_nearby_characters').get().n, 1);
  assert.equal(fs.existsSync(path.join(tablesDir, 'tables.json')), true);
});
