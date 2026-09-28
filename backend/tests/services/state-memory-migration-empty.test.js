import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

// 独立进程/独立数据库：验证全新数据库（无任何旧数据）迁移时直接完成并写标记。
// 与 state-memory-migration.test.js 的完整场景共用同一数据库会导致标记提前写入，
// 所以这里单独起一个 sandbox（node --test --test-isolation=process 按文件隔离进程）。
const sandbox = createTestSandbox('state-memory-migration-empty');
sandbox.setEnv();

const { migrateToStateMemory } = await freshImport('backend/services/state-memory-migration.js');
const { default: db } = await freshImport('backend/db/index.js');

test.after(() => sandbox.cleanup());

test('全新数据库没有任何旧数据时，迁移直接完成并写入标记', () => {
  assert.doesNotThrow(() => migrateToStateMemory());

  assert.equal(
    db.prepare(`SELECT value FROM internal_meta WHERE key = 'state_memory_migrated_v1'`).get()?.value,
    '1',
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM state_entities').get().n, 0);
  assert.equal(
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_nearby_characters'`).get(),
    undefined,
  );

  // 重复调用仍是 no-op
  assert.doesNotThrow(() => migrateToStateMemory());
});
